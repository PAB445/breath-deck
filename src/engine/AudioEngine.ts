import type { Phases } from '../pattern/timing'
import type { SampleLibrary } from '../samples/SampleLibrary'
import { fillFor } from '../samples/types'
import { Scheduler, type PhaseEvent, type StyleId, type VoiceHandle } from './Scheduler'
import { createVoice } from './voice'

export type Transport = 'stopped' | 'playing' | 'paused'
export interface FramePos {
  phase: PhaseEvent['phase'] | 'rest'
  progress: number
  remaining: number
  dur: number
}

export class AudioEngine {
  ctx: AudioContext | null = null
  state: Transport = 'stopped'
  pattern: Phases = { inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 }
  style: StyleId = 'soft'
  volume = 0.7
  muted = false
  visualOffsetMs = 0
  sched: Scheduler
  activeVoices = 0
  onMissing: (style: StyleId) => void = () => {}
  onState: () => void = () => {}
  onSuspended: (suspended: boolean) => void = () => {}

  private vol!: GainNode
  private mute!: GainNode
  private transport!: GainNode
  route!: GainNode
  private lib: SampleLibrary
  private ticker: Worker | null = null
  private acc = 0
  private runStart = 0
  private token = 0
  private warmTimer: ReturnType<typeof setTimeout> | undefined

  constructor(lib: SampleLibrary) {
    this.lib = lib
    this.sched = new Scheduler({
      now: () => this.ctx!.currentTime,
      hidden: () => document.hidden,
      pattern: () => this.pattern,
      style: () => this.style,
      startVoice: (ev) => this.startVoice(ev),
    })
    document.addEventListener('visibilitychange', () => this.sched.tick())
  }

  async ensure() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'playback' })
      this.ctx = ctx
      this.vol = ctx.createGain()
      this.mute = ctx.createGain()
      this.transport = ctx.createGain()
      this.route = ctx.createGain()
      this.vol.connect(this.mute).connect(this.transport).connect(this.route).connect(ctx.destination)
      this.vol.gain.value = this.volume ** 2
      this.mute.gain.value = this.muted ? 0 : 1
      ctx.onstatechange = () => {
        const suspended = ctx.state !== 'running'
        this.onSuspended(suspended)
        if (!suspended && this.state === 'playing') this.sched.tick()
      }
    }
    if (this.ctx.state !== 'running') await this.ctx.resume()
    return this.ctx
  }

  setVolume(v: number) {
    this.volume = v
    if (this.ctx) this.vol.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.05)
  }
  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.mute.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.012)
  }
  setPattern(p: Phases) {
    this.pattern = p
    this.sched.onPatternChange()
    clearTimeout(this.warmTimer)
    this.warmTimer = setTimeout(() => this.lib.warm(this.style, this.pattern), 120)
  }
  setStyle(s: StyleId) {
    this.style = s
    this.sched.onStyleChange()
    this.lib.warm(s, this.pattern)
  }

  async play() {
    if (this.state === 'playing') return
    const ctx = await this.ensure()
    if ((this.state as Transport) === 'playing') return
    const t = ctx.currentTime
    this.token++
    this.transport.gain.cancelScheduledValues(t)
    this.transport.gain.setValueAtTime(this.state === 'paused' ? 0 : 1, t)
    this.transport.gain.linearRampToValueAtTime(1, t + 0.05)
    if (this.state === 'stopped') this.acc = 0
    this.runStart = t
    this.state = 'playing'
    this.lib.warm(this.style, this.pattern)
    this.sched.start(t + 0.3)
    this.startTicker()
    this.sched.tick()
    this.onState()
  }

  pause() {
    if (this.state !== 'playing' || !this.ctx) return
    this.acc += this.ctx.currentTime - this.runStart
    this.state = 'paused'
    this.fadeOutThenHalt(0.15)
    this.onState()
  }

  stop() {
    if (this.state === 'stopped' || !this.ctx) return
    this.state = 'stopped'
    this.acc = 0
    this.fadeOutThenHalt(0.12)
    this.onState()
  }

  private fadeOutThenHalt(sec: number) {
    const ctx = this.ctx!
    const tk = ++this.token
    this.transport.gain.cancelScheduledValues(ctx.currentTime)
    this.transport.gain.setTargetAtTime(0, ctx.currentTime, sec / 4)
    this.stopTicker()
    setTimeout(() => {
      if (tk !== this.token) return
      this.sched.stop()
    }, sec * 1000 + 60)
  }

  elapsed(): number {
    if (!this.ctx) return 0
    return this.state === 'playing' ? this.acc + (this.ctx.currentTime - this.runStart) : this.acc
  }

  /** Position in the schedule as currently *heard* (latency-corrected). */
  frame(): FramePos {
    const rest: FramePos = { phase: 'rest', progress: 0, remaining: 0, dur: 0 }
    if (!this.ctx || this.state !== 'playing') return rest
    const t = this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0) - this.visualOffsetMs / 1000
    const ev = this.sched.locate(t)
    if (!ev) return rest
    return {
      phase: ev.phase,
      progress: (t - ev.start) / ev.dur,
      remaining: Math.max(0, ev.start + ev.dur - t),
      dur: ev.dur,
    }
  }

  private startTicker() {
    this.stopTicker()
    const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),25)'], { type: 'text/javascript' }))
    this.ticker = new Worker(url)
    URL.revokeObjectURL(url)
    this.ticker.onmessage = () => this.sched.tick()
  }
  private stopTicker() {
    this.ticker?.terminate()
    this.ticker = null
  }

  /** Plays one inhale and one exhale in the current style, outside the scheduler. */
  async testBreath(): Promise<boolean> {
    const ctx = await this.ensure()
    const t = ctx.currentTime + 0.1
    const mk = (phase: 'inhale' | 'exhale', start: number) =>
      this.makeVoice(phase, this.style, 2.2, start, 0, false)
    const a = mk('inhale', t)
    const b = mk('exhale', t + 2.6)
    if (!a && !b) {
      this.onMissing(this.style)
      return false
    }
    return true
  }

  private startVoice(ev: PhaseEvent): VoiceHandle | null {
    if (!this.ctx) return null
    const phase = ev.phase === 'inhale' ? 'inhale' : 'exhale'
    const lead = ev.style === 'connected' ? Math.min(0.12, 0.1 * ev.dur) : 0
    return this.makeVoice(phase, ev.style, ev.dur, ev.start, lead, true)
  }

  private makeVoice(
    phase: 'inhale' | 'exhale',
    style: StyleId,
    dur: number,
    start: number,
    lead: number,
    warnMissing: boolean,
  ): VoiceHandle | null {
    const ctx = this.ctx!
    const L = dur * fillFor(style)
    const pick = this.lib.pick(style, phase, L)
    if (!pick) {
      if (warnMissing) this.onMissing(style)
      return null
    }
    const when = Math.max(ctx.currentTime + 0.005, start - lead)
    const { src, gain: g } = createVoice(ctx, this.vol, pick, when, L + lead)
    this.activeVoices++
    let done = false
    const cleanup = () => {
      if (done) return
      done = true
      this.activeVoices--
      src.disconnect()
      g.disconnect()
    }
    src.onended = cleanup
    return {
      cancel: () => {
        try {
          src.stop()
        } catch {
          /* not started */
        }
        cleanup()
      },
    }
  }
}
