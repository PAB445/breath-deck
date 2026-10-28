export interface Phases {
  inhale: number
  holdIn: number
  exhale: number
  holdOut: number
}
export type PhaseKey = keyof Phases

export const MIN_BPM = 3
export const MAX_BPM = 40
export const MIN_BREATH = 0.3
export const MIN_HOLD = 0.2

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const roundTo = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

export const total = (p: Phases) => p.inhale + p.holdIn + p.exhale + p.holdOut
export const bpmOf = (p: Phases) => 60 / total(p)

const map = (p: Phases, f: (v: number) => number): Phases => ({
  inhale: f(p.inhale),
  holdIn: f(p.holdIn),
  exhale: f(p.exhale),
  holdOut: f(p.holdOut),
})

/** Highest BPM at which both breathing phases stay >= MIN_BREATH when scaling `base`. */
export function maxBpmFor(base: Phases): number {
  const smallest = Math.min(...[base.inhale, base.exhale].filter((v) => v > 0))
  if (!isFinite(smallest)) return MAX_BPM
  return Math.min(MAX_BPM, (60 * smallest) / (MIN_BREATH * total(base)))
}

/** Scale all phases so the cycle matches `bpm`, preserving ratios exactly. */
export function scaleToBpm(base: Phases, bpm: number): Phases {
  const b = clamp(bpm, MIN_BPM, Math.max(MIN_BPM, maxBpmFor(base)))
  const k = total(base) / (60 / b)
  return map(base, (v) => v / k)
}

/** Edit a single phase; keeps constraints and the 3–40 BPM range. */
export function setPhase(p: Phases, key: PhaseKey, value: number): Phases {
  const isHold = key === 'holdIn' || key === 'holdOut'
  let v = Math.max(0, value)
  if (isHold) v = v < MIN_HOLD ? 0 : v
  else v = Math.max(MIN_BREATH, v)
  const others = total(p) - p[key]
  const minTotal = 60 / MAX_BPM
  const maxTotal = 60 / MIN_BPM
  if (others + v < minTotal) v = minTotal - others
  if (others + v > maxTotal) v = maxTotal - others
  if (!isHold) v = Math.max(MIN_BREATH, v)
  return { ...p, [key]: v }
}

/** Apply inhale:exhale ratio i:e, keeping BPM and any holds (shrunk only if needed). */
export function applyRatio(p: Phases, i: number, e: number): Phases {
  const T = total(p)
  let holds = p.holdIn + p.holdOut
  const minBreathTime = (MIN_BREATH * (i + e)) / Math.min(i, e)
  if (T - holds < minBreathTime && holds > 0) {
    const newHolds = Math.max(0, T - minBreathTime)
    const s = newHolds / holds
    p = { ...p, holdIn: p.holdIn * s, holdOut: p.holdOut * s }
    holds = newHolds
  }
  const B = T - holds
  return { inhale: (B * i) / (i + e), holdIn: p.holdIn, exhale: (B * e) / (i + e), holdOut: p.holdOut }
}

export type RatioPick = '1:1' | '1:2' | '2:1' | 'custom'
export function detectRatio(p: Phases): RatioPick {
  const r = p.inhale / p.exhale
  const close = (a: number, b: number) => Math.abs(a - b) < 0.005
  if (close(r, 1)) return '1:1'
  if (close(r, 0.5)) return '1:2'
  if (close(r, 2)) return '2:1'
  return 'custom'
}

export function ratioLabel(p: Phases): string {
  const vals = [p.inhale, p.holdIn, p.exhale, p.holdOut]
  const nz = vals.filter((v) => v > 0)
  const m = Math.min(...nz)
  return vals.map((v) => roundTo(v / m, 1)).join(':')
}

export const samePhases = (a: Phases, b: Phases, eps = 0.005) =>
  Math.abs(a.inhale - b.inhale) < eps &&
  Math.abs(a.holdIn - b.holdIn) < eps &&
  Math.abs(a.exhale - b.exhale) < eps &&
  Math.abs(a.holdOut - b.holdOut) < eps
