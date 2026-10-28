import { useCallback, useEffect, useRef, useState } from 'react'
import { library } from '../app'
import { MicCapture } from '../recording/MicCapture'
import { splitPoint } from '../recording/segment'
import { GAP, LEAD, TAKE_PLAN, TAIL, pairLength, promptDuration, promptId, type Prompt } from '../recording/takePlan'
import { analyse } from '../samples/analyse'
import { STYLES, type BreathPhase } from '../samples/types'
import { useStore } from '../state/store'
import { Badge, Button, I, IconButton } from './kit'
import { Logo } from './Logo'
import { pcmToBuffer, playBuffer, playTake } from './preview'

interface Candidate {
  prompt: Prompt
  parts: Record<BreathPhase, { pcm: Float32Array; flags: string[] }>
  sr: number
}
type Step = { k: 'welcome' } | { k: 'mic' } | { k: 'prompt'; i: number; single: boolean } | { k: 'compare'; c: Candidate } | { k: 'review' }

const REST = 0.5
const smooth = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)))
const takeId = (p: Prompt, phase: BreathPhase) => `${p.style}-${phase}-${p.lengthClass}`
const styleOf = (p: Prompt) => STYLES.find((s) => s.id === p.style)!
const secs = (n: number) => `${n} ${n === 1 ? 'second' : 'seconds'}`
const planMinutes = Math.ceil(TAKE_PLAN.reduce((a, p) => a + promptDuration(p) + 6, 0) / 60)

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

const STEPS = ['Set up', 'Record', 'Review'] as const
const stepIndex = (s: Step) => (s.k === 'welcome' || s.k === 'mic' ? 0 : s.k === 'review' ? 2 : 1)

