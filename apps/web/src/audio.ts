type SoundKind = 'roll' | 'hop' | 'capture' | 'home' | 'win' | 'click'

/** Tiny synthesised sound effects, so the game ships without audio files. */
class Sfx {
  muted = false
  private ctx: AudioContext | null = null
  private noiseBuffer: AudioBuffer | null = null

  private get context(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  play(kind: SoundKind) {
    if (this.muted) return
    try {
      switch (kind) {
        case 'roll':
          this.clicks([0, 0.08, 0.17, 0.29, 0.44, 0.62])
          break
        case 'hop':
          this.tone(520, 0.08, 'triangle', 0.05, 660)
          break
        case 'capture':
          this.tone(420, 0.22, 'sawtooth', 0.06, 120)
          this.tone(180, 0.26, 'square', 0.04, 90)
          break
        case 'home':
          this.tone(523, 0.12, 'sine', 0.07, 659)
          this.tone(784, 0.2, 'sine', 0.06, 988, 0.12)
          break
        case 'win':
          [523, 659, 784, 1046].forEach((freq, index) => {
            this.tone(freq, 0.3, 'triangle', 0.06, freq, index * 0.11)
          })
          break
        case 'click':
          this.tone(880, 0.05, 'sine', 0.04, 990)
          break
      }
    } catch {
      // Audio is a nice to have, never let it break the game.
    }
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    endFrequency = frequency,
    delay = 0,
  ) {
    const ctx = this.context
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, start)
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFrequency),
      start + duration,
    )
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(amp).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  private clicks(times: number[]) {
    const ctx = this.context
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
      }
      this.noiseBuffer = buffer
    }
    for (const time of times) {
      const source = ctx.createBufferSource()
      source.buffer = this.noiseBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1400 + Math.random() * 900
      const amp = ctx.createGain()
      amp.gain.value = 0.16
      source.connect(filter).connect(amp).connect(ctx.destination)
      source.start(ctx.currentTime + time)
    }
  }
}

export const sfx = new Sfx()
