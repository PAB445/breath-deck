// Headless Chrome smoke test: loads the app, seeds synthetic stand-in takes (test only,
// never shipped), plays at several rates, switches style, and checks scheduler stats.
import { chromium } from 'playwright-core'

const url = process.env.URL ?? 'http://127.0.0.1:5287'
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.addInitScript(() => localStorage.setItem('breathdeck:v1:seen', '1'))
await page.goto(url)
await page.waitForFunction(() => window.bd?.library)

await page.evaluate(async () => {
  const sr = 48000
  await window.bd.library.clear()
  for (const style of ['soft', 'powerful']) {
    for (const [phase, secs] of [['inhale', 3], ['exhale', 3], ['inhale', 1], ['exhale', 1]]) {
      const n = Math.round(sr * secs)
      const pcm = new Float32Array(n)
      for (let i = 0; i < n; i++) pcm[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / n) * 0.3
      await window.bd.library.save({ style, phase, lengthClass: 'upload', source: 'uploaded', pcm, sampleRate: sr })
    }
  }
})
const stats = () => page.evaluate(() => ({ ...window.bd.engine.sched.stats, voices: window.bd.engine.activeVoices, state: window.bd.engine.state, queue: window.bd.engine.sched.queue.length }))

await page.getByRole('button', { name: 'PLAY', exact: true }).click()
await page.waitForTimeout(1500)
console.log('after play', await stats())
await page.screenshot({ path: '/tmp/bd-playing.png' })

for (const bpm of [20, 6, 40, 3, 12]) {
  await page.evaluate((b) => { const s = window.bd; s.__set?.(b) }, bpm).catch(() => {})
  const slider = page.locator('#rate-slider')
  await slider.evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, String(bpm))
  await page.waitForTimeout(1500)
}
await page.getByRole('button', { name: 'Powerful' }).click()
await page.waitForTimeout(2500)
console.log('after sweeps + style switch', await stats())
const frame = await page.evaluate(() => window.bd.engine.frame())
console.log('frame', frame)

await page.getByRole('button', { name: 'PAUSE' }).click()
await page.waitForTimeout(600)
console.log('paused', await stats())
await page.keyboard.press('Space')
await page.waitForTimeout(1200)
console.log('resumed via Space', await stats())
await page.keyboard.press('m')
await page.waitForTimeout(100)
console.log('muted', await page.evaluate(() => window.bd.engine.muted))
await page.getByRole('button', { name: 'Live Mode' }).click()
await page.screenshot({ path: '/tmp/bd-live.png' })
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'STOP' }).click()
await page.waitForTimeout(500)
console.log('stopped', await stats())
console.log('errors', errors)
await browser.close()
