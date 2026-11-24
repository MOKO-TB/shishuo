import { chromium } from 'playwright-core'
import fs from 'node:fs'
const BASE = 'http://localhost:5200/'
const OUT = 'promo/keynote/assets'
fs.mkdirSync(OUT, { recursive: true })
const css = `html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
  .guide-button{display:none!important}
  .ask-submit[disabled]{opacity:1!important;background:var(--accent)!important;border-color:var(--accent)!important;color:#fff!important}`

async function login(page, role) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.getByText(role === 'student' ? '学生 · 林晓' : '教师 · 陈砚（管理员）').click()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForTimeout(2400)
}
async function polish(page) {
  await page.addStyleTag({ content: css })
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button, span, div, a')) {
      const t = (el.textContent || '').trim()
      if (t === 'AI 未配置') { const b = el.closest('button'); if (b) b.style.display = 'none' }
      if (t === '演示指引' || t === '看演示指引') el.style.display = 'none'
    }
  })
}
const b = await chromium.launch({ channel: 'msedge' })

// student with attached docx
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const p = await ctx.newPage()
  await login(p, 'student')
  await polish(p)
  await p.evaluate(() => {
    document.querySelectorAll('.daily-card, .class-card, .side-timetable').forEach(el => el.remove())
  })
  const inputs = p.locator('input[type=file]')
  console.log('file inputs', await inputs.count())
  const docInput = p.locator('input[type=file]').nth(1)
  await docInput.setInputFiles('promo/keynote/assets/数据结构_第6章_习题.docx')
  await p.waitForTimeout(2600)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/ask-file.png` })
  console.log('ask-file ok')
  await ctx.close()
}

// teacher insights
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const p = await ctx.newPage()
  await login(p, 'teacher')
  await polish(p)
  await p.getByRole('button', { name: /答疑洞察/ }).first().click()
  await p.waitForTimeout(1800)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.screenshot({ path: `${OUT}/teacher-insights.png` })
  console.log('insights ok')
  await ctx.close()
}

// canteen
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const p = await ctx.newPage()
  await login(p, 'teacher')
  await polish(p)
  await p.getByRole('button', { name: /食堂决策/ }).first().click()
  await p.waitForTimeout(2200)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.screenshot({ path: `${OUT}/canteen.png` })
  console.log('canteen ok')
  await ctx.close()
}

// admin accounts
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const p = await ctx.newPage()
  await p.goto(BASE + 'admin/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  await p.getByPlaceholder(/admin@|邮箱/).first().fill('admin@shishuo.local')
  await p.locator('input[type=password]').first().fill('admin123')
  await p.getByRole('button', { name: '进入管理台' }).click()
  await p.waitForTimeout(2400)
  await p.getByText('账号管理', { exact: true }).first().click()
  await p.waitForTimeout(1400)
  await p.screenshot({ path: `${OUT}/admin-accounts.png` })
  console.log('admin ok')
  await ctx.close()
}

// login hero (clean, no guide)
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1400)
  await p.screenshot({ path: `${OUT}/login-hero.png` })
  console.log('login ok')
  await ctx.close()
}

await b.close()
console.log('done')
