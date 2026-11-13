import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { StartMenu } from './ui/StartMenu'
import { GameOver } from './ui/GameOver'
import { Toast } from './ui/Toast'
import { useGame } from './store'

export default function App() {
  const phase = useGame((state) => state.phase)

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

      {phase !== 'menu' && <Hud />}
      {phase === 'menu' && <StartMenu />}
      {phase === 'over' && <GameOver />}
      <Toast />
    </div>
  )
}
