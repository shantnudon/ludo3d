import { describe, expect, it } from 'vitest'
import { COLORS, absIndex } from '../board'
import {
  type GameState,
  POS_HOME,
  completionPercent,
  createGame,
  endTurn,
  legalMoves,
  playMove,
  roll,
  standings,
} from '../rules'
import { mulberry32 } from '../rng'

type TokenMap = Partial<Record<(typeof COLORS)[number], number[]>>

function makeGame(options: {
  current?: (typeof COLORS)[number]
  dice?: number | null
  tokens?: TokenMap
} = {}): GameState {
  const game = createGame('red')
  const current = options.current
    ? game.players.findIndex((player) => player.color === options.current)
    : 0

  if (options.tokens) {
    for (const [color, positions] of Object.entries(options.tokens)) {
      const player = game.players.find((p) => p.color === color)
      if (!player || !positions) continue
      player.tokens = [...positions]
    }
  }

  return { ...game, current, diceValue: options.dice ?? null }
}

describe('leaving the base', () => {
  it('needs a six', () => {
    const game = makeGame({ dice: 5 })
    expect(legalMoves(game)).toHaveLength(0)

    const six = makeGame({ dice: 6 })
    const moves = legalMoves(six)
    expect(moves).toHaveLength(4)
    expect(moves.every((move) => move.from === -1 && move.to === 0)).toBe(true)
  })

  it('sends the token to its own start cell', () => {
    const game = makeGame({ current: 'blue', dice: 6 })
    const move = legalMoves(game)[0]!
    expect(move.cell).toEqual([6, 13])
  })
})

describe('moving on the ring', () => {
  it('moves by the die value', () => {
    const game = makeGame({ dice: 3, tokens: { red: [10, -1, -1, -1] } })
    const move = legalMoves(game).find((m) => m.from === 10)!
    expect(move.to).toBe(13)
    expect(move.cell).toEqual([8, 1])
  })

  it('still allows a ring move when a six is rolled', () => {
    const game = makeGame({ dice: 6, tokens: { red: [10, -1, -1, -1] } })
    const moves = legalMoves(game)
    expect(moves.some((m) => m.from === 10)).toBe(true)
  })

  it('does not let a token overshoot home', () => {
    const game = makeGame({ dice: 4, tokens: { red: [53, -1, -1, -1] } })
    const moves = legalMoves(game)
    expect(moves.some((m) => m.from === 53)).toBe(false)
  })

  it('allows the exact roll to reach home', () => {
    const game = makeGame({ dice: 3, tokens: { red: [53, -1, -1, -1] } })
    const move = legalMoves(game).find((m) => m.from === 53)!
    expect(move.to).toBe(POS_HOME)
    expect(move.reachedHome).toBe(true)
  })

  it('prevents moving a token that already finished', () => {
    const game = makeGame({ dice: 6, tokens: { red: [56, -1, -1, -1] } })
    expect(legalMoves(game).some((m) => m.from === 56)).toBe(false)
  })
})

describe('captures', () => {
  it('sends an opponent home from an open cell', () => {
    const game = makeGame({
      dice: 2,
      tokens: { red: [0, -1, -1, -1], blue: [15, -1, -1, -1] },
    })
    // red 0 -> absolute 13, +2 -> absolute 15 (not a safe cell)
    expect(absIndex('red', 2)).toBe(15)
    expect(absIndex('blue', 15)).toBe(15)

    const move = legalMoves(game).find((m) => m.from === 0)!
    expect(move.captures).toEqual([{ player: 3, token: 0 }])

    const after = playMove(game, move)
    expect(after.players[3]!.tokens[0]).toBe(-1)
    expect(after.players[0]!.tokens[0]).toBe(2)
  })

  it('captures every opponent token stacked on the cell', () => {
    const game = makeGame({
      dice: 2,
      tokens: { red: [0, -1, -1, -1], blue: [15, 15, -1, -1] },
    })
    const move = legalMoves(game).find((m) => m.from === 0)!
    expect(move.captures).toHaveLength(2)
    const after = playMove(game, move)
    expect(after.players[3]!.tokens).toEqual([-1, -1, -1, -1])
  })

  it('counts captures per player', () => {
    const game = makeGame({
      dice: 2,
      tokens: { red: [0, -1, -1, -1], blue: [15, -1, -1, -1] },
    })
    expect(game.captures).toEqual([0, 0, 0, 0])
    const move = legalMoves(game).find((m) => m.from === 0)!
    const after = playMove(game, move)
    expect(after.captures).toEqual([1, 0, 0, 0])
  })

  it('never captures on a safe cell', () => {
    const game = makeGame({
      dice: 3,
      tokens: { red: [5, -1, -1, -1], blue: [21, -1, -1, -1] },
    })
    // red 5 -> absolute 18, +3 -> absolute 21 which is a star cell
    expect(absIndex('red', 8)).toBe(21)
    const move = legalMoves(game).find((m) => m.from === 5)!
    expect(move.captures).toHaveLength(0)
  })

  it('allows own tokens to stack', () => {
    const game = makeGame({
      dice: 2,
      tokens: { red: [0, 2, -1, -1] },
    })
    const move = legalMoves(game).find((m) => m.from === 0)!
    expect(move.captures).toHaveLength(0)
    expect(playMove(game, move).players[0]!.tokens[0]).toBe(2)
  })
})

