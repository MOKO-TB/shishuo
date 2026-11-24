import { chromium } from 'playwright-core'
import fs from 'node:fs'
const tl = JSON.parse(fs.readFileSync('promo/keynote/timeline.json', 'utf-8'))
const b = await chromium.launch({ channel: 'msedge' })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' })
await p.addInitScript(js => { window.__TIMELINE__ = js }, tl)
p.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()) })
p.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message))
await p.goto('http://127.0.0.1:5301/promo/keynote/film.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }).catch(e => console.log('not ready', e.message))
fs.mkdirSync('promo/keynote/preview', { recursive: true })
const times = [1.5,5.5,9.0,11.5,13.5,15.5,18.3,20.5,23.0,25.5,28.0,31.0,33.5,36.0,39.5,42.5,47.5,54.5,58.0,62.0,65.5,67.5,70.5,74.0,77.0,80.5,83.0,87.5,92.0,98.0,101.0,104.0,106.0,110.5,114.0,117.5,120.5,123.5,126.0,128.5,132.0,135.0,138.0,140.5,143.5,147.0]
for (const t of times) {
  await p.evaluate(t => window.__render(t), t)
  await p.waitForTimeout(40)
  await p.screenshot({ path: `promo/keynote/preview/t${t.toFixed(1).replace('.', '_')}.png` })
}
console.log('previews done')
await b.close()
