import { chromium } from 'playwright-core'
import fs from 'node:fs'
const tl = JSON.parse(fs.readFileSync('promo/keynote/timeline.json', 'utf-8'))
const b = await chromium.launch({ channel: 'msedge' })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' })
await p.addInitScript(js => { window.__TIMELINE__ = js }, tl)
p.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message))
await p.goto('http://127.0.0.1:5301/promo/keynote/film.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 })
for (const t of [1.5,13.5,33.5,50.0,58.0,90.0,114.0,135.0,149.0]) {
  await p.evaluate(t => window.__render(t), t)
  await p.waitForTimeout(40)
  await p.screenshot({ path: `promo/keynote/preview/x${t.toFixed(1).replace('.', '_')}.png` })
}
console.log('ok')
await b.close()
