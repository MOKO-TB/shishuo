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

// 交互测试不测吸附：关掉平滑滚动/吸附，强制露出 reveal，并移开固定翻页器避免挡点击。
const SETTLE_CSS = `
  html { scroll-behavior: auto !important; scroll-snap-type: none !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  .line > span { transform: none !important; }
  .deck-nav { display: none !important; }
`

const gotoSection = async (page, selector) => {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'start' })
  }, selector)
  await page.waitForTimeout(350)
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
watch(page, 'desktop')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.addStyleTag({ content: SETTLE_CSS })
await gotoSection(page, '#research')

/* 调研：关键摘录 + 完整 10 题报告 */
const research = await page.evaluate(() => ({
  cards: document.querySelectorAll('#research .research-grid > *').length,
  stat: document.querySelector('#research .research-stat strong')?.textContent,
  toggle: document.querySelector('[data-report-toggle] span')?.textContent,
  expanded: document.querySelector('[data-report-toggle]')?.getAttribute('aria-expanded'),
  panelHidden: document.querySelector('[data-report-panel]')?.hidden,
}))
console.log('research:', research)
assert(research.cards === 4, 'research has 4 key cards')
assert((research.stat || '').includes('86.3'), 'research key stat 86.3%')
assert(research.toggle === '查看完整 10 题报告', 'report toggle label')
assert(research.expanded === 'false' && research.panelHidden === true, 'report starts closed')

await page.locator('[data-report-toggle]').click()
await page.waitForTimeout(400)
const opened = await page.evaluate(() => ({
  hidden: document.querySelector('[data-report-panel]').hidden,
  expanded: document.querySelector('[data-report-toggle]')?.getAttribute('aria-expanded'),
  label: document.querySelector('[data-report-toggle] span')?.textContent,
  tabs: document.querySelectorAll('.report-tab').length,
  count: document.querySelector('[data-report-count]')?.textContent,
  question: document.querySelector('[data-report-question]')?.textContent,
  bars: document.querySelectorAll('.report-bar').length,
  prevDisabled: document.querySelector('[data-report-prev]')?.disabled,
  firstValue: document.querySelector('.report-bar-value')?.textContent,
}))
console.log('report opened:', opened)
assert(opened.hidden === false, 'report panel opens')
assert(opened.expanded === 'true', 'report aria expanded')
assert(opened.label === '收起完整报告', 'toggle label switches')
assert(opened.tabs === 10, 'report has 10 tabs')
assert(opened.count === '01 / 10', 'report starts at 01/10')
assert((opened.question || '').includes('年级'), 'report Q1 is grade')
assert(opened.prevDisabled === true, 'report prev disabled at Q1')
assert(opened.bars === 4, 'Q1 renders 4 bars')
assert(opened.firstValue === '61.64%', 'Q1 top value 61.64%')

await page.locator('.report-tab').nth(3).click()
await page.waitForTimeout(250)
const q4 = await page.evaluate(() => ({
  count: document.querySelector('[data-report-count]')?.textContent,
  question: document.querySelector('[data-report-question]')?.textContent,
  noteRows: document.querySelectorAll('.report-note-row').length,
  tags: [...document.querySelectorAll('.report-note-row .tag')].map((tag) => tag.textContent),
  note: document.querySelector('.report-note-text')?.textContent,
}))
console.log('report Q4:', q4)
assert(q4.count === '04 / 10', 'Q4 count')
assert((q4.question || '').includes('什么时候'), 'Q4 question')
assert(q4.noteRows === 4, 'Q4 note card has 4 rows')
assert(q4.tags.length === 2 && q4.tags.every((tag) => tag === '高频'), 'Q4 tags 高频')
assert((q4.note || '').includes('折叠'), 'Q4 explains folded options')

