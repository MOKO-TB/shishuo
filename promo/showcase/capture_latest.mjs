import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173/'
const OUT = path.resolve('d:/100h/jiaoshi ai/promo/showcase/latest_assets')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const POLISH_CSS = `
  html { scrollbar-width: none; }
  ::-webkit-scrollbar { display: none; }
  .guide-button { display: none !important; }
`

async function polish(page) {
  await page.addStyleTag({ content: POLISH_CSS })
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

async function login(page, role) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const label = role === 'student' ? '学生 · 林晓' : '教师 · 陈砚'
  await page.getByText(label).first().click()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForTimeout(2000)
  await polish(page)
}

async function shot(page, name) {
  const p = path.join(OUT, name)
  await page.screenshot({ path: p, type: 'png' })
  console.log(`[ok] ${name}`)
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' })

  try {
    // ================= 1. STUDENT DESKTOP =================
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
      const p = await ctx.newPage()
      await login(p, 'student')

      // Ensure light mode first
      const darkToggle = p.locator('button:has-text("浅色"), button:has-text("深色")').first()
      if (await darkToggle.count()) {
        const txt = (await darkToggle.textContent() || '').trim()
        if (txt.includes('浅色')) {
          // currently dark -> capture dark first!
          await p.waitForTimeout(400)
          await shot(p, '01_student_dark.png')
          await darkToggle.click()
          await p.waitForTimeout(500)
          await shot(p, '02_student_light.png')
        } else {
          await shot(p, '02_student_light.png')
          await darkToggle.click()
          await p.waitForTimeout(500)
          await shot(p, '01_student_dark.png')
          // switch back to light for consistent inner captures
          await p.locator('button:has-text("浅色"), button:has-text("深色")').first().click()
          await p.waitForTimeout(400)
        }
      } else {
        await shot(p, '02_student_light.png')
      }

      // Open a real thread (pick one that is NOT a test thread if possible, else first)
      const threadItems = p.locator('button:has-text("AI 已答"), button:has-text("老师已回复"), button:has-text("等待中")')
      let openedThread = false
      const cnt = await threadItems.count()
      for (let i = 0; i < cnt; i++) {
        const item = threadItems.nth(i)
        const txt = (await item.textContent() || '')
        if (!txt.includes('长回答布局测试')) {
          await item.click()
          openedThread = true
          break
        }
      }
      if (!openedThread && cnt > 0) {
        await threadItems.first().click()
        openedThread = true
      }
      if (openedThread) {
        await p.waitForTimeout(800)
        await shot(p, '03_student_thread.png')
        await p.keyboard.press('Escape')
        await p.waitForTimeout(450)
      }

      // Open Review Cards (复习卡)
      const reviewBtn = p.locator('button:has-text("复习卡")').first()
      if (await reviewBtn.count()) {
        await reviewBtn.click()
        await p.waitForTimeout(700)
        await shot(p, '04_student_review.png')
        await p.keyboard.press('Escape')
        await p.waitForTimeout(450)
      }

      // Open AI Mentor drawer
      const mentorBtn = p.locator('button:has-text("数据结构导师"), button:has-text("导师")').first()
      if (await mentorBtn.count()) {
        await mentorBtn.click()
        await p.waitForTimeout(800)
        await shot(p, '06_student_mentor.png')

        // Switch mentor to 数电 to capture Karnaugh Map interactive tool
        try {
          const switcher = p.locator('button:has-text("数据结构")').last()
          if (await switcher.count()) {
            await switcher.click({ timeout: 3000 })
            await p.waitForTimeout(400)
            const digOpt = p.locator('button:visible:has-text("数电"), [role="menuitem"]:visible:has-text("数电")').first()
            if (await digOpt.count()) {
              await digOpt.click({ timeout: 3000 })
              await p.waitForTimeout(700)
              const kmapBtn = p.locator('button:visible:has-text("卡诺图")').first()
              if (await kmapBtn.count()) {
                await kmapBtn.click({ timeout: 3000 })
                await p.waitForTimeout(700)
                await shot(p, '07_digital_kmap.png')
                await p.keyboard.press('Escape')
                await p.waitForTimeout(400)
              }
            }
          }
        } catch (e) { console.log('[skip] kmap:', e.message.split('\n')[0]) }
        await p.keyboard.press('Escape')
        await p.waitForTimeout(450)
      }

      // Schedule (宽屏课程表)
      const schedNav = p.locator('nav button:has-text("课程表"), aside button:has-text("课程表")').first()
      if (await schedNav.count()) {
        await schedNav.click()
        await p.waitForTimeout(900)
        await shot(p, '05_student_schedule.png')
      }

      // Campus Life -> GPA, Map, Canteen
      const campusNav = p.locator('button:has-text("校园生活")').first()
      if (await campusNav.count()) {
        await campusNav.click()
        await p.waitForTimeout(1000)
        await p.evaluate(() => window.scrollTo(0, 0))
        await shot(p, '14_campus_home.png')

        const mapTab = p.locator('button:has-text("校园地图")').first()
        if (await mapTab.count()) {
          await mapTab.click()
          await p.waitForTimeout(1000)
          await shot(p, '15_campus_map.png')
        }

        const canteenTab = p.locator('button:has-text("食堂决策")').first()
        if (await canteenTab.count()) {
          await canteenTab.click()
          await p.waitForTimeout(1000)
          await shot(p, '16_campus_canteen.png')
        }
      }

      await ctx.close()
    }

    // ================= 2. TEACHER DESKTOP =================
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
      const p = await ctx.newPage()
      await login(p, 'teacher')

      await p.waitForTimeout(500)
      await shot(p, '08_teacher_queue.png')

      // New feature: 本节提问墙
      const wallBtn = p.locator('button:has-text("本节提问墙")').first()
      if (await wallBtn.count()) {
        await wallBtn.click()
        await p.waitForTimeout(800)
        await shot(p, '09_teacher_wall.png')
        await p.keyboard.press('Escape')
        await p.waitForTimeout(450)
      }

      // New feature: 期末复习包
      const packBtn = p.locator('button:has-text("期末复习包")').first()
      if (await packBtn.count()) {
        await packBtn.click()
        await p.waitForTimeout(800)
        await shot(p, '09b_teacher_review_pack.png')
        await p.keyboard.press('Escape')
        await p.waitForTimeout(450)
      }

      // Teacher Drawer: 打开处理
      const handleBtn = p.locator('button:has-text("打开处理")').first()
      if (await handleBtn.count()) {
        await handleBtn.click()
        await p.waitForTimeout(800)
        await shot(p, '10_teacher_drawer.png')
        await p.keyboard.press('Escape')
        await p.waitForTimeout(450)
      }

      // New feature: AI 已答抽查 tab
      const aiDoneTab = p.locator('button:has-text("AI 已答")').first()
      if (await aiDoneTab.count()) {
        await aiDoneTab.click()
        await p.waitForTimeout(700)
        await shot(p, '11_teacher_ai_audit.png')
      }

      // Course KB
      const kbNav = p.locator('button:has-text("课程知识库")').first()
      if (await kbNav.count()) {
        await kbNav.click()
        await p.waitForTimeout(800)
        await shot(p, '12_teacher_kb.png')
      }

      // Insights
      const insNav = p.locator('button:has-text("答疑洞察")').first()
      if (await insNav.count()) {
        await insNav.click()
        await p.waitForTimeout(900)
        await shot(p, '13_teacher_insights.png')
      }

      await ctx.close()
    }

    // ================= 3. STUDENT MOBILE =================
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' })
      const p = await ctx.newPage()
      await login(p, 'student')
      await p.waitForTimeout(600)
      await shot(p, '17_mobile_student.png')
      await ctx.close()
    }

    // ================= 4. ADMIN CONSOLE =================
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' })
      const p = await ctx.newPage()
      await p.goto(BASE + 'admin/', { waitUntil: 'networkidle' })
      await p.waitForTimeout(700)
      const emailInput = p.getByPlaceholder(/admin@|邮箱/).first()
      if (await emailInput.count()) {
        await emailInput.fill('admin@shishuo.local')
        await p.locator('input[type=password]').first().fill('admin123')
        await p.getByRole('button', { name: /登录/ }).first().click()
        await p.waitForTimeout(1600)
      }
      await polish(p)
      const auditBtn = p.locator('button:has-text("操作审计")').first()
      if (await auditBtn.count()) {
        await auditBtn.click()
        await p.waitForTimeout(800)
      }
      await shot(p, '18_admin_audit.png')
      await ctx.close()
    }

  } finally {
    await browser.close()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
