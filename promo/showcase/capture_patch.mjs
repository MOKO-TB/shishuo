import path from 'node:path'
import { chromium } from 'playwright-core'

const OUT = path.resolve('d:/100h/jiaoshi ai/promo/showcase/latest_assets')
const b = await chromium.launch({ channel: 'msedge' })
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const p = await ctx.newPage()
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  await p.getByText('学生 · 林晓').first().click()
  await p.getByRole('button', { name: '登录', exact: true }).click()
  await p.waitForTimeout(1800)
  await p.addStyleTag({ content: 'html{scrollbar-width:none;} ::-webkit-scrollbar{display:none;} .guide-button{display:none!important;}' })
  await p.locator('button:has-text("老师已回复")').first().click()
  await p.waitForTimeout(500)
  // Click the thread item inside the list (exclude filter pills by matching text length > 15)
  const items = p.locator('button')
  const n = await items.count()
  for (let i = 0; i < n; i++) {
    const t = (await items.nth(i).textContent() || '').trim()
    if (t.includes('老师已回复') && t.length > 18) {
      await items.nth(i).click()
      break
    }
  }
  await p.waitForTimeout(800)
  await p.screenshot({ path: path.join(OUT, '03_student_thread_modal.png') })
  console.log('[ok] 03_student_thread_modal.png')
} finally {
  await b.close()
}
