import { useEffect } from 'react'
import { bindStore, useStore, type Theme } from '../state/store'
import { engine, library, router } from '../app'
import { bpmOf } from '../pattern/timing'
import { STYLES } from '../samples/types'
import { BreathCircle } from './BreathCircle'
import { PresetCard, RateControl, RhythmCard, SoundCard, SourceBadge, StylePicker, TransportControl, VolumeControl } from './Controls'
import { Button, Dialog, I, IconButton } from './kit'
import { Logo } from './Logo'
import { SoundLibraryPanel, SpeakerPanel } from './Panels'
import { RecordingSetup } from './RecordingSetup'

bindStore()
const SEEN = 'breathdeck:v1:seen'

function useShortcuts() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()
      if (s.panel === 'recording' || s.panel === 'welcome') return
      if (e.code === 'Space') {
        if (el.tagName === 'BUTTON') return
        e.preventDefault()
        if (s.transport === 'playing') s.pause()
        else s.play()
      } else if (e.key.toLowerCase() === 'm') s.toggleMute()
      else if (e.key === 'Escape' && s.live && !s.panel) s.toggleLive(false)
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

const THEMES: Record<Theme, { next: Theme; label: string; icon: React.ReactNode }> = {
  night: { next: 'paper', label: 'Dark theme', icon: <I.moon /> },
  paper: { next: 'system', label: 'Light theme', icon: <I.sun /> },
  system: { next: 'night', label: 'Theme follows Mac', icon: <I.auto /> },
}

function Header() {
  const theme = useStore((s) => s.theme)
  useStore((s) => s.libVersion)
  const { setTheme, setPanel, toggleLive } = useStore.getState()
  const speaker = router.selectedLabel || 'Mac output'
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
      <div className="flex items-center gap-3">
        <Logo size={34} />
        <div className="leading-tight">
          <div className="font-serif text-[26px] leading-none">BreathDeck</div>
          <div className="text-[10px] font-bold tracking-[0.24em] text-faint uppercase">The Breath Reset</div>
        </div>
      </div>
      <nav className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setPanel('speaker')} aria-label="Speaker" className="max-sm:hidden">
          <I.speaker s={15} /> <span className="max-w-40 truncate">{speaker}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPanel('library')}>
          <I.library s={15} /> Sounds
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPanel('recording')} className="max-md:hidden">
          <I.mic s={15} /> Record
        </Button>
        <IconButton label={`${THEMES[theme].label}. Change theme`} size={34} onClick={() => setTheme(THEMES[theme].next)}>
          {THEMES[theme].icon}
        </IconButton>
        <Button variant="secondary" size="sm" onClick={() => toggleLive()}>
          <I.expand s={14} /> Live Mode
        </Button>
      </nav>
    </header>
  )
}

function StatusLine() {
  const pattern = useStore((s) => s.pattern)
  const style = useStore((s) => s.style)
  const transport = useStore((s) => s.transport)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-soft">
      <span className="flex items-center gap-1.5 font-semibold text-fg">
        <span className={`h-2 w-2 rounded-full ${transport === 'playing' ? 'pulse-dot bg-sage' : transport === 'paused' ? 'bg-clay' : 'bg-line'}`} />
        {transport === 'playing' ? 'Playing' : transport === 'paused' ? 'Paused' : 'Stopped'}
      </span>
      <span className="text-faint">·</span>
      <span className="tabular-nums">{bpmOf(pattern).toFixed(1)} BPM</span>
      <span className="text-faint">·</span>
      <span>{STYLES.find((s) => s.id === style)!.label}</span>
      <SourceBadge style={style} />
    </div>
  )
}

function Notices() {
  const notice = useStore((s) => s.notice)
  const suspended = useStore((s) => s.suspended)
  const { setNotice, setPanel } = useStore.getState()
  if (!notice && !suspended) return null
  return (
    <div className="rise flex items-center gap-3 rounded-2xl border border-clay/40 bg-clay-tint px-4 py-3 text-sm">
      <I.info s={16} />
      <span className="flex-1">{suspended ? 'Audio was paused by the system. Press Play to continue.' : notice}</span>
      {!suspended && (
        <>
          <Button size="sm" variant="secondary" onClick={() => setPanel('library', 'samples')}>Open Sounds</Button>
          <IconButton label="Dismiss" size={28} onClick={() => setNotice('')}><I.x s={14} /></IconButton>
        </>
      )}
    </div>
  )
}

