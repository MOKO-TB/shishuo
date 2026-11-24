import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.APP_URL || 'http://localhost:5173/'
const OUT = 'promo/assets'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const hiddenCss = `
  html { scrollbar-width: none; }
  ::-webkit-scrollbar { display: none; }
  .da-widget, .guide-button { display: none !important; }
`

async function login(page, role) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const label = role === 'teacher' ? '教师 · 陈砚' : '学生 · 林晓'
  await page.getByText(label, { exact: false }).first().click()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForTimeout(2400)
}

async function hideDebug(page) {
  await page.addStyleTag({ content: hiddenCss })
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('.recent-row')) {
      if ((row.textContent || '').includes('长回答布局测试')) {
        row.style.display = 'none'
      }
    }
    for (const el of document.querySelectorAll('.campus-search-note, small, span')) {
      if ((el.textContent || '').trim() === '75 条相关卡片') {
        el.style.display = 'none'
      }
    }
  })
}

async function pickCourse(page, name = '数据结构') {
  await page.locator('.course-combobox-trigger').click()
  await page.waitForTimeout(250)
  await page.locator('.course-combobox-option', { hasText: name }).first().click()
  await page.waitForTimeout(1200)
}

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' }
const shot = async (page, name) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('saved', name)
}

// 学生首页：切换到数据结构，选「老师已回复」，避开测试数据。
{
  const ctx = await browser.newContext(desktop)
  const page = await ctx.newPage()
  await login(page, 'student')
  await pickCourse(page)
  await page.locator('.recent-filters button[role=tab]', { hasText: '老师已回复' }).click()
  await page.waitForTimeout(700)
  await hideDebug(page)
  await shot(page, 'student-home')

  // 问题详情：当前 UI 的完整答疑记录（AI 回答 + 老师精答 + 继续追问）。
  await page.locator('.recent-row').first().click()
  await page.waitForTimeout(1400)
  await hideDebug(page)
  await shot(page, 'student-thread')
  await ctx.close()
}

// 课程知识库。
{
  const ctx = await browser.newContext(desktop)
  const page = await ctx.newPage()
  await login(page, 'student')
  await pickCourse(page)
  await page.getByText('浏览全部课程知识', { exact: true }).first().click()
  await page.waitForTimeout(1600)
  await hideDebug(page)
  await shot(page, 'student-knowledge')
  await ctx.close()
}

// AI 导师抽屉。
{
  const ctx = await browser.newContext(desktop)
  const page = await ctx.newPage()
  await login(page, 'student')
  await pickCourse(page)
  await page.getByText('数据结构导师', { exact: true }).first().click()
  await page.waitForTimeout(1400)
  await hideDebug(page)
  await shot(page, 'student-mentor')
  await ctx.close()
}

// 校园地图：用当前版本地图替换旧的校园素材；不展示 75 条搜索索引，避免与站点 804 口径打架。
{
  const ctx = await browser.newContext(desktop)
  const page = await ctx.newPage()
  await login(page, 'student')
  await page.getByRole('button', { name: /校园生活/ }).first().click()
  await page.waitForTimeout(1600)
  await page.getByText('校园地图', { exact: true }).first().click()
  await page.waitForTimeout(1600)
  await hideDebug(page)
  await shot(page, 'student-campus')
  await ctx.close()
}

// 学生手机端。
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
  await pickCourse(page)
  await hideDebug(page)
  await shot(page, 'student-mobile')
  await ctx.close()
}

// 教师待办台 + 回复抽屉。
{
  const ctx = await browser.newContext(desktop)
  const page = await ctx.newPage()
  await login(page, 'teacher')
  await hideDebug(page)
  await shot(page, 'teacher-queue')
  await page.getByText('打开处理', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  await hideDebug(page)
  await shot(page, 'teacher-drawer')
  await ctx.close()
}

await browser.close()
console.log('done')
