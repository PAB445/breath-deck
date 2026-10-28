import type { Phases } from '../pattern/timing'

export type StyleId = 'soft' | 'deep' | 'powerful' | 'connected'
export type PhaseName = 'inhale' | 'holdIn' | 'exhale' | 'holdOut'
const ORDER: PhaseName[] = ['inhale', 'holdIn', 'exhale', 'holdOut']

export interface PhaseEvent {
  id: number
  cycle: number
  idx: number
  phase: PhaseName
  start: number
  dur: number
  style: StyleId
  spec: Phases
}
export interface VoiceHandle {
  cancel(): void
}
export interface SchedulerDeps {
  now(): number
  hidden(): boolean
  pattern(): Phases
  style(): StyleId
  startVoice(ev: PhaseEvent): VoiceHandle | null
}
interface Entry {
  ev: PhaseEvent
  voice: VoiceHandle | null
}
interface Cursor {
  cycle: number
  spec: Phases
  idx: number
}

export const LOOKAHEAD_VISIBLE = 0.25
export const LOOKAHEAD_HIDDEN = 4
const LATE_TOLERANCE = 0.05

/**
 * Lookahead scheduler. Pure with respect to Web Audio: it decides *when* phases
 * start on the audio clock and asks `startVoice` to realise them. Times are
 * accumulated audio-clock seconds, never wall-clock.
 */
export class Scheduler {
  running = false
  nextTime = 0
  queue: Entry[] = []
  stats = { late: 0, scheduled: 0, cancelled: 0 }
  private cursor: Cursor | null = null
  private cycleCounter = 0
  private nextId = 0
  private d: SchedulerDeps

  constructor(deps: SchedulerDeps) {
    this.d = deps
  }

  start(at: number) {
    this.stop()
    this.running = true
    this.nextTime = at
    this.cursor = null
    this.cycleCounter = 0
  }

  stop() {
    for (const e of this.queue) e.voice?.cancel()
    this.queue = []
    this.cursor = null
    this.running = false
  }

  tick() {
    if (!this.running) return
    const now = this.d.now()
    if (this.nextTime < now - LATE_TOLERANCE) this.resync(now)
    const horizon = now + (this.d.hidden() ? LOOKAHEAD_HIDDEN : LOOKAHEAD_VISIBLE)
    let guard = 0
    while (this.nextTime < horizon && guard++ < 64) this.scheduleNext()
    this.queue = this.queue.filter((e) => e.ev.start + e.ev.dur > now - 1)
  }

  /** Event covering time t, if any. */
  locate(t: number): PhaseEvent | null {
    for (const e of this.queue) if (t >= e.ev.start && t < e.ev.start + e.ev.dur) return e.ev
    return null
  }

  /** New pattern: applies from the next cycle; keeps the active cycle intact. */
  onPatternChange() {
    if (!this.running) return
    const now = this.d.now()
    const active = this.locate(now)
    const first = this.queue.find((e) => e.ev.start > now && e.ev.cycle !== active?.cycle)
    if (!first) return
    const t = first.ev.start
    this.cancelFrom(first)
    this.cursor = null
    this.nextTime = t
  }

  /** New style: applies from the next phase that has not started yet. */
  onStyleChange() {
    if (!this.running) return
    const now = this.d.now()
    const first = this.queue.find((e) => e.ev.start > now)
    if (!first) return
    const { cycle, spec, idx, start } = first.ev
    this.cancelFrom(first)
    this.cursor = { cycle, spec, idx }
    this.nextTime = start
  }

  private cancelFrom(entry: Entry) {
    const i = this.queue.indexOf(entry)
    for (const e of this.queue.splice(i)) {
      e.voice?.cancel()
      this.stats.cancelled++
    }
  }

  private resync(now: number) {
    this.stats.late++
    const keep: Entry[] = []
    for (const e of this.queue) {
      if (e.ev.start > now) {
        e.voice?.cancel()
        this.stats.cancelled++
      } else keep.push(e)
    }
    this.queue = keep
    this.cursor = null
    this.nextTime = now + 0.1
  }

  private scheduleNext() {
    if (!this.cursor) {
      this.cursor = { cycle: this.cycleCounter++, spec: { ...this.d.pattern() }, idx: 0 }
    }
    const c = this.cursor
    const phase = ORDER[c.idx]
    const dur = c.spec[phase]
    const idx = c.idx
    c.idx++
    if (c.idx >= ORDER.length) this.cursor = null
    if (dur <= 0) return
    const ev: PhaseEvent = {
      id: this.nextId++,
      cycle: c.cycle,
      idx,
      phase,
      start: this.nextTime,
      dur,
      style: this.d.style(),
      spec: c.spec,
    }
    const isBreath = phase === 'inhale' || phase === 'exhale'
    const voice = isBreath ? this.d.startVoice(ev) : null
    this.queue.push({ ev, voice })
    this.nextTime += dur
    this.stats.scheduled++
  }
}
