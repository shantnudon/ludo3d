import {
  type ClientMessage,
  type GameEvent,
  type GameSnapshot,
  type RoomSnapshot,
  type ServerMessage,
} from '@ludo/core'

export interface OpenOptions {
  code: string
  name: string
  create?: boolean
  playerId?: string
}

export interface OpenResult {
  socket: RoomSocket
  code: string
  playerId: string
  seat: number
  room: RoomSnapshot
}

type Ack = Extract<ServerMessage, { t: 'ack' }>

export function serverUrl(): string {
  const explicit = import.meta.env.VITE_SERVER_URL as string | undefined
  if (explicit) return explicit
  if (import.meta.env.DEV) {
    // Works for localhost and for a phone on the same WiFi.
    return `http://${window.location.hostname}:3001`
  }
  return window.location.origin
}

function socketUrl(code: string): string {
  const url = new URL(serverUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.searchParams.set('code', code)
  return url.toString()
}

/**
 * Thin native-WebSocket client. One instance = one room connection.
 * Commands that need confirmation carry a request id, everything else is a
 * fire-and-forget message that the server validates.
 */
export class RoomSocket {
  private ws: WebSocket
  private pending = new Map<number, (ack: Ack) => void>()
  private roomHandler: ((room: RoomSnapshot) => void) | null = null
  private gameHandler: ((game: GameSnapshot) => void) | null = null
  private eventHandler: ((event: GameEvent) => void) | null = null
  private closeHandler: (() => void) | null = null
  private lastRoom: RoomSnapshot | null = null
  private lastGame: GameSnapshot | null = null
  private closed = false

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener('message', (event: MessageEvent) => this.onMessage(event))
    ws.addEventListener('close', () => this.handleClose())
    ws.addEventListener('error', () => this.handleClose())
  }

  static open(options: OpenOptions): Promise<OpenResult> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(socketUrl(options.code))
      } catch {
        reject(new Error('connect-failed'))
        return
      }

      const socket = new RoomSocket(ws)
      let settled = false

      const fail = (reason: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          ws.close()
        } catch {
          // ignore
        }
        reject(new Error(reason))
      }

      const timer = setTimeout(() => fail('timeout'), 9000)

      ws.addEventListener('open', () => {
        socket.request(
          {
            t: 'hello',
            rid: 1,
            name: options.name,
            create: options.create,
            playerId: options.playerId,
          },
          (ack) => {
            if (settled) return
            if (!ack.ok) {
              fail(ack.error)
              return
            }
            settled = true
            clearTimeout(timer)
            resolve({
              socket,
              code: ack.code,
              playerId: ack.playerId,
              seat: ack.seat,
              room: ack.room,
            })
          },
        )
      })

      ws.addEventListener('error', () => fail('connect-failed'))
      ws.addEventListener('close', () => fail('connect-failed'))
    })
  }

  send(message: ClientMessage): void {
    this.sendRaw(message)
  }

  onRoom(handler: (room: RoomSnapshot) => void): void {
    this.roomHandler = handler
    if (this.lastRoom) handler(this.lastRoom)
  }

  onGame(handler: (game: GameSnapshot) => void): void {
    this.gameHandler = handler
    if (this.lastGame) handler(this.lastGame)
  }

  onEvent(handler: (event: GameEvent) => void): void {
    this.eventHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  close(): void {
    this.closed = true
    try {
      this.ws.close()
    } catch {
      // ignore
    }
  }

  private request(message: ClientMessage, callback: (ack: Ack) => void): void {
    const rid = (message as { rid?: number }).rid ?? 0
    this.pending.set(rid, callback)
    this.sendRaw(message)
  }

  private sendRaw(message: ClientMessage): void {
    try {
      this.ws.send(JSON.stringify(message))
    } catch {
      // socket already closed
    }
  }

  private onMessage(event: MessageEvent): void {
    let message: ServerMessage
    try {
      message = JSON.parse(String(event.data)) as ServerMessage
    } catch {
      return
    }

    switch (message.t) {
      case 'ack': {
        const callback = this.pending.get(message.rid)
        if (callback) {
          this.pending.delete(message.rid)
          callback(message)
        }
        break
      }
      case 'room':
        this.lastRoom = message.room
        this.roomHandler?.(message.room)
        break
      case 'game':
        this.lastGame = message.game
        this.gameHandler?.(message.game)
        break
      case 'event':
        this.eventHandler?.(message.event)
        break
      case 'error':
        break
    }
  }

  private handleClose(): void {
    if (this.closed) return
    this.closed = true
    this.closeHandler?.()
  }
}
