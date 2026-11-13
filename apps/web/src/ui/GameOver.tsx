import type { CSSProperties } from 'react'
import { COLOR_HEX, POS_HOME, standings } from '@ludo/core'
import { useGame } from '../store'
import { COLOR_LABEL } from './labels'

export function GameOver() {
  const game = useGame((state) => state.game)
  const human = useGame((state) => state.human)
  const level = useGame((state) => state.level)
  const mode = useGame((state) => state.mode)
  const startGame = useGame((state) => state.startGame)
  const goMenu = useGame((state) => state.goMenu)

  const order = standings(game)
  const winner = order[0]!
  const won = winner === human

  return (
    <div className="overlay">
      <div className="panel">
        <p className="eyebrow">Final standings</p>
        <h2>{won ? 'You win the crown' : `${COLOR_LABEL[winner]} takes the crown`}</h2>

        <ol className="ranking">
          {order.map((color, index) => {
            const player = game.players.find((candidate) => candidate.color === color)!
            const homes = player.tokens.filter((pos) => pos === POS_HOME).length
            return (
              <li
                key={color}
                className={
                  mode === 'solo' && color === human
                    ? 'me'
                    : index === 0
                      ? 'winner'
                      : ''
                }
              >
                <span className="rank">{index + 1}</span>
                <i
                  className="dot"
                  style={{ background: COLOR_HEX[color] } as CSSProperties}
                />
                <span className="who">
                  {COLOR_LABEL[color]}
                  {mode === 'solo' && color === human ? ' (you)' : ''}
                </span>
                <span className="homes">{homes}/4</span>
              </li>
            )
          })}
        </ol>

        <div className="row">
          <button type="button" className="primary" onClick={() => startGame(level)}>
            PLAY AGAIN
          </button>
          <button type="button" className="ghost" onClick={goMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  )
}
