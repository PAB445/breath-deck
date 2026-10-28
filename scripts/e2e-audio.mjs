// Audio engine verification in headless Chrome using the bundled CC0 samples.
// 1. Offline render: schedules real voices into an OfflineAudioContext and measures the
//    output: breath energy in each inhale/exhale, silence in holds, no clicks, no clipping.
// 2. Live: plays through the real engine and taps its output with an AnalyserNode to
//    check that sound lines up with the phase the circle shows.
import { chromium } from 'playwright-core'

const url = process.env.URL ?? 'http://127.0.0.1:5287'
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.addInitScript(() => {
  localStorage.clear()
  localStorage.setItem('breathdeck:v1:seen', '1')
})
await page.goto(url)
await page.waitForFunction(() => window.bd?.library.samplesReady, null, { timeout: 20000 })
const fail = []
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fail.push(msg) }

const CASES = [
  ['soft', { inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 }],
  ['soft', { inhale: 3, holdIn: 1, exhale: 3, holdOut: 1 }],
  ['deep', { inhale: 4, holdIn: 2, exhale: 6, holdOut: 2 }],
  ['deep', { inhale: 1.5, holdIn: 0, exhale: 1.5, holdOut: 0 }],
  ['powerful', { inhale: 1, holdIn: 0, exhale: 1, holdOut: 0 }],
  ['powerful', { inhale: 2, holdIn: 1, exhale: 2, holdOut: 0 }],
  ['connected', { inhale: 0.75, holdIn: 0, exhale: 0.75, holdOut: 0 }],
  ['connected', { inhale: 2, holdIn: 0, exhale: 2, holdOut: 0 }],
]

for (const [style, p] of CASES) {
  const r = await page.evaluate(async ({ style, p }) => {
    const { createVoice } = await import('/src/engine/voice.ts')
    const { fillFor } = await import('/src/samples/types.ts')
    const lib = window.bd.library
    lib.warm(style, p)
    await new Promise((res) => setTimeout(res, 600))
    const sr = 48000
    const cycles = 3
    const T = p.inhale + p.holdIn + p.exhale + p.holdOut
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * (0.2 + T * cycles + 0.5)), sr)
    const merge = ctx.createChannelMerger(2)
    merge.connect(ctx.destination)
    const vols = [0, 1].map((ch) => {
      const g = ctx.createGain()
      g.gain.value = 0.49
      g.connect(merge, 0, ch)
      return g
    })
    let n = 0
    const phases = []
    let t = 0.2
    for (let c = 0; c < cycles; c++) {
      for (const k of ['inhale', 'holdIn', 'exhale', 'holdOut']) {
        const dur = p[k]
        if (dur <= 0) continue
        if (k === 'inhale' || k === 'exhale') {
          const lead = style === 'connected' ? Math.min(0.12, 0.1 * dur) : 0
          const L = dur * fillFor(style)
          const pick = lib.pick(style, k, L)
          const ch = n++ % 2
          const v = createVoice(ctx, vols[ch], pick, t - lead, L + lead)
          phases.push({ k, start: t, dur, ch, vWhen: v.when, vLen: v.len })
        } else phases.push({ k, start: t, dur })
        t += dur
      }
    }
    const rendered = await ctx.startRendering()
    const chans = [rendered.getChannelData(0), rendered.getChannelData(1)]
    const out = new Float32Array(chans[0].length)
    for (let i = 0; i < out.length; i++) out[i] = chans[0][i] + chans[1][i]
    const db = (a, b) => {
      let s = 0
      const i0 = Math.max(0, Math.floor(a * sr)), i1 = Math.min(out.length, Math.floor(b * sr))
      for (let i = i0; i < i1; i++) s += out[i] * out[i]
      return 20 * Math.log10(Math.sqrt(s / Math.max(1, i1 - i0)) + 1e-12)
    }
    let peak = 0, nan = false
    for (const v of out) { if (!Number.isFinite(v)) nan = true; peak = Math.max(peak, Math.abs(v)) }
    const breaths = phases.filter((x) => x.vLen)
    const breathDb = breaths.map((x) => db(x.start, x.start + x.dur * 0.9))
    const holdDb = phases.filter((x) => !x.vLen).map((x) => db(x.start + 0.02, x.start + x.dur))
    const edge = Math.max(...breaths.flatMap((x) => [
      Math.max(...Array.from(chans[x.ch].subarray(Math.floor(x.vWhen * sr), Math.floor(x.vWhen * sr) + 48), Math.abs)),
      Math.max(...Array.from(chans[x.ch].subarray(Math.floor((x.vWhen + x.vLen) * sr) - 48, Math.floor((x.vWhen + x.vLen) * sr)), Math.abs)),
    ]))
    let worstGap = 0
    if (style === 'connected') {
      const a = breaths[0].start, b = breaths[breaths.length - 1].start + breaths[breaths.length - 1].dur * 0.85
      let run = 0
      for (let w = a; w < b; w += 0.01) {
        run = db(w, w + 0.01) < -60 ? run + 0.01 : 0
        worstGap = Math.max(worstGap, run)
      }
    }
    return { peak, nan, breathDb, holdDb, edge, worstGap, lens: breaths.map((x) => +(x.vLen / x.dur).toFixed(2)) }
  }, { style, p })
  const tag = `${style} ${p.inhale}-${p.holdIn}-${p.exhale}-${p.holdOut}`
  const minBreath = Math.min(...r.breathDb)
  const maxHold = r.holdDb.length ? Math.max(...r.holdDb) : -Infinity
  console.log(`     ${tag}: breath ${minBreath.toFixed(1)}..${Math.max(...r.breathDb).toFixed(1)} dB, holds ${maxHold.toFixed(1)} dB, peak ${r.peak.toFixed(2)}, edge ${r.edge.toFixed(4)}${style === 'connected' ? `, longest gap ${(r.worstGap * 1000).toFixed(0)} ms, voice/phase ${r.lens.join(' ')}` : ''}`)
  check(!r.nan && r.peak < 0.99, `${tag} no clipping or NaN`)
  check(minBreath > -45, `${tag} every inhale/exhale is audible`)
  check(maxHold < -70, `${tag} holds are silent`)
  check(r.edge < 0.01, `${tag} breath edges fade to zero (no clicks)`)
  if (style === 'connected' && p.inhale <= 1) check(r.worstGap < 0.1, `${tag} connected breathing has no gaps`)
}

