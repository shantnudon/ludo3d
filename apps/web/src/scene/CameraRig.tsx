import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

/** Board corners, slightly outside the wooden body, used to fit the camera. */
const CORNERS = [
  new THREE.Vector3(-8.5, 0.4, -8.5),
  new THREE.Vector3(8.5, 0.4, -8.5),
  new THREE.Vector3(-8.5, 0.4, 8.5),
  new THREE.Vector3(8.5, 0.4, 8.5),
]

export function CameraRig() {
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)
  const portrait = size.width < size.height

  // In landscape the board sits a touch left so the dice tray has room.
  const target = useMemo<[number, number, number]>(
    () => (portrait ? [0, 0.6, 1.1] : [0.9, 0.6, 1.1]),
    [portrait],
  )

  useEffect(() => {
    const aspect = size.width / size.height
    const fov = portrait ? 55 : 38
    const cam = camera as THREE.PerspectiveCamera

    cam.fov = fov
    cam.aspect = aspect
    cam.updateProjectionMatrix()

    const phi = 0.72
    const direction = new THREE.Vector3(0, Math.cos(phi), Math.sin(phi))
    const center = new THREE.Vector3(...target)
    const limitX = portrait ? 0.96 : 0.92
    const reservedBottom = 120
    const limitY = portrait
      ? 0.94
      : Math.max(0.62, Math.min(0.82, 1 - (2 * reservedBottom) / size.height))

    // Grow the distance until every board corner fits with a margin. This
    // solves the perspective properly instead of guessing a radius.
    let distance = 14
    for (let attempt = 0; attempt < 80; attempt += 1) {
      cam.position.copy(direction).multiplyScalar(distance).add(center)
      cam.lookAt(center)
      cam.updateMatrixWorld(true)

      let fits = true
      for (const corner of CORNERS) {
        const projected = corner.clone().project(cam)
        if (Math.abs(projected.x) > limitX || Math.abs(projected.y) > limitY) {
          fits = false
          break
        }
      }
      if (fits) break
      distance *= 1.03
    }

    cam.updateProjectionMatrix()
  }, [camera, portrait, size.width, size.height, target])

  return (
    <OrbitControls
      makeDefault
      target={target}
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      minDistance={12}
      maxDistance={60}
      minPolarAngle={0.25}
      maxPolarAngle={1.22}
    />
  )
}
