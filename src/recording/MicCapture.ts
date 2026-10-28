const WORKLET = `
class Cap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('cap', Cap)
`

/** Raw PCM mic capture with all browser voice processing disabled. */
export class MicCapture {
  ctx!: AudioContext
  sampleRate = 48000
  private stream!: MediaStream
  private chunks: Float32Array[] = []
  private recording = false
  level = 0
  settings: MediaTrackSettings = {}

  async open(deviceId?: string) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    this.settings = this.stream.getAudioTracks()[0].getSettings()
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.sampleRate = this.ctx.sampleRate
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    await this.ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const src = this.ctx.createMediaStreamSource(this.stream)
    const node = new AudioWorkletNode(this.ctx, 'cap', { numberOfOutputs: 0 })
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      let s = 0
      for (const v of e.data) s += v * v
      this.level = Math.sqrt(s / e.data.length)
      if (this.recording) this.chunks.push(e.data)
    }
    src.connect(node)
    if (this.ctx.state !== 'running') await this.ctx.resume()
  }

  start() {
    this.chunks = []
    this.recording = true
    return this.ctx.currentTime
  }

  stop(): Float32Array {
    this.recording = false
    const n = this.chunks.reduce((a, c) => a + c.length, 0)
    const out = new Float32Array(n)
    let o = 0
    for (const c of this.chunks) {
      out.set(c, o)
      o += c.length
    }
    this.chunks = []
    return out
  }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
  }
}