// Live path: real engine, real-time, analyser on the output.
const live = await page.evaluate(async () => {
  const { engine, library } = window.bd
  const ctx = await engine.ensure()
  const an = ctx.createAnalyser()
  an.fftSize = 1024
  engine.route.connect(an)
  const buf = new Float32Array(an.fftSize)
  const seen = { inhale: [], exhale: [], holdIn: [], holdOut: [] }
  engine.setStyle('deep')
  engine.setPattern({ inhale: 2.5, holdIn: 1, exhale: 2.5, holdOut: 1 })
  await engine.play()
  const t0 = performance.now()
  while (performance.now() - t0 < 9000) {
    await new Promise((r) => setTimeout(r, 40))
    const f = engine.frame()
    if (f.phase === 'rest') continue
    an.getFloatTimeDomainData(buf)
    let s = 0
    for (const v of buf) s += v * v
    const lag = (ctx.outputLatency || ctx.baseLatency || 0) + 0.03
    if (f.progress * f.dur > lag + 0.1 && f.remaining > 0.5) seen[f.phase].push(20 * Math.log10(Math.sqrt(s / buf.length) + 1e-12))
  }
  engine.stop()
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null)
  return { stats: engine.sched.stats, src: library.sourceFor('deep'), inhale: med(seen.inhale), exhale: med(seen.exhale), hold: med([...seen.holdIn, ...seen.holdOut]) }
})
console.log('     live deep 2.5-1-2.5-1:', JSON.stringify(live))
check(live.src === 'sample', 'live: deep plays the bundled samples')
check(live.stats.late === 0, 'live: no late events')
check(live.inhale > -50 && live.exhale > -50, 'live: sound during inhale and exhale')
check(live.hold === null || live.hold < live.inhale - 20, 'live: quiet during holds')
check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
await browser.close()
if (fail.length) process.exit(1)
