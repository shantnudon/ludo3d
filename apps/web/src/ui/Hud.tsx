import type { CSSProperties } from 'react'
import { COLOR_HEX, POS_HOME } from '@ludo/core'
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
  const roll = useGame((state) => state.roll)
  const toggleMute = useGame((state) => state.toggleMute)
  const startGame = useGame((state) => state.startGame)
  const goMenu = useGame((state) => state.goMenu)

  const active = game.players[game.current]!
  const isHumanTurn = !active.isBot
  const canRoll = isHumanTurn && phase === 'idle' && !busy

  let hint = mode === 'pass' ? `${COLOR_LABEL[active.color]}'s turn` : 'Your turn'
  if (phase === 'rolling') hint = 'Rolling the dice…'
  else if (phase === 'select') hint = 'Tap a glowing token'
  else if (phase === 'animating') hint = `${COLOR_LABEL[active.color]} is moving…`
  else if (game.over) hint = 'Game over'
  else if (!isHumanTurn) hint = `${COLOR_LABEL[active.color]} is thinking…`

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand">
          LUDO <span>3D</span>
        </div>

        <div className="players">
          {game.players.map((player) => {
            const homes = player.tokens.filter((pos) => pos === POS_HOME).length
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
                <span className="name">
                  {mode === 'solo' && player.color === human
                    ? 'You'
                    : COLOR_LABEL[player.color]}
                </span>
                <span className="homes">{homes}/4</span>
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

          <button
            type="button"
            className="icon"
            onClick={() => startGame(level)}
            aria-label="Restart"
            title="Restart"
          >
            ⟳
          </button>
        </div>

        <div className="meta">
          <button type="button" className="link" onClick={goMenu}>
            Menu
          </button>
          <span className="badge">
            {mode === 'pass' ? 'pass & play' : `${level} bots`}
          </span>
        </div>
      </div>
    </div>
  )
}
