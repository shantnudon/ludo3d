import { describe, expect, it } from 'vitest'
import {
  BASE_SPOTS,
  CENTER,
  COLORS,
  HOME_PATH,
  MAIN_PATH,
  SAFE_INDICES,
  START_INDEX,
  TURN_CELL_INDEX,
  cellFor,
  isSafeAbs,
  toWorld,
} from '../board'
import { POS_HOME, createGame } from '../rules'
import { mulberry32 } from '../rng'

describe('board geometry', () => {
  it('has a 52 cell main ring', () => {
    expect(MAIN_PATH).toHaveLength(52)
  })

  it('has no duplicate cells and stays inside the grid', () => {
    const seen = new Set<string>()
    for (const [col, row] of MAIN_PATH) {
      expect(col).toBeGreaterThanOrEqual(0)
      expect(col).toBeLessThanOrEqual(14)
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThanOrEqual(14)
      seen.add(`${col},${row}`)
    }
    expect(seen.size).toBe(52)
  })

  it('gives every color exactly one start cell', () => {
    expect(START_INDEX).toEqual({ red: 13, green: 26, yellow: 39, blue: 0 })
    expect(MAIN_PATH[13]).toEqual([1, 6])
    expect(MAIN_PATH[26]).toEqual([8, 1])
    expect(MAIN_PATH[39]).toEqual([13, 8])
    expect(MAIN_PATH[0]).toEqual([6, 13])
  })

  it('places the turn cells 50 steps after each start', () => {
    for (const color of COLORS) {
      expect((START_INDEX[color] + 50) % 52).toBe(TURN_CELL_INDEX[color])
    }
    expect(MAIN_PATH[TURN_CELL_INDEX.red]).toEqual([0, 7])
    expect(MAIN_PATH[TURN_CELL_INDEX.green]).toEqual([7, 0])
    expect(MAIN_PATH[TURN_CELL_INDEX.yellow]).toEqual([14, 7])
    expect(MAIN_PATH[TURN_CELL_INDEX.blue]).toEqual([7, 14])
  })

  it('keeps the four turn cells 13 apart', () => {
    const order = [TURN_CELL_INDEX.red, TURN_CELL_INDEX.green, TURN_CELL_INDEX.yellow, TURN_CELL_INDEX.blue]
    for (let i = 0; i < 4; i += 1) {
      const next = order[(i + 1) % 4]!
      expect((next - order[i]! + 52) % 52).toBe(13)
    }
  })

  it('has 5 home cells per color leading to the center', () => {
    for (const color of COLORS) {
      expect(HOME_PATH[color]).toHaveLength(5)
      const last = HOME_PATH[color][4]!
      const distance = Math.abs(last[0] - CENTER[0]) + Math.abs(last[1] - CENTER[1])
      expect(distance).toBeLessThanOrEqual(2)
    }
  })

  it('maps every position of every color to a real cell', () => {
    for (const color of COLORS) {
      expect(cellFor(color, 0)).toEqual(MAIN_PATH[START_INDEX[color]])
      expect(cellFor(color, 50)).toEqual(MAIN_PATH[TURN_CELL_INDEX[color]])
      expect(cellFor(color, 51)).toEqual(HOME_PATH[color][0])
      expect(cellFor(color, 55)).toEqual(HOME_PATH[color][4])
      expect(cellFor(color, POS_HOME)).toEqual(CENTER)
      for (let pos = 0; pos <= POS_HOME; pos += 1) {
        expect(cellFor(color, pos)).toBeDefined()
      }
    }
  })

  it('has 8 unique safe cells, 4 of them start cells', () => {
    expect(SAFE_INDICES.size).toBe(8)
    for (const color of COLORS) {
      expect(isSafeAbs(START_INDEX[color])).toBe(true)
      expect(isSafeAbs((START_INDEX[color] + 8) % 52)).toBe(true)
    }
  })

  it('places four base spots per color inside the base', () => {
    expect(BASE_SPOTS.red).toHaveLength(4)
    const unique = new Set(BASE_SPOTS.red.map((cell) => cell.join(',')))
    expect(unique.size).toBe(4)
  })

  it('converts grid coordinates to world space around the origin', () => {
    expect(toWorld(CENTER)).toEqual([0, 0])
    expect(toWorld([0, 0])).toEqual([-7, -7])
    expect(toWorld([14, 14])).toEqual([7, 7])
  })
})

describe('game setup', () => {
  it('starts with four tokens parked in base', () => {
    for (const color of COLORS) {
      const game = createGame(color)
      expect(game.players).toHaveLength(4)
      expect(game.players.map((p) => p.color)).toEqual([...COLORS])
      expect(game.players.filter((p) => p.isBot)).toHaveLength(3)
      expect(game.current).toBe(game.players.findIndex((p) => p.color === color))
      expect(game.players.flatMap((p) => p.tokens).every((pos) => pos === -1)).toBe(true)
    }
  })

  it('can seat four humans for pass and play', () => {
    const game = createGame([...COLORS])
    expect(game.players.every((player) => !player.isBot)).toBe(true)
    expect(game.current).toBe(0)

    const duo = createGame(['green', 'yellow'])
    expect(duo.players.filter((player) => !player.isBot).map((p) => p.color)).toEqual([
      'green',
      'yellow',
    ])
    expect(duo.current).toBe(1)
  })

  it('uses a deterministic rng', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
