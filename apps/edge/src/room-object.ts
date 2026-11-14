import { Room } from './room'
import type {
  ClientMessage,
  ServerMessage,
  StoredRoom,
} from '@ludo/core'

export interface Env {
  ROOMS: DurableObjectNamespace
  ASSETS: Fetcher
}

const NAME_MAX = 16

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const name = value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX)
  return name || fallback
}

type SocketState = string | null

/**
 * One Durable Object per room code. Sockets are accepted without hibernation
 * so the turn loop can use ordinary timers; room state is mirrored to storage
 * so a cold start keeps the table.
 */
export class RoomDurableObject implements DurableObject {
  private state: DurableObjectState
  private room: Room | null = null
  private code = ''
  private sockets = new Map<WebSocket, SocketState>()
  private byPlayer = new Map<string, WebSocket>()

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state
    void state.blockConcurrencyWhile(async () => {
      await this.load()
    })
  }

  private async load(): Promise<void> {
    const stored = await this.state.storage.get<StoredRoom>('room')
    if (!stored) return
    this.code = stored.code
    const room = new Room(stored.code, {
      emit: (message) => this.broadcast(message),
      persist: () => void this.persist(),
    })
    room.restore(stored)
    this.room = room
    room.resume()
  }

  private async persist(): Promise<void> {
    if (!this.room) return
    await this.state.storage.put('room', this.room.toStored())
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message)
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(payload)
      } catch {
        this.sockets.delete(socket)
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message))
    } catch {
      // socket already gone
    }
  }

  private ack(
    socket: WebSocket,
    rid: number,
    result:
      | { ok: true; playerId: string; seat: number }
      | { ok: false; error: string },
  ): void {
    if (!this.room) {
      this.send(socket, { t: 'ack', rid, ok: false, error: 'room-not-found' })
      return
    }
    if (!result.ok) {
      this.send(socket, { t: 'ack', rid, ok: false, error: result.error })
      return
    }
    this.send(socket, {
      t: 'ack',
      rid,
      ok: true,
      code: this.room.code,
      playerId: result.playerId,
      seat: result.seat,
      room: this.room.snapshot(),
    })
    // Make sure the client also receives the authoritative table state.
    this.room.broadcastState()
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({
        ok: true,
        code: this.code || null,
        players: this.room?.seats.filter((seat) => seat.playerId).length ?? 0,
      })
    }

    const code = (url.searchParams.get('code') ?? '').toUpperCase()
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      return new Response('invalid room code', { status: 400 })
    }
    if (this.room && this.room.code !== code) {
      return new Response('room mismatch', { status: 409 })
    }
    if (!this.room) this.code = code

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    server.accept()

    this.sockets.set(server, null)
    server.addEventListener('message', (event: MessageEvent) =>
      this.onMessage(server, event),
    )
    server.addEventListener('close', () => this.onClose(server))
    server.addEventListener('error', () => this.onClose(server))

    return new Response(null, { status: 101, webSocket: client })
  }

  private onMessage(socket: WebSocket, event: MessageEvent): void {
    let message: ClientMessage
    try {
      message = JSON.parse(String(event.data)) as ClientMessage
    } catch {
      return
    }

    switch (message.t) {
      case 'hello':
        this.onHello(socket, message)
        break
      case 'leave':
        this.onLeave(socket)
        break
      case 'start':
        this.withPlayer(socket, (playerId) => {
          if (this.isHost(playerId)) this.room?.start()
        })
        break
      case 'restart':
        this.withPlayer(socket, (playerId) => {
          if (this.isHost(playerId)) this.room?.restart()
        })
        break
      case 'roll':
        this.withPlayer(socket, (playerId) => {
          void this.room?.roll(playerId)
        })
        break
      case 'move':
        this.withPlayer(socket, (playerId) => {
          const token = Number(message.token)
          if (Number.isInteger(token) && token >= 0 && token <= 3) {
            this.room?.move(playerId, token)
          }
        })
        break
    }
  }

  private onHello(
    socket: WebSocket,
    message: Extract<ClientMessage, { t: 'hello' }>,
  ): void {
    const rid = message.rid

    // Reconnect to an existing seat.
    if (message.playerId) {
      if (!this.room) {
        this.send(socket, { t: 'ack', rid, ok: false, error: 'room-not-found' })
        return
      }
      const seat = this.room.rejoin(message.playerId)
      if (seat === null) {
        this.send(socket, { t: 'ack', rid, ok: false, error: 'not-in-room' })
        return
      }
      this.bind(socket, message.playerId)
      this.ack(socket, rid, { ok: true, playerId: message.playerId, seat })
      return
    }

    // Create a fresh room.
    if (message.create) {
      if (this.room) {
        this.send(socket, { t: 'ack', rid, ok: false, error: 'code-in-use' })
        return
      }
      const room = new Room(this.code, {
        emit: (payload) => this.broadcast(payload),
        persist: () => void this.persist(),
      })
      const joined = room.join(cleanName(message.name, 'Host'))
      if (!joined) {
        this.send(socket, { t: 'ack', rid, ok: false, error: 'could-not-create' })
        return
      }
      this.room = room
      this.bind(socket, joined.playerId)
      this.ack(socket, rid, { ok: true, playerId: joined.playerId, seat: joined.seat })
      return
    }

    // Join an existing room.
    if (!this.room) {
      this.send(socket, { t: 'ack', rid, ok: false, error: 'room-not-found' })
      return
    }
    if (this.room.status !== 'lobby') {
      this.send(socket, { t: 'ack', rid, ok: false, error: 'game-started' })
      return
    }
    const joined = this.room.join(cleanName(message.name, 'Guest'))
    if (!joined) {
      this.send(socket, { t: 'ack', rid, ok: false, error: 'room-full' })
      return
    }
    this.bind(socket, joined.playerId)
    this.ack(socket, rid, { ok: true, playerId: joined.playerId, seat: joined.seat })
  }

  private onLeave(socket: WebSocket): void {
    const playerId = this.sockets.get(socket)
    if (!playerId || !this.room) return
    this.byPlayer.delete(playerId)
    this.sockets.set(socket, null)
    this.room.leave(playerId)
  }

  private withPlayer(socket: WebSocket, run: (playerId: string) => void): void {
    const playerId = this.sockets.get(socket)
    if (!playerId) return
    run(playerId)
  }

  private isHost(playerId: string): boolean {
    if (!this.room || this.room.hostSeat === null) return false
    return this.room.seats[this.room.hostSeat]?.playerId === playerId
  }

  private bind(socket: WebSocket, playerId: string): void {
    const previous = this.byPlayer.get(playerId)
    if (previous && previous !== socket) {
      this.sockets.delete(previous)
      try {
        previous.close(4000, 'replaced by a newer connection')
      } catch {
        // already closed
      }
    }
    this.byPlayer.set(playerId, socket)
    this.sockets.set(socket, playerId)
  }

  private onClose(socket: WebSocket): void {
    const playerId = this.sockets.get(socket)
    this.sockets.delete(socket)
    if (!playerId) return
    if (this.byPlayer.get(playerId) !== socket) return
    this.byPlayer.delete(playerId)
    this.room?.disconnect(playerId)
  }
}
