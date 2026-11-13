import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import { Server } from 'socket.io'
import {
  ROOM_CODE_LENGTH,
  type GameEvent,
  type JoinAck,
  type RoomSnapshot,
} from '@ludo/core'
import { Room, type RoomChannels } from './room.ts'

const PORT = Number(process.env.PORT ?? 3001)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: true, credentials: false },
})

const rooms = new Map<string, Room>()

const channels: RoomChannels = {
  room: (room) => io.to(room.code).emit('room', room.snapshot()),
  game: (room) => io.to(room.code).emit('game', room.gameSnapshot()),
  event: (room, event: GameEvent) => io.to(room.code).emit('event', event),
}

function makeCode(): string {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let code = ''
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    if (!rooms.has(code)) return code
  }
  throw new Error('Could not allocate a room code')
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const name = value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16)
  return name || fallback
}

function dropIfEmpty(room: Room): void {
  if (room.hasPlayers()) return
  room.dispose()
  rooms.delete(room.code)
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, rooms: rooms.size })
})

// In production the built client is served by this same process.
const clientDist = fileURLToPath(new URL('../../web/dist', import.meta.url))
if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_request, response) => {
    response.sendFile(path.join(clientDist, 'index.html'))
  })
}

io.on('connection', (socket) => {
  let membership: { code: string; playerId: string } | null = null

  const roomOf = (): Room | undefined =>
    membership ? rooms.get(membership.code) : undefined

  const attach = (room: Room, playerId: string): void => {
    membership = { code: room.code, playerId }
    void socket.join(room.code)
  }

  socket.on('room:create', (payload: { name?: string }, ack: (r: JoinAck) => void) => {
    if (membership) {
      ack({ ok: false, error: 'You are already in a room' })
      return
    }
    const room = new Room(makeCode(), channels)
    rooms.set(room.code, room)
    const joined = room.join(cleanName(payload?.name, 'Host'))
    if (!joined) {
      ack({ ok: false, error: 'Could not create the room' })
      return
    }
    attach(room, joined.playerId)
    ack({
      ok: true,
      code: room.code,
      playerId: joined.playerId,
      seat: joined.seat,
      room: room.snapshot(),
    })
    channels.room(room)
  })

  socket.on(
    'room:join',
    (payload: { code?: string; name?: string }, ack: (r: JoinAck) => void) => {
      if (membership) {
        ack({ ok: false, error: 'You are already in a room' })
        return
      }
      const code = String(payload?.code ?? '').trim().toUpperCase()
      const room = rooms.get(code)
      if (!room) {
        ack({ ok: false, error: 'Room not found. Check the code.' })
        return
      }
      if (room.status !== 'lobby') {
        ack({ ok: false, error: 'That game already started' })
        return
      }
      const joined = room.join(cleanName(payload?.name, 'Guest'))
      if (!joined) {
        ack({ ok: false, error: 'Room is full' })
        return
      }
      attach(room, joined.playerId)
      ack({
        ok: true,
        code: room.code,
        playerId: joined.playerId,
        seat: joined.seat,
        room: room.snapshot(),
      })
      channels.room(room)
    },
  )

  socket.on(
    'room:rejoin',
    (payload: { code?: string; playerId?: string }, ack: (r: JoinAck) => void) => {
      const code = String(payload?.code ?? '').toUpperCase()
      const playerId = String(payload?.playerId ?? '')
      const room = rooms.get(code)
      if (!room) {
        ack({ ok: false, error: 'Room is gone' })
        return
      }
      const seat = room.rejoin(playerId)
      if (seat === null) {
        ack({ ok: false, error: 'You are not in this room anymore' })
        return
      }
      attach(room, playerId)
      ack({ ok: true, code, playerId, seat, room: room.snapshot() })
      channels.room(room)
      if (room.game) channels.game(room)
    },
  )

  socket.on('room:leave', () => {
    const room = roomOf()
    if (!room || !membership) return
    room.leave(membership.playerId)
    void socket.leave(room.code)
    membership = null
    dropIfEmpty(room)
  })

  socket.on('room:start', () => {
    const room = roomOf()
    if (!room || !membership) return
    if (room.hostSeat === null) return
    if (room.seats[room.hostSeat]?.playerId !== membership.playerId) return
    room.start()
  })

  socket.on('room:restart', () => {
    const room = roomOf()
    if (!room || !membership) return
    if (room.hostSeat === null) return
    if (room.seats[room.hostSeat]?.playerId !== membership.playerId) return
    room.restart()
  })

  socket.on('game:roll', () => {
    const room = roomOf()
    if (!room || !membership) return
    void room.roll(membership.playerId)
  })

  socket.on('game:move', (payload: { token?: number }) => {
    const room = roomOf()
    if (!room || !membership) return
    const token = Number(payload?.token)
    if (!Number.isInteger(token) || token < 0 || token > 3) return
    room.move(membership.playerId, token)
  })

  socket.on('disconnect', () => {
    const room = roomOf()
    if (!room || !membership) return
    room.disconnect(membership.playerId)
    membership = null
    setTimeout(() => dropIfEmpty(room), 60_000).unref()
  })
})

// Sweep abandoned rooms.
setInterval(
  () => {
    const cutoff = Date.now() - 30 * 60 * 1000
    for (const room of rooms.values()) {
      if (!room.hasConnectedPlayers() && room.lastSeen < cutoff) {
        room.dispose()
        rooms.delete(room.code)
      }
    }
  },
  10 * 60 * 1000,
).unref()

httpServer.listen(PORT, () => {
  const suffix = existsSync(clientDist) ? ' (serving built client)' : ''
  console.log(`Ludo 3D server listening on http://localhost:${PORT}${suffix}`)
})

export type { RoomSnapshot }
