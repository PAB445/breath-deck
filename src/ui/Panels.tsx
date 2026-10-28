import { useEffect, useReducer, useRef } from 'react'
import { engine, library, router } from '../app'
import { splitLongestGap } from '../recording/segment'
import { STYLES, type BreathPhase } from '../samples/types'
import { decodeToMono } from '../samples/wav'
import { useStore } from '../state/store'
import { btn } from './Controls'
import { playTake } from './preview'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-line bg-bg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-3xl">{title}</h2>
          <button className={btn} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SoundLibraryPanel() {
  useStore((s) => s.libVersion)
  const { setPanel, setNotice } = useStore.getState()
  const fileFor = useRef<{ style: (typeof STYLES)[number]['id']; phase: BreathPhase | 'both' } | null>(null)
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
  const pick = (style: (typeof STYLES)[number]['id'], phase: BreathPhase | 'both') => {
    fileFor.current = { style, phase }
    input.current?.click()
  }
  return (
    <Sheet title="Sound library" onClose={() => setPanel(null)}>
      <input ref={input} type="file" accept="audio/*,.m4a,.flac" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      <p className="mb-4 text-sm text-soft">
        Real recordings only. Your own takes come first: record them with the guide, or upload files.
      </p>
      <button className={`${btn} mb-8 w-full border-sage py-4 text-base`} onClick={() => setPanel('recording')}>
        Record your breath (about 10 minutes)
      </button>
      {STYLES.map((s) => {
        const takes = library.takes(s.id).sort((a, b) => a.phase.localeCompare(b.phase) || a.duration - b.duration)
        return (
          <section key={s.id} className="mb-6 border-t border-line pt-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-2xl">{s.label}</h3>
              <span className="text-xs text-soft">{takes.length} takes</span>
            </div>
            <p className="mb-2 text-sm text-soft">{s.blurb}</p>
            <ul className="mb-3 space-y-1 text-sm">
              {takes.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <button className="rounded-full border border-line px-3 py-1" onClick={() => playTake(t.id)} aria-label={`Play ${t.phase}`}>▶</button>
                  <span className="w-16">{t.phase}</span>
                  <span className="w-14 tabular-nums text-soft">{t.duration.toFixed(1)} s</span>
                  <span className="text-soft">{t.source}</span>
                  {t.flags.length > 0 && <span className="text-clay">{t.flags.join(', ')}</span>}
                  <button className="ml-auto text-soft hover:text-fg" onClick={() => library.remove(t.id)}>Delete</button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => pick(s.id, 'inhale')}>Upload inhale</button>
              <button className={btn} onClick={() => pick(s.id, 'exhale')}>Upload exhale</button>
              <button className={btn} onClick={() => pick(s.id, 'both')} title="One file with an inhale then an exhale, split automatically">
                Upload in + out file
              </button>
            </div>
          </section>
        )
      })}
    </Sheet>
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
      router.onChange = () => {}
    }
  }, [])
  const key = router.selectedLabel || 'mac'
  const mismatch = router.selectedId && router.macDefaultLabel && router.selectedLabel !== router.macDefaultLabel
  return (
    <Sheet title="Speaker" onClose={() => setPanel(null)}>
      {!router.supported && <p className="mb-4 text-sm text-clay">This browser can't choose a speaker. BreathDeck will use your Mac's output.</p>}
      <p className="mb-4 text-sm text-soft">
        BreathDeck plays to your Mac's selected output. Spotify does the same, so both reach the same speaker.
        BreathDeck never controls Spotify.
      </p>
      {router.banner && <p className="mb-4 rounded-lg border border-clay p-3 text-sm">{router.banner}</p>}
      <div className="space-y-2">
        <label className="flex items-center gap-3 rounded-xl border border-line p-3">
          <input type="radio" checked={!router.selectedId} onChange={() => router.choose('')} />
          <span>
            <span className="block font-medium">Same as Mac (recommended)</span>
            <span className="text-sm text-soft">{router.macDefaultLabel ? `Currently: ${router.macDefaultLabel}` : 'Follows System Settings → Sound'}</span>
          </span>
        </label>
        {router.supported &&
          router.speakers.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <input type="radio" checked={router.selectedId === s.id} onChange={() => router.choose(s.id)} />
              <span className="font-medium">{s.label}</span>
            </label>
          ))}
      </div>
      {router.supported && !router.labelsVisible && (
        <button className={`${btn} mt-3`} onClick={() => router.revealNames().catch(() => {})}>Show speaker names</button>
      )}
      {mismatch && (
        <p className="mt-3 text-sm text-clay">
          Spotify plays on your Mac's output ({router.macDefaultLabel}). To hear both on {router.selectedLabel}, also select it in System Settings → Sound.
        </p>
      )}

      <h3 className="mb-2 mt-8 font-serif text-2xl">Connect a Bluetooth speaker</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-soft">
        <li>Put the speaker in pairing mode (Google Home: say "Hey Google, Bluetooth pairing").</li>
        <li>
          Pair it in macOS:{' '}
          <a className="text-sage underline" href="x-apple.systempreferences:com.apple.BluetoothSettings">Open Bluetooth settings</a>
        </li>
        <li>
          Make it the Mac's output:{' '}
          <a className="text-sage underline" href="x-apple.systempreferences:com.apple.Sound-Settings.extension">Open Sound settings</a>
        </li>
        <li>Come back here and press Test breath.</li>
      </ol>
      <p className="mt-2 text-xs text-soft">Pairing happens in macOS: browsers can't pair audio devices. Compatibility with a particular speaker isn't guaranteed.</p>

      <div className="mt-6 flex items-center gap-3">
        <button className={btn} onClick={() => engine.testBreath()}>Test breath</button>
      </div>
      <div className="mt-6">
        <div className="text-xs uppercase tracking-[0.18em] text-soft">Circle alignment · {key === 'mac' ? 'Mac output' : key}</div>
        <p className="text-sm text-soft">Bluetooth adds delay. If the circle moves before you hear the breath, move this right.</p>
        <input type="range" min={-500} max={500} step={10} value={offsets[key] ?? 0}
          onChange={(e) => { const v = parseInt(e.target.value); setOffset(key, v); engine.visualOffsetMs = v }} />
        <div className="text-sm tabular-nums">{offsets[key] ?? 0} ms</div>
      </div>
    </Sheet>
  )
}
