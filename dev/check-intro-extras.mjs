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

const SETTLE_CSS = `
  html { scroll-behavior: auto !important; scroll-snap-type: none !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  .line > span { transform: none !important; }
  .site-header, .deck-nav, .skip-link, .scroll-progress { display: none !important; }
`

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
watch(page, 'desktop')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.addStyleTag({ content: SETTLE_CSS })

/* FAQ：关键词搜索 + 主题筛选 + 空态 */
await page.evaluate(() => document.querySelector('#faq').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
const faqInitial = await page.evaluate(() => ({
  items: document.querySelectorAll('.faq-item').length,
  visible: [...document.querySelectorAll('.faq-item')].filter((item) => !item.hidden).length,
  tags: document.querySelectorAll('[data-faq-tag]').length,
  cleared: document.querySelector('[data-faq-clear]')?.hidden,
}))
console.log('faq initial:', faqInitial)
assert(faqInitial.items === 5 && faqInitial.visible === 5, 'FAQ starts with 5 items')
assert(faqInitial.tags === 5 && faqInitial.cleared === true, 'FAQ tools ready')

await page.locator('[data-faq-search]').fill('匿名')
await page.waitForTimeout(150)
const faqSearch = await page.evaluate(() => {
  const visible = [...document.querySelectorAll('.faq-item')].filter((item) => !item.hidden)
  return {
    visible: visible.length,
    tag: visible[0]?.dataset.faqTags,
    open: visible[0]?.classList.contains('is-open'),
    empty: document.querySelector('[data-faq-empty]')?.hidden,
    clear: document.querySelector('[data-faq-clear]')?.hidden,
  }
})
console.log('faq search 匿名:', faqSearch)
assert(faqSearch.visible === 1 && faqSearch.tag === 'privacy', 'search filters privacy answer')
assert(faqSearch.open === true, 'single search result opens')
assert(faqSearch.empty === true && faqSearch.clear === false, 'search empty/clear states')

await page.locator('[data-faq-clear]').click()
await page.waitForTimeout(120)
const faqCleared = await page.evaluate(() => ({
  value: document.querySelector('[data-faq-search]')?.value,
  visible: [...document.querySelectorAll('.faq-item')].filter((item) => !item.hidden).length,
  clear: document.querySelector('[data-faq-clear]')?.hidden,
}))
console.log('faq cleared:', faqCleared)
assert(faqCleared.value === '' && faqCleared.visible === 5 && faqCleared.clear === true, 'clear restores FAQ')

await page.locator('[data-faq-tag="app"]').click()
await page.waitForTimeout(150)
const faqTagApp = await page.evaluate(() => {
  const visible = [...document.querySelectorAll('.faq-item')].filter((item) => !item.hidden)
  return {
    visible: visible.length,
    tag: visible[0]?.dataset.faqTags,
    open: visible[0]?.classList.contains('is-open'),
    pressed: document.querySelector('[data-faq-tag="app"]')?.getAttribute('aria-pressed'),
  }
})
console.log('faq tag app:', faqTagApp)
assert(faqTagApp.visible === 1 && faqTagApp.tag === 'app', 'topic filter app')
assert(faqTagApp.open === true && faqTagApp.pressed === 'true', 'app answer opens')

await page.locator('[data-faq-tag="all"]').click()
await page.waitForTimeout(120)
await page.locator('[data-faq-search]').fill('不会存在的问题')
await page.waitForTimeout(150)
const faqEmpty = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('.faq-item')].filter((item) => !item.hidden).length,
  empty: document.querySelector('[data-faq-empty]')?.hidden,
  open: [...document.querySelectorAll('.faq-item')].some((item) => item.classList.contains('is-open')),
}))
console.log('faq empty:', faqEmpty)
assert(faqEmpty.visible === 0 && faqEmpty.empty === false && faqEmpty.open === false, 'empty state')
await page.locator('[data-faq-clear]').click()
await page.waitForTimeout(120)

