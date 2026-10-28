import type { StyleId } from '../engine/Scheduler'
import { analyse, levelGain } from './analyse'
import type { TakeRepository } from './repo'
import { fillFor, type BreathPhase, type LengthClass, type SampleCredit, type Take, type TakeSource } from './types'
import { decodeToMono, encodeWav } from './wav'

interface Loaded {
  take: Take
  buffer: AudioBuffer
}
export interface Pick {
  buffer: AudioBuffer
  rate: number
}
export type StyleSource = 'own' | 'sample' | 'none'
type PerStyle = Record<StyleId, boolean>
interface SamplePrefs {
  use: PerStyle
  swap: PerStyle
}
interface Manifest {
  licence: string
  note: string
  styles: Record<StyleId, { sources: SampleCredit[]; takes: { file: string; phase: BreathPhase; duration: number }[] }>
}

const CACHE_MAX = 64
const MIN_S = 0.75
const MAX_S = 1.33
const PREFS_KEY = 'breathdeck:v1:samples'
const ALL = (v: boolean): PerStyle => ({ soft: v, deep: v, powerful: v, connected: v })
const flip = (p: BreathPhase): BreathPhase => (p === 'inhale' ? 'exhale' : 'inhale')

function loadPrefs(): SamplePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return { use: { ...ALL(true), ...p.use }, swap: { ...ALL(false), ...p.swap } }
  } catch {
    return { use: ALL(true), swap: ALL(false) }
  }
}

export class SampleLibrary {
  private loaded = new Map<string, Loaded>()
  private bundled = new Map<string, Loaded>()
  private credit: Partial<Record<StyleId, SampleCredit[]>> = {}
  private cache = new Map<string, AudioBuffer>()
  private pending = new Set<string>()
  private worker: Worker | null = null
  private subs = new Set<() => void>()
  private repo: TakeRepository
  prefs: SamplePrefs = loadPrefs()
  ready = false
  samplesReady = false
  samplesError = ''
  licence = ''

  constructor(repo: TakeRepository) {
    this.repo = repo
  }

  subscribe(cb: () => void) {
    this.subs.add(cb)
    return () => this.subs.delete(cb)
  }
  private emit() {
    this.subs.forEach((f) => f())
  }

  async load() {
    const takes = await this.repo.list()
    for (const t of takes) this.loaded.set(t.id, await this.hydrate(t))
    this.ready = true
    this.emit()
    await this.loadSamples()
  }

  /** Bundled CC0 takes. Processed like uploads but never written to storage. */
  async loadSamples(base = import.meta.env.BASE_URL) {
    try {
      const res = await fetch(`${base}samples/manifest.json`)
      if (!res.ok) throw new Error(`manifest ${res.status}`)
      const m: Manifest = await res.json()
      this.licence = m.licence
      await Promise.all(
        (Object.keys(m.styles) as StyleId[]).flatMap((style) => {
          const s = m.styles[style]
          this.credit[style] = s.sources
          return s.takes.map(async (t, i) => {
            const blob = await (await fetch(`${base}samples/${t.file}`)).blob()
            const { pcm, sampleRate } = await decodeToMono(await blob.arrayBuffer())
            const a = analyse(pcm, sampleRate, style)
            const take: Take = {
              id: `sample-${style}-${i}`,
              style,
              phase: t.phase,
              lengthClass: 'upload',
              source: 'sample',
              wav: blob,
              duration: a.duration,
              peak: a.peak,
              rms: a.rms,
              flags: [],
              createdAt: 0,
            }
            this.bundled.set(take.id, { take, buffer: toBuffer(a.pcm, sampleRate) })
          })
        }),
      )
      this.samplesReady = true
    } catch (e) {
      this.samplesError = `Sample sounds could not be loaded (${(e as Error).message}).`
    }
    this.emit()
  }

  private async hydrate(take: Take): Promise<Loaded> {
    const { pcm, sampleRate } = await decodeToMono(await take.wav.arrayBuffer())
    const g = levelGain(take.style, take.rms, take.peak)
    if (g > 1.05) for (let i = 0; i < pcm.length; i++) pcm[i] *= g
    for (const k of [...this.cache.keys()]) if (k.startsWith(take.id + '@')) this.cache.delete(k)
    return { take, buffer: toBuffer(pcm, sampleRate) }
  }