function Stage() {
  return (
    <section aria-label="Session" className="relative flex min-h-[560px] flex-col overflow-hidden rounded-[32px] border border-line bg-panel p-6 shadow-[var(--shadow)] lg:min-h-0">
      <div className="flex flex-col gap-3">
        <StatusLine />
        <Notices />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <BreathCircle size="min(44vh, 390px, 78vw)" />
        <TransportControl />
      </div>
      <p className="text-center text-xs leading-relaxed text-faint">
        Plays alongside Spotify on the same speaker. Space to play or pause, M to mute.
        <br className="max-md:hidden" /> Fast breathing can cause dizziness or tingling. Stop if you feel unwell.
      </p>
    </section>
  )
}

function Welcome() {
  const { setPanel } = useStore.getState()
  const close = () => {
    localStorage.setItem(SEEN, '1')
    setPanel(null)
  }
  return (
    <Dialog title="Welcome to BreathDeck" subtitle="Real human breathing that keeps time with your session, while your music plays." onClose={close} width="max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={close}
          className="group flex cursor-pointer flex-col items-start gap-3 rounded-3xl border border-sage bg-sage-tint p-5 text-left transition-transform hover:-translate-y-0.5"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sage text-on-accent"><I.wave s={20} /></span>
          <span className="text-lg font-bold">Start with sample sounds</span>
          <span className="text-sm text-soft">Ready now. Recorded human breaths for all four styles, free to use (CC0).</span>
          <span className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-sage">Start breathing <I.arrow s={14} /></span>
        </button>
        <button
          onClick={() => { localStorage.setItem(SEEN, '1'); setPanel('recording') }}
          className="group flex cursor-pointer flex-col items-start gap-3 rounded-3xl border border-line bg-raised p-5 text-left transition-transform hover:-translate-y-0.5"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-panel text-fg ring-1 ring-line"><I.mic s={20} /></span>
          <span className="text-lg font-bold">Record your own breath</span>
          <span className="text-sm text-soft">5 to 10 minutes. A guide shows you exactly when to breathe in and out.</span>
          <span className="mt-auto flex items-center gap-1.5 text-sm font-semibold">Set up my voice <I.arrow s={14} /></span>
        </button>
      </div>
      <ol className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ['Pick a rhythm', 'Choose a preset or set the breaths per minute.'],
          ['Choose a style', 'Soft, Deep, Powerful or Connected.'],
          ['Press play', 'Start Spotify too. Both play on the same speaker.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold">{i + 1}</span>
            <span><span className="block font-semibold">{t}</span><span className="text-soft">{d}</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs text-faint">You can switch between samples and your own recordings any time in Sounds.</p>
    </Dialog>
  )
}

function LiveMode() {
  const { toggleLive } = useStore.getState()
  return (
    <div className="live flex min-h-full flex-col gap-6 p-6 lg:h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={30} />
          <span className="font-serif text-2xl">BreathDeck</span>
          <span className="rounded-full bg-sage-tint px-2.5 py-1 text-xs font-bold tracking-wider text-sage uppercase">Live</span>
        </div>
        <Button variant="secondary" onClick={() => toggleLive(false)}>
          <I.x s={14} /> Exit Live Mode <span className="text-faint">Esc</span>
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_1.05fr]">
        <section className="flex flex-col items-center justify-center gap-6 rounded-[32px] border border-line bg-panel p-6">
          <StatusLine />
          <BreathCircle size="min(50vh, 440px, 80vw)" />
        </section>
        <section className="flex flex-col justify-center gap-8 rounded-[32px] border border-line bg-panel p-8">
          <RateControl big />
          <StylePicker big />
          <VolumeControl big />
          <TransportControl big />
        </section>
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
  const libVersion = useStore((s) => s.libVersion)
  useEffect(() => {
    void library.load()
    void router.refresh()
    router.onChange = () => useStore.setState((x) => ({ libVersion: x.libVersion + 1 }))
    if (!localStorage.getItem(SEEN)) useStore.getState().setPanel('welcome')
  }, [])
  useEffect(() => {
    engine.visualOffsetMs = offsets[router.selectedLabel || 'mac'] ?? 0
  }, [offsets, libVersion])

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      {live ? (
        <LiveMode />
      ) : (
        <>
          <Header />
          <main className="grid min-h-0 flex-1 gap-5 px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
            <Stage />
            <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
              <RhythmCard />
              <SoundCard />
              <PresetCard />
            </div>
          </main>
        </>
      )}
      {panel === 'welcome' && <Welcome />}
      {panel === 'library' && <SoundLibraryPanel />}
      {panel === 'speaker' && <SpeakerPanel />}
      {panel === 'recording' && <RecordingSetup />}
    </div>
  )
}