/* 调研报告：点选选项 -> 你的选择反馈 */
await page.evaluate(() => document.querySelector('#research').scrollIntoView({ block: 'start' }))
await page.locator('[data-report-toggle]').click()
await page.waitForTimeout(300)
await page.locator('.report-bar').first().click()
await page.waitForTimeout(150)
const reportPick1 = await page.evaluate(() => ({
  hidden: document.querySelector('[data-report-selection]')?.hidden,
  text: document.querySelector('[data-report-selection]')?.textContent,
  picked: document.querySelector('.report-bar.is-picked .report-bar-label')?.textContent,
  pressed: document.querySelector('.report-bar.is-picked')?.getAttribute('aria-pressed'),
}))
console.log('report pick Q1:', reportPick1)
assert(reportPick1.hidden === false, 'report pick appears')
assert((reportPick1.text || '').includes('61.64%') && (reportPick1.text || '').includes('和你一样'), 'Q1 pick text')
assert(reportPick1.picked === '大二' && reportPick1.pressed === 'true', 'Q1 row selected')

await page.locator('.report-tab').nth(9).click()
await page.waitForTimeout(200)
const reportReset = await page.evaluate(() => ({
  hidden: document.querySelector('[data-report-selection]')?.hidden,
  donut: Boolean(document.querySelector('.report-donut')),
}))
console.log('report Q10 reset:', reportReset)
assert(reportReset.hidden === true && reportReset.donut, 'pick resets on question change')

await page.locator('.report-legend li').first().click()
await page.waitForTimeout(150)
const reportPick10 = await page.evaluate(() => ({
  text: document.querySelector('[data-report-selection]')?.textContent,
  picked: document.querySelector('.report-legend li.is-picked span')?.textContent,
}))
console.log('report pick Q10:', reportPick10)
assert(
  (reportPick10.text || '').includes('43.84%') &&
    (reportPick10.text || '').includes('和你一样') &&
    reportPick10.picked === '愿意',
  'Q10 legend pick'
)

await page.locator('[data-report-prev]').click()
await page.waitForTimeout(200)
await page.locator('.report-bar').first().focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
const reportPick9 = await page.evaluate(() => ({
  text: document.querySelector('[data-report-selection]')?.textContent,
  picked: document.querySelector('.report-bar.is-picked .report-bar-label')?.textContent,
}))
console.log('report pick Q9 keyboard:', reportPick9)
assert(
  (reportPick9.text || '').includes('86.3%') &&
    (reportPick9.text || '').includes('也选了这个') &&
    reportPick9.picked === '不知道它答得对不对',
  'Q9 keyboard pick on multi'
)
await page.locator('[data-report-toggle]').click()
await page.waitForTimeout(150)

/* 首屏界面放大预览 */
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(250)
await page.locator('[data-device-zoom]').click()
await page.waitForTimeout(250)
const shotStudent = await page.evaluate(() => ({
  visible: !document.getElementById('shot-lightbox')?.hidden,
  src: document.querySelector('[data-shot-image]')?.getAttribute('src'),
  caption: document.querySelector('#shot-lightbox [data-shot-caption]')?.textContent,
  overflow: document.body.style.overflow,
}))
console.log('shot student:', shotStudent)
assert(shotStudent.visible === true, 'student shot lightbox opens')
assert((shotStudent.src || '').includes('hero-student.webp'), 'student shot src')
assert((shotStudent.caption || '').includes('学生端'), 'student shot caption')
assert(shotStudent.overflow === 'hidden', 'shot lightbox locks scroll')

await page.keyboard.press('Escape')
await page.waitForTimeout(150)
assert(
  await page.evaluate(() => document.getElementById('shot-lightbox')?.hidden === true),
  'shot lightbox closes on Esc'
)

await page.locator('[data-device-tab="teacher"]').click()
await page.waitForTimeout(450)
await page.locator('[data-device-zoom]').click()
await page.waitForTimeout(250)
const shotTeacher = await page.evaluate(() => ({
  visible: !document.getElementById('shot-lightbox')?.hidden,
  src: document.querySelector('[data-shot-image]')?.getAttribute('src'),
  caption: document.querySelector('#shot-lightbox [data-shot-caption]')?.textContent,
}))
console.log('shot teacher:', shotTeacher)
assert(shotTeacher.visible === true, 'teacher shot lightbox opens')
assert((shotTeacher.src || '').includes('story-queue.webp'), 'teacher shot src')
assert((shotTeacher.caption || '').includes('教师端'), 'teacher shot caption')
await page.locator('[data-close-shot]').click()
await page.waitForTimeout(150)

