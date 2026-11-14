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
  type GameState,
  type Move,
  type NetPhase,
  type RoomSnapshot,
  type RoomStatus,
  type SeatInfo,
  type ServerMessage,
  type StoredRoom,
} from '@ludo/core'

export interface RoomIO {
  emit(message: ServerMessage): void
  persist(): void
}

interface Seat {
  index: number
  color: Color
  name: string
  playerId: string | null
  connected: boolean
  isBot: boolean
}

const BOT_LEVEL: BotLevel = 'medium'
const DEFAULT_NAME = 'Player'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * One authoritative room, living inside a Durable Object.
 *
 * The object is addressed by its room code, so every player of a room reaches
 * the same single-threaded instance — no locks, no race conditions. State is
 * mirrored into DO storage so a cold start keeps the table.
 */
export class Room {
  readonly code: string
  status: RoomStatus = 'lobby'
  hostSeat: number | null = null
  seats: Seat[]
  game: GameState | null = null
  phase: NetPhase = 'idle'
  diceValue = 0
  legal: string[] = []

  private io: RoomIO
  private generation = 0
  private selectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(code: string, io: RoomIO) {
    this.code = code
    this.io = io
    this.seats = COLORS.map((color, index) => ({
      index,
      color,
      name: 'Open',
      playerId: null,
      connected: false,
      isBot: false,
    }))
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

  // ------------------------------------------------------------ storage

  toStored(): StoredRoom {
    return {
      code: this.code,
      status: this.status,
      hostSeat: this.hostSeat,
      seats: this.seats.map((seat) => ({
        index: seat.index,
        color: seat.color,
        name: seat.name,
        playerId: seat.playerId,
        isBot: seat.isBot,
      })),
      game: this.game,
      phase: this.phase,
      diceValue: this.diceValue,
      legal: this.legal,
    }
  }

  restore(stored: StoredRoom): void {
    this.status = stored.status
    this.hostSeat = stored.hostSeat
    this.game = stored.game
    this.phase =
      stored.phase === 'rolling' || stored.phase === 'animating'
        ? 'idle'
        : stored.phase
    this.diceValue = stored.diceValue
    this.legal = stored.phase === 'select' ? stored.legal : []
    this.seats = stored.seats.map((seat, index) => ({
      index,
      color: seat.color,
      name: seat.name,
      playerId: seat.playerId,
      isBot: seat.isBot,
      connected: false,
    }))
    if (this.game) {
      this.seats.forEach((seat) => {
        this.game!.players[seat.index]!.isBot = seat.isBot
      })
    }
  }

  /** Called after a cold start: nudge the turn loop back to life. */
  resume(): void {
    if (this.status !== 'playing' || !this.game) return
    if (this.phase === 'select' && this.seats[this.game.current]?.isBot) {
      this.botChoose()
      return
    }
    if (this.phase === 'select') {
      this.armSelectTimeout()
      return
    }
    this.phase = 'idle'
    this.emitGame()
    this.maybeBot()
  }

  /** Push the full table state to everyone (used after a join/reconnect). */
  broadcastState(): void {
    this.emitRoom()
    if (this.game) this.emitGame()
  }

  // ---------------------------------------------------------- membership

  join(name: string): { seat: number; playerId: string } | null {
    if (this.status !== 'lobby') return null
    const seat = this.seats.find((candidate) => candidate.playerId === null)
    if (!seat) return null

    seat.playerId = crypto.randomUUID()
    seat.name = name || `${DEFAULT_NAME} ${seat.index + 1}`
    seat.connected = true
    seat.isBot = false
    this.hostSeat ??= seat.index

    this.emitRoom()
    this.emitGame()
    return { seat: seat.index, playerId: seat.playerId }
  }

  rejoin(playerId: string): number | null {
    const seat = this.seatOf(playerId)
    if (!seat) return null

    seat.connected = true
    seat.isBot = false
    if (this.game) this.game.players[seat.index]!.isBot = false
    if (this.hostSeat === null) this.hostSeat = seat.index

    this.emitRoom()
    if (this.game) this.emitGame()
    this.maybeBot()
    return seat.index
  }

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
    }

    const game = createGame(humans)
    this.seats.forEach((seat) => {
      game.players[seat.index]!.isBot = seat.isBot
    })

    const host = this.hostSeat !== null ? this.seats[this.hostSeat] : undefined
    game.current = host?.playerId
      ? host.index
      : this.seats.find((seat) => seat.playerId)!.index

    this.game = game
    this.status = 'playing'
    this.phase = 'idle'
    this.diceValue = 0
    this.legal = []
    this.generation += 1

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
    this.emitGame()
    this.emitEvent({ type: 'roll', value: result.value, forfeit: result.forfeit })

    await sleep(TIMING.roll)
    if (this.disposed || generation !== this.generation) return

    if (result.forfeit) {
      this.finishTurn()
      return
    }

    const moves = legalMoves(this.game, result.value)

    if (moves.length === 0) {
      this.emitEvent({ type: 'noMove' })
      await sleep(TIMING.noMove)
      if (this.disposed || generation !== this.generation) return
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
      if (this.disposed || generation !== this.generation) return
      const move = chooseMove(this.game, moves, BOT_LEVEL, Math.random)
      await this.applyMove(move, generation)
      return
    }

    this.phase = 'select'
    this.legal = moves.map((move) => `${move.player}-${move.token}`)
    this.emitGame()
    this.emitEvent({ type: 'select', state: this.game, legal: this.legal })
    this.armSelectTimeout()
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
    this.emitGame()
    this.emitEvent({ type: 'move', move, prev: previous, state: after, cells })

    await sleep(wait)
    if (this.disposed || generation !== this.generation) return

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
      if (this.disposed || generation !== this.generation) return
      if (this.phase !== 'idle' || !this.game || this.game.over) return
      void this.roll(null)
    }, delay)
  }

  private armSelectTimeout(): void {
    this.clearSelectTimer()
    if (this.phase !== 'select') return
    const generation = this.generation
    this.selectTimer = setTimeout(() => {
      if (this.disposed || generation !== this.generation) return
      if (this.phase === 'select') this.botChoose()
    }, TIMING.selectTimeout)
  }

  private clearSelectTimer(): void {
    if (this.selectTimer) {
      clearTimeout(this.selectTimer)
      this.selectTimer = null
    }
  }

  private clearSelect(): void {
    this.clearSelectTimer()
    this.legal = []
  }

  dispose(): void {
    this.disposed = true
    this.generation += 1
    this.clearSelect()
  }

  private emitRoom(): void {
    this.io.emit({ t: 'room', room: this.snapshot() })
    this.io.persist()
  }

  private emitGame(): void {
    this.io.emit({ t: 'game', game: this.gameSnapshot() })
    this.io.persist()
  }

  private emitEvent(event: GameEvent): void {
    this.io.emit({ t: 'event', event })
  }
}
