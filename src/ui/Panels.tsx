import { useEffect, useReducer, useRef } from 'react'
import { engine, library, router } from '../app'
import type { StyleId } from '../engine/Scheduler'
import { splitLongestGap } from '../recording/segment'
import { STYLES, type BreathPhase, type Take } from '../samples/types'
import { decodeToMono } from '../samples/wav'
import { useStore } from '../state/store'
import { Badge, Button, Dialog, I, Segmented, Slider, Switch } from './kit'
import { playTake } from './preview'

function Takes({ list, onDelete }: { list: Take[]; onDelete?: (id: string) => void }) {
  const sorted = [...list].sort((a, b) => a.phase.localeCompare(b.phase) || a.duration - b.duration)
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((t) => (
        <span key={t.id} className="inline-flex items-center rounded-lg border border-line bg-bg/40 text-xs">
          <button className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 hover:text-sage" onClick={() => playTake(t.id)} aria-label={`Play ${t.phase} ${t.duration.toFixed(1)} seconds`}>
            <I.play s={10} />
            <span className="font-semibold">{t.phase === 'inhale' ? 'In' : 'Out'}</span>
            <span className="text-faint tabular-nums">{t.duration.toFixed(1)}s</span>
            {t.flags.length > 0 && <span className="text-clay" title={t.flags.join(', ')}>!</span>}
          </button>
          {onDelete && (
            <button className="cursor-pointer border-l border-line px-1.5 py-1.5 text-faint hover:text-clay" onClick={() => onDelete(t.id)} aria-label="Delete take">
              <I.x s={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

function SamplesTab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        Real human breathing from Freesound, all public domain (CC0). They play whenever you haven't recorded your own takes for a style.
      </p>
      {library.samplesError && <p className="rounded-xl bg-clay-tint p-3 text-sm text-clay">{library.samplesError}</p>}
      {!library.samplesReady && !library.samplesError && <p className="text-sm text-faint">Loading sample sounds…</p>}
      {STYLES.map((s) => {
        const own = library.hasOwn(s.id)
        const on = library.prefs.use[s.id]
        return (
          <article key={s.id} className="rounded-2xl border border-line bg-raised/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">{s.label}</h3>
                  {own ? <Badge tone="sage">Using your recording</Badge> : on ? <Badge>In use</Badge> : <Badge tone="clay">Off</Badge>}
                </div>
                <p className="text-[13px] text-soft">{s.blurb}</p>
              </div>
              <Switch label={`Use ${s.label} sample sounds`} on={on} onChange={(v) => library.setUseSamples(s.id, v)} />
            </div>
            {library.samplesReady && (
              <div className="mt-3 space-y-3">
                <Takes list={library.samples(s.id)} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {library.credits(s.id).map((c) => (
                      <a key={c.url} className="inline-flex items-center gap-1 hover:text-fg" href={c.url} target="_blank" rel="noreferrer">
                        <I.link s={12} /> “{c.title.replace(/^[-\s]+/, '')}” by {c.author}
                      </a>
                    ))}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => library.setSwap(s.id, !library.prefs.swap[s.id])} title="If a breath labelled In sounds like an out-breath, swap them">
                    <I.swap s={13} /> {library.prefs.swap[s.id] ? 'In/out swapped' : 'Swap in/out'}
                  </Button>
                </div>
              </div>
            )}
          </article>
        )
      })}
      <p className="text-xs text-faint">
        Sliced from 128 kbps previews and labelled in/out automatically. If a style sounds back to front, use Swap in/out.
      </p>
    </div>
  )
}

function MineTab() {
  const { setPanel } = useStore.getState()
  const total = library.count()
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-sage/50 bg-sage-tint p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sage text-on-accent"><I.mic s={20} /></span>
        <div className="flex-1">
          <div className="font-bold">{total ? 'Add or redo recordings' : 'Record your own breath'}</div>
          <div className="text-[13px] text-soft">5 to 10 minutes, guided step by step. Your takes replace the samples.</div>
        </div>
        <Button variant="primary" onClick={() => setPanel('recording')}>{total ? 'Open guide' : 'Start'}</Button>
      </div>
      {STYLES.map((s) => {
        const takes = library.takes(s.id)
        return (
          <article key={s.id} className="rounded-2xl border border-line p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold">{s.label}</h3>
              <span className="text-xs text-faint">{takes.length ? `${takes.length} takes` : 'Using samples'}</span>
            </div>
            {takes.length ? <Takes list={takes} onDelete={(id) => void library.remove(id)} /> : <p className="text-[13px] text-faint">No recordings yet.</p>}
          </article>
        )
      })}
    </div>
  )
}

function UploadTab() {
  const { setNotice } = useStore.getState()
  const fileFor = useRef<{ style: StyleId; phase: BreathPhase | 'both' } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const onFile = async (f: File | undefined) => {
    const target = fileFor.current
    if (!f || !target) return
    try {
      const { pcm, sampleRate } = await decodeToMono(await f.arrayBuffer())
      if (target.phase === 'both') {
        const cut = splitLongestGap(pcm, sampleRate)
        await library.save({ style: target.style, phase: 'inhale', lengthClass: 'upload', source: 'uploaded', pcm: pcm.slice(0, cut), sampleRate })
        await library.save({ style: target.style, phase: 'exhale', lengthClass: 'upload', source: 'uploaded', pcm: pcm.slice(cut), sampleRate })
      } else {
        await library.save({ style: target.style, phase: target.phase, lengthClass: 'upload', source: 'uploaded', pcm, sampleRate })
      }
      setNotice('')
    } catch {
      setNotice(`Could not read "${f.name}". Try WAV, MP3, M4A, OGG or FLAC.`)
    }
  }
  const pick = (style: StyleId, phase: BreathPhase | 'both') => {
    fileFor.current = { style, phase }
    input.current?.click()
  }
  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="audio/*,.m4a,.flac" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      <p className="text-sm text-soft">
        Already have breath recordings? Add them here. A file with one inhale then one exhale is split for you automatically.
      </p>
      {STYLES.map((s) => (
        <article key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line p-4">
          <h3 className="text-base font-bold">{s.label}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={() => pick(s.id, 'both')} title="One file with an inhale then an exhale">
              <I.upload s={13} /> In + out file
            </Button>
            <Button size="sm" onClick={() => pick(s.id, 'inhale')}>Inhale</Button>
            <Button size="sm" onClick={() => pick(s.id, 'exhale')}>Exhale</Button>
          </div>
        </article>
      ))}
    </div>
  )
}

export function SoundLibraryPanel() {
  useStore((s) => s.libVersion)
  const tab = useStore((s) => s.libraryTab)
  const { setPanel } = useStore.getState()
  return (
    <Dialog side title="Sounds" subtitle="Choose what each breath style sounds like." onClose={() => setPanel(null)} width="max-w-[560px]">
      <Segmented
        label="Sound source"
        className="sticky top-0 z-10 mb-4 bg-panel"
        value={tab}
        onChange={(t) => useStore.setState({ libraryTab: t })}
        options={[
          { value: 'samples', label: 'Sample sounds' },
          { value: 'mine', label: `Your recordings${library.count() ? ` (${library.count()})` : ''}` },
          { value: 'upload', label: 'Upload' },
        ]}
      />
      {tab === 'samples' && <SamplesTab />}
      {tab === 'mine' && <MineTab />}
      {tab === 'upload' && <UploadTab />}
    </Dialog>
  )
}

export function SpeakerPanel() {
  const [, bump] = useReducer((x) => x + 1, 0)
  const { setPanel, setOffset } = useStore.getState()
  const offsets = useStore((s) => s.offsets)
  useEffect(() => {
    router.onChange = bump
    void router.refresh()
    return () => {
      router.onChange = () => useStore.setState((x) => ({ libVersion: x.libVersion + 1 }))
    }
  }, [])
  const key = router.selectedLabel || 'mac'
  const mismatch = router.selectedId && router.macDefaultLabel && router.selectedLabel !== router.macDefaultLabel
  const opt = (checked: boolean, onPick: () => void, title: string, sub?: string) => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors ${checked ? 'border-sage bg-sage-tint' : 'border-line hover:bg-raised'}`}>
      <input type="radio" className="accent-[var(--sage)]" checked={checked} onChange={onPick} />
      <span>
        <span className="block font-semibold">{title}</span>
        {sub && <span className="text-[13px] text-soft">{sub}</span>}
      </span>
    </label>
  )
  return (
    <Dialog side title="Speaker" subtitle="Where the breathing plays. Spotify keeps playing on your Mac's output." onClose={() => setPanel(null)} width="max-w-[520px]">
      {!router.supported && <p className="mb-4 rounded-xl bg-clay-tint p-3 text-sm text-clay">This browser can't choose a speaker. BreathDeck will use your Mac's output.</p>}
      {router.banner && <p className="mb-4 rounded-xl bg-clay-tint p-3 text-sm">{router.banner}</p>}
      <div className="space-y-2">
        {opt(!router.selectedId, () => router.choose(''), 'Same as Mac (recommended)', router.macDefaultLabel ? `Currently ${router.macDefaultLabel}` : 'Follows System Settings → Sound')}
        {router.supported && router.speakers.map((s) => <div key={s.id}>{opt(router.selectedId === s.id, () => router.choose(s.id), s.label)}</div>)}
      </div>
      <div className="mt-3 flex gap-2">
        {router.supported && !router.labelsVisible && (
          <Button size="sm" onClick={() => router.revealNames().catch(() => {})}>Show speaker names</Button>
        )}
        <Button size="sm" variant="primary" onClick={() => engine.testBreath()}><I.play s={12} /> Test breath</Button>
      </div>
      {mismatch && (
        <p className="mt-3 text-sm text-clay">
          Spotify plays on your Mac's output ({router.macDefaultLabel}). To hear both on {router.selectedLabel}, also select it in System Settings → Sound.
        </p>
      )}

      <h3 className="mt-8 mb-3 text-base font-bold">Connect a Bluetooth speaker</h3>
      <ol className="space-y-3 text-sm">
        {[
          <>Put the speaker in pairing mode. For Google Home, say “Hey Google, Bluetooth pairing”.</>,
          <>Pair it on your Mac. <a className="font-semibold text-sage hover:underline" href="x-apple.systempreferences:com.apple.BluetoothSettings">Open Bluetooth settings</a></>,
          <>Make it the Mac's output. <a className="font-semibold text-sage hover:underline" href="x-apple.systempreferences:com.apple.Sound-Settings.extension">Open Sound settings</a></>,
          <>Come back here and press Test breath.</>,
        ].map((c, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold">{i + 1}</span>
            <span className="pt-0.5 text-soft">{c}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-faint">Browsers can't pair audio devices, so pairing happens in macOS.</p>

      <div className="mt-8 rounded-2xl border border-line p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold">Circle alignment</h3>
          <span className="text-sm font-semibold tabular-nums">{offsets[key] ?? 0} ms</span>
        </div>
        <p className="mb-2 text-[13px] text-soft">For {key === 'mac' ? 'Mac output' : key}. Bluetooth adds delay: if the circle moves before you hear the breath, slide right.</p>
        <Slider min={-500} max={500} step={10} value={offsets[key] ?? 0} aria-label="Circle alignment"
          onChange={(e) => { const v = parseInt(e.target.value); setOffset(key, v); engine.visualOffsetMs = v }} />
      </div>
    </Dialog>
  )
}