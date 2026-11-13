import { useState } from 'react'
import { COLOR_HEX } from '@ludo/core'
import { useGame } from '../store'

export function Lobby() {
  const online = useGame((state) => state.online)
  const startOnline = useGame((state) => state.startOnline)
  const leaveOnline = useGame((state) => state.leaveOnline)
  const netError = useGame((state) => state.netError)
  const [copied, setCopied] = useState(false)

  if (!online) return null

  const me = online.seats[online.seat]
  const isHost = online.seat === online.hostSeat
  const humans = online.seats.filter((seat) => seat.hasPlayer).length
  const link = `${window.location.origin}${window.location.pathname}?room=${online.code}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copy this link', link)
    }
  }

  return (
    <div className="overlay">
      <div className="panel">
        <p className="eyebrow">Room code</p>
        <div className="room-code">{online.code}</div>
        <button type="button" className="copy" onClick={copy}>
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>

        <ul className="seat-list">
          {online.seats.map((seat) => (
            <li
              key={seat.index}
              className={[
                'seat',
                seat.hasPlayer ? '' : 'empty',
                seat.index === online.seat ? 'me' : '',
              ].join(' ')}
            >
              <i
                className="dot"
                style={{ background: COLOR_HEX[seat.color] }}
              />
              <span className="seat-name">
                {seat.hasPlayer ? seat.name : 'Waiting for a player'}
              </span>
              <span className="seat-tag">
                {seat.index === online.hostSeat
                  ? 'host'
                  : seat.hasPlayer
                    ? 'ready'
                    : 'bot'}
              </span>
            </li>
          ))}
        </ul>

        <p className="small">
          Empty seats become bots when the game starts.{' '}
          {humans < 4
            ? `${4 - humans} seat${4 - humans > 1 ? 's' : ''} will be ${
                4 - humans > 1 ? 'bots' : 'a bot'
              }.`
            : 'The table is full.'}
        </p>

        {netError && <p className="error">{netError}</p>}

        <div className="row">
          {isHost ? (
            <button type="button" className="primary" onClick={startOnline}>
              START GAME
            </button>
          ) : (
            <button type="button" className="primary" disabled>
              WAITING FOR HOST…
            </button>
          )}
          <button type="button" className="ghost" onClick={leaveOnline}>
            Leave
          </button>
        </div>

        <p className="small">
          You are {me?.name ?? 'Player'} · {me?.color.toUpperCase() ?? ''} · room{' '}
          {online.code}
        </p>
      </div>
    </div>
  )
}
