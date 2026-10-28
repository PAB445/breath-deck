import { useEffect, useRef } from 'react'
import { engine } from '../app'
import type { PhaseKey } from '../pattern/timing'
import { useStore } from '../state/store'

const REST = 0.56
const WORD: Record<string, string> = { inhale: 'Breathe in', exhale: 'Breathe out', holdIn: 'Hold', holdOut: 'Hold', rest: 'Ready' }
const smooth = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)))
export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
const R = 48
const C = 2 * Math.PI * R

export function BreathCircle({ size }: { size: string }) {
  const disc = useRef<HTMLDivElement>(null)
  const arc = useRef<SVGCircleElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const count = useRef<HTMLDivElement>(null)
  const elapsed = useRef<HTMLSpanElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const last = useRef({ scale: REST })

  useEffect(() => {
    let raf = 0
    let lastWord = ''
    let lastCount = ''
    let lastPhase = ''
    const loop = () => {
      const f = engine.frame()
      let target = last.current.scale
      if (f.phase === 'inhale') target = REST + (1 - REST) * smooth(f.progress)
      else if (f.phase === 'exhale') target = 1 - (1 - REST) * smooth(f.progress)
      else if (f.phase === 'holdIn') target = 1
      else if (f.phase === 'holdOut') target = REST
      else target = engine.state === 'playing' ? last.current.scale : last.current.scale + (REST - last.current.scale) * 0.08
      last.current.scale = target
      if (disc.current) disc.current.style.transform = `scale(${target})`
      if (arc.current) arc.current.style.strokeDashoffset = String(C * (1 - (f.phase === 'rest' ? 0 : Math.min(1, f.progress))))
      const w = engine.state === 'paused' ? 'Paused' : WORD[f.phase]
      const c = f.phase === 'rest' ? '' : String(Math.max(1, Math.ceil(f.remaining - 0.001)))
      if (word.current && w !== lastWord) word.current.textContent = lastWord = w
      if (count.current && c !== lastCount) count.current.textContent = lastCount = c
      if (elapsed.current) elapsed.current.textContent = fmtTime(engine.elapsed())
      if (strip.current && f.phase !== lastPhase) {
        lastPhase = f.phase
        for (const el of strip.current.children) (el as HTMLElement).dataset.on = String((el as HTMLElement).dataset.k === f.phase)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <div className="stage-glow pointer-events-none absolute -inset-[18%] rounded-full" />
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="0.8" />
          <circle ref={arc} cx="50" cy="50" r={R} fill="none" stroke="var(--sage)" strokeWidth="1.2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C} />
        </svg>
        <div
          ref={disc}
          className="absolute inset-[5%] rounded-full border border-[color-mix(in_srgb,var(--sage),transparent_45%)]"
          style={{
            transform: `scale(${REST})`,
            willChange: 'transform',
            background: 'radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--sage), transparent 72%), color-mix(in srgb, var(--sage), transparent 92%) 62%, transparent)',
          }}
        />
        <div className="relative text-center" aria-live="off">
          <div ref={word} className="text-[13px] font-semibold tracking-[0.22em] text-soft uppercase">Ready</div>
          <div ref={count} className="font-serif text-[clamp(56px,9vh,96px)] leading-none tabular-nums" style={{ minHeight: '1em' }} />
        </div>
      </div>
      <PhaseStrip stripRef={strip} />
      <div className="text-sm text-faint">
        Session <span ref={elapsed} className="font-semibold text-soft tabular-nums">00:00</span>
      </div>
    </div>
  )
}

const PARTS: [PhaseKey, string][] = [['inhale', 'In'], ['holdIn', 'Hold'], ['exhale', 'Out'], ['holdOut', 'Hold']]

function PhaseStrip({ stripRef }: { stripRef: React.RefObject<HTMLDivElement | null> }) {
  const p = useStore((s) => s.pattern)
  return (
    <div ref={stripRef} className="flex w-[min(360px,80vw)] gap-1" aria-label="Pattern">
      {PARTS.map(([k, name]) => (
        <div
          key={k}
          data-k={k}
          data-on="false"
          className="group min-w-0 transition-[flex-grow] duration-300"
          style={{ flexGrow: Math.max(p[k], 0), flexBasis: 0, display: p[k] > 0 ? 'block' : 'none' }}
        >
          <div className="h-1.5 rounded-full bg-line transition-colors group-data-[on=true]:bg-sage" />
          <div className="mt-1.5 truncate text-center text-[11px] font-semibold text-faint group-data-[on=true]:text-fg">
            {name} {Math.round(p[k] * 10) / 10}s
          </div>
        </div>
      ))}
    </div>
  )
}
