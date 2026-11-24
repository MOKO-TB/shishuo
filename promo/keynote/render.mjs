import { chromium } from 'playwright-core'
import fs from 'node:fs'
const FPS = 30
const tl = JSON.parse(fs.readFileSync('promo/keynote/timeline.json', 'utf-8'))
const total = Math.ceil(tl.total * FPS)
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' })
await page.addInitScript(js => { window.__TIMELINE__ = js }, tl)
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message))
await page.goto('http://127.0.0.1:5301/promo/keynote/film.html', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 })
for (let i = 0; i < total; i++) {
  const t = i / FPS
  await page.evaluate(t => window.__render(t), t)
  await page.screenshot({ path: `promo/keynote/frames/f_${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 })
  if (i % 500 === 0 || i === total - 1) console.log(`frame ${i}/${total} t=${t.toFixed(2)}`)
}
await browser.close()
console.log('render complete', total)
