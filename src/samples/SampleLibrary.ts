import type { StyleId } from '../engine/Scheduler'
import { analyse } from './analyse'
import type { TakeRepository } from './repo'
import { fillFor, type BreathPhase, type LengthClass, type Take, type TakeSource } from './types'
import { decodeToMono, encodeWav } from './wav'

interface Loaded {
  take: Take
  buffer: AudioBuffer
}
export interface Pick {
  buffer: AudioBuffer
  rate: number
}

const CACHE_MAX = 64
const MIN_S = 0.75
const MAX_S = 1.33

export class SampleLibrary {
  private loaded = new Map<string, Loaded>()
  private cache = new Map<string, AudioBuffer>()
  private pending = new Set<string>()
  private worker: Worker | null = null
  private subs = new Set<() => void>()
  private repo: TakeRepository
  ready = false

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
    for (const t of takes) await this.hydrate(t)
    this.ready = true
    this.emit()
  }

  private async hydrate(take: Take) {
    const { pcm, sampleRate } = await decodeToMono(await take.wav.arrayBuffer())
    const buffer = new AudioBuffer({ length: pcm.length, sampleRate, numberOfChannels: 1 })
    buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
    this.loaded.set(take.id, { take, buffer })
    for (const k of [...this.cache.keys()]) if (k.startsWith(take.id + '@')) this.cache.delete(k)
  }

  takes(style?: StyleId, phase?: BreathPhase): Take[] {
    return [...this.loaded.values()]
      .map((l) => l.take)
      .filter((t) => (!style || t.style === style) && (!phase || t.phase === phase))
  }
  get(id: string) {
    return this.loaded.get(id)?.take
  }
  buffer(id: string) {
    return this.loaded.get(id)?.buffer
  }
  hasStyle(style: StyleId) {
    return this.takes(style, 'inhale').length > 0 && this.takes(style, 'exhale').length > 0
  }
  count() {
    return this.loaded.size
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
    await this.hydrate(take)
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
    const list = this.takes(style, phase)
    if (!list.length) return null
    let best = list[0]
    for (const t of list) if (Math.abs(Math.log(L / t.duration)) < Math.abs(Math.log(L / best.duration))) best = t
    const raw = this.loaded.get(best.id)!.buffer
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
    const src = this.loaded.get(id)
    if (!src) return
    this.pending.add(key)
    if (!this.worker) {
      this.worker = new Worker(new URL('./stretchWorker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ key: string; out: Float32Array<ArrayBuffer> }>) => {
        const { key: k, out } = e.data
        this.pending.delete(k)
        const base = k.split('@')[0]
        const l = this.loaded.get(base)
        if (!l) return
        const buf = new AudioBuffer({ length: out.length, sampleRate: l.buffer.sampleRate, numberOfChannels: 1 })
        buf.copyToChannel(out, 0)
        this.cache.set(k, buf)
        if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!)
      }
    }
    const pcm = src.buffer.getChannelData(0).slice()
    this.worker.postMessage({ key, pcm, sr: src.buffer.sampleRate, ratio }, [pcm.buffer])
  }
}
