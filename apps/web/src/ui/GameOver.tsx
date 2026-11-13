import type { CSSProperties } from 'react'
import { COLOR_HEX, POS_HOME, standings } from '@ludo/core'
import { useGame } from '../store'
import { COLOR_LABEL } from './labels'

export function GameOver() {
  const game = useGame((state) => state.game)
  const human = useGame((state) => state.human)
  const level = useGame((state) => state.level)
  const mode = useGame((state) => state.mode)
  const online = useGame((state) => state.online)
  const startGame = useGame((state) => state.startGame)
  const goMenu = useGame((state) => state.goMenu)
  const restartRoom = useGame((state) => state.restartRoom)
  const leaveOnline = useGame((state) => state.leaveOnline)

  const order = standings(game)
  const winner = order[0]!
  const winnerIndex = game.players.findIndex((player) => player.color === winner)

  const youIndex = online
    ? online.seat
    : mode === 'solo'
      ? game.players.findIndex((player) => player.color === human)
      : -1
  const won = winnerIndex === youIndex

  const isHost = Boolean(online && online.seat === online.hostSeat)
  const labelFor = (index: number) => {
    if (online) return online.seats[index]?.name ?? COLOR_LABEL[game.players[index]!.color]
    return COLOR_LABEL[game.players[index]!.color]
  }

  const title = won
    ? 'You win the crown'
    : online
      ? `${labelFor(winnerIndex)} takes the crown`
      : `${COLOR_LABEL[winner]} takes the crown`

  return (
    <div className="overlay">
      <div className="panel">
        <p className="eyebrow">Final standings</p>
        <h2>{title}</h2>

        <ol className="ranking">
          {order.map((color, rank) => {
            const index = game.players.findIndex((player) => player.color === color)
            const player = game.players[index]!
            const homes = player.tokens.filter((pos) => pos === POS_HOME).length
            return (
              <li
                key={color}
                className={
                  index === youIndex
                    ? 'me'
                    : rank === 0
                      ? 'winner'
                      : ''
                }
              >
                <span className="rank">{rank + 1}</span>
                <i
                  className="dot"
                  style={{ background: COLOR_HEX[color] } as CSSProperties}
                />
                <span className="who">
                  {labelFor(index)}
                  {index === youIndex ? ' (you)' : ''}
                </span>
                <span className="homes">{homes}/4</span>
              </li>
            )
          })}
        </ol>

        {online ? (
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={restartRoom}
              disabled={!isHost}
            >
              {isHost ? 'BACK TO LOBBY' : 'WAITING FOR HOST…'}
            </button>
            <button type="button" className="ghost" onClick={leaveOnline}>
              Leave
            </button>
          </div>
        ) : (
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => startGame(level)}
            >
              PLAY AGAIN
            </button>
            <button type="button" className="ghost" onClick={goMenu}>
              Menu
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
