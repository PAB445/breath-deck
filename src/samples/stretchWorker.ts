import { wsolaStretch } from './stretch'

self.onmessage = (e: MessageEvent<{ key: string; pcm: Float32Array; sr: number; ratio: number }>) => {
  const { key, pcm, sr, ratio } = e.data
  const out = wsolaStretch(pcm, sr, ratio)
  ;(self as unknown as Worker).postMessage({ key, out }, [out.buffer])
}