/* 课程演示：复制回答 */
await page.evaluate(() => document.querySelector('#try').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
await page.locator('[data-demo-copy]').click()
await page.waitForTimeout(250)
const demoCopy = await page.evaluate(async () => {
  const toast = document.getElementById('intro-toast')
  let clip = ''
  try {
    clip = await navigator.clipboard.readText()
  } catch {
    clip = ''
  }
  return {
    toast: toast?.textContent,
    visible: toast && !toast.hidden,
    clip,
  }
})
console.log('demo copy:', { ...demoCopy, clip: demoCopy.clip.slice(0, 60) })
assert(demoCopy.visible === true && (demoCopy.toast || '').includes('回答已复制'), 'copy toast')
if (demoCopy.clip) {
  assert(demoCopy.clip.includes('来源：'), 'clipboard has answer source')
}

/* 手机：搜索 / 报告点选 / 放大预览都不溢出 */
const mobile = await context.newPage()
await mobile.setViewportSize({ width: 390, height: 844 })
watch(mobile, 'mobile')
await mobile.goto(BASE, { waitUntil: 'networkidle' })
await mobile.addStyleTag({ content: SETTLE_CSS })
await mobile.evaluate(() => document.querySelector('#faq').scrollIntoView({ block: 'start' }))
await mobile.locator('[data-faq-search]').fill('图片')
await mobile.waitForTimeout(150)
const mobileFaq = await mobile.evaluate(() => ({
  visible: [...document.querySelectorAll('.faq-item')].filter((item) => !item.hidden).length,
  width: document.documentElement.scrollWidth,
  inner: window.innerWidth,
}))
console.log('mobile faq:', mobileFaq)
assert(mobileFaq.visible === 1, 'mobile FAQ search')
assert(mobileFaq.width <= mobileFaq.inner, 'mobile FAQ no overflow')

await mobile.locator('[data-faq-clear]').click()
await mobile.evaluate(() => document.querySelector('#research').scrollIntoView({ block: 'start' }))
await mobile.locator('[data-report-toggle]').click()
await mobile.waitForTimeout(250)
await mobile.locator('.report-bar').first().click()
await mobile.waitForTimeout(150)
const mobileReport = await mobile.evaluate(() => ({
  pick: document.querySelector('[data-report-selection]')?.textContent,
  width: document.documentElement.scrollWidth,
  inner: window.innerWidth,
}))
console.log('mobile report pick:', mobileReport)
assert((mobileReport.pick || '').includes('61.64%'), 'mobile report pick')
assert(mobileReport.width <= mobileReport.inner, 'mobile report no overflow')

await mobile.evaluate(() => window.scrollTo(0, 0))
await mobile.waitForTimeout(200)
await mobile.locator('[data-device-zoom]').click()
await mobile.waitForTimeout(250)
const mobileShot = await mobile.evaluate(() => ({
  visible: !document.getElementById('shot-lightbox')?.hidden,
  imgWidth: Math.round(document.querySelector('[data-shot-image]')?.getBoundingClientRect().width),
  inner: window.innerWidth,
  width: document.documentElement.scrollWidth,
}))
console.log('mobile shot:', mobileShot)
assert(mobileShot.visible && mobileShot.imgWidth <= mobileShot.inner, 'mobile shot fits')
assert(mobileShot.width <= mobileShot.inner, 'mobile shot no overflow')
await mobile.close()

await context.close()
await browser.close()

if (errors.length) {
  console.log('\n--- errors ---')
  for (const error of [...new Set(errors)]) console.log(error)
  process.exitCode = 1
} else {
  console.log('\nextra interaction checks passed, no console errors')
}
