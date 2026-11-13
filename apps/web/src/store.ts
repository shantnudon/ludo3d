import { create } from 'zustand'
import {
  BASE_SPOTS,
  COLORS,
  POS_HOME,
  type BotLevel,
  type Cell,
  type Color,
  type GameEvent,
  type GameState,
  type JoinAck,
  type Move,
  type RoomStatus,
  type SeatInfo,
  cellFor,
  chooseMove,
  createGame,
  endTurn,
  legalMoves,
  playMove,
  roll as rollDie,
} from '@ludo/core'
import { sfx } from './audio'
import { getSocket } from './net'

export type Phase = 'menu' | 'idle' | 'rolling' | 'select' | 'animating' | 'over'

/** Solo = you against three bots, pass = four humans on one device. */
export type Mode = 'solo' | 'pass' | 'online'

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

export interface OnlineState {
  code: string
  playerId: string
  seat: number
  status: RoomStatus
  seats: SeatInfo[]
  hostSeat: number | null
  canStart: boolean
}

export const DICE_ANIM_MS = 1150

const NAME_KEY = 'ludo3d:name'
const SESSION_KEY = 'ludo3d:room'
const keyOf = (player: number, token: number) => `${player}-${token}`
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let toastSeq = 0
let socketWired = false

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? 'Player'
  } catch {
    return 'Player'
  }
}

function readSession(): { code: string; playerId: string } | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { code?: string; playerId?: string }
    if (!parsed.code || !parsed.playerId) return null
    return { code: parsed.code, playerId: parsed.playerId }
  } catch {
    return null
  }
}

function saveSession(code: string, playerId: string): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }))
  } catch {
    // ignore private mode
  }
}

