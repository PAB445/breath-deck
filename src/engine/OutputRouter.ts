import type { AudioEngine } from './AudioEngine'

export interface Speaker {
  id: string
  label: string
}

type SinkCtx = AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string }

/** Speaker selection via AudioContext.setSinkId. Default '' follows the Mac's output. */
export class OutputRouter {
  speakers: Speaker[] = []
  selectedId = ''
  selectedLabel = ''
  macDefaultLabel = ''
  banner = ''
  labelsVisible = false
  supported = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype
  onChange: () => void = () => {}
  private engine: AudioEngine
  private lost: { label: string; at: number } | null = null

  constructor(engine: AudioEngine) {
    this.engine = engine
    if (navigator.mediaDevices) navigator.mediaDevices.addEventListener('devicechange', () => this.refresh())
    this.selectedLabel = localStorage.getItem('breathdeck:v1:speaker') ?? ''
  }

  async revealNames() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach((t) => t.stop())
    await this.refresh()
  }

  async refresh() {
    if (!navigator.mediaDevices) return
    const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput')
    this.labelsVisible = all.some((d) => d.label)
    const def = all.find((d) => d.deviceId === 'default')
    this.macDefaultLabel = def?.label.replace(/^Default - /, '') ?? ''
    this.speakers = all
      .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d) => ({ id: d.deviceId, label: d.label || 'Speaker' }))
    if (this.selectedId && !this.speakers.some((s) => s.id === this.selectedId)) {
      this.lost = { label: this.selectedLabel, at: Date.now() }
      this.banner = `${this.selectedLabel || 'Speaker'} disconnected. Playing on your Mac's output.`
      await this.apply('', false)
    } else if (!this.selectedId && this.lost && Date.now() - this.lost.at < 60000) {
      const back = this.speakers.find((s) => s.label === this.lost!.label)
      if (back) {
        this.lost = null
        this.banner = ''
        await this.choose(back.id)
      }
    }
    this.onChange()
  }

  async choose(id: string) {
    const sp = this.speakers.find((s) => s.id === id)
    await this.apply(id, true)
    this.selectedLabel = sp?.label ?? ''
    localStorage.setItem('breathdeck:v1:speaker', this.selectedLabel)
    this.banner = ''
    this.onChange()
  }

  private async apply(id: string, fade: boolean) {
    const ctx = (await this.engine.ensure()) as SinkCtx
    if (!ctx.setSinkId) return
    const g = this.engine.route.gain
    if (fade) {
      g.cancelScheduledValues(ctx.currentTime)
      g.setTargetAtTime(0, ctx.currentTime, 0.04)
      await new Promise((r) => setTimeout(r, 180))
    }
    try {
      await ctx.setSinkId(id)
      this.selectedId = id
    } catch (e) {
      this.banner = `Could not switch speaker: ${(e as Error).message}`
    }
    g.cancelScheduledValues(ctx.currentTime)
    g.setTargetAtTime(1, ctx.currentTime, 0.05)
  }
}
