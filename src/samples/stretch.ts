/**
 * WSOLA time-stretch (pitch preserving). ratio = outputLength / inputLength.
 * Offline use only (runs in a Worker).
 */
export function wsolaStretch(input: Float32Array, sr: number, ratio: number): Float32Array {
  const outLen = Math.round(input.length * ratio)
  if (Math.abs(ratio - 1) < 0.002 || input.length < 64) return input.slice()
  const N = Math.round(0.04 * sr)
  const Hs = N >> 1
  const Ha = Hs / ratio
  const delta = Math.round(0.012 * sr)
  const x = new Float32Array(input.length + N * 2)
  x.set(input)
  const out = new Float32Array(outLen + N * 2)
  const norm = new Float32Array(outLen + N * 2)
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / N)
  const maxPos = Math.max(0, input.length - N)
  let prev = 0
  for (let k = 0; ; k++) {
    const o = k * Hs
    if (o >= outLen) break
    let pos = 0
    if (k > 0) {
      const target = Math.min(maxPos, Math.round(k * Ha))
      const ref = Math.min(maxPos, prev + Hs)
      let best = -Infinity
      pos = target
      const lo = Math.max(0, target - delta)
      const hi = Math.min(maxPos, target + delta)
      for (let c = lo; c <= hi; c += 2) {
        let dot = 0
        let e = 1e-9
        for (let i = 0; i < N; i += 4) {
          const a = x[c + i]
          dot += a * x[ref + i]
          e += a * a
        }
        const score = dot / Math.sqrt(e)
        if (score > best) {
          best = score
          pos = c
        }
      }
    }
    for (let i = 0; i < N; i++) {
      out[o + i] += x[pos + i] * win[i]
      norm[o + i] += win[i]
    }
    prev = pos
  }
  const res = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0
  return res
}