await page.locator('.report-tab').nth(9).click()
await page.waitForTimeout(300)
const q10 = await page.evaluate(() => {
  const donut = document.querySelector('.report-donut')
  return {
    count: document.querySelector('[data-report-count]')?.textContent,
    question: document.querySelector('[data-report-question]')?.textContent,
    donut: Boolean(donut),
    gradient: donut ? getComputedStyle(donut).backgroundImage : '',
    center: document.querySelector('.report-donut-center')?.textContent,
    legend: document.querySelectorAll('.report-legend li').length,
    nextDisabled: document.querySelector('[data-report-next]')?.disabled,
    prevDisabled: document.querySelector('[data-report-prev]')?.disabled,
  }
})
console.log('report Q10:', { ...q10, gradient: q10.gradient.slice(0, 60) })
assert(q10.count === '10 / 10', 'Q10 count')
assert((q10.question || '').includes('愿意用吗'), 'Q10 question')
assert(q10.donut && q10.gradient.includes('conic-gradient'), 'Q10 donut rendered')
assert((q10.center || '').includes('56.17%'), 'Q10 center 56.17%')
assert(q10.legend === 5, 'Q10 has 5 legend rows')
assert(q10.nextDisabled === true && q10.prevDisabled === false, 'Q10 next disabled')

await page.locator('[data-report-prev]').click()
await page.waitForTimeout(250)
const q9 = await page.evaluate(() => ({
  count: document.querySelector('[data-report-count]')?.textContent,
  question: document.querySelector('[data-report-question]')?.textContent,
  nextDisabled: document.querySelector('[data-report-next]')?.disabled,
  bars: document.querySelectorAll('.report-bar').length,
}))
console.log('report back to Q9:', q9)
assert(q9.count === '09 / 10', 'prev returns to Q9')
assert((q9.question || '').includes('AI'), 'Q9 question')
assert(q9.bars === 4 && q9.nextDisabled === false, 'Q9 bars and next enabled')

await page.locator('[data-report-toggle]').click()
await page.waitForTimeout(250)
const closed = await page.evaluate(() => ({
  hidden: document.querySelector('[data-report-panel]')?.hidden,
  expanded: document.querySelector('[data-report-toggle]')?.getAttribute('aria-expanded'),
  label: document.querySelector('[data-report-toggle] span')?.textContent,
}))
console.log('report closed:', closed)
assert(closed.hidden === true && closed.expanded === 'false', 'report closes')
assert(closed.label === '查看完整 10 题报告', 'toggle label restores')

/* 团队：4 条线 + 指导教师；周节奏区块已按用户要求删除 */
await gotoSection(page, '#team')
const team = await page.evaluate(() => ({
  cards: document.querySelectorAll('#team .team-card').length,
  advisor: Boolean(document.querySelector('#team .team-advisor')),
  flow: Boolean(document.querySelector('#team .team-flow')),
  note: Boolean(document.querySelector('#team .team-note')),
}))
console.log('team:', team)
assert(team.cards === 5 && team.advisor, 'team has 4 lines + advisor')
assert(team.flow === false && team.note === false, 'team flow/note removed')

/* 版本：10 条，全部 / 已上线 7 / 下一步 3 */
await gotoSection(page, '#roadmap')
const roadmap = await page.evaluate(() => ({
  total: document.querySelectorAll('.roadmap-item').length,
  visible: [...document.querySelectorAll('.roadmap-item')].filter((item) => !item.hidden).length,
  filters: document.querySelectorAll('[data-roadmap-filter]').length,
  active: document.querySelector('[data-roadmap-filter].is-active')?.dataset.roadmapFilter,
  sideCount: document.querySelector('.roadmap-side-count strong')?.textContent,
  sideFacts: document.querySelectorAll('.roadmap-side-facts div').length,
  sideText: document.querySelector('.roadmap-side')?.textContent,
}))
console.log('roadmap:', { ...roadmap, sideText: undefined })
assert(roadmap.total === 10 && roadmap.visible === 10, 'roadmap has 10 visible items')
assert(roadmap.filters === 3 && roadmap.active === 'all', 'roadmap starts on all')
assert(roadmap.sideCount === '7' && roadmap.sideFacts === 3, 'roadmap progress panel')
assert(
  (roadmap.sideText || '').includes('v1.0 公测') && (roadmap.sideText || '').includes('介绍站 2.0'),
  'roadmap panel facts'
)

