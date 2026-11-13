# Ludo 3D

A genuine 3D Ludo board game that runs in the browser — wooden board, brass inlay,
glossy pawns, a dice tray on the table and three bots to beat. Built so the same
rules engine can power more classic board games later (Snakes & Ladders, Chess,
Carrom…) and an online mode.

![board](docs/board.png)

<p align="center">
  <img src="docs/mobile.png" alt="Ludo 3D on a phone" width="300" />
</p>

## What is in the box

- **3D board** modelled from code (no downloaded assets): 52-cell ring, four
  6×6 bases, five-cell home columns, brass trim, felt field and a real dice tray.
- **Full Ludo rules**: six to leave base, exact roll to finish, captures, safe
  squares, extra turns for a six / capture / home, three-six forfeit, ranking.
- **Three bot personalities** (easy / medium / hard) with a threat-aware
  heuristic instead of random moves.
- **Pass & play** for four humans on one device, or solo against three bots.
- **Animation**: hop-by-hop pawn movement, capture arcs, dice tumble that always
  lands on the value the rules already decided, camera-fitting for any screen.
- **Mobile ready**: touch controls, responsive HUD, portrait framing, PWA
  manifest so it can be installed to the home screen.
- **Synthesised sound effects** (no audio files) with a mute toggle.

## Stack

| Part | Choice |
| --- | --- |
| Rendering | Three.js + React Three Fiber + drei |
| UI | React 19 + plain CSS |
| State | Zustand |
| Rules | `@ludo/core` — pure TypeScript, zero Three.js |
| Tests | Vitest (44 tests, 200 seeded full games) |
| Build | Vite |

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # rules + bot test suite
pnpm build      # typecheck + production build
```

`pnpm dev` also exposes `window.__ludo` (the store) in development for debugging.

## Project layout

```
packages/core/            pure game logic, no rendering
  src/board.ts            52-cell ring, home columns, safe cells, base spots
  src/rules.ts            legal moves, captures, extra turns, ranking
  src/bot.ts              easy / medium / hard move selection
  src/rng.ts              seedable mulberry32
  src/__tests__/          44 tests including 200 simulated games

apps/web/
  src/store.ts            turn loop: roll → move → animate → next player
  src/scene/Board.tsx     board geometry, instanced tiles, base plates, home
  src/scene/Tokens.tsx    pawn mesh, path animation, picking
  src/scene/Dice.tsx      result-driven dice animation, tray
  src/scene/CameraRig.tsx perspective-correct camera fitting + orbit controls
  src/ui/                 HUD, start menu, standings, toasts
```

## Board model

The board is a 15×15 grid. `[col, row]` maps to world `x = col - 7`, `z = row - 7`.

A token position is a single number:

| value | meaning |
| --- | --- |
| `-1` | in base |
| `0…50` | steps along the 52-cell ring (0 = own start cell) |
| `51…55` | home column |
| `56` | home (center) |

Ring cell for a position: `MAIN_PATH[(startIndex[color] + pos) % 52]`.
Safe cells: the four start cells plus the star cells eight steps later
(`start + 8`). Each colour owns a 13-cell arm, which keeps the layout symmetric.

## Design decisions worth keeping

1. **Logic never imports Three.js.** The whole game can be replayed, tested and
   later run authoritatively on a server.
2. **The dice result comes first, the animation follows.** The RNG decides the
   value, then the die is animated onto that face. This removes a whole class of
   “the dice showed six but I moved three” bugs and makes online play cheat-proof.
3. **View state is derived from one `GameState`.** Animations are descriptors
   (`anims[key] = { from, cells, start, duration }`) so React re-renders never
   fight the frame loop.
4. **Instanced tiles.** 72 track tiles are one draw call, keeping mobile at 60fps.

## Rules implemented

- Roll a six to bring a token out of the base.
- Six, capture or reaching home grants another roll.
- Three consecutive sixes forfeit the turn.
- An exact roll is required to land on home; overshooting is illegal.
- Capturing is impossible on the eight safe cells; own tokens may stack.
- Landing on an opponent sends every opponent token on that cell back to base.
- Finishing all four tokens records your place; finished players are skipped.
- The game ends when three players have finished; the fourth gets last place.

## Roadmap

- [x] Playable Ludo 3D vs three bots
- [x] Mobile / PWA shell
- [ ] Online 4-player rooms (Colyseus, reusing `@ludo/core` on the server)
- [ ] Snakes & Ladders (reuses board, dice, seats and turn loop)
- [ ] Chess 3D (`chess.js` for rules)
- [ ] Carrom 3D (Rapier physics — the big visual showpiece)
- [ ] Optional variants: blocking, team play, timer per turn
