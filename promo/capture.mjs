import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = 'http://localhost:5200/'
const OUT = 'promo/assets'
fs.mkdirSync(OUT, { recursive: true })

const hiddenCss = `html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
  .guide-button{display:none !important}
  .ask-submit[disabled]{opacity:1 !important;background:var(--accent) !important;border-color:var(--accent) !important;color:#fff !important;cursor:pointer !important}`

async function polish(page, { teacher = false } = {}) {
  await page.addStyleTag({ content: hiddenCss })
  await page.evaluate((isTeacher) => {
    for (const el of document.querySelectorAll('button, span, div')) {
      const t = (el.textContent || '').trim()
      if (t === 'AI 未配置') {
        const btn = el.closest('button')
        if (btn) btn.style.display = 'none'
      }
    }
    for (const el of document.querySelectorAll('button, span, div, a')) {
      if ((el.textContent || '').trim() === '看演示指引') el.style.display = 'none'
    }
    if (isTeacher) {
      for (const el of document.querySelectorAll('.stat-card')) {
        if ((el.textContent || '').includes('试点 AI 自动解决')) el.style.display = 'none'
      }
    }
  }, teacher)
}

async function login(page, role) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const label = role === 'student' ? '学生 · 林晓' : '教师 · 陈砚（管理员）'
  await page.getByText(label).click()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForTimeout(2400)
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('saved', name)
}

const browser = await chromium.launch({ channel: 'msedge' })

// ---------- student desktop ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await login(page, 'student')
  await polish(page)
  await shot(page, 'student-home')

  await page.getByText('动态规划的状态转移方程到底怎么找？每次都不知道 dp[i] 该定义成什么。', { exact: true }).click()
  await page.waitForTimeout(1400)
  await shot(page, 'student-thread')
  await page.locator('button.modal-close').first().click()
  await page.waitForTimeout(700)

  await page.getByText('浏览全部课程知识', { exact: true }).first().click()
  await page.waitForTimeout(1600)
  await shot(page, 'student-knowledge')

  await page.getByRole('button', { name: /我的答疑/ }).first().click()
  await page.waitForTimeout(1200)
  await page.getByText('数据结构导师', { exact: true }).first().click()
  await page.waitForTimeout(1200)
  await shot(page, 'student-mentor')
  await page.locator('button.modal-close').first().click().catch(() => {})
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: /校园生活/ }).first().click()
  await page.waitForTimeout(1600)
  await shot(page, 'student-campus')
  await ctx.close()
}

// ---------- student mobile ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await login(page, 'student')
  await polish(page)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/student-mobile.png` })
  console.log('saved student-mobile')
  await ctx.close()
}

// ---------- teacher ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await login(page, 'teacher')
  await polish(page, { teacher: true })
  await shot(page, 'teacher-queue')
  await page.getByText('打开处理', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  await shot(page, 'teacher-drawer')
  await ctx.close()
}

// ---------- admin ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await page.goto(BASE + 'admin/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.getByPlaceholder(/admin@|邮箱/).first().fill('admin@shishuo.local')
  await page.locator('input[type=password]').first().fill('admin123')
  await page.getByRole('button', { name: '进入管理台' }).click()
  await page.waitForTimeout(2500)
  await page.getByText('账号管理', { exact: true }).first().click()
  await page.waitForTimeout(1400)
  await shot(page, 'admin-accounts')
  await ctx.close()
}

await browser.close()
console.log('done')