await page.locator('[data-roadmap-filter="done"]').click()
await page.waitForTimeout(200)
const done = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('.roadmap-item')].filter((item) => !item.hidden).length,
  versions: [...document.querySelectorAll('.roadmap-item:not([hidden]) .roadmap-version')].map(
    (node) => node.textContent
  ),
  active: document.querySelector('[data-roadmap-filter].is-active')?.dataset.roadmapFilter,
  pressed: document
    .querySelector('[data-roadmap-filter="done"]')
    ?.getAttribute('aria-pressed'),
}))
console.log('roadmap done:', done)
assert(done.visible === 7, 'done filter shows 7')
assert(done.versions.includes('v0.1') && done.versions.includes('介绍站 2.0'), 'done versions')
assert(done.active === 'done' && done.pressed === 'true', 'done filter active')

await page.locator('[data-roadmap-filter="next"]').click()
await page.waitForTimeout(200)
const next = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('.roadmap-item')].filter((item) => !item.hidden).length,
  versions: [...document.querySelectorAll('.roadmap-item:not([hidden]) .roadmap-version')].map(
    (node) => node.textContent
  ),
  active: document.querySelector('[data-roadmap-filter].is-active')?.dataset.roadmapFilter,
}))
console.log('roadmap next:', next)
assert(next.visible === 3, 'next filter shows 3')
assert(next.versions.join(' / ') === 'v1.0 / v1.1 / v2.0', 'next versions')
assert(next.active === 'next', 'next filter active')

await page.locator('[data-roadmap-filter="all"]').click()
await page.waitForTimeout(200)
const all = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('.roadmap-item')].filter((item) => !item.hidden).length,
  active: document.querySelector('[data-roadmap-filter].is-active')?.dataset.roadmapFilter,
}))
console.log('roadmap all:', all)
assert(all.visible === 10 && all.active === 'all', 'all filter restores 10')

/* 手机：报告与版本筛选都能用，页面不横向溢出 */
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
watch(mobile, 'mobile')
await mobile.goto(BASE, { waitUntil: 'networkidle' })
await mobile.addStyleTag({ content: SETTLE_CSS })
await gotoSection(mobile, '#research')
await mobile.locator('[data-report-toggle]').click()
await mobile.waitForTimeout(300)
await mobile.locator('.report-tab').nth(9).click()
await mobile.waitForTimeout(300)
const mobileReport = await mobile.evaluate(() => ({
  tabs: document.querySelectorAll('.report-tab').length,
  donut: Boolean(document.querySelector('.report-donut')),
  legend: document.querySelectorAll('.report-legend li').length,
  width: document.documentElement.scrollWidth,
  inner: window.innerWidth,
  panelWidth: Math.round(document.querySelector('[data-report-panel]').getBoundingClientRect().width),
}))
console.log('mobile report:', mobileReport)
assert(mobileReport.tabs === 10 && mobileReport.donut, 'mobile report works')
assert(mobileReport.legend === 5, 'mobile Q10 legend')
assert(mobileReport.width <= mobileReport.inner, 'mobile no horizontal overflow')
assert(mobileReport.panelWidth <= 390, 'mobile report panel fits viewport')

await gotoSection(mobile, '#roadmap')
await mobile.locator('[data-roadmap-filter="done"]').click()
await mobile.waitForTimeout(200)
const mobileRoadmap = await mobile.evaluate(() => ({
  visible: [...document.querySelectorAll('.roadmap-item')].filter((item) => !item.hidden).length,
  width: document.documentElement.scrollWidth,
  inner: window.innerWidth,
}))
console.log('mobile roadmap:', mobileRoadmap)
assert(mobileRoadmap.visible === 7, 'mobile done filter shows 7')
assert(mobileRoadmap.width <= mobileRoadmap.inner, 'mobile roadmap no overflow')
await mobile.close()

await page.close()
await browser.close()

if (errors.length) {
  console.log('\n--- errors ---')
  for (const error of [...new Set(errors)]) console.log(error)
  process.exitCode = 1
} else {
  console.log('\nproject section checks passed, no console errors')
}
