import { describe, expect, it } from 'vitest'
import { applyRatio, bpmOf, detectRatio, scaleToBpm, setPhase, total } from './timing'

const bal = { inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 }

describe('timing', () => {
  it('computes bpm', () => {
    expect(bpmOf(bal)).toBeCloseTo(7.5)
    expect(bpmOf({ inhale: 5, holdIn: 0, exhale: 5, holdOut: 0 })).toBeCloseTo(6)
  })
  it('scales preserving ratio', () => {
    const p = { inhale: 4, holdIn: 1, exhale: 6, holdOut: 0.5 }
    for (const b of [3, 5.5, 12, 20, 30]) {
      const s = scaleToBpm(p, b)
      expect(bpmOf(s)).toBeCloseTo(b, 9)
      expect(s.inhale / s.exhale).toBeCloseTo(p.inhale / p.exhale, 9)
      expect(s.holdIn / s.inhale).toBeCloseTo(p.holdIn / p.inhale, 9)
    }
  })
  it('no drift after many scalings from a snapshot', () => {
    let last = bal
    for (let i = 0; i < 1000; i++) last = scaleToBpm(bal, 3 + (i % 37))
    expect(bpmOf(last)).toBeCloseTo(3 + (999 % 37), 9)
  })
  it('clamps bpm to range', () => {
    expect(bpmOf(scaleToBpm(bal, 100))).toBeCloseTo(40)
    expect(bpmOf(scaleToBpm(bal, 1))).toBeCloseTo(3)
  })
  it('keeps breaths >= 0.3s when scaling up', () => {
    const p = { inhale: 1, holdIn: 4, exhale: 1, holdOut: 4 }
    const s = scaleToBpm(p, 40)
    expect(s.inhale).toBeGreaterThanOrEqual(0.2999)
  })
  it('edits a phase and recomputes bpm', () => {
    const p = setPhase(bal, 'exhale', 6)
    expect(total(p)).toBe(10)
    expect(bpmOf(p)).toBeCloseTo(6)
  })
  it('limits phase edits at range edges', () => {
    expect(bpmOf(setPhase(bal, 'inhale', 100))).toBeCloseTo(3)
    expect(bpmOf(setPhase({ inhale: 1, holdIn: 0, exhale: 1, holdOut: 0 }, 'inhale', 0.3))).toBeLessThanOrEqual(40.0001)
  })
  it('ratio quick-pick keeps bpm and holds', () => {
    const p = { inhale: 4, holdIn: 2, exhale: 4, holdOut: 0 }
    const r = applyRatio(p, 1, 2)
    expect(total(r)).toBeCloseTo(total(p))
    expect(r.holdIn).toBe(2)
    expect(r.exhale / r.inhale).toBeCloseTo(2)
    expect(detectRatio(r)).toBe('1:2')
    expect(detectRatio(applyRatio(bal, 2, 1))).toBe('2:1')
  })
})
