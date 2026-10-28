import type { StyleId } from '../engine/Scheduler'
import type { LengthClass } from '../samples/types'

export interface Prompt {
  style: StyleId
  lengthClass: LengthClass
  seconds: number
}
const L = (style: StyleId, lengthClass: LengthClass, seconds: number): Prompt => ({ style, lengthClass, seconds })

/** 14 prompts, each yielding an inhale and an exhale take = 28 takes. */
export const TAKE_PLAN: Prompt[] = [
  L('soft', 'short', 2), L('soft', 'medium', 4), L('soft', 'long', 6),
  L('deep', 'short', 2), L('deep', 'medium', 4), L('deep', 'long', 6),
  L('powerful', 'fast', 1), L('powerful', 'short', 2), L('powerful', 'medium', 4), L('powerful', 'long', 6),
  L('connected', 'fast', 1), L('connected', 'short', 2), L('connected', 'medium', 4), L('connected', 'long', 6),
]

export const LEAD = 0.8
export const GAP = 0.8
export const TAIL = 0.4
export const ATTEMPTS = 2
export const pairLength = (p: Prompt) => 2 * p.seconds + GAP
export const promptDuration = (p: Prompt) => LEAD + ATTEMPTS * pairLength(p) + TAIL
export const promptId = (p: Prompt) => `${p.style}-${p.lengthClass}`
