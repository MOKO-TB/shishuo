import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'msedge' })
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
await p.goto('http://localhost:5200/', { waitUntil: 'networkidle' })
await p.waitForTimeout(600)
await p.getByText('学生 · 林晓').click()
await p.getByRole('button', { name: '登录', exact: true }).click()
await p.waitForTimeout(2300)
await p.addStyleTag({ content: `html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
  .guide-button{display:none!important}
  .ask-submit[disabled]{opacity:1!important;background:var(--accent)!important;border-color:var(--accent)!important;color:#fff!important}` })
await p.evaluate(() => {
  for (const el of document.querySelectorAll('button, span, div, a')) {
    const t = (el.textContent || '').trim()
    if (t === 'AI 未配置') { const b = el.closest('button'); if (b) b.style.display = 'none' }
    if (t === '演示指引' || t === '看演示指引') el.style.display = 'none'
  }
  document.querySelectorAll('.daily-card, .class-card, .side-timetable').forEach(el => el.remove())
})
await p.locator('input[type=file]').nth(1).setInputFiles('promo/keynote/assets/数据结构_第6章_习题.docx')
await p.waitForTimeout(1200)
const agree = p.getByRole('button', { name: '同意并继续' })
if (await agree.count()) { await agree.click(); await p.waitForTimeout(2200) }
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(600)
await p.screenshot({ path: 'promo/keynote/assets/ask-file.png' })
console.log('ok')
await b.close()
