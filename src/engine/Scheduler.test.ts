import { describe, expect, it } from 'vitest'
import { Scheduler, type PhaseEvent, type StyleId } from './Scheduler'
import type { Phases } from '../pattern/timing'

function setup(p: Phases) {
  const s = { t: 0, hidden: false, pattern: p, style: 'soft' as StyleId }
  const started: { ev: PhaseEvent; cancelled: boolean }[] = []
  const sch = new Scheduler({
    now: () => s.t,
    hidden: () => s.hidden,
    pattern: () => s.pattern,
    style: () => s.style,
    startVoice: (ev) => {
      const rec = { ev, cancelled: false }
      started.push(rec)
      return { cancel: () => (rec.cancelled = true) }
    },
  })
  const advance = (to: number, step = 0.025) => {
    while (s.t < to) {
      s.t += step
      sch.tick()
    }
  }
  return { s, sch, started, advance }
}
const live = (st: ReturnType<typeof setup>['started']) => st.filter((x) => !x.cancelled).map((x) => x.ev)

describe('Scheduler', () => {
  it('schedules phases back to back at exact cumulative times', () => {
    const { sch, started, advance } = setup({ inhale: 4, holdIn: 1, exhale: 4, holdOut: 0 })
    sch.start(0.3)
    advance(30)
    const evs = live(started)
    expect(evs[0].start).toBeCloseTo(0.3, 9)
    expect(evs[1].phase).toBe('exhale')
    expect(evs[1].start).toBeCloseTo(0.3 + 5, 9)
    expect(evs[2].start).toBeCloseTo(0.3 + 9, 9)
    for (let i = 1; i < sch.queue.length; i++) {
      const a = sch.queue[i - 1].ev
      const b = sch.queue[i].ev
      expect(b.start).toBeCloseTo(a.start + a.dur, 9)
    }
    expect(new Set(sch.queue.map((e) => e.ev.id)).size).toBe(sch.queue.length)
  })

  it('applies rate change at next cycle without touching the current one', () => {
    const { s, sch, started, advance } = setup({ inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 })
    sch.start(0.3)
    advance(2) // inside first inhale
    s.pattern = { inhale: 2, holdIn: 0, exhale: 2, holdOut: 0 }
    sch.onPatternChange()
    advance(30)
    const evs = live(started)
    expect(evs[0].dur).toBe(4)
    expect(evs[1].dur).toBe(4) // exhale of the first cycle keeps the old spec
    expect(evs[2].dur).toBe(2) // next cycle uses new pattern
    expect(evs[2].start).toBeCloseTo(8.3, 9)
  })

  it('hidden mode: cancels queued future cycles on change, no duplicates', () => {
    const { s, sch, started, advance } = setup({ inhale: 1, holdIn: 0, exhale: 1, holdOut: 0 })
    s.hidden = true
    sch.start(0.3)
    advance(1) // 4s lookahead queues ~2 cycles ahead
    expect(sch.queue.length).toBeGreaterThan(4)
    s.pattern = { inhale: 3, holdIn: 0, exhale: 3, holdOut: 0 }
    sch.onPatternChange()
    advance(12)
    const evs = live(started)
    for (let i = 1; i < evs.length; i++) expect(evs[i].start).toBeGreaterThanOrEqual(evs[i - 1].start + evs[i - 1].dur - 1e-9)
    expect(evs.some((e) => e.dur === 3)).toBe(true)
    expect(new Set(evs.map((e) => e.start.toFixed(6))).size).toBe(evs.length)
  })

  it('style change applies from the next phase', () => {
    const { s, sch, started, advance } = setup({ inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 })
    sch.start(0.3)
    advance(3.9) // exhale is scheduled just ahead
    s.style = 'powerful'
    sch.onStyleChange()
    advance(20)
    const evs = live(started)
    expect(evs[0].style).toBe('soft')
    expect(evs[1].style).toBe('powerful')
  })

  it('recovers from a stall with a single resync, not a burst', () => {
    const { s, sch, started, advance } = setup({ inhale: 2, holdIn: 0, exhale: 2, holdOut: 0 })
    sch.start(0.3)
    advance(3)
    s.t += 5 // main thread frozen
    sch.tick()
    expect(sch.stats.late).toBe(1)
    advance(s.t + 1)
    const evs = live(started).filter((e) => e.start > 3)
    evs.forEach((e) => expect(e.start).toBeGreaterThanOrEqual(8))
  })

  it('stop cancels all voices; bounded queue over an hour at 40 bpm', () => {
    const { sch, started, advance } = setup({ inhale: 0.75, holdIn: 0, exhale: 0.75, holdOut: 0 })
    sch.start(0.3)
    advance(3600, 0.05)
    expect(sch.queue.length).toBeLessThan(10)
    sch.stop()
    expect(started.filter((x) => x.ev.start > 3599).every((x) => x.cancelled)).toBe(true)
  })
})
