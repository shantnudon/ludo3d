import type { CSSProperties } from 'react'
import { COLOR_HEX, POS_HOME, completionPercent } from '@ludo/core'
import { useGame } from '../store'
import { COLOR_LABEL } from './labels'

export function Hud() {
  const game = useGame((state) => state.game)
  const human = useGame((state) => state.human)
  const phase = useGame((state) => state.phase)
  const busy = useGame((state) => state.busy)
  const diceValue = useGame((state) => state.diceValue)
  const level = useGame((state) => state.level)
  const mode = useGame((state) => state.mode)
  const muted = useGame((state) => state.muted)
  const online = useGame((state) => state.online)
  const roll = useGame((state) => state.roll)
  const toggleMute = useGame((state) => state.toggleMute)
  const startGame = useGame((state) => state.startGame)
  const goMenu = useGame((state) => state.goMenu)
  const leaveOnline = useGame((state) => state.leaveOnline)

  const active = game.players[game.current]!
  const mySeat = online ? online.seat : null
  const myTurn = online ? game.current === mySeat : !active.isBot
  const canRoll = myTurn && phase === 'idle' && !busy

  const nameOf = (index: number): string => {
    if (online) {
      const seat = online.seats[index]
      if (seat) return seat.index === online.seat ? `${seat.name} (you)` : seat.name
      return COLOR_LABEL[game.players[index]!.color]
    }
    const player = game.players[index]!
    if (mode === 'solo' && player.color === human) return 'You'
    return COLOR_LABEL[player.color]
  }

  let hint: string
  if (game.over) hint = 'Game over'
  else if (phase === 'rolling') hint = 'Rolling the dice…'
  else if (phase === 'select') {
    hint = myTurn ? 'Tap a glowing token' : `${nameOf(game.current)} is picking…`
  } else if (phase === 'animating') hint = `${nameOf(game.current)} is moving…`
  else if (myTurn) hint = mode === 'pass' ? `${nameOf(game.current)}'s turn` : 'Your turn'
  else if (active.isBot) hint = `${nameOf(game.current)} is thinking…`
  else hint = `${nameOf(game.current)}'s turn`

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand">
          LUDO <span>3D</span>
        </div>

        <div className="players">
          {game.players.map((player, index) => {
            const homes = player.tokens.filter((pos) => pos === POS_HOME).length
            const captured = (game.captures?.[index] ?? 0) > 0
            const percent = completionPercent(player.tokens)
            const isActive = player.color === active.color
            const style = { '--accent': COLOR_HEX[player.color] } as CSSProperties
            return (
              <div
                key={player.color}
                className={[
                  'player',
                  isActive ? 'active' : '',
                  homes === 4 ? 'done' : '',
                ].join(' ')}
                style={style}
              >
                <i className="dot" />
                <span className="name">{nameOf(index)}</span>
                <i
                  className={`capture ${captured ? 'has' : 'none'}`}
                  title={
                    captured
                      ? `Captured ${game.captures?.[index] ?? 0} token(s)`
                      : 'No captures yet'
                  }
                />
                <span className="percent" title={`${homes}/4 tokens home`}>
                  {percent}%
                </span>
              </div>
            )
          })}
        </div>

        <div className="turn">
          <i
            className="dot"
            style={{ background: COLOR_HEX[active.color] } as CSSProperties}
          />
          <span>{hint}</span>
        </div>
      </div>

      <div className="hud-bottom">
        <div className="controls">
          <button
            type="button"
            className="icon"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>

          <button
            type="button"
            className={`roll ${canRoll ? 'ready' : ''}`}
            disabled={!canRoll}
            onClick={() => void roll()}
          >
            <span className="roll-face">{diceValue || '?'}</span>
            <span className="roll-label">ROLL</span>
          </button>

          {!online && (
            <button
              type="button"
              className="icon"
              onClick={() => startGame(level)}
              aria-label="Restart"
              title="Restart"
            >
              ⟳
            </button>
          )}
        </div>

        <div className="meta">
          {online ? (
            <button type="button" className="link" onClick={leaveOnline}>
              Leave room
            </button>
          ) : (
            <button type="button" className="link" onClick={goMenu}>
              Menu
            </button>
          )}
          <span className="badge">
            {online
              ? `room ${online.code}`
              : mode === 'pass'
                ? 'pass & play'
                : `${level} bots`}
          </span>
        </div>
      </div>
    </div>
  )
}
