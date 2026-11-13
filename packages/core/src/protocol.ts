import type { Color } from './board'
import type { GameState, Move } from './rules'

/** Shared wire protocol between the game server and the browser client. */

export const ROOM_CODE_LENGTH = 4

/** Animation timings, shared so server pacing matches client animation. */
export const TIMING = {
  roll: 1300,
  moveBase: 260,
  movePerCell: 95,
  captureExtra: 650,
  noMove: 700,
  botThink: 600,
  selectTimeout: 30000,
} as const

export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type NetPhase = 'idle' | 'rolling' | 'select' | 'animating' | 'over'

export interface SeatInfo {
  index: number
  color: Color
  name: string
  isBot: boolean
  connected: boolean
  hasPlayer: boolean
}

export interface RoomSnapshot {
  code: string
  status: RoomStatus
  hostSeat: number | null
  seats: SeatInfo[]
  canStart: boolean
}

export interface GameSnapshot {
  state: GameState
  phase: NetPhase
  diceValue: number
  legal: string[]
}

export type GameEvent =
  | { type: 'roll'; value: number; forfeit: boolean }
  | { type: 'select'; state: GameState; legal: string[] }
  | { type: 'move'; move: Move; prev: GameState; state: GameState; cells: number }
  | { type: 'noMove' }
  | { type: 'turn'; state: GameState }
  | { type: 'over'; state: GameState }

export interface JoinAckOk {
  ok: true
  code: string
  playerId: string
  seat: number
  room: RoomSnapshot
}

export interface JoinAckError {
  ok: false
  error: string
}

export type JoinAck = JoinAckOk | JoinAckError

export interface ClientToServerEvents {
  'room:create': (payload: { name: string }, ack: (result: JoinAck) => void) => void
  'room:join': (
    payload: { code: string; name: string },
    ack: (result: JoinAck) => void,
  ) => void
  'room:rejoin': (
    payload: { code: string; playerId: string },
    ack: (result: JoinAck) => void,
  ) => void
  'room:leave': () => void
  'room:start': () => void
  'room:restart': () => void
  'game:roll': () => void
  'game:move': (payload: { token: number }) => void
}

export interface ServerToClientEvents {
  room: (room: RoomSnapshot) => void
  game: (game: GameSnapshot) => void
  event: (event: GameEvent) => void
  'net:error': (message: string) => void
}
