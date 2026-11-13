import { randomUUID } from 'node:crypto'
import {
  COLORS,
  TIMING,
  chooseMove,
  createGame,
  endTurn,
  legalMoves,
  playMove,
  roll,
  type BotLevel,
  type Color,
  type GameEvent,
  type GameSnapshot,
  type Move,
  type NetPhase,
  type RoomSnapshot,
  type RoomStatus,
  type SeatInfo,
} from '@ludo/core'

/** How the room talks to the outside world (socket layer implements this). */
export interface RoomChannels {
  room(room: Room): void
  game(room: Room): void
  event(room: Room, event: GameEvent): void
}

interface Seat {
  index: number
  color: Color
  name: string
  playerId: string | null
  connected: boolean
  isBot: boolean
}

const DEFAULT_NAME = 'Player'
const BOT_LEVEL: BotLevel = 'medium'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * One online table.
 *
 * The server is authoritative: clients only send intents (`roll`, `move`) and
 * the room applies them with the same rules package the browser uses. Empty
 * seats are turned into bots when the host starts.
 */
export class Room {
  readonly code: string
  status: RoomStatus = 'lobby'
  hostSeat: number | null = null
  seats: Seat[]
  game: ReturnType<typeof createGame> | null = null
  phase: NetPhase = 'idle'
  diceValue = 0
  legal: string[] = []

  private channels: RoomChannels
  private generation = 0
  private selectTimer: ReturnType<typeof setTimeout> | null = null
  private lastActivity = Date.now()

  constructor(code: string, channels: RoomChannels) {
    this.code = code
    this.channels = channels
    this.seats = COLORS.map((color, index) => ({
      index,
      color,
      name: 'Open',
      playerId: null,
      connected: false,
      isBot: false,
    }))
  }

  get lastSeen(): number {
    return this.lastActivity
  }

  hasPlayers(): boolean {
    return this.seats.some((seat) => seat.playerId !== null)
  }

  hasConnectedPlayers(): boolean {
    return this.seats.some((seat) => seat.playerId !== null && seat.connected)
  }

