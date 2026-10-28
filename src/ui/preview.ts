import { engine, library } from '../app'

let current: AudioBufferSourceNode | null = null

export async function playBuffer(buf: AudioBuffer) {
  const ctx = await engine.ensure()
  current?.stop()
  const g = ctx.createGain()
  g.gain.value = 0.9
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(g).connect(ctx.destination)
  src.start()
  current = src
}
export const playTake = (id: string) => {
  const b = library.buffer(id)
  if (b) void playBuffer(b)
}
export function pcmToBuffer(pcm: Float32Array, sr: number) {
  const b = new AudioBuffer({ length: Math.max(1, pcm.length), sampleRate: sr, numberOfChannels: 1 })
  b.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
  return b
}
