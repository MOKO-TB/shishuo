import { chromium } from 'playwright-core'

const BASE = process.env.INTRO_URL || 'http://127.0.0.1:8899/intro/'
const browser = await chromium.launch({ channel: 'msedge' })
const errors = []

const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERT: ${message}`)
}

const watch = (page, name) => {
  page.on('pageerror', (error) => errors.push(`${name} pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name} console: ${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    errors.push(`${name} requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`)
  })
}

/* ---------- 桌面 ---------- */
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
watch(page, 'desktop')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.hero h1')
await page.addStyleTag({ content: 'html{scroll-snap-type:none !important}' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1200)
assert((await page.title()).includes('每句有出处'), 'page title')
console.log('font loaded:', await page.evaluate(() => document.fonts.check('16px "Noto Serif SC"')))

/* 首屏学生 / 教师切换 */
await page.locator('[data-device-tab="teacher"]').click()
await page.waitForTimeout(500)
const heroState = await page.evaluate(() => ({
  mode: document.querySelector('.hero-visual').dataset.mode,
  title: document.querySelector('[data-device-title]').textContent,
  shot: [...document.querySelectorAll('[data-device-shot]')].find((el) => el.classList.contains('is-active'))?.dataset.deviceShot,
  teacherText: getComputedStyle(document.querySelector('.float-handoff .mode-teacher')).display,
  studentText: getComputedStyle(document.querySelector('.float-handoff .mode-student')).display,
}))
console.log('hero teacher:', heroState)
assert(heroState.mode === 'teacher', 'hero teacher mode')
assert(heroState.shot === 'teacher', 'hero teacher shot')
assert(heroState.title.includes('教师端'), 'hero teacher title')
assert(heroState.teacherText !== 'none' && heroState.studentText === 'none', 'hero float mode text')
await page.screenshot({ path: 'dev/screenshots/interactive-hero-teacher.png' })
await page.locator('[data-device-tab="student"]').click()
await page.waitForTimeout(300)
assert((await page.evaluate(() => document.querySelector('.hero-visual').dataset.mode)) === 'student', 'hero student back')

/* 课程问答演示 */
assert((await page.locator('.try-q').count()) === 2, 'initial questions')
console.log('demo initial:', await page.locator('.try-q.is-active .try-q-text').textContent())
await page.locator('[data-demo-course="circuit"]').click()
await page.waitForTimeout(300)
assert((await page.locator('.try-q').count()) === 2, 'circuit questions')
await page.locator('.try-q').nth(1).click()
await page.waitForTimeout(2400)
const demoState = await page.evaluate(() => ({
  course: document.querySelector('.try-courses .is-active')?.textContent,
  question: document.querySelector('.try-q.is-active .try-q-text')?.textContent,
  confidence: document.querySelector('[data-demo-confidence]')?.textContent,
  source: document.querySelector('[data-demo-source]')?.textContent,
  answer: document.querySelector('[data-demo-text]')?.textContent,
  same: document.querySelector('[data-demo-same]')?.textContent,
}))
console.log('demo state:', demoState)
assert(demoState.course.includes('电路'), 'demo course selected')
assert(demoState.answer.length > 20, 'demo answer typed')
assert(demoState.source.includes('电路'), 'demo source')

await page.locator('[data-demo-transfer]').click()
await page.waitForTimeout(500)
assert(await page.locator('[data-demo-teacher]').isVisible(), 'demo teacher visible')
console.log(
  'demo teacher:',
  await page.evaluate(() => ({
    name: document.querySelector('[data-demo-teacher-name]')?.textContent,
    reply: document.querySelector('[data-demo-teacher-text]')?.textContent,
  }))
)
await page.locator('[data-demo-settle]').click()
await page.waitForTimeout(500)
assert(await page.locator('[data-demo-settled]').isVisible(), 'demo settled')
assert(!(await page.locator('[data-demo-settle]').isVisible()), 'settle button hidden')
assert((await page.locator('.try-q.is-active .try-q-settled').count()) === 1, 'demo settled badge')
await page.screenshot({ path: 'dev/screenshots/interactive-demo-settled.png' })
const beforeReset = await page.locator('.try-q.is-active .try-q-text').textContent()
await page.locator('[data-demo-reset]').click()
await page.waitForTimeout(300)
const afterReset = await page.locator('.try-q.is-active .try-q-text').textContent()
assert(beforeReset !== afterReset, 'reset changes question')

/* FAQ 手风琴 */
await page.locator('#faq').scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
assert((await page.locator('.faq-item.is-open').count()) === 1, 'one faq open')
await page.locator('.faq-q').nth(1).click()
await page.waitForTimeout(600)
const faqState = await page.evaluate(() => ({
  open: [...document.querySelectorAll('.faq-item')].map((item) => item.classList.contains('is-open')),
  expanded: [...document.querySelectorAll('.faq-q')].map((button) => button.getAttribute('aria-expanded')),
}))
console.log('faq:', faqState)
assert(faqState.open.filter(Boolean).length === 1, 'faq one open after click')
assert(faqState.open[1] === true, 'faq second open')
assert(faqState.expanded[1] === 'true', 'faq aria expanded')
await page.screenshot({ path: 'dev/screenshots/interactive-faq.png' })

/* 复制链接 / 二维码 */
await page.locator('#app').scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.locator('[data-copy-link]').first().click()
await page.waitForTimeout(300)
const toastText = await page.locator('#intro-toast').textContent()
console.log('toast:', toastText, 'visible:', await page.locator('#intro-toast').isVisible())
assert(await page.locator('#intro-toast').isVisible(), 'toast visible')

await page.locator('[data-open-qr]').click()
await page.waitForTimeout(400)
assert(await page.locator('#qr-lightbox').isVisible(), 'qr modal open')
await page.screenshot({ path: 'dev/screenshots/interactive-qr.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
assert(!(await page.locator('#qr-lightbox').isVisible()), 'qr modal closed')

/* ---------- 手机 ---------- */
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
watch(mobile, 'mobile')
await mobile.goto(BASE, { waitUntil: 'networkidle' })
await mobile.waitForSelector('.hero h1')
await mobile.addStyleTag({ content: 'html{scroll-snap-type:none !important}' })
await mobile.waitForTimeout(1000)
await mobile.locator('[data-device-tab="teacher"]').click()
await mobile.waitForTimeout(400)
await mobile.locator('#try').scrollIntoViewIfNeeded()
await mobile.waitForTimeout(600)
await mobile.screenshot({ path: 'dev/screenshots/interactive-mobile-demo.png' })
const mobileOverflow = await mobile.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  inner: window.innerWidth,
}))
console.log('mobile overflow:', mobileOverflow)
assert(mobileOverflow.scroll <= mobileOverflow.inner, 'mobile no horizontal overflow')
await mobile.close()

/* ---------- 减少动画 ---------- */
const reduced = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
  reducedMotion: 'reduce',
})
watch(reduced, 'reduced')
await reduced.goto(BASE, { waitUntil: 'networkidle' })
await reduced.waitForSelector('.try-demo')
await reduced.addStyleTag({ content: 'html{scroll-snap-type:none !important}' })
await reduced.locator('[data-demo-course="ds"]').click()
await reduced.waitForTimeout(200)
const reducedAnswer = await reduced.locator('[data-demo-text]').textContent()
console.log('reduced answer length:', reducedAnswer.length)
assert(reducedAnswer.length > 20, 'reduced motion types instantly')
await reduced.close()

await page.close()
await browser.close()

if (errors.length) {
  console.log('\n--- errors ---')
  for (const error of [...new Set(errors)]) console.log(error)
  process.exitCode = 1
} else {
  console.log('\ninteractive checks passed, no console errors')
}
