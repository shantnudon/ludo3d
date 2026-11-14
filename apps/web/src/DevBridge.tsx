import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { BASE_SPOTS, cellFor } from '@ludo/core'
import { useGame } from './store'

/**
 * Development-only bridge used by the automated smoke test to click real 3D
 * tokens. It is tree-shaken out of production builds.
 */
export function DevBridge() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const scope = window as unknown as {
      __ludoScreenOfToken?: (
        player: number,
        token: number,
      ) => { x: number; y: number } | null
      __ludoCamera?: THREE.PerspectiveCamera
      __ludoFrames?: () => number
    }

    scope.__ludoCamera = camera as THREE.PerspectiveCamera
    scope.__ludoFrames = () => gl.info.render.frame

    scope.__ludoScreenOfToken = (player, token) => {
      const { game } = useGame.getState()
      const owner = game.players[player]
      if (!owner) return null
      const pos = owner.tokens[token]
      if (pos === undefined) return null
      const cell = pos === -1 ? BASE_SPOTS[owner.color][token]! : cellFor(owner.color, pos)
      const point = new THREE.Vector3(cell[0] - 7, 0.8, cell[1] - 7).project(camera)
      return {
        x: (point.x * 0.5 + 0.5) * size.width,
        y: (-point.y * 0.5 + 0.5) * size.height,
      }
    }

    return () => {
      delete scope.__ludoScreenOfToken
      delete scope.__ludoFrames
    }
  }, [camera, size, gl])

  return null
}
