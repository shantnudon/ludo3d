/**
 * Device tier. Everything expensive is scaled down on phones / battery savers
 * instead of blindly rendering at desktop settings.
 */
export type Quality = 'low' | 'high'

function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const memory = (navigator as { deviceMemory?: number }).deviceMemory
  if (coarse) return 'low'
  if (typeof memory === 'number' && memory > 0 && memory <= 4) return 'low'
  return 'high'
}

export const QUALITY: Quality = detectQuality()
export const IS_LOW = QUALITY === 'low'

/** Pixel-ratio cap: the single biggest battery/GPU lever in a WebGL game. */
export const MAX_DPR = IS_LOW ? 1.25 : 1.5
export const SHADOW_MAP = IS_LOW ? 512 : 1024
export const ANTIALIAS = !IS_LOW
/** Bots on a phone can be skipped in favour of a still preview? Not used yet. */
export const ENV_RESOLUTION = IS_LOW ? 64 : 128
