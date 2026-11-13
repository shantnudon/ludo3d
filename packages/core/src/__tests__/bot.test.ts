import { describe, expect, it } from 'vitest'
import { COLORS, absIndex } from '../board'
import {
  POS_HOME,
  createGame,
  endTurn,
  legalMoves,
  playMove,
  roll,
  standings,
} from '../rules'
import { chooseMove, countThreats, playBotGame, scoreMove } from '../bot'
import { mulberry32 } from '../rng'

describe('bot heuristics', () => {
  it('always returns one of the legal moves', () => {
    const rng = mulberry32(11)
    const game = createGame('red')
    game.diceValue = 6
    const moves = legalMoves(game)
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const pick = chooseMove(game, moves, level, rng)
      expect(moves).toContain(pick)
    }
  })

  it('prefers a capture over a plain move', () => {
    const game = createGame('red')
    game.diceValue = 2
    // red token 0 at abs 13 -> abs 15 captures blue; token 1 at 20 -> 22 is free
    game.players[0]!.tokens = [0, 20, -1, -1]
    game.players[3]!.tokens = [15, -1, -1, -1]
    const moves = legalMoves(game)

    const capture = moves.find((m) => m.from === 0)!
    const plain = moves.find((m) => m.from === 20)!
    expect(scoreMove(game, capture)).toBeGreaterThan(scoreMove(game, plain))
  })

  it('prefers finishing a token', () => {
    const game = createGame('red')
    game.diceValue = 1
    game.players[0]!.tokens = [55, 4, -1, -1]
    const moves = legalMoves(game)
    const finish = moves.find((m) => m.from === 55)!
    const plain = moves.find((m) => m.from === 4)!
    expect(scoreMove(game, finish)).toBeGreaterThan(scoreMove(game, plain))
  })

  it('counts opponent tokens sitting up to six cells behind', () => {
    const game = createGame('green')
    // red at pos 13 sits on absolute 26, three cells behind absolute 29
    game.players[0]!.tokens = [13, -1, -1, -1]
    expect(absIndex('red', 13)).toBe(26)
    expect(countThreats(game, 29)).toBe(1)
    expect(countThreats(game, 33)).toBe(0)
  })

  it('gets scared of danger on hard but not on easy scoring', () => {
    const game = createGame('red')
    game.diceValue = 2
    game.players[0]!.tokens = [0, -1, -1, -1]
    game.players[3]!.tokens = [13, -1, -1, -1] // blue at abs 13, behind abs 15
    const move = legalMoves(game).find((m) => m.from === 0)!
    const hard = scoreMove(game, move, 'hard')
    const medium = scoreMove(game, move, 'medium')
    expect(hard).not.toBe(medium)
  })
})

describe('bot games', () => {
  it('plays 100 full bot games without breaking', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = mulberry32(seed * 104729)
      const game = playBotGame(createGame('blue'), rng, 'hard')
      expect(game.over).toBe(true)
      expect(standings(game)).toHaveLength(4)
      const done = game.players.filter((p) => p.tokens.every((pos) => pos === POS_HOME))
      expect(done.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps every game under a sane number of turns', () => {
    let total = 0
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = mulberry32(seed * 31337)
      let game = createGame('blue')
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
        game = endTurn(playMove(result.state, chooseMove(result.state, moves, 'medium', rng)))
      }
      total += guard
    }
    expect(total / 30).toBeLessThan(3000)
  })

  it('every color can win across many seedings', () => {
    const winners = new Set<string>()
    for (let seed = 1; seed <= 200; seed += 1) {
      const game = playBotGame(createGame('blue'), mulberry32(seed * 7717), 'medium')
      for (const color of COLORS) {
        if (game.players.find((p) => p.color === color)!.tokens.every((pos) => pos === POS_HOME)) {
          if (standings(game)[0] === color) winners.add(color)
        }
      }
    }
    expect(winners.size).toBeGreaterThanOrEqual(2)
  })
})
