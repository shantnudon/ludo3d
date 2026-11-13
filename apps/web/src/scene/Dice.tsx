import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { useGame, DICE_ANIM_MS } from '../store'
import { DICE_REST_Y } from './layout'

const SIZE = 0.9

const FACE_ROTATION: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
}

const PIP_LAYOUT: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-0.2, -0.2],
    [0.2, 0.2],
  ],
  3: [
    [0, 0],
    [-0.21, -0.21],
    [0.21, 0.21],
  ],
  4: [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ],
  5: [
    [0, 0],
    [-0.21, -0.21],
    [0.21, -0.21],
    [-0.21, 0.21],
    [0.21, 0.21],
  ],
  6: [
    [-0.2, -0.24],
    [0.2, -0.24],
    [-0.2, 0],
    [0.2, 0],
    [-0.2, 0.24],
    [0.2, 0.24],
  ],
}

type Axis = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'

const FACES: Array<{ value: number; axis: Axis }> = [
  { value: 1, axis: 'py' },
  { value: 6, axis: 'ny' },
  { value: 2, axis: 'pz' },
  { value: 5, axis: 'nz' },
  { value: 3, axis: 'px' },
  { value: 4, axis: 'nx' },
]

function pipPosition(axis: Axis, u: number, v: number): [number, number, number] {
  const half = SIZE / 2 - 0.004
  switch (axis) {
    case 'px':
      return [half, v, u]
    case 'nx':
      return [-half, v, u]
    case 'py':
      return [u, half, v]
    case 'ny':
      return [u, -half, v]
    case 'pz':
      return [u, v, half]
    default:
      return [u, v, -half]
  }
}

function pipScale(axis: Axis): [number, number, number] {
  if (axis === 'px' || axis === 'nx') return [0.5, 1, 1]
  if (axis === 'py' || axis === 'ny') return [1, 0.5, 1]
  return [1, 1, 0.5]
}

export function Dice() {
  const cube = useRef<THREE.Group>(null)
  const rollKey = useGame((state) => state.diceKey)
  const value = useGame((state) => state.diceValue)
  const phase = useGame((state) => state.phase)
  const roll = useGame((state) => state.roll)
  const portrait = useThree((state) => state.size.width < state.size.height)
  const [trayX, trayZ] = portrait ? [4.4, 10.2] : [9.9, 1.0]

  const startAt = useRef(0)
  const fromQuat = useRef(new THREE.Quaternion())
  const toQuat = useRef(new THREE.Quaternion())
  const spinAxis = useRef(new THREE.Vector3(1, 0, 0))
  const spinQuat = useMemo(() => new THREE.Quaternion(), [])

  useEffect(() => {
    const node = cube.current
    if (!node) return
    startAt.current = performance.now()
    fromQuat.current.copy(node.quaternion)
    spinAxis.current
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize()

    const rotation = FACE_ROTATION[value] ?? FACE_ROTATION[1]!
    const target = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2]),
    )
    // Random yaw keeps repeated rolls from looking identical.
    target.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.random() * Math.PI * 2,
      ),
    )
    toQuat.current.copy(target)
  }, [rollKey, value])

  useFrame(() => {
    const node = cube.current
    if (!node) return

    const t = Math.min(1, (performance.now() - startAt.current) / DICE_ANIM_MS)
    const eased = 1 - (1 - t) ** 3

    node.quaternion.slerpQuaternions(fromQuat.current, toQuat.current, eased)
    if (t < 1) {
      spinQuat.setFromAxisAngle(spinAxis.current, (1 - eased) * Math.PI * 2 * 2.4)
      node.quaternion.multiply(spinQuat)
    }

    const bounce = Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t) * 1.7
    node.position.y = DICE_REST_Y + bounce
  })

  const clickable = phase === 'idle'

  return (
    <group
      position={[trayX, 0, trayZ]}
      onClick={(event) => {
        event.stopPropagation()
        if (clickable) void roll()
      }}
      onPointerOver={() => {
        if (clickable) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Tray */}
      <mesh position={[0, -0.36, 0]} receiveShadow>
        <cylinderGeometry args={[1.62, 1.68, 0.12, 56]} />
        <meshStandardMaterial color="#0f1725" roughness={0.82} metalness={0.12} />
      </mesh>
      <mesh position={[0, -0.297, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.42, 1.55, 64]} />
        <meshStandardMaterial color="#c9a24a" metalness={1} roughness={0.3} />
      </mesh>

      <group ref={cube} position={[0, DICE_REST_Y, 0]} castShadow>
        <RoundedBox args={[SIZE, SIZE, SIZE]} radius={0.09} smoothness={4} castShadow receiveShadow>
          <meshPhysicalMaterial
            color="#f8f3e6"
            roughness={0.24}
            metalness={0.02}
            clearcoat={0.9}
            clearcoatRoughness={0.2}
            envMapIntensity={0.9}
          />
        </RoundedBox>

        {FACES.map((face) => (
          <group key={face.value}>
            {PIP_LAYOUT[face.value]!.map(([u, v], index) => (
              <mesh
                key={index}
                position={pipPosition(face.axis, u, v)}
                scale={pipScale(face.axis)}
              >
                <sphereGeometry args={[0.06, 16, 16]} />
                <meshStandardMaterial color="#151a24" roughness={0.35} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  )
}