function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore private mode
  }
}

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
  name: string
  online: OnlineState | null
  netBusy: boolean
  netError: string | null

  startGame: (level?: BotLevel, mode?: Mode) => void
  goMenu: () => void
  roll: () => Promise<void>
  selectToken: (player: number, token: number) => Promise<void>
  notify: (text: string) => void
  clearToast: () => void
  toggleMute: () => void
  setName: (name: string) => void
  createRoom: () => void
  joinRoom: (code: string) => void
  startOnline: () => void
  restartRoom: () => void
  leaveOnline: () => void
  resumeSession: () => void
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
    if (get().online) return
    const state = get()
    if (state.phase !== 'idle' || state.busy || state.game.over) return
    if (!state.game.players[state.game.current]?.isBot) return
    const delay = 650 + Math.random() * 550
    setTimeout(() => {
      const next = get()
      if (
        !next.online &&
        next.phase === 'idle' &&
        !next.busy &&
        !next.game.over &&
        next.game.players[next.game.current]?.isBot
      ) {
        void next.roll()
      }
    }, delay)
  }

  /** Describes how a move should be animated, both locally and online. */
  const buildAnims = (game: GameState, move: Move) => {
    const mover = game.players[move.player]!
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
    const now = performance.now()
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

    return { anims, hopMs }
  }

  const runMove = async (move: Move) => {
    const snapshot = get()
    const game = snapshot.game
    const { anims, hopMs } = buildAnims(game, move)

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

  const applyJoin = (ack: Extract<JoinAck, { ok: true }>) => {
    saveSession(ack.code, ack.playerId)
    set({
      online: {
        code: ack.code,
        playerId: ack.playerId,
        seat: ack.seat,
        status: ack.room.status,
        seats: ack.room.seats,
        hostSeat: ack.room.hostSeat,
        canStart: ack.room.canStart,
      },
      mode: 'online',
      netBusy: false,
      netError: null,
      anims: {},
      legalKeys: [],
      toast: null,
      busy: false,
    })
  }

  const handleEvent = (event: GameEvent) => {
    switch (event.type) {
      case 'roll': {
        set((state) => ({
          diceValue: event.value,
          diceKey: state.diceKey + 1,
          phase: 'rolling',
          legalKeys: [],
        }))
        sfx.play('roll')
        break
      }
      case 'select': {
        const online = get().online
        const mine = Boolean(online && event.state.current === online.seat)
        set({
          game: event.state,
          phase: 'select',
          legalKeys: mine ? event.legal : [],
        })
        break
      }
      case 'move': {
        const { anims, hopMs } = buildAnims(event.prev, event.move)
        set({
          game: event.state,
          anims,
          phase: 'animating',
          legalKeys: [],
        })
        sfx.play('hop')
        window.setTimeout(() => {
          if (event.move.captures.length > 0) {
            sfx.play('capture')
            notify(
              event.move.captures.length > 1 ? 'Double capture!' : 'Captured!',
            )
          }
          if (event.move.reachedHome) {
            sfx.play('home')
            notify('Token home!')
          }
        }, hopMs + 60)
        window.setTimeout(
          () => set({ anims: {} }),
          hopMs + (event.move.captures.length > 0 ? 720 : 260),
        )
        break
      }
      case 'noMove':
        notify('No legal move')
        break
      case 'turn':
        set({ game: event.state, phase: 'idle' })
        break
      case 'over':
        set({ game: event.state, phase: 'over' })
        sfx.play('win')
        break
    }
  }

  const wireSocket = () => {
    const socket = getSocket()
    if (socketWired) return socket
    socketWired = true

    socket.on('room', (room) => {
      const online = get().online
      if (!online) return
      set({
        online: {
          ...online,
          status: room.status,
          seats: room.seats,
          hostSeat: room.hostSeat,
          canStart: room.canStart,
        },
      })
    })

    socket.on('game', (snapshot) => {
      const online = get().online
      if (!online) return
      set({
        game: snapshot.state,
        phase: snapshot.phase,
        diceValue: snapshot.diceValue,
        legalKeys:
          snapshot.phase === 'select' && snapshot.state.current === online.seat
            ? snapshot.legal
            : [],
      })
    })

    socket.on('event', handleEvent)
    socket.on('net:error', (message) => set({ netError: message }))
    socket.on('connect_error', () =>
      set({
        netError:
          'Game server not reachable. Start it with "pnpm dev:server" and try again.',
        netBusy: false,
      }),
    )

    socket.on('connect', () => {
      const online = get().online
      const session = online
        ? { code: online.code, playerId: online.playerId }
        : readSession()
      if (!session) return
      socket.emit('room:rejoin', session, (ack) => {
        if (!ack.ok) {
          clearSession()
          set({ online: null, netError: ack.error })
          return
        }
        applyJoin(ack)
      })
    })

    return socket
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
    name: readName(),
    online: null,
    netBusy: false,
    netError: null,

    startGame: (level, mode) => {
      const nextLevel = level ?? get().level
      const nextMode = mode ?? get().mode
      const humans = nextMode === 'pass' ? [...COLORS] : [get().human]
      set({
        game: createGame(humans),
        level: nextLevel,
        mode: nextMode === 'online' ? 'solo' : nextMode,
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

    roll: async () => {
      const state = get()
      if (state.online) {
        if (state.phase !== 'idle' || state.game.over) return
        if (state.game.current !== state.online.seat) return
        getSocket().emit('game:roll')
        return
      }
      await rollNow()
    },

    selectToken: async (player, token) => {
      const state = get()
      if (state.online) {
        if (state.phase !== 'select' || state.game.current !== state.online.seat) return
        getSocket().emit('game:move', { token })
        set({ legalKeys: [] })
        return
      }
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

    setName: (name) => {
      const clean = name.slice(0, 16)
      set({ name: clean })
      try {
        window.localStorage.setItem(NAME_KEY, clean)
      } catch {
        // ignore private mode
      }
    },

    createRoom: () => {
      const socket = wireSocket()
      if (!socket.connected) socket.connect()
      set({ netBusy: true, netError: null })
      socket.emit('room:create', { name: get().name }, (ack) => {
        if (!ack.ok) {
          set({ netBusy: false, netError: ack.error })
          return
        }
        sfx.play('click')
        applyJoin(ack)
      })
    },

    joinRoom: (code) => {
      const socket = wireSocket()
      if (!socket.connected) socket.connect()
      set({ netBusy: true, netError: null })
      socket.emit(
        'room:join',
        { code: code.trim().toUpperCase(), name: get().name },
        (ack) => {
          if (!ack.ok) {
            set({ netBusy: false, netError: ack.error })
            return
          }
          sfx.play('click')
          applyJoin(ack)
        },
      )
    },

    startOnline: () => {
      getSocket().emit('room:start')
    },

    restartRoom: () => {
      getSocket().emit('room:restart')
    },

    leaveOnline: () => {
      const online = get().online
      if (online) getSocket().emit('room:leave')
      clearSession()
      set({
        online: null,
        phase: 'menu',
        mode: 'solo',
        netBusy: false,
        netError: null,
        anims: {},
        legalKeys: [],
        toast: null,
        game: createGame('blue'),
      })
      sfx.play('click')
    },

    resumeSession: () => {
      if (get().online) return
      const session = readSession()
      if (!session) return
      const socket = wireSocket()
      if (!socket.connected) {
        socket.connect()
        return
      }
      socket.emit('room:rejoin', session, (ack) => {
        if (!ack.ok) {
          clearSession()
          return
        }
        applyJoin(ack)
      })
    },
  }
})

// Handy for debugging and for automated smoke tests during development.
if (import.meta.env.DEV) {
  ;(window as unknown as { __ludo?: typeof useGame }).__ludo = useGame
}
