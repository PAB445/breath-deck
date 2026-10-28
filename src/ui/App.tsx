import { useEffect } from 'react'
import { bindStore, useStore } from '../state/store'
import { engine, library, router } from '../app'
import { bpmOf } from '../pattern/timing'
import { STYLES } from '../samples/types'
import { BreathCircle } from './BreathCircle'
import { AudioTest, PresetBar, RateControl, StylePicker, TimingControl, TransportControl, VolumeControl, btn } from './Controls'
import { Logo } from './Logo'
import { SoundLibraryPanel, SpeakerPanel } from './Panels'
import { RecordingSetup } from './RecordingSetup'

bindStore()

function useShortcuts() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()
      if (s.panel === 'recording') return
      if (e.code === 'Space') {
        if (el.tagName === 'BUTTON') return
        e.preventDefault()
        s.transport === 'playing' ? s.pause() : s.play()
      } else if (e.key.toLowerCase() === 'm') s.toggleMute()
      else if (e.key === 'Escape' && s.live) s.toggleLive(false)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
}

function useTheme() {
  const theme = useStore((s) => s.theme)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const apply = () => (document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'paper' : 'night') : theme)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function Header() {
  const theme = useStore((s) => s.theme)
  const { setTheme, setPanel, toggleLive } = useStore.getState()
  const speaker = router.selectedLabel || 'Same as Mac'
  const next = theme === 'night' ? 'paper' : theme === 'paper' ? 'system' : 'night'
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
      <div className="flex items-center gap-4">
        <Logo size={44} />
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-soft">The Breath Reset</div>
          <div className="font-serif text-3xl leading-none">BreathDeck</div>
          <div className="text-sm text-soft">Your breath. Your rhythm.</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => setPanel('speaker')} aria-label="Speaker">Speaker: {speaker}</button>
        <button className={btn} onClick={() => setPanel('library')}>Sound library</button>
        <button className={btn} onClick={() => setTheme(next)} aria-label="Change theme">Theme: {theme}</button>
        <button className={btn} onClick={() => toggleLive()}>Live Mode</button>
      </div>
    </header>
  )
}

function Status() {
  const { pattern, style, volume, muted, transport } = useStore()
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-soft" aria-live="off">
      <span>{transport}</span>
      <span>{bpmOf(pattern).toFixed(1)} BPM</span>
      <span>{STYLES.find((s) => s.id === style)!.label}</span>
      <span>{muted ? 'muted' : `${Math.round(volume * 100)}%`}</span>
    </div>
  )
}

function Notes() {
  const notice = useStore((s) => s.notice)
  const suspended = useStore((s) => s.suspended)
  return (
    <div className="space-y-2 text-xs text-soft">
      {notice && <p className="rounded-lg border border-clay p-3 text-sm text-fg">{notice}</p>}
      {suspended && <p className="rounded-lg border border-clay p-3 text-sm text-fg">Audio was paused by the system. Press Play to continue.</p>}
      <p>BreathDeck plays through your Mac's selected sound output unless you choose a speaker. Music apps such as Spotify keep playing independently on your Mac's output.</p>
      <p>Rapid breathing can cause dizziness, tingling or fainting. Only start patterns you have chosen, and stop if you feel unwell.</p>
    </div>
  )
}

function Setup() {
  useStore((s) => s.libVersion)
  const style = useStore((s) => s.style)
  const { setPanel } = useStore.getState()
  if (!library.ready || library.hasStyle(style)) return null
  return (
    <div className="rounded-xl border border-line p-4 text-sm">
      {library.count() === 0 ? 'No breathing recordings yet. ' : `No complete ${style} recordings yet. `}
      <button className="text-sage underline" onClick={() => setPanel('recording')}>Record your breath</button> or{' '}
      <button className="text-sage underline" onClick={() => setPanel('library')}>upload files</button>.
    </div>
  )
}

function LiveMode() {
  const { toggleLive } = useStore.getState()
  return (
    <div className="live flex min-h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Logo size={32} /><span className="font-serif text-2xl">BreathDeck</span></div>
        <button className={btn} onClick={() => toggleLive(false)}>Exit Live Mode (Esc)</button>
      </div>
      <div className="grid flex-1 gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col items-center justify-center gap-4">
          <BreathCircle size="min(46vh, 420px)" />
          <Status />
        </div>
        <div className="flex flex-col justify-center gap-8">
          <RateControl big />
          <VolumeControl big />
          <StylePicker />
          <TransportControl />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  useShortcuts()
  useTheme()
  const live = useStore((s) => s.live)
  const panel = useStore((s) => s.panel)
  const offsets = useStore((s) => s.offsets)
  useEffect(() => {
    void library.load()
    void router.refresh()
    router.onChange = () => useStore.setState((x) => ({ libVersion: x.libVersion }))
  }, [])
  useEffect(() => {
    engine.visualOffsetMs = offsets[router.selectedLabel || 'mac'] ?? 0
  }, [offsets])
  useEffect(() => {
    if (library.ready && library.count() === 0 && !localStorage.getItem('breathdeck:v1:seen')) {
      localStorage.setItem('breathdeck:v1:seen', '1')
      useStore.getState().setPanel('recording')
    }
  }, [useStore((s) => s.libVersion)])

  return (
    <div className="flex min-h-full flex-col">
      {live ? (
        <LiveMode />
      ) : (
        <>
          <Header />
          <main className="grid flex-1 gap-8 p-6 lg:grid-cols-[1fr_1.15fr]">
            <div className="flex flex-col items-center justify-center gap-4">
              <BreathCircle size="min(52vh, 440px)" />
              <Status />
            </div>
            <div className="space-y-6">
              <RateControl />
              <TimingControl />
              <StylePicker />
              <VolumeControl />
              <TransportControl />
              <PresetBar />
              <div className="flex gap-2"><AudioTest /></div>
              <Setup />
              <Notes />
            </div>
          </main>
        </>
      )}
      {panel === 'library' && <SoundLibraryPanel />}
      {panel === 'speaker' && <SpeakerPanel />}
      {panel === 'recording' && <RecordingSetup />}
    </div>
  )
}
