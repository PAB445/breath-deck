import { windowRms } from '../samples/analyse'

function smoothEnv(pcm: Float32Array, sr: number) {
  const win = Math.round(sr * 0.01)
  const env = windowRms(pcm, win)
  const k = 5
  const sm = new Float32Array(env.length)
  for (let i = 0; i < env.length; i++) {
    let s = 0
    let n = 0
    for (let j = Math.max(0, i - k); j <= Math.min(env.length - 1, i + k); j++) {
      s += env[j]
      n++
    }
    sm[i] = s / n
  }
  return { sm, win }
}

/** Sample index of lowest energy within nominal ± tol (seconds). Ties favour the centre. */
export function splitPoint(pcm: Float32Array, sr: number, nominalSec: number, tolSec: number): number {
  const { sm, win } = smoothEnv(pcm, sr)
  const lo = Math.max(0, Math.floor((nominalSec - tolSec) * sr / win))
  const hi = Math.min(sm.length - 1, Math.ceil((nominalSec + tolSec) * sr / win))
  const mid = nominalSec * sr / win
  let best = lo
  for (let i = lo; i <= hi; i++) {
    const better = sm[i] < sm[best] - 1e-7 || (Math.abs(sm[i] - sm[best]) <= 1e-7 && Math.abs(i - mid) < Math.abs(best - mid))
    if (better) best = i
  }
  return Math.min(pcm.length, Math.round((best + 0.5) * win))
}

/** Auto-split a recording of one inhale then one exhale at its longest quiet gap. */
export function splitLongestGap(pcm: Float32Array, sr: number): number {
  const { sm, win } = smoothEnv(pcm, sr)
  const max = Math.max(...sm)
  const thr = max * 0.12
  const from = Math.floor(sm.length * 0.1)
  const to = Math.floor(sm.length * 0.9)
  let bestA = -1
  let bestLen = 0
  let runA = -1
  for (let i = from; i <= to; i++) {
    if (sm[i] < thr) {
      if (runA < 0) runA = i
      if (i - runA + 1 > bestLen) {
        bestLen = i - runA + 1
        bestA = runA
      }
    } else runA = -1
  }
  if (bestA < 0) return Math.floor(pcm.length / 2)
  return Math.round((bestA + bestLen / 2) * win)
}
