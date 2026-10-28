import { describe, expect, it } from 'vitest'
import { wsolaStretch } from './stretch'

const sr = 48000
const sine = (hz: number, sec: number) => Float32Array.from({ length: sr * sec }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sr))
const crossings = (x: Float32Array, a: number, b: number) => {
  let n = 0
  for (let i = a + 1; i < b; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++
  return n / ((b - a) / sr) / 2
}

describe('wsolaStretch', () => {
  for (const ratio of [0.75, 0.9, 1.15, 1.33]) {
    it(`stretches by ${ratio} without changing pitch`, () => {
      const out = wsolaStretch(sine(220, 1), sr, ratio)
      expect(Math.abs(out.length - sr * ratio)).toBeLessThanOrEqual(1)
      const mid = out.length >> 1
      expect(crossings(out, mid - sr / 8, mid + sr / 8)).toBeCloseTo(220, -1)
    })
  }

  it('keeps level and stays finite', () => {
    const out = wsolaStretch(sine(180, 1), sr, 1.25)
    let peak = 0
    let sum = 0
    for (let i = sr / 10; i < out.length - sr / 10; i++) {
      expect(Number.isFinite(out[i])).toBe(true)
      peak = Math.max(peak, Math.abs(out[i]))
      sum += out[i] * out[i]
    }
    const rms = Math.sqrt(sum / (out.length - sr / 5))
    expect(peak).toBeLessThan(0.6)
    expect(rms).toBeGreaterThan(0.3)
  })

  it('returns a copy for ratio 1', () => {
    const x = sine(220, 0.1)
    const out = wsolaStretch(x, sr, 1)
    expect(out).not.toBe(x)
    expect(out.length).toBe(x.length)
  })
})
