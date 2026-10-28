import { describe, expect, it } from 'vitest'
import { splitLongestGap, splitPoint } from './segment'

const SR = 48000
function burst(a: number, b: number, buf: Float32Array) {
  for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) buf[i] = (Math.sin(i * 0.37) + Math.sin(i * 1.91)) * 0.2
}
describe('segment', () => {
  const pcm = new Float32Array(9 * SR)
  burst(0.1, 3.0, pcm)
  burst(4.2, 8.0, pcm)
  it('splits at the quiet gap near the nominal boundary', () => {
    const s = splitPoint(pcm, SR, 3.6, 1.0) / SR
    expect(s).toBeGreaterThan(3.0)
    expect(s).toBeLessThan(4.2)
  })
  it('auto-splits at the longest gap', () => {
    const s = splitLongestGap(pcm, SR) / SR
    expect(Math.abs(s - 3.6)).toBeLessThan(0.05)
  })
})
