import { useState } from 'react'
import { engine } from '../app'
import { bpmOf, detectRatio, MAX_BPM, MIN_BPM, ratioLabel, samePhases, type PhaseKey } from '../pattern/timing'
import { STYLES } from '../samples/types'
import { allPresets, useStore } from '../state/store'

export const btn =
  'rounded-full border border-line px-4 py-2 text-sm font-medium tracking-wide hover:border-fg transition-colors disabled:opacity-40'
const label = 'text-xs uppercase tracking-[0.18em] text-soft'

export function RateControl({ big = false }: { big?: boolean }) {
  const pattern = useStore((s) => s.pattern)
  const { beginRate, endRate, setBpm, nudgeBpm } = useStore.getState()
  const bpm = bpmOf(pattern)
  return (
    <section aria-label="Breathing rate" className="space-y-2">
      <div className={label}>Rate · breaths per minute</div>
      <div className="flex items-center justify-between gap-4">
        <button className={`${btn} ${big ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'}`} onClick={() => nudgeBpm(-0.5)} aria-label="Slower">−</button>
        <div className={`font-serif tabular-nums leading-none ${big ? 'text-[7rem]' : 'text-7xl'}`}>{bpm.toFixed(1)}</div>
        <button className={`${btn} ${big ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'}`} onClick={() => nudgeBpm(0.5)} aria-label="Faster">+</button>
      </div>
      <input
        id="rate-slider"
        type="range"
        min={MIN_BPM}
        max={MAX_BPM}
        step={0.1}
        value={Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))}
        aria-label="Breaths per minute"
        onPointerDown={beginRate}
        onPointerUp={endRate}
        onBlur={endRate}
        onChange={(e) => setBpm(parseFloat(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            nudgeBpm(e.key === 'ArrowUp' ? 0.5 : -0.5)
          }
        }}
      />
    </section>
  )
}

const KEYS: [PhaseKey, string][] = [['inhale', 'Inhale'], ['holdIn', 'Hold'], ['exhale', 'Exhale'], ['holdOut', 'Hold']]

export function TimingControl() {
  const pattern = useStore((s) => s.pattern)
  const { setPhaseValue, setRatio } = useStore.getState()
  const ratio = detectRatio(pattern)
  return (
    <section aria-label="Timing" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className={label}>Timing · seconds</div>
        <div className="text-sm text-soft">{ratioLabel(pattern)} · {bpmOf(pattern).toFixed(1)} BPM</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map(([k, name]) => (
          <label key={k} className="space-y-1">
            <span className="block text-xs text-soft">{name}</span>
            <PhaseInput value={pattern[k]} onCommit={(v) => setPhaseValue(k, v)} />
          </label>
        ))}
      </div>
      <div className="flex gap-2" role="group" aria-label="Ratio">
        {(['1:1', '1:2', '2:1'] as const).map((r) => (
          <button key={r} className={`${btn} ${ratio === r ? 'border-fg bg-fg !text-bg' : ''}`} onClick={() => { const [i, e] = r.split(':').map(Number); setRatio(i, e) }}>
            {r}
          </button>
        ))}
        <button className={`${btn} ${ratio === 'custom' ? 'border-fg bg-fg !text-bg' : ''}`} disabled>Custom</button>
      </div>
    </section>
  )
}

function PhaseInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) {
      const v = parseFloat(draft)
      if (isFinite(v)) onCommit(v)
      setDraft(null)
    }
  }
  return (
    <input
      type="number"
      step="0.1"
      min="0"
      inputMode="decimal"
      className="w-full rounded-lg border border-line bg-transparent px-2 py-2 text-center font-serif text-2xl tabular-nums"
      value={draft ?? String(Math.round(value * 100) / 100)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function StylePicker() {
  const style = useStore((s) => s.style)
  useStore((s) => s.libVersion)
  const { setStyle } = useStore.getState()
  return (
    <section aria-label="Breath style" className="space-y-2">
      <div className={label}>Style</div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STYLES.map((s) => (
          <button key={s.id} onClick={() => setStyle(s.id)} aria-pressed={style === s.id}
            className={`${btn} py-3 ${style === s.id ? 'border-fg bg-fg !text-bg' : ''}`}>
            {s.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function VolumeControl({ big = false }: { big?: boolean }) {
  const volume = useStore((s) => s.volume)
  const muted = useStore((s) => s.muted)
  const { setVolume, toggleMute } = useStore.getState()
  return (
    <section aria-label="Breathing volume" className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={label}>Breath volume</div>
        <div className={`font-serif tabular-nums ${big ? 'text-5xl' : 'text-3xl'}`}>{Math.round(volume * 100)}%</div>
      </div>
      <div className="flex items-center gap-4">
        <input type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="Breath volume"
          onChange={(e) => setVolume(parseInt(e.target.value) / 100)} />
        <button onClick={toggleMute} aria-pressed={muted} aria-label="Mute (M)"
          className={`${btn} shrink-0 ${big ? 'px-10 py-5 text-lg' : 'px-6 py-3'} ${muted ? 'border-clay bg-clay !text-bg' : ''}`}>
          {muted ? 'MUTED' : 'MUTE'}
        </button>
      </div>
    </section>
  )
}

export function TransportControl() {
  const t = useStore((s) => s.transport)
  const { play, pause, stop } = useStore.getState()
  const big = 'flex-1 rounded-full border border-line py-5 text-lg font-semibold tracking-[0.2em] transition-colors disabled:opacity-35'
  return (
    <div className="flex gap-3" role="group" aria-label="Transport">
      <button className={`${big} ${t === 'playing' ? '' : 'border-sage bg-sage !text-[var(--on-accent)]'}`} onClick={play} disabled={t === 'playing'}>PLAY</button>
      <button className={`${big} hover:border-fg`} onClick={pause} disabled={t !== 'playing'}>PAUSE</button>
      <button className={`${big} hover:border-fg`} onClick={stop} disabled={t === 'stopped'}>STOP</button>
    </div>
  )
}

export function PresetBar() {
  const pattern = useStore((s) => s.pattern)
  const customs = useStore((s) => s.customs)
  const { setPattern, saveCustom, renameCustom, deleteCustom } = useStore.getState()
  const list = allPresets(customs)
  const active = list.find((p) => samePhases(p.phases, pattern))
  const [name, setName] = useState('')
  return (
    <section aria-label="Presets" className="space-y-2">
      <div className={label}>Presets</div>
      <div className="flex flex-wrap gap-2">
        {list.map((p) => (
          <button key={p.id} className={`${btn} ${active?.id === p.id ? 'border-fg bg-fg !text-bg' : ''}`} onClick={() => setPattern(p.phases)}>
            {p.name}{p.builtin ? ` ${p.phases.inhale}:${p.phases.holdIn}:${p.phases.exhale}:${p.phases.holdOut}` : ''}
          </button>
        ))}
        <span className={`${btn} ${!active ? 'border-fg' : 'opacity-60'} cursor-default`}>Custom</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {active && !active.builtin ? (
          <>
            <button className={btn} onClick={() => { const n = prompt('Rename preset', active.name); if (n?.trim()) renameCustom(active.id, n.trim()) }}>Rename</button>
            <button className={btn} onClick={() => confirm(`Delete "${active.name}"?`) && deleteCustom(active.id)}>Delete</button>
          </>
        ) : (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this pattern"
              className="rounded-full border border-line bg-transparent px-4 py-2 text-sm" />
            <button className={btn} disabled={!name.trim() || !!active} onClick={() => { saveCustom(name.trim()); setName('') }}>Save as preset</button>
          </>
        )}
      </div>
    </section>
  )
}

export function AudioTest() {
  return <button className={btn} onClick={() => engine.testBreath()}>Audio test</button>
}
