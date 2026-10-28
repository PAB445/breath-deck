// Headless Chrome UI pass: first-run welcome, main screen fit at laptop sizes in both
// themes, Sounds panel tabs, and the recording guide screens. Screenshots go to /tmp/bd-ui-*.png.
import { chromium } from 'playwright-core'

const url = process.env.URL ?? 'http://127.0.0.1:5287'
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const fail = []
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fail.push(msg) }

for (const [w, h] of [[1280, 800], [1440, 900]]) {
  for (const theme of ['night', 'paper']) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.addInitScript((t) => {
      if (!sessionStorage.getItem('init')) {
        localStorage.clear()
        sessionStorage.setItem('init', '1')
      }
      localStorage.setItem('breathdeck:v1:settings', JSON.stringify({ theme: t }))
    }, theme)
    await page.goto(url)
    await page.waitForFunction(() => window.bd?.library.samplesReady, null, { timeout: 20000 })
    const tag = `${w}x${h}-${theme}`
    const welcome = page.getByRole('dialog', { name: 'Welcome to BreathDeck' })
    check(await welcome.isVisible(), `${tag} welcome shows on first run`)
    await page.screenshot({ path: `/tmp/bd-ui-welcome-${tag}.png` })
    await page.getByRole('button', { name: /Start with sample sounds/ }).click()
    check(await page.evaluate(() => ['soft', 'deep', 'powerful', 'connected'].every((s) => window.bd.library.sourceFor(s) === 'sample')), `${tag} all styles use samples`)
    const fits = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)
    const colFits = await page.evaluate(() => [...document.querySelectorAll('main > div')].every((d) => d.scrollHeight <= d.clientHeight + 1))
    check(fits && colFits, `${tag} main screen fits without scrolling`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForTimeout(2600)
    await page.screenshot({ path: `/tmp/bd-ui-main-${tag}.png` })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    if (w === 1440 && theme === 'night') {
      await page.getByRole('button', { name: 'Sounds' }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `/tmp/bd-ui-sounds-samples.png` })
      await page.getByRole('button', { name: /Your recordings/ }).click()
      await page.screenshot({ path: `/tmp/bd-ui-sounds-mine.png` })
      await page.getByRole('button', { name: 'Upload', exact: true }).click()
      await page.screenshot({ path: `/tmp/bd-ui-sounds-upload.png` })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Speaker' }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `/tmp/bd-ui-speaker.png` })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /Live Mode/ }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `/tmp/bd-ui-live.png` })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Record', exact: true }).click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: `/tmp/bd-ui-rec-intro.png` })
      await page.getByRole('button', { name: /Check my microphone/ }).click()
      await page.getByRole('button', { name: /Allow microphone/ }).click()
      await page.getByRole('button', { name: /Start recording/ }).waitFor()
      await page.waitForTimeout(500)
      await page.screenshot({ path: `/tmp/bd-ui-rec-mic.png` })
      await page.getByRole('button', { name: /Start recording/ }).click()
      await page.waitForTimeout(5200)
      await page.screenshot({ path: `/tmp/bd-ui-rec-prompt.png` })
    }
    check(errors.length === 0, `${tag} no console errors ${errors.join(' | ')}`)
    await page.close()
  }
}
await browser.close()
if (fail.length) process.exit(1)
