/**
 * The Ludo board, described as data only.
 *
 * Coordinate system: a classic 15x15 grid, [col, row], with row 0 at the top.
 * World space conversion: x = col - 7, z = row - 7, one grid cell = 1 unit.
 *
 * The 52 cell main ring is split into four 13 cell arms, exactly like a real
 * board. Each arm belongs to one color, and holds that color's start cell, its
 * star (safe) cell and the entry cell for its home column.
 */

export type Color = 'red' | 'green' | 'yellow' | 'blue'

export const COLORS: readonly Color[] = ['red', 'green', 'yellow', 'blue']

/** [col, row] on the 15x15 grid. */
export type Cell = readonly [number, number]

export const GRID = 15
export const CENTER: Cell = [7, 7]

/** The 52 cell ring, clockwise. */
export const MAIN_PATH: readonly Cell[] = [
  // bottom arm, leaving (6,13) going up
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  // left arm, going left along the bottom row of the arm
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  // left turn cell
  [0, 7],
  // left arm, going right along the top row of the arm
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  // top arm, going up
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  // top turn cell
  [7, 0],
  // top arm, going down
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  // right arm, going right
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  // right turn cell
  [14, 7],
  // right arm, going left
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  // bottom arm, going down
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  // bottom turn cell
  [7, 14],
  // home stretch of the bottom arm
  [6, 14],
]

/** Where each color's tokens enter the ring. */
export const START_INDEX: Record<Color, number> = {
  red: 13, // [1,6]
  green: 26, // [8,1]
  yellow: 39, // [13,8]
  blue: 0, // [6,13]
}

/**
 * Last ring cell before turning into the home column (== start + 50, mod 52).
 * red [0,7] · green [7,0] · yellow [14,7] · blue [7,14]
 */
export const TURN_CELL_INDEX: Record<Color, number> = {
  red: 11,
  green: 24,
  yellow: 37,
  blue: 50,
}

/** Five colored cells per color, from outer end to the center. */
export const HOME_PATH: Record<Color, readonly Cell[]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
}

/**
 * Safe squares: the four start cells plus the four star cells eight steps
 * further along the ring. Captures are impossible on these cells.
 */
export const SAFE_INDICES: ReadonlySet<number> = new Set<number>([
  START_INDEX.red,
  START_INDEX.green,
  START_INDEX.yellow,
  START_INDEX.blue,
  (START_INDEX.red + 8) % 52,
  (START_INDEX.green + 8) % 52,
  (START_INDEX.yellow + 8) % 52,
  (START_INDEX.blue + 8) % 52,
])

/** Center of each color's 6x6 base, in grid coordinates. */
export const BASE_ORIGIN: Record<Color, Cell> = {
  red: [2.5, 2.5],
  green: [11.5, 2.5],
  yellow: [11.5, 11.5],
  blue: [2.5, 11.5],
}

/** The four parking spots inside each base, in grid coordinates. */
export const BASE_SPOTS: Record<Color, readonly Cell[]> = {
  red: [[1, 1], [4, 1], [1, 4], [4, 4]],
  green: [[10, 1], [13, 1], [10, 4], [13, 4]],
  yellow: [[10, 10], [13, 10], [10, 13], [13, 13]],
  blue: [[1, 10], [4, 10], [1, 13], [4, 13]],
}

/** Token position values: -1 is base, 0..50 ring, 51..55 home column, 56 home. */
export const POS_BASE = -1
export const POS_HOME = 56

export const COLOR_HEX: Record<Color, string> = {
  red: '#e0433f',
  green: '#2fa857',
  yellow: '#f0b429',
  blue: '#3a7bdc',
}

export function toWorld(cell: Cell): [number, number] {
  return [cell[0] - 7, cell[1] - 7]
}

export function absIndex(color: Color, pos: number): number | null {
  if (pos < 0 || pos > 50) return null
  return (START_INDEX[color] + pos) % 52
}

export function isSafeAbs(index: number): boolean {
  return SAFE_INDICES.has(index)
}

/** Grid cell for a token position. Base (-1) must be resolved with BASE_SPOTS. */
export function cellFor(color: Color, pos: number): Cell {
  if (pos <= 50) {
    return MAIN_PATH[(START_INDEX[color] + pos) % 52]!
  }
  if (pos <= 55) {
    return HOME_PATH[color][pos - 51]!
  }
  return CENTER
}

/** Which color owns the 13 cell arm containing an absolute ring index. */
export function armOwner(index: number): Color {
  if (index >= 5 && index <= 17) return 'red'
  if (index >= 18 && index <= 30) return 'green'
  if (index >= 31 && index <= 43) return 'yellow'
  return 'blue'
}
