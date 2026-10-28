import { useState } from 'react'
import { engine, library } from '../app'
import type { StyleId } from '../engine/Scheduler'
import { bpmOf, detectRatio, MAX_BPM, MIN_BPM, ratioLabel, samePhases, type PhaseKey } from '../pattern/timing'
import { STYLES } from '../samples/types'
import { allPresets, useStore } from '../state/store'
import { Badge, Button, Card, I, IconButton, Segmented, Slider } from './kit'

export function RateControl({ big = false }: { big?: boolean }) {
  const pattern = useStore((s) => s.pattern)
  const { beginRate, endRate, setBpm, nudgeBpm } = useStore.getState()
  const bpm = bpmOf(pattern)
  const step = big ? 64 : 44
  return (
    <div aria-label="Breathing rate" className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <IconButton label="Slower" size={step} onClick={() => nudgeBpm(-0.5)}>
          <I.minus s={big ? 26 : 18} />
        </IconButton>
        <div className="text-center">
          <div className={`font-serif leading-[0.9] tabular-nums ${big ? 'text-[120px]' : 'text-[56px]'}`}>{bpm.toFixed(1)}</div>
          <div className={`font-semibold text-faint ${big ? 'text-base' : 'text-xs'}`}>breaths per minute</div>
        </div>
        <IconButton label="Faster" size={step} onClick={() => nudgeBpm(0.5)}>
          <I.plus s={big ? 26 : 18} />
        </IconButton>
      </div>
      <Slider
        id="rate-slider"
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
    </div>
  )
}

const KEYS: [PhaseKey, string][] = [['inhale', 'Inhale'], ['holdIn', 'Hold'], ['exhale', 'Exhale'], ['holdOut', 'Hold']]

