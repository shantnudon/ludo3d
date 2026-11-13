import { useState } from 'react'
import type { BotLevel } from '@ludo/core'
import { COLOR_HEX } from '@ludo/core'
import { type Mode, useGame } from '../store'

const LEVELS: Array<{ id: BotLevel; title: string; blurb: string }> = [
  { id: 'easy', title: 'Casual', blurb: 'Bots play loose. Good for a warm-up.' },
  { id: 'medium', title: 'Sharp', blurb: 'Bots chase captures and safe squares.' },
  { id: 'hard', title: 'Ruthless', blurb: 'Bots count the dice and dodge danger.' },
]

const MODES: Array<{ id: Mode; title: string; hint: string }> = [
  { id: 'solo', title: 'Solo', hint: 'vs 3 bots' },
  { id: 'pass', title: 'Pass & play', hint: '4 humans' },
  { id: 'online', title: 'Online', hint: 'room code' },
]

function codeFromUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get('room') ?? '')
      .toUpperCase()
      .slice(0, 4)
  } catch {
    return ''
  }
}

export function StartMenu() {
  const startGame = useGame((state) => state.startGame)
  const createRoom = useGame((state) => state.createRoom)
  const joinRoom = useGame((state) => state.joinRoom)
  const name = useGame((state) => state.name)
  const setName = useGame((state) => state.setName)
  const netBusy = useGame((state) => state.netBusy)
  const netError = useGame((state) => state.netError)

  const [level, setLevel] = useState<BotLevel>('medium')
  const [mode, setMode] = useState<Mode>(() =>
    codeFromUrl() ? 'online' : 'solo',
  )
  const [code, setCode] = useState<string>(codeFromUrl)

  return (
    <div className="overlay">
      <div className="panel">
        <div className="logo">
          LUDO <span>3D</span>
        </div>
        <p className="tagline">
          Four colours, one board. Roll smart, capture everything, bring all
          four tokens home.
        </p>

        <div className="modes">
          {MODES.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`mode ${mode === option.id ? 'on' : ''}`}
              onClick={() => setMode(option.id)}
            >
              <strong>{option.title}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>

        {mode === 'solo' && (
          <div className="level-grid">
            {LEVELS.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`level ${level === option.id ? 'selected' : ''}`}
                onClick={() => setLevel(option.id)}
              >
                <strong>{option.title}</strong>
                <span>{option.blurb}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'pass' && (
          <p className="mode-note">
            The board asks for a roll from whoever owns the highlighted colour.
            Pass the device around after every turn.
          </p>
        )}

        {mode === 'online' && (
          <div className="online-form">
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                maxLength={16}
                onChange={(event) => setName(event.target.value)}
                placeholder="Player"
              />
            </label>

            <button
              type="button"
              className="primary"
              onClick={createRoom}
              disabled={netBusy}
            >
              {netBusy ? 'CONNECTING…' : 'CREATE ROOM'}
            </button>

            <div className="divider">
              <span>or join a friend</span>
            </div>

            <div className="join-row">
              <input
                className="code-input"
                value={code}
                maxLength={4}
                onChange={(event) =>
                  setCode(
                    event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                  )
                }
                placeholder="CODE"
                inputMode="text"
                autoCapitalize="characters"
              />
              <button
                type="button"
                className="ghost"
                disabled={netBusy || code.length !== 4}
                onClick={() => joinRoom(code)}
              >
                JOIN
              </button>
            </div>

            {netError && <p className="error">{netError}</p>}
          </div>
        )}

        {(mode === 'solo' || mode === 'pass') && (
          <button
            type="button"
            className="primary"
            onClick={() => startGame(level, mode)}
          >
            PLAY NOW
          </button>
        )}

        {mode === 'solo' && (
          <p className="note">
            <i className="dot" style={{ background: COLOR_HEX.blue }} />
            You are Blue · three bots · 4 tokens each
          </p>
        )}
        {mode === 'pass' && (
          <p className="note">
            <i className="dot" style={{ background: COLOR_HEX.blue }} />
            Red starts · green, yellow, blue follow clockwise
          </p>
        )}
        {mode === 'online' && (
          <p className="note">
            <i className="dot" style={{ background: COLOR_HEX.blue }} />
            Up to 4 players · empty seats are bots
          </p>
        )}

        <p className="small">
          Drag to orbit the board · scroll or pinch to zoom · tap the dice to roll
        </p>
      </div>
    </div>
  )
}
