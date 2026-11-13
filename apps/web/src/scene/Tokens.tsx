import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  BASE_SPOTS,
  COLORS,
  COLOR_HEX,
  POS_HOME,
  cellFor,
  toWorld,
  type Cell,
} from '@ludo/core'
import { useGame } from '../store'
import { TOKEN_Y } from './layout'

const PROFILE: Array<[number, number]> = [
  [0.015, 0],
  [0.27, 0],
  [0.32, 0.045],
  [0.27, 0.13],
  [0.18, 0.21],
  [0.135, 0.29],
  [0.135, 0.39],
  [0.2, 0.47],
  [0.215, 0.55],
  [0.155, 0.62],
  [0.07, 0.68],
  [0.0, 0.705],
]

const PAWN_GEOMETRY = new THREE.LatheGeometry(
  PROFILE.map(([x, y]) => new THREE.Vector2(x, y)),
  36,
)

export function Tokens() {
  const players = useGame((state) => state.game.players)
  return (
    <>
      {players.map((_, playerIndex) =>
        [0, 1, 2, 3].map((tokenIndex) => (
          <Token
            key={`${playerIndex}-${tokenIndex}`}
            playerIndex={playerIndex}
            tokenIndex={tokenIndex}
          />
        )),
      )}
    </>
  )
}

interface TokenProps {
  playerIndex: number
  tokenIndex: number
}

function Token({ playerIndex, tokenIndex }: TokenProps) {
  const group = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const key = `${playerIndex}-${tokenIndex}`
  const color = useGame((state) => state.game.players[playerIndex]!.color)
  const pos = useGame((state) => state.game.players[playerIndex]!.tokens[tokenIndex]!)
  const anim = useGame((state) => state.anims[key])
  const legal = useGame((state) => state.legalKeys.includes(key))
  const selectToken = useGame((state) => state.selectToken)

  const baseCell = BASE_SPOTS[color][tokenIndex]!
  const colorIndex = COLORS.indexOf(color)

  const path = useMemo<Cell[] | null>(
    () => (anim ? [anim.from, ...anim.cells] : null),
    [anim],
  )

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return

    const now = performance.now()
    let x: number
    let z: number
    let lift = 0

    if (anim && path) {
      const elapsed = now - anim.start
      if (elapsed <= 0) {
        ;[x, z] = toWorld(path[0]!)
      } else {
        const t = Math.min(1, elapsed / anim.duration)
        const segments = path.length - 1
        const progress = t * segments
        const index = Math.min(segments - 1, Math.floor(progress))
        const f = progress - index
        const a = toWorld(path[index]!)
        const b = toWorld(path[index + 1]!)
        x = a[0] + (b[0] - a[0]) * f
        z = a[1] + (b[1] - a[1]) * f
        lift =
          anim.kind === 'arc'
            ? Math.sin(Math.PI * t) * 1.6
            : Math.sin(Math.PI * f) * 0.2
      }
    } else {
      const cell = pos === -1 ? baseCell : cellFor(color, pos)
      ;[x, z] = toWorld(cell)
    }

    const scatter = pos === -1 ? 0 : pos === POS_HOME && !anim ? 0.58 : 0.085
    const angle = (colorIndex * 4 + tokenIndex) * 0.42 + colorIndex * 0.6
    x += Math.cos(angle) * scatter
    z += Math.sin(angle) * scatter

    const bob = legal && !anim ? 0.06 + Math.sin(now / 220) * 0.05 : 0
    node.position.set(x, TOKEN_Y + lift + bob, z)

    const target = hovered && legal ? 1.16 : legal ? 1.07 : 1
    const scale = node.scale.x + (target - node.scale.x) * Math.min(1, delta * 14)
    node.scale.setScalar(scale)

    if (glow.current) {
      glow.current.visible = legal && !anim
      const material = glow.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.35 + Math.sin(now / 260) * 0.2
    }
  })

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation()
        if (legal) void selectToken(playerIndex, tokenIndex)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
        if (legal) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      <mesh geometry={PAWN_GEOMETRY} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={COLOR_HEX[color]}
          roughness={0.16}
          metalness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1.1}
        />
      </mesh>

      <mesh ref={glow} rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} visible={false}>
        <ringGeometry args={[0.34, 0.44, 40]} />
        <meshBasicMaterial
          color="#ffe0a0"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
