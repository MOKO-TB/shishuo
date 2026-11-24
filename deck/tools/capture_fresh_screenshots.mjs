import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173/'
const OUT = path.resolve('D:/100h/jiaoshi ai/deck/pptx_fresh_shots')
fs.mkdirSync(OUT, { recursive: true })

const CSS = `
  html { scrollbar-width: none; }
  ::-webkit-scrollbar { display: none; }
  .guide-button { display: none !important; }
`

async function login(page, role) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const label = role === 'student' ? '学生 · 林晓' : '教师 · 陈砚（管理员）'
  await page.getByText(label).first().click()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForTimeout(2200)
}

async function polish(page) {
  await page.addStyleTag({ content: CSS })
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button, span, div, a')) {
      const t = (el.textContent || '').trim()
      if (t === 'AI 未配置') {
        const b = el.closest('button')
        if (b) b.style.display = 'none'
      }
      if (t === '演示指引' || t === '看演示指引') el.style.display = 'none'
    }
  })
}

const browser = await chromium.launch({ channel: 'msedge' })

try {
  // 1. Student desktop + mentor + campus + canteen
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
    const p = await ctx.newPage()
    await login(p, 'student')
    await polish(p)
    await p.waitForTimeout(600)
    await p.screenshot({ path: path.join(OUT, 'fresh_student.png') })
    console.log('captured fresh_student.png')

    // Try opening AI Mentor if present
    const mentorBtn = p.locator('button:has-text("导师"), button:has-text("知识地图")').first()
    if (await mentorBtn.count()) {
      await mentorBtn.click()
      await p.waitForTimeout(900)
      await p.screenshot({ path: path.join(OUT, 'fresh_mentor.png') })
      console.log('captured fresh_mentor.png')
      await p.keyboard.press('Escape')
      await p.waitForTimeout(400)
    }

    // Campus view
    await p.getByRole('button', { name: /校园生活/ }).first().click()
    await p.waitForTimeout(1400)
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.screenshot({ path: path.join(OUT, 'fresh_campus.png') })
    console.log('captured fresh_campus.png')

    // Canteen view if reachable
    const canteenBtn = p.locator('button:has-text("食堂"), button:has-text("今天吃什么")').first()
    if (await canteenBtn.count()) {
      await canteenBtn.click()
      await p.waitForTimeout(1000)
      await p.screenshot({ path: path.join(OUT, 'fresh_canteen.png') })
      console.log('captured fresh_canteen.png')
    }
    await ctx.close()
  }

  // 2. Teacher desktop
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
    const p = await ctx.newPage()
    await login(p, 'teacher')
    await polish(p)
    await p.waitForTimeout(800)
    await p.screenshot({ path: path.join(OUT, 'fresh_teacher.png') })
    console.log('captured fresh_teacher.png')
    await ctx.close()
  }

  // 3. Mobile student (390x844)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' })
    const p = await ctx.newPage()
    await login(p, 'student')
    await polish(p)
    await p.waitForTimeout(800)
    await p.screenshot({ path: path.join(OUT, 'fresh_mobile.png') })
    console.log('captured fresh_mobile.png')
    await ctx.close()
  }

  // 4. Admin console
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
    const p = await ctx.newPage()
    await p.goto(BASE + 'admin/', { waitUntil: 'networkidle' })
    await p.waitForTimeout(800)
    const emailInput = p.getByPlaceholder(/admin@|邮箱/).first()
    if (await emailInput.count()) {
      await emailInput.fill('admin@shishuo.local')
      await p.locator('input[type=password]').first().fill('admin123')
      await p.getByRole('button', { name: /登录/ }).first().click()
      await p.waitForTimeout(1800)
    }
    const auditBtn = p.locator('button:has-text("操作审计"), button:has-text("审计")').first()
    if (await auditBtn.count()) {
      await auditBtn.click()
      await p.waitForTimeout(900)
    }
    await p.screenshot({ path: path.join(OUT, 'fresh_admin.png') })
    console.log('captured fresh_admin.png')
    await ctx.close()
  }
} finally {
  await browser.close()
}
