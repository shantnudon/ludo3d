import { Environment, Lightformer } from '@react-three/drei'
import { ENV_RESOLUTION, SHADOW_MAP } from '../perf'

export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#bcd6ff', '#0a0d14', 0.55]} />
      <ambientLight intensity={0.32} />

      <directionalLight
        position={[7.5, 15, 9]}
        intensity={2.2}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <directionalLight position={[-9, 8, -8]} intensity={0.7} color="#7fb0ff" />
      <pointLight
        position={[0, 8, 0]}
        intensity={9}
        distance={30}
        decay={2}
        color="#ffd9a8"
      />

      <Environment resolution={ENV_RESOLUTION} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.4}
          position={[0, 7, -10]}
          scale={[14, 6, 1]}
          color="#9db8ff"
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[0, 5, 10]}
          scale={[14, 4, 1]}
          color="#ffd9b0"
        />
        <Lightformer
          form="ring"
          intensity={1.8}
          position={[9, 6, 0]}
          scale={[5, 5, 1]}
          color="#ffffff"
        />
        <Lightformer
          form="ring"
          intensity={1.2}
          position={[-9, 5, 3]}
          scale={[4, 4, 1]}
          color="#c9a24a"
        />
      </Environment>
    </>
  )
}
