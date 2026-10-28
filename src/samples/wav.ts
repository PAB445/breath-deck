export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length * 2, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export async function decodeToMono(data: ArrayBuffer): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const ctx = new OfflineAudioContext(1, 1, 48000)
  const ab = await ctx.decodeAudioData(data.slice(0))
  const out = new Float32Array(ab.length)
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const ch = ab.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / ab.numberOfChannels
  }
  return { pcm: out, sampleRate: ab.sampleRate }
}
