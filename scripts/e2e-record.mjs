// Runs the first recording prompt with Chrome's fake mic and checks two takes are stored.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.URL ?? 'http://127.0.0.1:5287')
await page.waitForFunction(() => window.bd?.library)
await page.waitForSelector('text=Record your own breath')
await page.getByRole('button', { name: 'Begin' }).click()
await page.getByRole('button', { name: 'Allow microphone' }).click()
await page.getByRole('button', { name: 'Start recording' }).click()
await page.waitForSelector('text=Soft · 2 seconds')
await page.screenshot({ path: '/tmp/bd-prompt.png' })
await page.waitForFunction(() => window.bd.library.count() >= 2, null, { timeout: 30000 })
console.log(await page.evaluate(() => window.bd.library.takes().map((t) => ({ id: t.id, dur: +t.duration.toFixed(2), flags: t.flags }))))
await page.waitForSelector('text=Soft · 4 seconds')
console.log('advanced to next prompt; errors', errors)
await browser.close()
