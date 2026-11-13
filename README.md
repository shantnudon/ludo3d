# Ludo 3D

A genuine 3D Ludo board game that runs in the browser — wooden board, brass inlay,
glossy pawns, a dice tray on the table and three bots to beat. Play solo, pass one
device around, or create an online room and share a 4-letter code; empty seats are
filled by bots. Built so the same rules engine can power more classic board games
later (Snakes & Ladders, Chess, Carrom…).

![board](docs/board.png)

<p align="center">
  <img src="docs/mobile.png" alt="Ludo 3D on a phone" width="260" />
  <img src="docs/lobby.png" alt="Online room lobby" width="420" />
</p>

## What is in the box

- **3D board** modelled from code (no downloaded assets): 52-cell ring, four
  6×6 bases, five-cell home columns, brass trim, felt field and a real dice tray.
- **Full Ludo rules**: six to leave base, exact roll to finish, captures, safe
  squares, extra turns for a six / capture / home, three-six forfeit, ranking.
- **Three bot personalities** (easy / medium / hard) with a threat-aware
  heuristic instead of random moves.
- **Pass & play** for four humans on one device, or solo against three bots.
- **Online rooms**: create a room, share the 4-letter code (or invite link), and
  friends join from any device. The server is authoritative, seats can be
  reclaimed after a refresh, and anyone who drops off is taken over by a bot.
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
| Online | Socket.IO rooms, server-authoritative turn loop |
| Tests | Vitest (44 tests, 200 seeded full games) |
| Build | Vite + tsx |

## Getting started

```bash
pnpm install
pnpm dev          # client  → http://localhost:5173
pnpm dev:server   # server  → http://localhost:3001   (needed for online rooms)
pnpm test         # rules + bot test suite
pnpm build        # typecheck + production build
```

Solo and pass & play work without the server. For online rooms run both commands.

### Production (single process)

```bash
pnpm build        # builds apps/web/dist
pnpm start        # serves the client + socket server on :3001
```

The server serves `apps/web/dist` when it exists, so the whole game lives on one
origin. Set `PORT` to change the port, or `VITE_SERVER_URL` at build time if you
host the socket server elsewhere.

`pnpm dev` also exposes `window.__ludo` (the store) in development for debugging.

## Project layout

```
packages/core/            pure game logic, no rendering
  src/board.ts            52-cell ring, home columns, safe cells, base spots
  src/rules.ts            legal moves, captures, extra turns, ranking
  src/bot.ts              easy / medium / hard move selection
  src/rng.ts              seedable mulberry32
  src/protocol.ts         shared wire types + animation timings
  src/__tests__/          44 tests including 200 simulated games

apps/web/
  src/store.ts            turn loop: roll → move → animate → next player
  src/net.ts              socket.io client (dev: :3001, prod: same origin)
  src/scene/Board.tsx     board geometry, instanced tiles, base plates, home
  src/scene/Tokens.tsx    pawn mesh, path animation, picking
  src/scene/Dice.tsx      result-driven dice animation, tray
  src/scene/CameraRig.tsx perspective-correct camera fitting + orbit controls
  src/ui/                 HUD, start menu, lobby, standings, toasts

apps/server/
  src/room.ts             authoritative room: turns, bots, reconnects
  src/index.ts            express + socket.io wiring, room registry
```

## Online rooms

1. **Create** a room — the host gets a 4-letter code and an invite link
   (`/?room=CODE`).
2. **Join** from up to three other devices with the code, or open the link.
3. The host presses **Start**. Any seat that is still open becomes a bot, so a
   room with two people is a 2v2 humans-vs-bots match.

How the server drives it:

- Clients only send intents: `game:roll` and `game:move {token}`.
- The room validates everything with `@ludo/core` — same rules as the browser.
- The server rolls, resolves legal moves, runs bot turns, and paces the result so
  each client can play the same animation (`TIMING` is shared in `protocol.ts`).
- A player token is stored in `localStorage`, so a refresh rejoins the same seat.
- If a player disconnects mid-game the seat is handed to a bot immediately; they
  can still come back and take over again by reopening the invite link.
- Empty rooms are swept after 30 minutes without connected players.

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

1. **Logic never imports Three.js.** The whole game is replayed, tested and run
   authoritatively on the socket server with the exact same package.
2. **The dice result comes first, the animation follows.** The RNG decides the
   value, then the die is animated onto that face. This removes a whole class of
   “the dice showed six but I moved three” bugs and makes online play cheat-proof.
3. **Clients send intents, not state.** Room state only moves forward when the
   server applies a validated move, so a modified client cannot cheat.
4. **View state is derived from one `GameState`.** Animations are descriptors
   (`anims[key] = { from, cells, start, duration }`) so React re-renders never
   fight the frame loop.
5. **Instanced tiles.** 72 track tiles are one draw call, keeping mobile at 60fps.

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
- [x] Online 4-player rooms with codes, bots for empty seats and reconnects
- [ ] Snakes & Ladders (reuses board, dice, seats and turn loop)
- [ ] Chess 3D (`chess.js` for rules)
- [ ] Carrom 3D (Rapier physics — the big visual showpiece)
- [ ] Optional variants: blocking, team play, timer per turn
