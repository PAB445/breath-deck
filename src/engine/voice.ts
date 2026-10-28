import type { Pick } from '../samples/SampleLibrary'

const ease = (n: number) => {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) c[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1))
  return c
}
const UP = ease(48)
const DOWN = UP.slice().reverse()

export interface Voice {
  src: AudioBufferSourceNode
  gain: GainNode
  when: number
  len: number
}

/**
 * One breath: plays `pick` from `when` for at most `maxLen` seconds with a cosine
 * fade-in and fade-out so it never clicks, whatever the buffer contains.
 */
export function createVoice(ctx: BaseAudioContext, dest: AudioNode, pick: Pick, when: number, maxLen: number): Voice {
  const len = Math.min(pick.buffer.duration / pick.rate, maxLen)
  const a = Math.min(0.15, 0.2 * len)
  const r = Math.min(0.4, 0.3 * len)
  const src = ctx.createBufferSource()
  src.buffer = pick.buffer
  src.playbackRate.value = pick.rate
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.gain.setValueCurveAtTime(UP, when, a)
  gain.gain.setValueCurveAtTime(DOWN, when + len - r, r)
  src.connect(gain).connect(dest)
  src.start(when)
  src.stop(when + len + 0.02)
  return { src, gain, when, len }
}
