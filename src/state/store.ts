import { create } from 'zustand'
import { engine, library } from '../app'
import type { StyleId } from '../engine/Scheduler'
import type { Transport } from '../engine/AudioEngine'
import { applyRatio, maxBpmFor, scaleToBpm, setPhase, bpmOf, type PhaseKey, type Phases } from '../pattern/timing'
import { BUILTIN_PRESETS, type Preset } from './presets'

export type Theme = 'system' | 'night' | 'paper'
const KEY = 'breathdeck:v1:settings'
const PKEY = 'breathdeck:v1:presets'

interface Saved {
  pattern: Phases
  style: StyleId
  volume: number
  theme: Theme
  offsets: Record<string, number>
}
const defaults: Saved = {
  pattern: { inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 },
  style: 'soft',
  volume: 0.6,
  theme: 'system',
  offsets: {},
}
function load<T>(k: string, d: T): T {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k) ?? '{}') }
  } catch {
    return d
  }
}
const saved = load<Saved>(KEY, defaults)
let customs: Preset[] = []
try {
  customs = JSON.parse(localStorage.getItem(PKEY) ?? '[]')
} catch {
  /* ignore */
}

interface S extends Saved {
  muted: boolean
  transport: Transport
  live: boolean
  customs: Preset[]
  panel: null | 'library' | 'speaker' | 'recording'
  notice: string
  suspended: boolean
  libVersion: number
  rateBase: Phases | null
  beginRate(): void
  endRate(): void
  setBpm(bpm: number): void
  nudgeBpm(d: number): void
  setPhaseValue(k: PhaseKey, v: number): void
  setRatio(i: number, e: number): void
  setPattern(p: Phases): void
  setStyle(s: StyleId): void
  setVolume(v: number): void
  toggleMute(): void
  play(): void
  pause(): void
  stop(): void
  toggleLive(force?: boolean): void
  setTheme(t: Theme): void
  setPanel(p: S['panel']): void
  setNotice(n: string): void
  saveCustom(name: string): void
  renameCustom(id: string, name: string): void
  deleteCustom(id: string): void
  setOffset(label: string, ms: number): void
}

export const useStore = create<S>((set, get) => ({
  ...saved,
  muted: false,
  transport: 'stopped',
  live: false,
  customs,
  panel: null,
  notice: '',
  suspended: false,
  libVersion: 0,
  rateBase: null,
  beginRate: () => set({ rateBase: get().pattern }),
  endRate: () => set({ rateBase: null }),
  setBpm: (bpm) => {
    const s = get()
    get().setPattern(scaleToBpm(s.rateBase ?? s.pattern, bpm))
  },
  nudgeBpm: (d) => {
    const p = get().pattern
    const b = Math.round((bpmOf(p) + d) * 10) / 10
    get().setPattern(scaleToBpm(p, Math.min(maxBpmFor(p), b)))
  },
  setPhaseValue: (k, v) => get().setPattern(setPhase(get().pattern, k, v)),
  setRatio: (i, e) => get().setPattern(applyRatio(get().pattern, i, e)),
  setPattern: (pattern) => set({ pattern }),
  setStyle: (style) => set({ style }),
  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  play: () => void engine.play(),
  pause: () => engine.pause(),
  stop: () => engine.stop(),
  toggleLive: (force) => set((s) => ({ live: force ?? !s.live })),
  setTheme: (theme) => set({ theme }),
  setPanel: (panel) => set({ panel }),
  setNotice: (notice) => set({ notice }),
  saveCustom: (name) =>
    set((s) => ({ customs: [...s.customs, { id: crypto.randomUUID(), name, phases: s.pattern }] })),
  renameCustom: (id, name) => set((s) => ({ customs: s.customs.map((c) => (c.id === id ? { ...c, name } : c)) })),
  deleteCustom: (id) => set((s) => ({ customs: s.customs.filter((c) => c.id !== id) })),
  setOffset: (label, ms) => set((s) => ({ offsets: { ...s.offsets, [label]: ms } })),
}))

export const allPresets = (customsList: Preset[]) => [...BUILTIN_PRESETS, ...customsList]

/** Wire store → engine/persistence. */
export function bindStore() {
  const s = useStore.getState()
  engine.pattern = s.pattern
  engine.style = s.style
  engine.volume = s.volume
  useStore.subscribe((st, prev) => {
    if (st.pattern !== prev.pattern) {
      engine.setPattern(st.pattern)
    }
    if (st.style !== prev.style) engine.setStyle(st.style)
    if (st.volume !== prev.volume) engine.setVolume(st.volume)
    if (st.muted !== prev.muted) engine.setMuted(st.muted)
    if (st.customs !== prev.customs) localStorage.setItem(PKEY, JSON.stringify(st.customs))
    if (st.pattern !== prev.pattern || st.style !== prev.style || st.volume !== prev.volume || st.theme !== prev.theme || st.offsets !== prev.offsets) {
      const { pattern, style, volume, theme, offsets } = st
      localStorage.setItem(KEY, JSON.stringify({ pattern, style, volume, theme, offsets }))
    }
  })
  engine.onState = () => useStore.setState({ transport: engine.state })
  engine.onSuspended = (suspended) => useStore.setState({ suspended })
  engine.onMissing = (style) =>
    useStore.setState({ notice: `No breathing recordings for ${style} yet. Record or upload some in Sound library.` })
  library.subscribe(() => useStore.setState((x) => ({ libVersion: x.libVersion + 1 })))
}
