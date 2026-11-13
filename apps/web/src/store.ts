import { create } from 'zustand'
import {
  BASE_SPOTS,
  COLORS,
  POS_HOME,
  type BotLevel,
  type Cell,
  type Color,
  type GameState,
  type Move,
  cellFor,
  chooseMove,
  createGame,
  endTurn,
  legalMoves,
  playMove,
  roll as rollDie,
} from '@ludo/core'
import { sfx } from './audio'

export type Phase = 'menu' | 'idle' | 'rolling' | 'select' | 'animating' | 'over'

/** Solo = you against three bots, pass = four humans on one device. */
export type Mode = 'solo' | 'pass'

export interface Anim {
  from: Cell
  cells: Cell[]
  start: number
  duration: number
  kind: 'hop' | 'arc'
}

export interface Toast {
  id: number
  text: string
}

export const DICE_ANIM_MS = 1150

const keyOf = (player: number, token: number) => `${player}-${token}`
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let toastSeq = 0

interface GameStore {
  game: GameState
  phase: Phase
  diceValue: number
  diceKey: number
  anims: Record<string, Anim>
  legalKeys: string[]
  toast: Toast | null
  human: Color
  level: BotLevel
  mode: Mode
  muted: boolean
  busy: boolean

  startGame: (level?: BotLevel, mode?: Mode) => void
  goMenu: () => void
  roll: () => Promise<void>
  selectToken: (player: number, token: number) => Promise<void>
  notify: (text: string) => void
  clearToast: () => void
  toggleMute: () => void
}

export const useGame = create<GameStore>((set, get) => {
  const notify = (text: string) => {
    const id = ++toastSeq
    set({ toast: { id, text } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 1700)
  }

  const scheduleBot = () => {
    const state = get()
    if (state.phase !== 'idle' || state.busy || state.game.over) return
    if (!state.game.players[state.game.current]?.isBot) return
    const delay = 650 + Math.random() * 550
    setTimeout(() => {
      const next = get()
      if (
        next.phase === 'idle' &&
        !next.busy &&
        !next.game.over &&
        next.game.players[next.game.current]?.isBot
      ) {
        void next.roll()
      }
    }, delay)
  }

  const runMove = async (move: Move) => {
    const snapshot = get()
    const game = snapshot.game
    const mover = game.players[move.player]!
    const now = performance.now()

    const from: Cell =
      move.from === -1
        ? BASE_SPOTS[mover.color][move.token]!
        : cellFor(mover.color, move.from)

    const cells: Cell[] = []
    if (move.from === -1) {
      cells.push(cellFor(mover.color, 0))
    } else {
      for (let pos = move.from + 1; pos <= move.to; pos += 1) {
        cells.push(cellFor(mover.color, pos))
      }
    }

    const hopMs = Math.max(260, cells.length * 95)
    const anims: Record<string, Anim> = {
      [keyOf(move.player, move.token)]: {
        from,
        cells,
        start: now,
        duration: hopMs,
        kind: 'hop',
      },
    }

    const captureStart = now + hopMs + 110
    for (const capture of move.captures) {
      const victim = game.players[capture.player]!
      const victimPos = victim.tokens[capture.token]!
      anims[keyOf(capture.player, capture.token)] = {
        from: cellFor(victim.color, victimPos),
        cells: [BASE_SPOTS[victim.color][capture.token]!],
        start: captureStart,
        duration: 540,
        kind: 'arc',
      }
    }

    set({
      game: playMove(game, move),
      anims,
      phase: 'animating',
      legalKeys: [],
    })
    sfx.play('hop')

    await sleep(hopMs + 50)

    if (move.captures.length > 0) {
      sfx.play('capture')
      notify(move.captures.length > 1 ? 'Double capture!' : 'Captured!')
    }
    if (move.reachedHome) {
      sfx.play('home')
      notify('Token home!')
    }

    await sleep(move.captures.length > 0 ? 640 : 130)

    const after = get()
    const finishedPlayer = after.game.players[after.game.current]!
    const justFinished = finishedPlayer.tokens.every((pos) => pos === POS_HOME)

    set({ anims: {} })

    if (after.game.over) {
      sfx.play('win')
      set({ phase: 'over', busy: false })
      return
    }

    if (justFinished) {
      notify(`${finishedPlayer.color.toUpperCase()} finished!`)
    }

    if (after.game.extraTurn && !justFinished) {
      notify('Extra turn!')
      set({ phase: 'idle', busy: false })
    } else {
      set({ game: endTurn(after.game), phase: 'idle', busy: false })
    }

    scheduleBot()
  }

  const rollNow = async () => {
    const state = get()
    if (state.busy || state.phase !== 'idle' || state.game.over) return

    set({ busy: true })
    const result = rollDie(state.game, Math.random)
    set({
      game: result.state,
      diceValue: result.value,
      diceKey: state.diceKey + 1,
      phase: 'rolling',
      legalKeys: [],
    })
    sfx.play('roll')

    await sleep(DICE_ANIM_MS + 60)

    if (result.forfeit) {
      notify('Three sixes — turn skipped')
      set({ game: endTurn(get().game), phase: 'idle', busy: false })
      scheduleBot()
      return
    }

    const moves = legalMoves(get().game, result.value)

    if (moves.length === 0) {
      notify('No legal move')
      await sleep(650)
      set({ game: endTurn(get().game), phase: 'idle', busy: false })
      scheduleBot()
      return
    }

    const player = get().game.players[get().game.current]!

    if (player.isBot) {
      set({ phase: 'animating' })
      await sleep(500 + Math.random() * 450)
      const move = chooseMove(get().game, moves, get().level, Math.random)
      await runMove(move)
      return
    }

    if (moves.length === 1) {
      await runMove(moves[0]!)
      return
    }

    set({
      phase: 'select',
      legalKeys: moves.map((move) => keyOf(move.player, move.token)),
      busy: false,
    })
  }

  return {
    game: createGame('blue'),
    phase: 'menu',
    diceValue: 0,
    diceKey: 0,
    anims: {},
    legalKeys: [],
    toast: null,
    human: 'blue',
    level: 'medium',
    mode: 'solo',
    muted: false,
    busy: false,

    startGame: (level, mode) => {
      const nextLevel = level ?? get().level
      const nextMode = mode ?? get().mode
      const humans =
        nextMode === 'pass' ? [...COLORS] : [get().human]
      set({
        game: createGame(humans),
        level: nextLevel,
        mode: nextMode,
        phase: 'idle',
        diceValue: 0,
        diceKey: get().diceKey + 1,
        anims: {},
        legalKeys: [],
        busy: false,
        toast: null,
      })
      sfx.play('click')
      scheduleBot()
    },

    goMenu: () => {
      set({ phase: 'menu', anims: {}, legalKeys: [], busy: false, toast: null })
      sfx.play('click')
    },

    roll: rollNow,

    selectToken: async (player, token) => {
      const state = get()
      if (state.phase !== 'select' || state.busy) return
      if (state.game.current !== player) return
      const moves = legalMoves(state.game, state.game.diceValue)
      const move = moves.find((candidate) => candidate.token === token)
      if (!move) return
      set({ busy: true })
      sfx.play('click')
      await runMove(move)
    },

    notify,
    clearToast: () => set({ toast: null }),

    toggleMute: () => {
      sfx.muted = !get().muted
      set({ muted: sfx.muted })
    },
  }
})

// Handy for debugging and for automated smoke tests during development.
if (import.meta.env.DEV) {
  ;(window as unknown as { __ludo?: typeof useGame }).__ludo = useGame
}
