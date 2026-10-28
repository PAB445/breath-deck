import { useCallback, useEffect, useRef, useState } from 'react'
import { library } from '../app'
import { MicCapture } from '../recording/MicCapture'
import { splitPoint } from '../recording/segment'
import { GAP, LEAD, TAKE_PLAN, TAIL, pairLength, promptDuration, promptId, type Prompt } from '../recording/takePlan'
import { analyse } from '../samples/analyse'
import { STYLES, type BreathPhase } from '../samples/types'
import { useStore } from '../state/store'
import { btn } from './Controls'
import { pcmToBuffer, playBuffer, playTake } from './preview'

interface Candidate {
  prompt: Prompt
  parts: Record<BreathPhase, { pcm: Float32Array; flags: string[] }>
  sr: number
}
type Step = { k: 'welcome' } | { k: 'mic' } | { k: 'prompt'; i: number; single: boolean } | { k: 'compare'; c: Candidate } | { k: 'review' }

const REST = 0.55
const smooth = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)))
const takeId = (p: Prompt, phase: BreathPhase) => `${p.style}-${phase}-${p.lengthClass}`

function process(pcm: Float32Array, sr: number, p: Prompt): Candidate {
  const L = p.seconds
  const attempts = [0, 1].map((a) => {
    const start = LEAD + a * pairLength(p)
    const from = Math.max(0, Math.floor((start - 0.1) * sr))
    const to = Math.min(pcm.length, Math.floor((start + 2 * L + 0.6) * sr))
    const win = pcm.slice(from, to)
    const cut = splitPoint(win, sr, 0.1 + L + 0.2, 0.35 * L + 0.15)
    const inh = analyse(win.slice(0, cut), sr, p.style, L)
    const exh = analyse(win.slice(cut), sr, p.style, L)
    return { inh, exh, flags: inh.flags.length + exh.flags.length }
  })
  const best = attempts[1].flags <= attempts[0].flags ? attempts[1] : attempts[0]
  return {
    prompt: p,
    sr,
    parts: {
      inhale: { pcm: best.inh.pcm, flags: best.inh.flags },
      exhale: { pcm: best.exh.pcm, flags: best.exh.flags },
    },
  }
}

async function commit(c: Candidate) {
  for (const phase of ['inhale', 'exhale'] as const) {
    await library.save({
      style: c.prompt.style,
      phase,
      lengthClass: c.prompt.lengthClass,
      source: 'recorded',
      pcm: c.parts[phase].pcm,
      sampleRate: c.sr,
      expectedSec: c.prompt.seconds,
      id: takeId(c.prompt, phase),
    })
  }
}

