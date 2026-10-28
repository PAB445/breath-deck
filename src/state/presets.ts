import type { Phases } from '../pattern/timing'

export interface Preset {
  id: string
  name: string
  phases: Phases
  builtin?: boolean
}
const P = (inhale: number, holdIn: number, exhale: number, holdOut: number): Phases => ({ inhale, holdIn, exhale, holdOut })

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'coherence', name: 'Coherence', phases: P(5, 0, 5, 0), builtin: true },
  { id: 'relax', name: 'Relax', phases: P(4, 0, 6, 0), builtin: true },
  { id: 'balanced', name: 'Balanced', phases: P(4, 0, 4, 0), builtin: true },
  { id: 'energise', name: 'Energise', phases: P(2, 0, 2, 0), builtin: true },
  { id: 'activate', name: 'Activate', phases: P(1, 0, 1, 0), builtin: true },
]