  seatOf(playerId: string): Seat | undefined {
    return this.seats.find((seat) => seat.playerId === playerId)
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      status: this.status,
      hostSeat: this.hostSeat,
      seats: this.seats.map<SeatInfo>((seat) => ({
        index: seat.index,
        color: seat.color,
        name: seat.name,
        isBot: seat.isBot,
        connected: seat.connected,
        hasPlayer: seat.playerId !== null,
      })),
      canStart: this.status === 'lobby' && this.hasPlayers(),
    }
  }

  gameSnapshot(): GameSnapshot {
    return {
      state: this.game ?? createGame('blue'),
      phase: this.phase,
      diceValue: this.diceValue,
      legal: this.phase === 'select' ? this.legal : [],
    }
  }

  // ------------------------------------------------------------- membership

  join(name: string): { seat: number; playerId: string } | null {
    if (this.status !== 'lobby') return null
    const seat = this.seats.find((candidate) => candidate.playerId === null)
    if (!seat) return null

    seat.playerId = randomUUID()
    seat.name = name || `${DEFAULT_NAME} ${seat.index + 1}`
    seat.connected = true
    seat.isBot = false
    this.hostSeat ??= seat.index

    this.touch()
    this.emitRoom()
    return { seat: seat.index, playerId: seat.playerId }
  }

  rejoin(playerId: string): number | null {
    const seat = this.seatOf(playerId)
    if (!seat) return null

    seat.connected = true
    seat.isBot = false
    if (this.game) this.game.players[seat.index]!.isBot = false
    if (this.hostSeat === null) this.hostSeat = seat.index

    this.touch()
    this.emitRoom()
    if (this.game) this.emitGame()
    return seat.index
  }

  /** Socket dropped: keep the seat, hand control to a bot until they return. */
  disconnect(playerId: string): void {
    const seat = this.seatOf(playerId)
    if (!seat) return
    seat.connected = false

    if (this.status === 'lobby') {
      seat.playerId = null
      seat.name = 'Open'
      seat.isBot = false
      this.refreshHost()
      this.emitRoom()
      return
    }

    this.handToBot(seat)
  }

  /** Explicit leave: the seat is freed immediately. */
  leave(playerId: string): void {
    const seat = this.seatOf(playerId)
    if (!seat) return
    seat.playerId = null
    seat.connected = false

    if (this.status === 'lobby') {
      seat.name = 'Open'
      seat.isBot = false
      this.refreshHost()
      this.emitRoom()
      return
    }

    this.handToBot(seat)
  }

  private handToBot(seat: Seat): void {
    seat.isBot = true
    seat.name = 'Bot'
    if (this.game) this.game.players[seat.index]!.isBot = true

    this.touch()
    this.emitRoom()
    if (this.game) this.emitGame()

    if (this.phase === 'select' && this.game?.current === seat.index) {
      this.clearSelect()
      this.botChoose()
    }
    this.maybeBot()
  }

  private refreshHost(): void {
    if (this.hostSeat !== null && this.seats[this.hostSeat]?.playerId) return
    const next = this.seats.find((seat) => seat.playerId !== null)
    this.hostSeat = next ? next.index : null
  }

  // ------------------------------------------------------------------ flow

  start(): void {
    if (this.status !== 'lobby' || !this.hasPlayers()) return

    const humans = this.seats
      .filter((seat) => seat.playerId !== null)
      .map((seat) => seat.color)
    if (humans.length === 0) return

    for (const seat of this.seats) {
      if (seat.playerId === null) {
        seat.isBot = true
        seat.name = `Bot ${seat.index + 1}`
        seat.connected = false
      }
      seat.connected = seat.playerId !== null ? seat.connected : false
    }

    const game = createGame(humans)
    this.seats.forEach((seat) => {
      game.players[seat.index]!.isBot = seat.isBot
    })

    const host = this.hostSeat !== null ? this.seats[this.hostSeat] : undefined
    if (host && host.playerId) game.current = host.index
    else game.current = this.seats.find((seat) => seat.playerId)!.index

    this.game = game
    this.status = 'playing'
    this.phase = 'idle'
    this.diceValue = 0
    this.legal = []
    this.generation += 1
    this.touch()

    this.emitRoom()
    this.emitGame()
    this.maybeBot()
  }

  restart(): void {
    if (this.status !== 'finished') return
    this.generation += 1
    this.clearSelect()
    this.game = null
    this.status = 'lobby'
    this.phase = 'idle'
    this.diceValue = 0
    this.legal = []
    for (const seat of this.seats) {
      seat.isBot = seat.playerId === null
      seat.name = seat.playerId ? seat.name : 'Open'
    }
    this.refreshHost()
    this.touch()
    this.emitRoom()
  }

  async roll(playerId: string | null): Promise<void> {
    if (!this.game || this.status !== 'playing') return
    if (this.phase !== 'idle' || this.game.over) return

    const current = this.game.current
    const seat = this.seats[current]!

    if (playerId !== null) {
      const actor = this.seatOf(playerId)
      if (!actor || actor.index !== current) return
      if (actor.isBot) return
    } else if (!seat.isBot) {
      return
    }

    const generation = ++this.generation
    const result = roll(this.game, Math.random)

    this.game = result.state
    this.diceValue = result.value
    this.phase = 'rolling'
    this.touch()
    this.emitGame()
    this.emitEvent({ type: 'roll', value: result.value, forfeit: result.forfeit })

    await sleep(TIMING.roll)
    if (generation !== this.generation) return

    if (result.forfeit) {
      this.finishTurn()
      return
    }

    const moves = legalMoves(this.game, result.value)

    if (moves.length === 0) {
      this.emitEvent({ type: 'noMove' })
      await sleep(TIMING.noMove)
      if (generation !== this.generation) return
      this.finishTurn()
      return
    }

    if (moves.length === 1) {
      await this.applyMove(moves[0]!, generation)
      return
    }

    const player = this.game.players[current]!
    if (player.isBot) {
      this.phase = 'animating'
      this.emitGame()
      await sleep(TIMING.botThink)
      if (generation !== this.generation) return
      const move = chooseMove(this.game, moves, BOT_LEVEL, Math.random)
      await this.applyMove(move, generation)
      return
    }

    this.phase = 'select'
    this.legal = moves.map((move) => `${move.player}-${move.token}`)
    this.emitGame()
    this.emitEvent({ type: 'select', state: this.game, legal: this.legal })
    this.selectTimer = setTimeout(() => {
      if (this.generation === generation && this.phase === 'select') {
        this.botChoose()
      }
    }, TIMING.selectTimeout)
  }

  move(playerId: string, token: number): void {
    if (!this.game || this.phase !== 'select' || this.game.over) return
    const seat = this.seatOf(playerId)
    if (!seat || seat.index !== this.game.current) return

    const moves = legalMoves(this.game, this.game.diceValue)
    const move = moves.find((candidate) => candidate.token === token)
    if (!move) return

    this.clearSelect()
    void this.applyMove(move, this.generation)
  }

  private botChoose(): void {
    if (!this.game || this.phase !== 'select') return
    const moves = legalMoves(this.game, this.game.diceValue)
    if (moves.length === 0) {
      this.finishTurn()
      return
    }
    const move = chooseMove(this.game, moves, BOT_LEVEL, Math.random)
    this.clearSelect()
    void this.applyMove(move, this.generation)
  }

  private async applyMove(move: Move, generation: number): Promise<void> {
    if (!this.game) return
    this.clearSelect()

    const previous = this.game
    const after = playMove(previous, move)
    const cells = move.from < 0 ? 1 : move.to - move.from
    const wait =
      Math.max(TIMING.moveBase, cells * TIMING.movePerCell) +
      (move.captures.length > 0 ? TIMING.captureExtra : 420)

    this.game = after
    this.phase = 'animating'
    this.touch()
    this.emitGame()
    this.emitEvent({ type: 'move', move, prev: previous, state: after, cells })

    await sleep(wait)
    if (generation !== this.generation) return

    if (after.over) {
      this.status = 'finished'
      this.phase = 'over'
      this.emitRoom()
      this.emitGame()
      this.emitEvent({ type: 'over', state: after })
      return
    }

    this.finishTurn()
  }

  private finishTurn(): void {
    if (!this.game) return
    this.game = endTurn(this.game)
    this.phase = 'idle'
    this.touch()
    this.emitGame()
    this.emitEvent({ type: 'turn', state: this.game })
    this.maybeBot()
  }

  private maybeBot(): void {
    if (!this.game || this.phase !== 'idle' || this.game.over) return
    const current = this.game.current
    if (!this.seats[current]?.isBot) return

    const generation = this.generation
    const delay = TIMING.botThink + Math.random() * 500
    setTimeout(() => {
      if (generation !== this.generation) return
      if (this.phase !== 'idle' || !this.game || this.game.over) return
      void this.roll(null)
    }, delay)
  }

  private clearSelect(): void {
    if (this.selectTimer) {
      clearTimeout(this.selectTimer)
      this.selectTimer = null
    }
    this.legal = []
  }

  dispose(): void {
    this.generation += 1
    this.clearSelect()
  }

  private touch(): void {
    this.lastActivity = Date.now()
  }

  private emitRoom(): void {
    this.channels.room(this)
  }

  private emitGame(): void {
    this.channels.game(this)
  }

  private emitEvent(event: GameEvent): void {
    this.channels.event(this, event)
  }
}
