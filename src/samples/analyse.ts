import type { StyleId } from '../engine/Scheduler'

export interface Analysis {
  pcm: Float32Array
  duration: number
  peak: number
  rms: number
  flags: string[]
}

export const TARGET_RMS_DB: Record<StyleId, number> = { soft: -21, deep: -18, powerful: -15, connected: -18 }

/** Gain that brings an already-processed take to its style's target level without clipping. */
export const levelGain = (style: StyleId, rms: number, peak: number) =>
  Math.min(Math.pow(10, TARGET_RMS_DB[style] / 20) / Math.max(rms, 1e-6), 0.95 / Math.max(peak, 1e-6))
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9))

function highpass(x: Float32Array, sr: number, fc = 70): Float32Array {
  const rc = 1 / (2 * Math.PI * fc)
  const a = rc / (rc + 1 / sr)
  const y = new Float32Array(x.length)
  let py = 0
  let px = 0
  for (let i = 0; i < x.length; i++) {
    py = a * (py + x[i] - px)
    px = x[i]
    y[i] = py
  }
  return y
}

export function windowRms(x: Float32Array, win: number): Float32Array {
  const n = Math.ceil(x.length / win)
  const out = new Float32Array(n)
  for (let w = 0; w < n; w++) {
    let s = 0
    const a = w * win
    const b = Math.min(x.length, a + win)
    for (let i = a; i < b; i++) s += x[i] * x[i]
    out[w] = Math.sqrt(s / Math.max(1, b - a))
  }
  return out
}

/** Clean up a raw take: high-pass, trim to the breath, normalise, fade edges, flag issues. */
export function analyse(raw: Float32Array, sr: number, style: StyleId, expectedSec?: number): Analysis {
  const x = highpass(raw, sr)
  const win = Math.round(sr * 0.01)
  const env = windowRms(x, win)
  const sorted = [...env].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0
  const peakEnv = sorted[sorted.length - 1] ?? 0
  const thr = Math.max(floor * 3.16, peakEnv * 0.06, 1e-4)
  let first = env.findIndex((v) => v > thr)
  let last = env.length - 1
  while (last > 0 && env[last] <= thr) last--
  if (first < 0) first = 0
  const pad = Math.round(sr * 0.02)
  const a = Math.max(0, first * win - pad)
  const b = Math.min(x.length, (last + 1) * win + pad)
  const t = x.slice(a, Math.max(a + 1, b))

  let sumSq = 0
  let peak = 0
  for (let i = 0; i < t.length; i++) {
    sumSq += t[i] * t[i]
    peak = Math.max(peak, Math.abs(t[i]))
  }
  const rms0 = Math.sqrt(sumSq / Math.max(1, t.length))
  const gain = levelGain(style, rms0, peak)
  const out = new Float32Array(t.length)
  for (let i = 0; i < t.length; i++) out[i] = t[i] * gain
  const fade = Math.min(Math.round(sr * 0.005), out.length >> 1)
  for (let i = 0; i < fade; i++) {
    const g = i / fade
    out[i] *= g
    out[out.length - 1 - i] *= g
  }

  const flags: string[] = []
  if (db(peak) >= -1) flags.push('clipping')
  if (db(rms0) < -45) flags.push('too quiet')
  if (db(floor) > -50) flags.push('noisy room')
  const duration = out.length / sr
  if (expectedSec && Math.abs(duration - expectedSec) / expectedSec > 0.4) flags.push('length off')
  return { pcm: out, duration, peak: peak * gain, rms: rms0 * gain, flags }
}
