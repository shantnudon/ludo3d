import { useState } from 'react'
import type { BotLevel } from '@ludo/core'
import { COLOR_HEX } from '@ludo/core'
import { type Mode, useGame } from '../store'

const LEVELS: Array<{ id: BotLevel; title: string; blurb: string }> = [
  { id: 'easy', title: 'Casual', blurb: 'Bots play loose. Good for a warm-up.' },
  { id: 'medium', title: 'Sharp', blurb: 'Bots chase captures and safe squares.' },
  { id: 'hard', title: 'Ruthless', blurb: 'Bots count the dice and dodge danger.' },
]

export function StartMenu() {
  const startGame = useGame((state) => state.startGame)
  const [level, setLevel] = useState<BotLevel>('medium')
  const [mode, setMode] = useState<Mode>('solo')

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
          <button
            type="button"
            className={`mode ${mode === 'solo' ? 'on' : ''}`}
            onClick={() => setMode('solo')}
          >
            <strong>Solo</strong>
            <span>You vs 3 bots</span>
          </button>
          <button
            type="button"
            className={`mode ${mode === 'pass' ? 'on' : ''}`}
            onClick={() => setMode('pass')}
          >
            <strong>Pass &amp; play</strong>
            <span>4 humans, one device</span>
          </button>
        </div>

        {mode === 'solo' ? (
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
        ) : (
          <p className="mode-note">
            The board asks for a roll from whoever owns the highlighted colour.
            Pass the device around after every turn.
          </p>
        )}

        <button
          type="button"
          className="primary"
          onClick={() => startGame(level, mode)}
        >
          PLAY NOW
        </button>

        {mode === 'solo' ? (
          <p className="note">
            <i className="dot" style={{ background: COLOR_HEX.blue }} />
            You are Blue · three bots · 4 tokens each
          </p>
        ) : (
          <p className="note">
            <i className="dot" style={{ background: COLOR_HEX.blue }} />
            Red starts · green, yellow, blue follow clockwise
          </p>
        )}

        <p className="small">
          Drag to orbit the board · scroll or pinch to zoom · tap the dice to roll
        </p>
      </div>
    </div>
  )
}