describe('extra turns', () => {
  it('grants one for rolling a six', () => {
    const game = makeGame({ dice: 6, tokens: { red: [10, -1, -1, -1] } })
    const move = legalMoves(game).find((m) => m.from === 10)!
    const after = playMove(game, move)
    expect(after.extraTurn).toBe(true)
    expect(endTurn(after).current).toBe(0)
  })

  it('grants one for a capture', () => {
    const game = makeGame({
      dice: 2,
      tokens: { red: [0, -1, -1, -1], blue: [15, -1, -1, -1] },
    })
    const move = legalMoves(game).find((m) => m.from === 0)!
    const after = playMove(game, move)
    expect(after.extraTurn).toBe(true)
  })

  it('grants one for reaching home', () => {
    const game = makeGame({ dice: 1, tokens: { red: [55, -1, -1, -1] } })
    const move = legalMoves(game).find((m) => m.from === 55)!
    expect(playMove(game, move).extraTurn).toBe(true)
  })

  it('passes the turn otherwise', () => {
    const game = makeGame({ dice: 2, tokens: { red: [10, -1, -1, -1] } })
    const move = legalMoves(game).find((m) => m.from === 10)!
    const after = endTurn(playMove(game, move))
    expect(after.current).toBe(1)
    expect(after.sixStreak).toBe(0)
    expect(after.diceValue).toBeNull()
  })
})

describe('three sixes', () => {
  it('forfeits the turn', () => {
    const game = { ...makeGame({}), sixStreak: 2 }
    const result = roll(game, () => 0.99) // always a six
    expect(result.value).toBe(6)
    expect(result.forfeit).toBe(true)
    expect(result.state.diceValue).toBeNull()
    expect(result.state.sixStreak).toBe(0)
  })

  it('does not forfeit at two sixes', () => {
    const game = { ...makeGame({}), sixStreak: 1 }
    const result = roll(game, () => 0.99)
    expect(result.forfeit).toBe(false)
    expect(result.state.diceValue).toBe(6)
    expect(result.state.sixStreak).toBe(2)
  })

  it('resets the streak on a non six', () => {
    const game = { ...makeGame({}), sixStreak: 2 }
    const result = roll(game, () => 0)
    expect(result.value).toBe(1)
    expect(result.state.sixStreak).toBe(0)
  })
})

describe('finishing and ranking', () => {
  it('records a player once all four tokens are home', () => {
    const game = makeGame({
      dice: 1,
      tokens: { red: [56, 56, 56, 55] },
    })
    const move = legalMoves(game).find((m) => m.from === 55)!
    const after = playMove(game, move)
    expect(after.rankings).toEqual([0])
    expect(after.over).toBe(false)
  })

  it('ends the game once three players finished', () => {
    const game = makeGame({
      dice: 1,
      tokens: {
        red: [56, 56, 56, 55],
        green: [56, 56, 56, 56],
        yellow: [56, 56, 56, 56],
        blue: [-1, -1, -1, -1],
      },
    })
    game.rankings = [1, 2]
    const move = legalMoves(game).find((m) => m.from === 55)!
    const after = playMove(game, move)
    expect(after.over).toBe(true)
    expect(standings(after)).toEqual(['green', 'yellow', 'red', 'blue'])
  })

  it('skips finished players when handing over the turn', () => {
    const game = makeGame({
      current: 'green',
      dice: 2,
      tokens: {
        red: [56, 56, 56, 56],
        green: [10, -1, -1, -1],
      },
    })
    const move = legalMoves(game).find((m) => m.from === 10)!
    const after = endTurn(playMove(game, move))
    expect(after.current).toBe(2) // yellow, red is done
  })

  it('does not give an extra turn to a player who just finished', () => {
    const game = makeGame({
      dice: 1,
      tokens: { red: [56, 56, 56, 55] },
    })
    const move = legalMoves(game).find((m) => m.from === 55)!
    const after = endTurn(playMove(game, move))
    expect(after.current).toBe(1)
  })
})

describe('completion percentage', () => {
  it('measures how far a player is from home', () => {
    expect(completionPercent([-1, -1, -1, -1])).toBe(0)
    expect(completionPercent([56, 56, 56, 56])).toBe(100)
    expect(completionPercent([56, -1, -1, -1])).toBe(25)
    expect(completionPercent([10, -1, -1, -1])).toBe(5)
  })
})

describe('full games', () => {
  it('plays 200 seeded games that all terminate', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = mulberry32(seed * 7919)
      let game = createGame('red')
      let guard = 0

      while (!game.over && guard < 6000) {
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
        const move = moves[3 % moves.length]!
        game = endTurn(playMove(result.state, move))
      }

      expect(guard).toBeLessThan(6000)
      expect(game.over).toBe(true)
      expect(standings(game)).toHaveLength(4)

      // Every token of every player is either finished or still in play.
      const positions = game.players.flatMap((player) => player.tokens)
      expect(positions.every((pos) => pos >= -1 && pos <= 56)).toBe(true)

      // At least three players completed all four tokens.
      const done = game.players.filter((p) => p.tokens.every((pos) => pos === 56))
      expect(done.length).toBeGreaterThanOrEqual(3)
    }
  })
})
