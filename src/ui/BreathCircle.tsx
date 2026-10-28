import { useEffect, useRef } from 'react'
import { engine } from '../app'

const REST = 0.55
const WORD: Record<string, string> = { inhale: 'INHALE', exhale: 'EXHALE', holdIn: 'HOLD', holdOut: 'HOLD', rest: 'READY' }
const smooth = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)))
export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function BreathCircle({ size, elapsedClass = '' }: { size: string; elapsedClass?: string }) {
  const disc = useRef<HTMLDivElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const count = useRef<HTMLDivElement>(null)
  const elapsed = useRef<HTMLDivElement>(null)
  const last = useRef({ scale: REST })

  useEffect(() => {
    let raf = 0
    let lastWord = ''
    let lastCount = ''
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
      const w = engine.state === 'paused' ? 'PAUSED' : WORD[f.phase]
      const c = f.phase === 'rest' ? '' : String(Math.max(1, Math.ceil(f.remaining - 0.001)))
      if (word.current && w !== lastWord) word.current.textContent = lastWord = w
      if (count.current && c !== lastCount) count.current.textContent = lastCount = c
      if (elapsed.current) elapsed.current.textContent = fmtTime(engine.elapsed())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rounded-full border border-line" />
        <div
          ref={disc}
          className="absolute inset-0 rounded-full border-2 border-sage bg-panel"
          style={{ transform: `scale(${REST})`, willChange: 'transform' }}
        />
        <div className="relative text-center">
          <div ref={word} className="font-serif text-4xl tracking-[0.18em] md:text-5xl">READY</div>
          <div ref={count} className="mt-2 font-serif text-6xl tabular-nums text-sage md:text-7xl" style={{ minHeight: '1em' }} />
        </div>
      </div>
      <div ref={elapsed} className={`font-serif text-3xl tabular-nums text-soft ${elapsedClass}`}>00:00</div>
    </div>
  )
}
