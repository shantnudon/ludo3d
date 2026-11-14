import {
  type Cell,
  type Color,
  COLORS,
  POS_BASE,
  POS_HOME,
  absIndex,
  cellFor,
  isSafeAbs,
} from './board'

export { POS_BASE, POS_HOME, CENTER, cellFor, absIndex } from './board'

export interface PlayerState {
  color: Color
  isBot: boolean
  /** Four token positions: -1 base, 0..50 ring, 51..55 home column, 56 home. */
  tokens: number[]
}

export interface GameState {
  players: PlayerState[]
  /** Index into players. */
  current: number
  diceValue: number | null
  /** Consecutive sixes rolled by the current player in this turn. */
  sixStreak: number
  /** Move earned an extra turn (six, capture or reaching home). */
  extraTurn: boolean
  /** Player indices in finishing order. */
  rankings: number[]
  /** Tokens each player has captured this game, indexed by player. */
  captures: number[]
  over: boolean
  /** Increments on every turn hand-over, useful for animation keys. */
  turn: number
}

export interface Capture {
  player: number
  token: number
}

export interface Move {
  player: number
  token: number
  from: number
  to: number
  captures: Capture[]
  reachedHome: boolean
  cell: Cell
}

export interface RollResult {
  state: GameState
  value: number
  /** True when a third consecutive six forfeits the turn. */
  forfeit: boolean
}

export function createGame(humans: Color | Color[] = 'blue'): GameState {
  const humanList = Array.isArray(humans) ? humans : [humans]
  const humanSet = new Set(humanList)
  const players: PlayerState[] = COLORS.map((color) => ({
    color,
    isBot: !humanSet.has(color),
    tokens: [POS_BASE, POS_BASE, POS_BASE, POS_BASE],
  }))
  const firstHuman = players.findIndex((player) => !player.isBot)
  return {
    players,
    current: firstHuman >= 0 ? firstHuman : 0,
    diceValue: null,
    sixStreak: 0,
    extraTurn: false,
    rankings: [],
    captures: players.map(() => 0),
    over: false,
    turn: 0,
  }
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.current]!
}

export function isPlayerDone(state: GameState, index: number): boolean {
  return state.players[index]!.tokens.every((pos) => pos === POS_HOME)
}

export function finishedCount(state: GameState, index: number): number {
  return state.players[index]!.tokens.filter((pos) => pos === POS_HOME).length
}

/** Rolls the die. A third consecutive six forfeits the turn without a move. */
export function roll(state: GameState, rng: () => number): RollResult {
  const value = Math.floor(rng() * 6) + 1
  const sixStreak = value === 6 ? state.sixStreak + 1 : 0
  if (value === 6 && sixStreak >= 3) {
    return {
      state: { ...state, diceValue: null, sixStreak: 0 },
      value,
      forfeit: true,
    }
  }
  return {
    state: { ...state, diceValue: value, sixStreak },
    value,
    forfeit: false,
  }
}

export function legalMoves(state: GameState, dice = state.diceValue): Move[] {
  if (state.over || dice === null || dice < 1 || dice > 6) return []
  const player = currentPlayer(state)
  const moves: Move[] = []

  player.tokens.forEach((pos, token) => {
    if (pos === POS_HOME) return

    if (pos === POS_BASE) {
      if (dice !== 6) return
      moves.push(buildMove(state, token, POS_BASE, 0))
      return
    }

    const to = pos + dice
    if (to > POS_HOME) return
    moves.push(buildMove(state, token, pos, to))
  })

  return moves
}

function buildMove(
  state: GameState,
  token: number,
  from: number,
  to: number,
): Move {
  const player = currentPlayer(state)
  const captures: Capture[] = []

  if (to <= 50) {
    const target = absIndex(player.color, to)!
    if (!isSafeAbs(target)) {
      state.players.forEach((opponent, playerIndex) => {
        if (playerIndex === state.current) return
        opponent.tokens.forEach((pos, tokenIndex) => {
          if (pos < 0 || pos > 50) return
          if (absIndex(opponent.color, pos) === target) {
            captures.push({ player: playerIndex, token: tokenIndex })
          }
        })
      })
    }
  }

  return {
    player: state.current,
    token,
    from,
    to,
    captures,
    reachedHome: to === POS_HOME,
    cell: cellFor(player.color, to),
  }
}

export function playMove(state: GameState, move: Move): GameState {
  const players = state.players.map((player) => ({
    ...player,
    tokens: [...player.tokens],
  }))

  const me = players[state.current]!
  me.tokens[move.token] = move.to

  for (const capture of move.captures) {
    players[capture.player]!.tokens[capture.token] = POS_BASE
  }

  const rankings = [...state.rankings]
  if (
    me.tokens.every((pos) => pos === POS_HOME) &&
    !rankings.includes(state.current)
  ) {
    rankings.push(state.current)
  }

  const over = rankings.length >= players.length - 1
  const extraTurn =
    state.diceValue === 6 || move.captures.length > 0 || move.reachedHome
  const captures = [...(state.captures ?? state.players.map(() => 0))]
  captures[state.current] =
    (captures[state.current] ?? 0) + move.captures.length

  return {
    ...state,
    players,
    rankings,
    captures,
    extraTurn,
    over,
    diceValue: null,
  }
}

/** Ends the current turn, or keeps it if an extra turn was earned. */
export function endTurn(state: GameState): GameState {
  if (state.over) return state

  const keepTurn = state.extraTurn && !isPlayerDone(state, state.current)
  if (keepTurn) {
    return { ...state, extraTurn: false, diceValue: null, turn: state.turn + 1 }
  }

  let next = state.current
  for (let step = 0; step < state.players.length; step += 1) {
    next = (next + 1) % state.players.length
    if (!isPlayerDone(state, next)) break
  }

  return {
    ...state,
    current: next,
    diceValue: null,
    sixStreak: 0,
    extraTurn: false,
    turn: state.turn + 1,
  }
}

/** Steps a token needs to travel from base to home. */
export const TOKEN_STEPS = 57

/** How far a player is from winning, 0-100. */
export function completionPercent(tokens: number[]): number {
  const done = tokens.reduce(
    (sum, pos) => sum + (pos < 0 ? 0 : Math.min(TOKEN_STEPS, pos + 1)),
    0,
  )
  return Math.round((done / (tokens.length * TOKEN_STEPS)) * 100)
}

/** Final standings including the last player, who never "finishes". */
export function standings(state: GameState): Color[] {
  const order = [...state.rankings]
  state.players.forEach((_, index) => {
    if (!order.includes(index)) order.push(index)
  })
  return order.map((index) => state.players[index]!.color)
}
