import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { Lobby } from './ui/Lobby'
import { StartMenu } from './ui/StartMenu'
import { GameOver } from './ui/GameOver'
import { Toast } from './ui/Toast'
import { useGame } from './store'

export default function App() {
  const phase = useGame((state) => state.phase)
  const online = useGame((state) => state.online)
  const resumeSession = useGame((state) => state.resumeSession)

  useEffect(() => {
    resumeSession()
  }, [resumeSession])

  const inLobby = Boolean(online && online.status === 'lobby')
  const showMenu = !online && phase === 'menu'
  const showHud = !inLobby && !showMenu

  return (
    <div className="app">
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ position: [0, 20, 19], fov: 38, near: 0.1, far: 140 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene />
      </Canvas>

      <div className="vignette" />

      {showHud && <Hud />}
      {showMenu && <StartMenu />}
      {inLobby && <Lobby />}
      {!inLobby && phase === 'over' && <GameOver />}
      <Toast />
    </div>
  )
}