export function TimingControl() {
  const pattern = useStore((s) => s.pattern)
  const { setPhaseValue, setRatio } = useStore.getState()
  const ratio = detectRatio(pattern)
  return (
    <div aria-label="Timing" className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map(([k, name]) => (
          <label key={k} className="rounded-2xl border border-line bg-bg/40 px-2 pt-1.5 pb-1 text-center focus-within:border-sage">
            <span className="block text-[11px] font-semibold text-faint">{name}</span>
            <PhaseInput label={`${name} seconds`} value={pattern[k]} onCommit={(v) => setPhaseValue(k, v)} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-semibold text-faint">In : Out</span>
        <Segmented
          label="Ratio"
          className="flex-1"
          value={ratio}
          onChange={(r) => {
            if (r === 'custom') return
            const [i, e] = r.split(':').map(Number)
            setRatio(i, e)
          }}
          options={[
            { value: '1:1', label: '1 : 1', hint: 'Equal in and out' },
            { value: '1:2', label: '1 : 2', hint: 'Out twice as long (calming)' },
            { value: '2:1', label: '2 : 1', hint: 'In twice as long (energising)' },
            { value: 'custom', label: ratio === 'custom' ? ratioLabel(pattern) : 'Custom', disabled: ratio !== 'custom' },
          ]}
        />
      </div>
    </div>
  )
}

function PhaseInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
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
      aria-label={label}
      className="w-full bg-transparent text-center font-serif text-[28px] leading-tight tabular-nums outline-none"
      value={draft ?? String(Math.round(value * 100) / 100)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function RhythmCard() {
  return (
    <Card title="Rhythm">
      <div className="space-y-3">
        <RateControl />
        <TimingControl />
      </div>
    </Card>
  )
}

export function SourceBadge({ style }: { style: StyleId }) {
  useStore((s) => s.libVersion)
  const src = library.sourceFor(style)
  if (src === 'own') return <Badge tone="sage"><I.mic s={12} /> Your recording</Badge>
  if (src === 'sample') return <Badge><I.wave s={12} /> Sample sound</Badge>
  return <Badge tone="clay">No sound yet</Badge>
}

export function StylePicker({ big = false }: { big?: boolean }) {
  const style = useStore((s) => s.style)
  useStore((s) => s.libVersion)
  const { setStyle } = useStore.getState()
  return (
    <Segmented
      label="Breath style"
      size={big ? 'lg' : 'md'}
      value={style}
      onChange={setStyle}
      options={STYLES.map((s) => ({ value: s.id, label: s.label, hint: s.blurb }))}
    />
  )
}

export function VolumeControl({ big = false }: { big?: boolean }) {
  const volume = useStore((s) => s.volume)
  const muted = useStore((s) => s.muted)
  const { setVolume, toggleMute } = useStore.getState()
  return (
    <div aria-label="Breathing volume" className="flex items-center gap-3">
      <IconButton
        label={muted ? 'Unmute (M)' : 'Mute (M)'}
        aria-pressed={muted}
        size={big ? 64 : 40}
        onClick={toggleMute}
        className={muted ? '!border-clay !bg-clay-tint !text-clay' : ''}
      >
        {muted ? <I.muted s={big ? 26 : 18} /> : <I.volume s={big ? 26 : 18} />}
      </IconButton>
      <Slider min={0} max={100} value={Math.round(volume * 100)} aria-label="Breath volume" onChange={(e) => setVolume(parseInt(e.target.value) / 100)} />
      <div className={`w-14 shrink-0 text-right font-semibold tabular-nums ${big ? 'text-2xl' : 'text-sm'} ${muted ? 'text-clay' : ''}`}>
        {muted ? 'Muted' : `${Math.round(volume * 100)}%`}
      </div>
    </div>
  )
}

export function SoundCard() {
  const style = useStore((s) => s.style)
  useStore((s) => s.libVersion)
  const { setPanel } = useStore.getState()
  const info = STYLES.find((s) => s.id === style)!
  const src = library.sourceFor(style)
  return (
    <Card
      title="Sound"
      aside={
        <Button variant="ghost" size="sm" onClick={() => engine.testBreath()}>
          <I.play s={12} /> Test breath
        </Button>
      }
    >
      <div className="space-y-3">
        <StylePicker />
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="truncate text-soft">{info.blurb}</span>
          {src === 'none' ? (
            <button className="shrink-0 cursor-pointer font-semibold text-clay underline-offset-2 hover:underline" onClick={() => setPanel('library', 'samples')}>
              Choose a sound
            </button>
          ) : (
            <SourceBadge style={style} />
          )}
        </div>
        <VolumeControl />
      </div>
    </Card>
  )
}

export function TransportControl({ big = false }: { big?: boolean }) {
  const t = useStore((s) => s.transport)
  const { play, pause, stop } = useStore.getState()
  const playing = t === 'playing'
  const d = big ? 96 : 76
  return (
    <div className="flex items-center justify-center gap-4" role="group" aria-label="Transport">
      <span style={{ width: big ? 64 : 48 }} />
      <button
        onClick={playing ? pause : play}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        style={{ width: d, height: d }}
        className="grid cursor-pointer place-items-center rounded-full bg-sage text-on-accent shadow-[0_14px_40px_-14px_var(--sage)] transition-all hover:brightness-110 active:scale-95"
      >
        {playing ? <I.pause s={big ? 36 : 28} /> : <span className="translate-x-[2px]"><I.play s={big ? 36 : 28} /></span>}
      </button>
      <IconButton label="Stop" size={big ? 64 : 48} onClick={stop} disabled={t === 'stopped'}>
        <I.stop s={big ? 22 : 16} />
      </IconButton>
    </div>
  )
}

export function PresetCard() {
  const pattern = useStore((s) => s.pattern)
  const customs = useStore((s) => s.customs)
  const { setPattern, saveCustom, renameCustom, deleteCustom } = useStore.getState()
  const list = allPresets(customs)
  const active = list.find((p) => samePhases(p.phases, pattern))
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const save = () => {
    if (name.trim()) saveCustom(name.trim())
    setName('')
    setNaming(false)
  }
  return (
    <Card
      title="Presets"
      aside={
        active && !active.builtin ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => { const n = prompt('Rename preset', active.name); if (n?.trim()) renameCustom(active.id, n.trim()) }}>Rename</Button>
            <Button variant="danger" size="sm" onClick={() => confirm(`Delete "${active.name}"?`) && deleteCustom(active.id)}>Delete</Button>
          </div>
        ) : !active && !naming ? (
          <Button variant="ghost" size="sm" onClick={() => setNaming(true)}><I.bookmark s={13} /> Save current</Button>
        ) : null
      }
    >
      {naming ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this pattern"
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg/40 px-3 text-sm outline-none focus:border-sage" />
          <Button variant="primary" type="submit" disabled={!name.trim()}>Save</Button>
          <Button variant="ghost" type="button" onClick={() => setNaming(false)}>Cancel</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.map((p) => {
            const on = active?.id === p.id
            return (
              <button key={p.id} onClick={() => setPattern(p.phases)} aria-pressed={on}
                className={`h-9 cursor-pointer rounded-xl border px-3 text-[13px] font-semibold transition-colors ${on ? 'border-sage bg-sage-tint text-fg' : 'border-line text-soft hover:text-fg'}`}>
                {p.name}
                <span className="ml-1.5 font-normal text-faint tabular-nums">{bpmOf(p.phases).toFixed(bpmOf(p.phases) % 1 ? 1 : 0)}</span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