  /** Your own (recorded or uploaded) takes. */
  takes(style?: StyleId, phase?: BreathPhase): Take[] {
    return [...this.loaded.values()]
      .map((l) => l.take)
      .filter((t) => (!style || t.style === style) && (!phase || t.phase === phase))
  }
  /** Bundled sample takes, with the style's inhale/exhale swap applied. */
  samples(style: StyleId, phase?: BreathPhase): Take[] {
    const swap = this.prefs.swap[style]
    return [...this.bundled.values()]
      .map((l) => (swap ? { ...l.take, phase: flip(l.take.phase) } : l.take))
      .filter((t) => t.style === style && (!phase || t.phase === phase))
  }
  credits(style: StyleId): SampleCredit[] {
    return this.credit[style] ?? []
  }
  get(id: string) {
    return (this.loaded.get(id) ?? this.bundled.get(id))?.take
  }
  buffer(id: string) {
    return (this.loaded.get(id) ?? this.bundled.get(id))?.buffer
  }
  hasOwn(style: StyleId) {
    return this.takes(style, 'inhale').length > 0 && this.takes(style, 'exhale').length > 0
  }
  /** Where a style's sound comes from: your own takes win; samples fill in when enabled. */
  sourceFor(style: StyleId): StyleSource {
    if (this.hasOwn(style)) return 'own'
    if (this.prefs.use[style] && this.samples(style, 'inhale').length && this.samples(style, 'exhale').length) return 'sample'
    return 'none'
  }
  hasStyle(style: StyleId) {
    return this.sourceFor(style) !== 'none'
  }
  private active(style: StyleId, phase: BreathPhase): Take[] {
    const src = this.sourceFor(style)
    return src === 'own' ? this.takes(style, phase) : src === 'sample' ? this.samples(style, phase) : []
  }
  count() {
    return this.loaded.size
  }

  setUseSamples(style: StyleId, on: boolean) {
    this.prefs = { ...this.prefs, use: { ...this.prefs.use, [style]: on } }
    this.savePrefs()
  }
  setSwap(style: StyleId, on: boolean) {
    this.prefs = { ...this.prefs, swap: { ...this.prefs.swap, [style]: on } }
    this.savePrefs()
  }
  private savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs))
    this.emit()
  }

  async save(opts: {
    style: StyleId
    phase: BreathPhase
    lengthClass: LengthClass
    source: TakeSource
    pcm: Float32Array
    sampleRate: number
    expectedSec?: number
    id?: string
  }): Promise<Take> {
    const a = analyse(opts.pcm, opts.sampleRate, opts.style, opts.expectedSec)
    const take: Take = {
      id: opts.id ?? `${opts.style}-${opts.phase}-${opts.lengthClass}-${crypto.randomUUID().slice(0, 8)}`,
      style: opts.style,
      phase: opts.phase,
      lengthClass: opts.lengthClass,
      source: opts.source,
      wav: encodeWav(a.pcm, opts.sampleRate),
      duration: a.duration,
      peak: a.peak,
      rms: a.rms,
      flags: a.flags,
      createdAt: Date.now(),
    }
    await this.repo.put(take)
    this.loaded.set(take.id, await this.hydrate(take))
    this.emit()
    return take
  }

  async remove(id: string) {
    await this.repo.remove(id)
    this.loaded.delete(id)
    this.emit()
  }
  async clear() {
    await this.repo.clear()
    this.loaded.clear()
    this.cache.clear()
    this.emit()
  }

  /** Choose the take (and stretch) best matching target length `L` seconds. Synchronous. */
  pick(style: StyleId, phase: BreathPhase, L: number): Pick | null {
    const list = this.active(style, phase)
    if (!list.length) return null
    let best = list[0]
    for (const t of list) if (Math.abs(Math.log(L / t.duration)) < Math.abs(Math.log(L / best.duration))) best = t
    const raw = this.buffer(best.id)!
    const s = L / best.duration
    if (Math.abs(s - 1) <= 0.08) return { buffer: raw, rate: 1 / s }
    const r = Math.round(Math.min(MAX_S, Math.max(MIN_S, s)) * 100) / 100
    const key = `${best.id}@${r.toFixed(2)}`
    const hit = this.cache.get(key)
    if (hit) {
      this.cache.delete(key)
      this.cache.set(key, hit)
      return { buffer: hit, rate: 1 }
    }
    this.requestStretch(best.id, key, r)
    return { buffer: raw, rate: Math.min(1.25, Math.max(0.8, 1 / s)) }
  }

  /** Pre-render stretched buffers for a pattern so playback never waits. */
  warm(style: StyleId, p: { inhale: number; exhale: number }) {
    const f = fillFor(style)
    this.pick(style, 'inhale', p.inhale * f)
    this.pick(style, 'exhale', p.exhale * f)
  }

  private requestStretch(id: string, key: string, ratio: number) {
    if (this.pending.has(key) || typeof Worker === 'undefined') return
    const src = this.buffer(id)
    if (!src) return
    this.pending.add(key)
    if (!this.worker) {
      this.worker = new Worker(new URL('./stretchWorker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ key: string; out: Float32Array<ArrayBuffer> }>) => {
        const { key: k, out } = e.data
        this.pending.delete(k)
        const base = this.buffer(k.split('@')[0])
        if (!base) return
        this.cache.set(k, toBuffer(out, base.sampleRate))
        if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!)
      }
    }
    const pcm = src.getChannelData(0).slice()
    this.worker.postMessage({ key, pcm, sr: src.sampleRate, ratio }, [pcm.buffer])
  }
}

function toBuffer(pcm: Float32Array, sampleRate: number) {
  const b = new AudioBuffer({ length: Math.max(1, pcm.length), sampleRate, numberOfChannels: 1 })
  b.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
  return b
}
