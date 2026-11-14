import { useMemo } from 'react'
import * as THREE from 'three'
import { Board } from './Board'
import { CameraRig } from './CameraRig'
import { DevBridge } from '../DevBridge'
import { Dice } from './Dice'
import { Lighting } from './Lighting'
import { Scheduler } from './Scheduler'
import { Tokens } from './Tokens'

export function Scene() {
  return (
    <>
      <DevBridge />
      <Scheduler />
      <color attach="background" args={['#05070c']} />
      <fog attach="fog" args={['#05070c', 42, 85]} />

      <Lighting />
      <CameraRig />

      {/* One large table disc is enough; a second layer only costs fill rate. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.47, 0]} receiveShadow>
        <circleGeometry args={[44, 48]} />
        <meshStandardMaterial color="#0a0f18" roughness={0.96} metalness={0.05} />
      </mesh>

      <TableGlow />

      <Board />
      <Tokens />
      <Dice />
    </>
  )
}

/** Soft halo on the table so the scene never reads as a black void. */
function TableGlow() {
  const texture = useMemo(() => {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    )
    gradient.addColorStop(0, 'rgba(126, 160, 235, 0.5)')
    gradient.addColorStop(0.45, 'rgba(70, 100, 175, 0.2)')
    gradient.addColorStop(1, 'rgba(10, 15, 26, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    const canvasTexture = new THREE.CanvasTexture(canvas)
    canvasTexture.colorSpace = THREE.SRGBColorSpace
    return canvasTexture
  }, [])

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.445, 0]}>
      <planeGeometry args={[52, 52]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}
