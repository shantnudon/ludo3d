import { POS_BASE, POS_HOME, absIndex, isSafeAbs } from './board'
import {
  type GameState,
  type Move,
  currentPlayer,
  endTurn,
  finishedCount,
  legalMoves,
  playMove,
  roll,
} from './rules'

export type BotLevel = 'easy' | 'medium' | 'hard'

/**
 * Picks a move for the bot.
 *
 * easy   – pure random, good for letting a child win.
 * medium – greedy heuristic with a little noise so it is not predictable.
 * hard   – same heuristic, but it actually fears getting captured.
 */
export function chooseMove(
  state: GameState,
  moves: Move[],
  level: BotLevel,
  rng: () => number = Math.random,
): Move {
  if (moves.length === 0) throw new Error('chooseMove called without moves')
  if (moves.length === 1) return moves[0]!

  if (level === 'easy') {
    return moves[Math.floor(rng() * moves.length)]!
  }

  const noise = level === 'medium' ? 25 : 0
  let best = moves[0]!
  let bestScore = -Infinity

  for (const move of moves) {
    const score = scoreMove(state, move, level) + (rng() - 0.5) * 2 * noise
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }

  return best
}

export function scoreMove(
  state: GameState,
  move: Move,
  level: BotLevel = 'hard',
): number {
  const me = currentPlayer(state)
  let score = 0

  for (const capture of move.captures) {
    const victim = state.players[capture.player]!.tokens[capture.token]!
    score += 150 + victim * 0.6
  }

  if (move.reachedHome) score += 140

  if (move.from === POS_BASE) {
    score += 75
    if (me.tokens.filter((pos) => pos === POS_BASE).length >= 3) score += 35
  }

  if (move.to > 50 && move.to < POS_HOME) {
    // In the home column: nearly there, no risk anymore.
    score += 50 + move.to
  }

  if (move.to <= 50) {
    const target = absIndex(me.color, move.to)!
    if (isSafeAbs(target)) score += 40

    if (level !== 'easy') {
      const threats = countThreats(state, target)
      const exposure = isSafeAbs(target) ? 0 : threats
      score -= exposure * (level === 'hard' ? 70 : 40)
      score += move.to * 0.7
    }
  }

  score += finishedCount(state, state.current) * 6

  return score
}

/** How many opposing tokens sit 1..6 cells behind a ring cell. */
export function countThreats(state: GameState, targetAbs: number): number {
  let threats = 0
  state.players.forEach((player, index) => {
    if (index === state.current) return
    for (const pos of player.tokens) {
      if (pos < 0 || pos > 50) continue
      const oppAbs = absIndex(player.color, pos)!
      const distance = (targetAbs - oppAbs + 52) % 52
      if (distance >= 1 && distance <= 6) threats += 1
    }
  })
  return threats
}

/** Simulates one whole game, used by tests and balance checks. */
export function playBotGame(
  state: GameState,
  rng: () => number,
  level: BotLevel = 'medium',
): GameState {
  let game = state
  let guard = 0
  while (!game.over && guard < 5000) {
    guard += 1
    const result = roll(game, rng)
    if (result.forfeit) {
      game = endTurn(result.state)
      continue
    }

    const moves = legalMoves(result.state, result.value)
    if (moves.length === 0) {
      game = endTurn(result.state)
      continue
    }

    game = endTurn(playMove(result.state, chooseMove(result.state, moves, level, rng)))
  }
  return game
}