function Stepper({ at }: { at: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Steps">
      {STEPS.map((name, i) => (
        <li key={name} className="flex items-center gap-2">
          {i > 0 && <span className={`h-px w-6 sm:w-10 ${i <= at ? 'bg-sage' : 'bg-line'}`} />}
          <span className={`flex items-center gap-2 text-[13px] font-semibold ${i === at ? 'text-fg' : i < at ? 'text-sage' : 'text-faint'}`} aria-current={i === at ? 'step' : undefined}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i < at ? 'bg-sage text-on-accent' : i === at ? 'bg-fg text-bg' : 'bg-raised'}`}>
              {i < at ? <I.check s={13} /> : i + 1}
            </span>
            <span className="max-sm:hidden">{name}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function RecordingSetup() {
  const { setPanel } = useStore.getState()
  const [step, setStep] = useState<Step>({ k: library.count() > 0 ? 'review' : 'welcome' })
  const mic = useRef<MicCapture | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => () => mic.current?.close(), [])
  const close = () => {
    mic.current?.close()
    setPanel(null)
  }
  const ensureMic = async () => {
    if (mic.current) return true
    const m = new MicCapture()
    try {
      await m.open()
      mic.current = m
      return true
    } catch (e) {
      setErr(`Microphone unavailable: ${(e as Error).message}`)
      return false
    }
  }

  return (
    <div className="fade fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          <span className="font-serif text-[22px] max-sm:hidden">Record your breath</span>
        </div>
        <Stepper at={stepIndex(step)} />
        <Button variant={step.k === 'review' ? 'primary' : 'ghost'} size="sm" onClick={close}>
          {step.k === 'review' ? 'Done' : <><I.x s={14} /> Exit</>}
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
        {err && <p className="mb-4 rounded-2xl bg-clay-tint p-4 text-sm text-clay">{err}</p>}
        {step.k === 'welcome' && <Intro onNext={() => setStep({ k: 'mic' })} onReview={library.count() > 0 ? () => setStep({ k: 'review' }) : undefined} />}
        {step.k === 'mic' && <MicStep mic={mic} onError={setErr} onNext={() => setStep({ k: 'prompt', i: 0, single: false })} />}
        {step.k === 'prompt' && mic.current && (
          <PromptStep
            key={`${step.i}-${step.single}`}
            mic={mic.current}
            i={step.i}
            single={step.single}
            onDone={async (c) => {
              if (step.single && library.get(takeId(c.prompt, 'inhale'))) return setStep({ k: 'compare', c })
              await commit(c)
              const next = step.single ? -1 : TAKE_PLAN.findIndex((p, k) => k > step.i && !library.get(takeId(p, 'inhale')))
              setStep(next >= 0 ? { k: 'prompt', i: next, single: false } : { k: 'review' })
            }}
            onExit={() => setStep({ k: 'review' })}
          />
        )}
        {step.k === 'compare' && <CompareStep c={step.c} onKeep={async (k) => { if (k) await commit(step.c); setStep({ k: 'review' }) }} />}
        {step.k === 'review' && (
          <Review
            onRecord={async (i, single) => { if (await ensureMic()) setStep({ k: 'prompt', i, single }) }}
            onClose={close}
          />
        )}
      </div>
    </div>
  )
}

function Intro({ onNext, onReview }: { onNext: () => void; onReview?: () => void }) {
  const tips: [string, string][] = [
    ['Find a quiet room', 'Pause music and close windows. Fans and traffic get recorded too.'],
    ['Sit comfortably', 'Keep the mic 20 to 30 cm away, slightly to one side so breath doesn’t hit it directly.'],
    ['Follow the circle', 'It grows as you breathe in and shrinks as you breathe out. Each prompt is done twice.'],
    ['Take your time', 'Pause between prompts whenever you like. You can listen back and redo anything at the end.'],
  ]
  const byStyle = STYLES.map((s) => ({ s, lens: TAKE_PLAN.filter((p) => p.style === s.id).map((p) => p.seconds) }))
  return (
    <div className="rise grid flex-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <Badge tone="sage">About {planMinutes} minutes · {TAKE_PLAN.length} short prompts</Badge>
        <h1 className="mt-4 font-serif text-[56px] leading-[1.02]">Teach BreathDeck the sound of your breath</h1>
        <p className="mt-4 max-w-md text-soft">Your recordings replace the sample sounds, so every session sounds like you.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={onNext}>Check my microphone <I.arrow s={16} /></Button>
          {onReview && <Button size="lg" onClick={onReview}>Review my takes</Button>}
        </div>
        <p className="mt-4 text-xs text-faint">Powerful and fast breaths can cause dizziness. Rest whenever you need to.</p>
      </div>
      <div className="space-y-4">
        <ul className="space-y-4 rounded-3xl border border-line bg-panel p-6">
          {tips.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage-tint text-sage"><I.check s={13} /></span>
              <span><span className="block font-semibold">{t}</span><span className="text-sm text-soft">{d}</span></span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {byStyle.map(({ s, lens }) => (
            <div key={s.id} className="rounded-2xl border border-line p-3">
              <div className="text-sm font-bold">{s.label}</div>
              <div className="text-xs text-faint">{lens.join(', ')} s</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Meter({ mic, active = true }: { mic: MicCapture | null; active?: boolean }) {
  const bars = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      const lvl = Math.min(1, Math.sqrt((mic?.level ?? 0) * 6))
      const n = bars.current?.children.length ?? 0
      for (let i = 0; i < n; i++) {
        const el = bars.current!.children[i] as HTMLElement
        const on = i / n < lvl
        el.style.background = on ? (i / n > 0.85 ? 'var(--clay)' : 'var(--sage)') : 'var(--line)'
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [mic, active])
  return (
    <div ref={bars} className="flex h-8 items-end gap-[3px]" aria-label="Microphone level">
      {Array.from({ length: 32 }, (_, i) => <div key={i} className="flex-1 rounded-sm" style={{ height: `${35 + (i / 32) * 65}%` }} />)}
    </div>
  )
}

function MicStep({ mic, onNext, onError }: { mic: React.RefObject<MicCapture | null>; onNext: () => void; onError: (e: string) => void }) {
  const [ready, setReady] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [room, setRoom] = useState<{ text: string; ok?: boolean } | null>(null)

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

  const measure = async () => {
    const m = mic.current!
    setRoom({ text: 'Listening… stay quiet for 3 seconds' })
    m.start()
    await new Promise((r) => setTimeout(r, 3000))
    const pcm = m.stop()
    let s = 0
    for (const v of pcm) s += v * v
    const db = 20 * Math.log10(Math.sqrt(s / Math.max(1, pcm.length)) + 1e-9)
    setRoom(db < -55 ? { text: `Quiet room (${db.toFixed(0)} dB). Perfect.`, ok: true } : { text: `Some background noise (${db.toFixed(0)} dB). Moving away from fans or windows will help.`, ok: false })
  }

  return (
    <div className="rise mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
      <h1 className="font-serif text-[44px] leading-none">Microphone check</h1>
      <p className="mt-3 text-soft">Chrome will ask to use your microphone. BreathDeck turns off its voice filters so quiet breaths aren't removed.</p>
      <div className="mt-8 rounded-3xl border border-line bg-panel p-6">
        {!ready ? (
          <Button variant="primary" size="lg" className="w-full" onClick={() => open()}><I.mic s={18} /> Allow microphone</Button>
        ) : (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-faint">Microphone</span>
              <select className="h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm" onChange={(e) => open(e.target.value)} defaultValue={mic.current?.settings.deviceId}>
                {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-faint">Breathe normally. Bars should light up, without reaching the red end.</span>
              <Meter mic={mic.current} />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={measure}>Check room noise</Button>
              {room && <span className={`text-[13px] ${room.ok === false ? 'text-clay' : room.ok ? 'text-sage' : 'text-soft'}`}>{room.text}</span>}
            </div>
            {mic.current?.settings.noiseSuppression && <p className="text-sm text-clay">Browser noise suppression is on and may remove breath sounds.</p>}
          </div>
        )}
      </div>
      {ready && (
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={onNext}>
          Start recording <I.arrow s={16} />
        </Button>
      )}
    </div>
  )
}

function PromptStep({ mic, i, single, onDone, onExit }: { mic: MicCapture; i: number; single: boolean; onDone: (c: Candidate) => void; onExit: () => void }) {
  const p = TAKE_PLAN[i]
  const style = styleOf(p)
  const next = single ? undefined : TAKE_PLAN.find((q, k) => k > i && !library.get(takeId(q, 'inhale')))
  const [phase, setPhase] = useState<'ready' | 'count' | 'rec' | 'done'>(single ? 'ready' : 'count')
  const [run, setRun] = useState(0)
  const [count, setCount] = useState(3)
  const disc = useRef<HTMLDivElement>(null)
  const cue = useRef<HTMLDivElement>(null)
  const num = useRef<HTMLDivElement>(null)
  const round = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'count') return
    setCount(3)
    const timers = [1, 2, 3].map((n) => setTimeout(() => (n === 3 ? setPhase('rec') : setCount(3 - n)), n * 1000))
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
      let r = 1
      for (let a = 0; a < 2; a++) {
        const s = LEAD + a * pairLength(p)
        if (t >= s) r = a + 1
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
      if (round.current) round.current.textContent = `Round ${r} of 2`
      if (t >= total && !finished) {
        finished = true
        const pcm = mic.stop()
        const cand = process(pcm, mic.sampleRate, p)
        setPhase('done')
        setTimeout(() => onDone(cand), single ? 0 : 1400)
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

  const restart = () => { setRun((r) => r + 1); setPhase('count') }

  return (
    <div className="rise grid flex-1 items-center gap-10 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col items-center gap-6">
        <div className="relative grid h-[min(56vh,420px)] w-[min(56vh,420px)] max-w-[80vw] place-items-center">
          <div className="stage-glow absolute -inset-[15%] rounded-full" />
          <div className="absolute inset-0 rounded-full border border-line" />
          <div ref={disc} className="absolute inset-0 rounded-full border border-sage/60" style={{ transform: `scale(${REST})`, background: 'radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--sage), transparent 70%), color-mix(in srgb, var(--sage), transparent 92%) 62%, transparent)' }} />
          <div className="relative text-center">
            {phase === 'count' ? (
              <>
                <div className="text-[13px] font-semibold tracking-[0.22em] text-soft uppercase">Starting in</div>
                <div className="font-serif text-[96px] leading-none tabular-nums">{count}</div>
              </>
            ) : phase === 'ready' ? (
              <Button variant="primary" size="lg" onClick={() => setPhase('count')}><I.mic s={16} /> {single ? 'Record' : 'Continue'}</Button>
            ) : phase === 'done' ? (
              <div className="flex flex-col items-center gap-2 text-sage">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-sage text-on-accent"><I.check s={28} /></span>
                <span className="font-semibold">{single ? 'Recorded' : 'Saved'}</span>
              </div>
            ) : (
              <>
                <div ref={cue} className="text-[13px] font-semibold tracking-[0.22em] text-soft uppercase" />
                <div ref={num} className="font-serif text-[96px] leading-none tabular-nums" style={{ minHeight: '1em' }} />
              </>
            )}
          </div>
        </div>
        <div className="flex h-6 items-center gap-2 text-[13px] text-faint">
          {phase === 'rec' && <><span className="pulse-dot h-2 w-2 rounded-full bg-clay" /> <span className="font-semibold text-clay">Recording</span> · <span ref={round} /></>}
        </div>
        <div className="w-64"><Meter mic={mic} active={phase === 'rec'} /></div>
      </div>

      <aside className="space-y-4">
        {!single && (
          <div>
            <div className="mb-2 flex justify-between text-xs font-semibold text-faint">
              <span>Prompt {i + 1} of {TAKE_PLAN.length}</span>
              <span>{Math.round((i / TAKE_PLAN.length) * 100)}%</span>
            </div>
            <div className="flex gap-1">
              {TAKE_PLAN.map((q, k) => <div key={k} className={`h-1.5 flex-1 rounded-full ${k < i ? 'bg-sage' : k === i ? 'bg-fg' : 'bg-line'}`} title={`${styleOf(q).label} ${q.seconds}s`} />)}
            </div>
          </div>
        )}
        <div className="rounded-3xl border border-line bg-panel p-6">
          <Badge tone="sage">{style.label}</Badge>
          <h2 className="mt-3 font-serif text-[40px] leading-none">{secs(p.seconds)} in, {p.seconds} out</h2>
          <p className="mt-3 text-sm text-soft">{style.blurb}. Breathe in as the circle grows and out as it shrinks. You'll do it twice.</p>
          {p.style === 'powerful' && <p className="mt-2 text-sm text-clay">Stop and rest if you feel dizzy.</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {phase === 'count' || phase === 'rec' ? (
              <>
                <Button size="sm" onClick={() => setPhase('ready')}><I.pause s={12} /> Pause</Button>
                <Button size="sm" variant="ghost" onClick={restart}><I.redo s={13} /> Start again</Button>
              </>
            ) : null}
            {!single && <Button size="sm" variant="ghost" onClick={onExit}>Finish and review</Button>}
          </div>
        </div>
        {next && (
          <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
            <span className="text-xs font-semibold text-faint">Up next</span>
            <span className="font-semibold">{styleOf(next).label} · {secs(next.seconds)}</span>
          </div>
        )}
      </aside>
    </div>
  )
}

function CompareStep({ c, onKeep }: { c: Candidate; onKeep: (keepNew: boolean) => void }) {
  const p = c.prompt
  const has = !!library.get(takeId(p, 'inhale'))
  return (
    <div className="rise mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
      <h1 className="font-serif text-[44px] leading-none">Listen and choose</h1>
      <p className="mt-3 text-soft">{styleOf(p).label} · {secs(p.seconds)}. Keep whichever sounds more natural.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[{ name: 'New take', isNew: true }, { name: 'Current', isNew: false }].map(({ name, isNew }) => (
          <div key={name} className={`rounded-3xl border p-5 ${isNew ? 'border-sage bg-sage-tint' : 'border-line bg-panel'}`}>
            <div className="mb-3 text-sm font-bold">{name}</div>
            <div className="space-y-2">
              {(['inhale', 'exhale'] as const).map((ph) => (
                <div key={ph} className="flex items-center gap-2">
                  <IconButton label={`Play ${name} ${ph}`} size={34} disabled={!isNew && !has}
                    onClick={() => (isNew ? playBuffer(pcmToBuffer(c.parts[ph].pcm, c.sr)) : playTake(takeId(p, ph)))}>
                    <I.play s={13} />
                  </IconButton>
                  <span className="text-sm">{ph === 'inhale' ? 'In' : 'Out'}</span>
                  {isNew && c.parts[ph].flags.length > 0 && <span className="text-xs text-clay">{c.parts[ph].flags.join(', ')}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => onKeep(true)}>Keep new</Button>
        <Button size="lg" className="flex-1" onClick={() => onKeep(false)}>Keep current</Button>
      </div>
    </div>
  )
}

function Review({ onRecord, onClose }: { onRecord: (i: number, single: boolean) => void; onClose: () => void }) {
  useStore((s) => s.libVersion)
  const done = TAKE_PLAN.filter((p) => library.get(takeId(p, 'inhale')) && library.get(takeId(p, 'exhale'))).length
  const firstMissing = TAKE_PLAN.findIndex((p) => !library.get(takeId(p, 'inhale')) || !library.get(takeId(p, 'exhale')))
  return (
    <div className="rise space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[44px] leading-none">{done === TAKE_PLAN.length ? 'Your breath library is ready' : 'Review your takes'}</h1>
          <p className="mt-3 text-soft">
            {done} of {TAKE_PLAN.length} prompts recorded. Press play to listen. Styles you haven't recorded keep using sample sounds.
          </p>
        </div>
        <div className="flex gap-2">
          {firstMissing >= 0 && <Button onClick={() => onRecord(firstMissing, false)}><I.mic s={14} /> {done ? 'Continue recording' : 'Start recording'}</Button>}
          <Button variant="primary" onClick={onClose}>Start breathing <I.arrow s={14} /></Button>
        </div>
      </div>
      {STYLES.map((s) => (
        <section key={s.id}>
          <h3 className="mb-2 text-sm font-bold">{s.label} <span className="font-normal text-faint">· {s.blurb}</span></h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TAKE_PLAN.map((p, i) => ({ p, i })).filter((x) => x.p.style === s.id).map(({ p, i }) => {
              const a = library.get(takeId(p, 'inhale'))
              const b = library.get(takeId(p, 'exhale'))
              const flags = [...new Set([...(a?.flags ?? []), ...(b?.flags ?? [])])]
              return (
                <div key={promptId(p)} className={`rounded-2xl border p-4 ${a && b ? 'border-line bg-panel' : 'border-dashed border-line'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{secs(p.seconds)}</span>
                    {a && b ? <span className="text-sage"><I.check s={15} /></span> : <span className="text-xs text-faint">Not recorded</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <IconButton label="Play inhale" size={32} disabled={!a} onClick={() => playTake(a!.id)}><span className="text-[10px] font-bold">IN</span></IconButton>
                    <IconButton label="Play exhale" size={32} disabled={!b} onClick={() => playTake(b!.id)}><span className="text-[10px] font-bold">OUT</span></IconButton>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onRecord(i, true)}>{a ? 'Redo' : 'Record'}</Button>
                  </div>
                  {flags.length > 0 && <div className="mt-2 text-xs text-clay">{flags.join(', ')}</div>}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