export function RecordingSetup() {
  const { setPanel } = useStore.getState()
  const [step, setStep] = useState<Step>({ k: 'welcome' })
  const mic = useRef<MicCapture | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => () => mic.current?.close(), [])
  const close = () => {
    mic.current?.close()
    setPanel(null)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-soft">Recording setup</div>
          <button className={btn} onClick={close}>{step.k === 'review' ? 'Done' : 'Exit'}</button>
        </div>
        {err && <p className="mb-4 rounded-lg border border-clay p-3 text-sm">{err}</p>}
        {step.k === 'welcome' && (
          <Centered>
            <h1 className="font-serif text-5xl">Record your own breath</h1>
            <p className="max-w-lg text-soft">
              About 10 minutes. You'll breathe in and out to a visual guide, 14 times, across four styles. Find a quiet room, pause any music, and sit comfortably.
              Keep the mic about 20 to 30 cm away, slightly to the side.
            </p>
            <p className="max-w-lg text-sm text-soft">Powerful and Fast breaths can cause dizziness. Pause between prompts whenever you need to.</p>
            <button className={`${btn} border-sage px-8 py-4 text-base`} onClick={() => setStep({ k: 'mic' })}>Begin</button>
            {library.count() > 0 && <button className={btn} onClick={() => setStep({ k: 'review' })}>Review existing takes</button>}
          </Centered>
        )}
        {step.k === 'mic' && <MicStep mic={mic} onError={setErr} onNext={() => setStep({ k: 'prompt', i: 0, single: false })} />}
        {step.k === 'prompt' && mic.current && (
          <PromptStep
            key={`${step.i}-${step.single}`}
            mic={mic.current}
            i={step.i}
            single={step.single}
            onDone={async (c) => {
              if (step.single) setStep({ k: 'compare', c })
              else {
                await commit(c)
                setStep(step.i + 1 < TAKE_PLAN.length ? { k: 'prompt', i: step.i + 1, single: false } : { k: 'review' })
              }
            }}
            onExit={() => setStep({ k: 'review' })}
          />
        )}
        {step.k === 'compare' && (
          <CompareStep c={step.c} onKeep={async (k) => { if (k) await commit(step.c); setStep({ k: 'review' }) }} />
        )}
        {step.k === 'review' && (
          <Review
            onRerecord={async (i) => {
              if (!mic.current) {
                const m = new MicCapture()
                try {
                  await m.open()
                  mic.current = m
                } catch (e) {
                  setErr(`Microphone unavailable: ${(e as Error).message}`)
                  return
                }
              }
              setStep({ k: 'prompt', i, single: true })
            }}
          />
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">{children}</div>
}

function MicStep({ mic, onNext, onError }: { mic: React.RefObject<MicCapture | null>; onNext: () => void; onError: (e: string) => void }) {
  const [ready, setReady] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [room, setRoom] = useState<string>('')
  const bar = useRef<HTMLDivElement>(null)

  const open = useCallback(async (id?: string) => {
    mic.current?.close()
    const m = new MicCapture()
    try {
      await m.open(id)
    } catch (e) {
      onError(`Could not open the microphone: ${(e as Error).message}. Allow access in Chrome's address bar and try again.`)
      return
    }
    onError('')
    mic.current = m
    setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'))
    setReady(true)
  }, [mic, onError])

  useEffect(() => {
    if (!ready) return
    let raf = 0
    const loop = () => {
      const lvl = Math.min(1, (mic.current?.level ?? 0) * 6)
      if (bar.current) bar.current.style.width = `${lvl * 100}%`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [ready, mic])

  const measure = async () => {
    const m = mic.current!
    setRoom('Listening to the room… stay quiet for 3 seconds')
    m.start()
    await new Promise((r) => setTimeout(r, 3000))
    const pcm = m.stop()
    let s = 0
    for (const v of pcm) s += v * v
    const db = 20 * Math.log10(Math.sqrt(s / Math.max(1, pcm.length)) + 1e-9)
    setRoom(db < -55 ? `Room is quiet (${db.toFixed(0)} dB)` : `Some background noise (${db.toFixed(0)} dB). Closing a window or moving the Mac away from fans will help.`)
  }

  return (
    <Centered>
      <h1 className="font-serif text-4xl">Microphone check</h1>
      {!ready ? (
        <button className={`${btn} border-sage px-8 py-4`} onClick={() => open()}>Allow microphone</button>
      ) : (
        <div className="w-full max-w-md space-y-4 text-left">
          <select className="w-full rounded-lg border border-line bg-bg px-3 py-2" onChange={(e) => open(e.target.value)} defaultValue={mic.current?.settings.deviceId}>
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
          </select>
          <div className="h-2 overflow-hidden rounded bg-line"><div ref={bar} className="h-full bg-sage" /></div>
          <p className="text-sm text-soft">Breathe normally: the bar should move without hitting the end.</p>
          <div className="flex items-center gap-3">
            <button className={btn} onClick={measure}>Measure room tone</button>
            <span className="text-sm">{room}</span>
          </div>
          {mic.current?.settings.noiseSuppression && <p className="text-sm text-clay">Browser noise suppression is on and may remove breath sounds.</p>}
          <button className={`${btn} w-full border-sage py-4`} onClick={onNext}>Start recording</button>
        </div>
      )}
    </Centered>
  )
}

function PromptStep({ mic, i, single, onDone, onExit }: { mic: MicCapture; i: number; single: boolean; onDone: (c: Candidate) => void; onExit: () => void }) {
  const p = TAKE_PLAN[i]
  const style = STYLES.find((s) => s.id === p.style)!
  const [phase, setPhase] = useState<'ready' | 'count' | 'rec' | 'done'>(single ? 'ready' : 'count')
  const [run, setRun] = useState(0)
  const [count, setCount] = useState(3)
  const disc = useRef<HTMLDivElement>(null)
  const cue = useRef<HTMLDivElement>(null)
  const num = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'count') return
    setCount(3)
    const timers = [1, 2, 3].map((n) =>
      setTimeout(() => (n === 3 ? setPhase('rec') : setCount(3 - n)), n * 1000),
    )
    return () => timers.forEach(clearTimeout)
  }, [phase, run])

  useEffect(() => {
    if (phase !== 'rec') return
    const total = promptDuration(p)
    mic.start()
    const t0 = performance.now()
    let raf = 0
    let finished = false
    const L = p.seconds
    const loop = () => {
      const t = (performance.now() - t0) / 1000
      let scale = REST
      let word = 'Get ready'
      let remain = 0
      for (let a = 0; a < 2; a++) {
        const s = LEAD + a * pairLength(p)
        if (t >= s && t < s + L) {
          scale = REST + (1 - REST) * smooth((t - s) / L)
          word = 'Breathe in'
          remain = s + L - t
        } else if (t >= s + L && t < s + 2 * L) {
          scale = 1 - (1 - REST) * smooth((t - s - L) / L)
          word = 'Breathe out'
          remain = s + 2 * L - t
        } else if (t >= s + 2 * L && t < s + 2 * L + GAP && t > LEAD) {
          word = a === 0 ? 'Again' : 'Rest'
        }
      }
      if (t > total - TAIL) word = 'Rest'
      if (disc.current) disc.current.style.transform = `scale(${scale})`
      if (cue.current) cue.current.textContent = word
      if (num.current) num.current.textContent = remain > 0 ? String(Math.ceil(remain)) : ''
      if (t >= total && !finished) {
        finished = true
        const pcm = mic.stop()
        const cand = process(pcm, mic.sampleRate, p)
        setPhase('done')
        setTimeout(() => onDone(cand), single ? 0 : 1500)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (!finished) mic.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, run])

  const redo = () => { setRun((r) => r + 1); setPhase('count') }

  return (
    <Centered>
      <div className="w-full">
        <div className="mb-2 flex gap-1" aria-label="Progress">
          {TAKE_PLAN.map((q, k) => (
            <div key={k} className={`h-1 flex-1 rounded ${k < i ? 'bg-sage' : k === i ? 'bg-fg' : 'bg-line'}`} title={`${q.style} ${q.seconds}s`} />
          ))}
        </div>
        <div className="text-xs text-soft">Prompt {i + 1} of {TAKE_PLAN.length}</div>
      </div>
      <div>
        <div className="font-serif text-4xl">{style.label} · {p.seconds} {p.seconds === 1 ? 'second' : 'seconds'}</div>
        <p className="mt-1 text-soft">{style.blurb}. Breathe in for {p.seconds}, then out for {p.seconds}, twice.</p>
        {p.style === 'powerful' && <p className="mt-1 text-sm text-clay">Stop and rest if you feel dizzy.</p>}
      </div>
      <div className="relative grid h-72 w-72 place-items-center">
        <div className="absolute inset-0 rounded-full border border-line" />
        <div ref={disc} className="absolute inset-0 rounded-full border-2 border-sage bg-panel" style={{ transform: `scale(${REST})` }} />
        <div className="relative">
          {phase === 'count' ? (
            <div className="font-serif text-8xl tabular-nums">{count}</div>
          ) : phase === 'ready' ? (
            <button className={`${btn} border-sage px-6 py-3`} onClick={() => setPhase('count')}>Record</button>
          ) : phase === 'done' ? (
            <div className="font-serif text-3xl text-sage">Saved</div>
          ) : (
            <>
              <div ref={cue} className="font-serif text-3xl tracking-wider" />
              <div ref={num} className="font-serif text-6xl tabular-nums text-sage" />
            </>
          )}
        </div>
      </div>
      <div className="flex gap-3">
        <button className={btn} onClick={redo} disabled={phase === 'done'}>Redo</button>
        <button className={btn} onClick={onExit}>Stop and review</button>
      </div>
    </Centered>
  )
}

function CompareStep({ c, onKeep }: { c: Candidate; onKeep: (keepNew: boolean) => void }) {
  const p = c.prompt
  return (
    <Centered>
      <h2 className="font-serif text-4xl">{STYLES.find((s) => s.id === p.style)!.label} · {p.seconds} s</h2>
      <div className="grid w-full max-w-md grid-cols-2 gap-6 text-left">
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-soft">New</div>
          {(['inhale', 'exhale'] as const).map((ph) => (
            <div key={ph} className="mb-2 flex items-center gap-2">
              <button className={btn} onClick={() => playBuffer(pcmToBuffer(c.parts[ph].pcm, c.sr))}>▶ {ph}</button>
              <span className="text-xs text-clay">{c.parts[ph].flags.join(', ')}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-soft">Current</div>
          {(['inhale', 'exhale'] as const).map((ph) => (
            <div key={ph} className="mb-2">
              <button className={btn} disabled={!library.get(takeId(p, ph))} onClick={() => playTake(takeId(p, ph))}>▶ {ph}</button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <button className={`${btn} border-sage`} onClick={() => onKeep(true)}>Keep new</button>
        <button className={btn} onClick={() => onKeep(false)}>Keep current</button>
      </div>
    </Centered>
  )
}

function Review({ onRerecord }: { onRerecord: (i: number) => void }) {
  useStore((s) => s.libVersion)
  const missing = TAKE_PLAN.filter((p) => !library.get(takeId(p, 'inhale')) || !library.get(takeId(p, 'exhale'))).length
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-4xl">{missing === 0 ? 'Your breath library is ready' : 'Review your takes'}</h1>
      {missing > 0 && <p className="text-sm text-soft">{missing} of {TAKE_PLAN.length} prompts have no take yet. Re-record any of them below.</p>}
      {STYLES.map((s) => (
        <section key={s.id} className="border-t border-line pt-4">
          <h3 className="mb-2 font-serif text-2xl">{s.label}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TAKE_PLAN.map((p, i) => ({ p, i })).filter((x) => x.p.style === s.id).map(({ p, i }) => {
              const a = library.get(takeId(p, 'inhale'))
              const b = library.get(takeId(p, 'exhale'))
              const flags = [...(a?.flags ?? []), ...(b?.flags ?? [])]
              return (
                <div key={promptId(p)} className="rounded-xl border border-line p-3">
                  <div className="mb-2 text-sm font-medium">{p.seconds} s</div>
                  <div className="flex gap-1">
                    <button className={btn + ' px-3 py-1'} disabled={!a} onClick={() => playTake(a!.id)}>▶ in</button>
                    <button className={btn + ' px-3 py-1'} disabled={!b} onClick={() => playTake(b!.id)}>▶ out</button>
                  </div>
                  <div className="mt-2 min-h-4 text-xs text-clay">{flags.length ? [...new Set(flags)].join(', ') : a && b ? '' : 'not recorded'}</div>
                  <button className="mt-1 text-xs text-sage underline" onClick={() => onRerecord(i)}>{a ? 'Re-record' : 'Record'}</button>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
