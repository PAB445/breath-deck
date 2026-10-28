import type { StyleId } from '../engine/Scheduler'

export type BreathPhase = 'inhale' | 'exhale'
export type LengthClass = 'fast' | 'short' | 'medium' | 'long' | 'upload'
export type TakeSource = 'recorded' | 'uploaded' | 'sample'

export interface SampleCredit {
  title: string
  author: string
  url: string
}

export interface Take {
  id: string
  style: StyleId
  phase: BreathPhase
  lengthClass: LengthClass
  source: TakeSource
  wav: Blob
  duration: number
  peak: number
  rms: number
  flags: string[]
  createdAt: number
}

export const STYLES: { id: StyleId; label: string; blurb: string }[] = [
  { id: 'soft', label: 'Soft', blurb: 'Gentle and nasal, barely audible' },
  { id: 'deep', label: 'Deep', blurb: 'Full and slow, from the belly' },
  { id: 'powerful', label: 'Powerful', blurb: 'Strong, open-mouth, clearly audible' },
  { id: 'connected', label: 'Connected', blurb: 'Continuous, no pause between in and out' },
]

/** Fraction of a phase the recorded breath should fill. */
export const fillFor = (style: StyleId) => (style === 'connected' ? 1 : 0.9)
