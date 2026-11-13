import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  BASE_ORIGIN,
  BASE_SPOTS,
  COLORS,
  COLOR_HEX,
  HOME_PATH,
  MAIN_PATH,
  START_INDEX,
  armOwner,
  isSafeAbs,
  toWorld,
  type Cell,
  type Color,
} from '@ludo/core'
import { FIELD_TOP, TILE_HEIGHT, TILE_SIZE, TILE_Y } from './layout'

const CREAM = '#f4ead6'

interface Tile {
  cell: Cell
  color: THREE.Color
}

function buildTiles(): Tile[] {
  const cream = new THREE.Color(CREAM)
  const white = new THREE.Color('#ffffff')
  const tiles: Tile[] = []

  MAIN_PATH.forEach((cell, index) => {
    const owner = armOwner(index)
    const base = new THREE.Color(COLOR_HEX[owner])
    if (index === START_INDEX[owner]) {
      tiles.push({ cell, color: base.clone() })
    } else if (isSafeAbs(index)) {
      tiles.push({ cell, color: base.clone().lerp(white, 0.58) })
    } else {
      tiles.push({ cell, color: cream.clone().lerp(base, 0.16) })
    }
  })

  for (const color of COLORS) {
    for (const cell of HOME_PATH[color]) {
      tiles.push({
        cell,
        color: new THREE.Color(COLOR_HEX[color]).lerp(white, 0.12),
      })
    }
  }

  return tiles
}

export function Board() {
  const tiles = useMemo(buildTiles, [])
  const mesh = useRef<THREE.InstancedMesh>(null)

  const geometry = useMemo(
    () => new RoundedBoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE, 2, 0.045),
    [],
  )
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.06 }),
    [],
  )

  useLayoutEffect(() => {
    const node = mesh.current
    if (!node) return
    const dummy = new THREE.Object3D()
    tiles.forEach((tile, index) => {
      const [x, z] = toWorld(tile.cell)
      dummy.position.set(x, TILE_Y, z)
      dummy.updateMatrix()
      node.setMatrixAt(index, dummy.matrix)
      node.setColorAt(index, tile.color)
    })
    node.instanceMatrix.needsUpdate = true
    if (node.instanceColor) node.instanceColor.needsUpdate = true
    node.computeBoundingSphere()
  }, [tiles])

  return (
    <group>
      {/* Walnut body of the board */}
      <RoundedBox
        args={[16.6, 0.86, 16.6]}
        radius={0.22}
        smoothness={4}
        position={[0, -0.03, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#241a11" roughness={0.4} metalness={0.35} />
      </RoundedBox>

      {/* Brass inlay */}
      <RoundedBox
        args={[16.14, 0.1, 16.14]}
        radius={0.08}
        smoothness={3}
        position={[0, 0.41, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#c9a24a" metalness={1} roughness={0.28} />
      </RoundedBox>

      {/* Felt playing field */}
      <RoundedBox
        args={[15.56, 0.14, 15.56]}
        radius={0.06}
        smoothness={3}
        position={[0, FIELD_TOP - 0.07, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#0a2822" roughness={0.94} metalness={0.02} />
      </RoundedBox>

      <instancedMesh
        ref={mesh}
        args={[geometry, material, tiles.length]}
        castShadow
        receiveShadow
      />

      {COLORS.map((color) => (
        <Base key={color} color={color} />
      ))}

      <HomeCenter />
      <SafeMarkers />
    </group>
  )
}

function Base({ color }: { color: Color }) {
  const [x, z] = toWorld(BASE_ORIGIN[color])
  const hex = COLOR_HEX[color]

  const spots = BASE_SPOTS[color].map((cell) => {
    const [wx, wz] = toWorld(cell)
    return [wx - x, wz - z] as const
  })

  return (
    <group position={[x, 0, z]}>
      <RoundedBox
        args={[5.95, 0.12, 5.95]}
        radius={0.16}
        smoothness={4}
        position={[0, 0.58, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={hex} roughness={0.48} metalness={0.18} />
      </RoundedBox>

      <RoundedBox
        args={[4.55, 0.07, 4.55]}
        radius={0.12}
        smoothness={4}
        position={[0, 0.655, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#f7efdf" roughness={0.62} />
      </RoundedBox>

      {spots.map(([sx, sz], index) => (
        <mesh
          key={index}
          position={[sx, 0.698, sz]}
          rotation-x={-Math.PI / 2}
          receiveShadow
        >
          <ringGeometry args={[0.235, 0.33, 32]} />
          <meshStandardMaterial color={hex} roughness={0.4} metalness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function HomeCenter() {
  const geometry = useMemo(() => {
    const triangle = (
      a: [number, number],
      b: [number, number],
      c: [number, number],
    ) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [a[0], 0, a[1], b[0], 0, b[1], c[0], 0, c[1]],
          3,
        ),
      )
      // Explicit up normals: the triangles are flat and always face the sky.
      geo.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(
          [0, 1, 0, 0, 1, 0, 0, 1, 0],
          3,
        ),
      )
      return geo
    }
    const s = 1.5
    return [
      { color: COLOR_HEX.green, geo: triangle([-s, -s], [s, -s], [0, 0]) },
      { color: COLOR_HEX.yellow, geo: triangle([s, -s], [s, s], [0, 0]) },
      { color: COLOR_HEX.blue, geo: triangle([s, s], [-s, s], [0, 0]) },
      { color: COLOR_HEX.red, geo: triangle([-s, s], [-s, -s], [0, 0]) },
    ]
  }, [])

  return (
    <group>
      <RoundedBox
        args={[3.0, 0.18, 3.0]}
        radius={0.09}
        smoothness={3}
        position={[0, 0.57, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#0d1119" roughness={0.5} metalness={0.3} />
      </RoundedBox>

      {geometry.map((triangle) => (
        <mesh
          key={triangle.color}
          geometry={triangle.geo}
          position={[0, 0.665, 0]}
        >
          <meshStandardMaterial
            color={triangle.color}
            roughness={0.6}
            metalness={0.04}
            emissive={triangle.color}
            emissiveIntensity={0.22}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      <mesh position={[0, 0.668, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.08, 0.16, 32]} />
        <meshStandardMaterial color="#f0d18a" metalness={1} roughness={0.25} />
      </mesh>
    </group>
  )
}

function SafeMarkers() {
  const cells = useMemo(() => {
    const list: Cell[] = []
    for (const color of COLORS) {
      list.push(MAIN_PATH[START_INDEX[color]]!)
      list.push(MAIN_PATH[(START_INDEX[color] + 8) % 52]!)
    }
    return list
  }, [])

  return (
    <>
      {cells.map((cell, index) => {
        const [x, z] = toWorld(cell)
        return (
          <mesh key={index} position={[x, TILE_Y + 0.075, z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.15, 0.23, 24]} />
            <meshStandardMaterial
              color="#a98a4e"
              roughness={0.35}
              metalness={0.6}
              transparent
              opacity={0.55}
            />
          </mesh>
        )
      })}
    </>
  )
}
