import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGame } from '../store'

/**
 * The canvas runs in `frameloop="demand"` mode: nothing is rendered while the
 * board sits still. This component asks for frames only while something moves
 * (dice tumble, pawn hops) or the game state changes. Idle tab = no GPU work,
 * which is what saves battery and keeps the CPU cool.
 */
export function Scheduler() {
  const invalidate = useThree((state) => state.invalidate)
  const phase = useGame((state) => state.phase)
  const anims = useGame((state) => state.anims)
  const animating =
    phase === 'rolling' ||
    phase === 'animating' ||
    Object.keys(anims).length > 0

  useFrame(() => {
    if (animating) invalidate()
  })

  useEffect(() => {
    invalidate()
    const unsubscribe = useGame.subscribe(() => invalidate())
    return () => unsubscribe()
  }, [invalidate])

  useEffect(() => {
    invalidate()
  }, [animating, invalidate])

  // Effects that build render targets (environment map, instanced matrices)
  // settle after mount; one more frame makes sure they are on screen.
  useEffect(() => {
    const timer = setTimeout(() => invalidate(), 400)
    const onVisible = () => invalidate()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('resize', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('resize', onVisible)
    }
  }, [invalidate])

  return null
}
