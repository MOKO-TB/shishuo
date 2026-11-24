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

const deckState = (page) =>
  page.evaluate(() => {
    const chapters = [...document.querySelectorAll('[data-deck-label]')]
    const index = Number(document.querySelector('[data-deck-index]')?.textContent) - 1
    return {
      index: document.querySelector('[data-deck-index]')?.textContent,
      label: document.querySelector('[data-deck-label-current]')?.textContent,
      activeDot: [...document.querySelectorAll('.deck-dot')].findIndex((dot) =>
        dot.classList.contains('is-active')
      ),
      prevDisabled: document.querySelector('[data-deck-prev]')?.disabled,
      nextDisabled: document.querySelector('[data-deck-next]')?.disabled,
      top: chapters[index] ? Math.round(chapters[index].getBoundingClientRect().top) : null,
    }
  })

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
watch(page, 'desktop')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.deck-nav')
await page.waitForTimeout(900)

const initial = await page.evaluate(() => ({
  snap: getComputedStyle(document.documentElement).scrollSnapType,
  align: getComputedStyle(document.getElementById('story')).scrollSnapAlign,
  total: document.querySelector('[data-deck-total]')?.textContent,
  dots: document.querySelectorAll('.deck-dot').length,
  index: document.querySelector('[data-deck-index]')?.textContent,
  label: document.querySelector('[data-deck-label-current]')?.textContent,
  prevDisabled: document.querySelector('[data-deck-prev]')?.disabled,
}))
console.log('deck initial:', initial)
assert(
  initial.snap === 'y' || initial.snap === 'y proximity',
  'CSS scroll snap is proximity'
)
assert(initial.align === 'start', 'story snap align start')
assert(initial.total === '11' && initial.dots === 11, 'deck has 11 chapters')
assert(initial.index === '01' && initial.label === '首屏', 'deck starts at hero')
assert(initial.prevDisabled === true, 'prev disabled at start')

await page.locator('[data-deck-next]').click()
await page.waitForTimeout(1400)
const research = await deckState(page)
console.log('after next:', research)
assert(research.label === '调研' && research.index === '02', 'next goes to research')
assert(research.top >= 70 && research.top <= 85, 'research snaps below header')

await page.locator('[data-deck-next]').click()
await page.waitForTimeout(1400)
const story = await deckState(page)
console.log('after next 2:', story)
assert(story.label === '双通道' && story.index === '03', 'next goes to story')
assert(story.top >= 70 && story.top <= 85, 'story snaps below header')

await page.locator('[data-deck-next]').click()
await page.waitForTimeout(1400)
const stats = await deckState(page)
console.log('after next 3:', stats)
assert(stats.label === '数据' && stats.index === '04', 'next goes to stats')

await page.locator('.deck-dot').nth(5).click()
await page.waitForTimeout(1400)
const film = await deckState(page)
console.log('after film dot:', film)
assert(film.label === '宣传片' && film.index === '06', 'dot goes to film')

await page.keyboard.press('PageDown')
await page.waitForTimeout(1400)
const team = await deckState(page)
console.log('after PageDown:', team)
assert(team.label === '团队' && team.index === '07', 'PageDown goes to team')

await page.keyboard.press('PageUp')
await page.waitForTimeout(1400)
const backFilm = await deckState(page)
console.log('after PageUp:', backFilm)
assert(backFilm.label === '宣传片' && backFilm.index === '06', 'PageUp goes to film')

await page.locator('.deck-dot').nth(7).click()
await page.waitForTimeout(1400)
const app = await deckState(page)
console.log('after app dot:', app)
assert(app.label === '手机端' && app.index === '08', 'dot goes to app')
assert(app.nextDisabled === false, 'app has next chapter')

await page.locator('.deck-dot').nth(8).click()
await page.waitForTimeout(1400)
const roadmap = await deckState(page)
console.log('after roadmap dot:', roadmap)
assert(roadmap.label === '版本' && roadmap.index === '09', 'dot goes to roadmap')

await page.locator('.deck-dot').nth(9).click()
await page.waitForTimeout(1400)
const faq = await deckState(page)
console.log('after faq dot:', faq)
assert(faq.label === '常见问题' && faq.index === '10', 'dot goes to faq')

await page.locator('.deck-dot').nth(10).click()
await page.waitForTimeout(1400)
const about = await deckState(page)
console.log('after about dot:', about)
assert(about.label === '关于' && about.index === '11', 'dot goes to about')
assert(about.nextDisabled === true, 'next disabled at about')

/* 手机：翻页器可用，标签收起，不横向溢出 */
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
watch(mobile, 'mobile')
await mobile.goto(BASE, { waitUntil: 'networkidle' })
await mobile.waitForSelector('.deck-nav')
await mobile.waitForTimeout(800)
const mobileDeck = await mobile.evaluate(() => ({
  visible: getComputedStyle(document.querySelector('.deck-nav')).display !== 'none',
  labelDisplay: getComputedStyle(document.querySelector('.deck-label')).display,
  total: document.querySelector('[data-deck-total]')?.textContent,
  dots: document.querySelectorAll('.deck-dot').length,
  overflow: document.documentElement.scrollWidth,
  inner: window.innerWidth,
}))
console.log('mobile deck:', mobileDeck)
assert(mobileDeck.visible, 'mobile deck visible')
assert(mobileDeck.labelDisplay === 'none', 'mobile deck label hidden')
assert(mobileDeck.total === '11' && mobileDeck.dots === 11, 'mobile deck chapters')
assert(mobileDeck.overflow <= mobileDeck.inner, 'mobile no horizontal overflow')
await mobile.locator('[data-deck-next]').click()
await mobile.waitForTimeout(1200)
const mobileResearch = await deckState(mobile)
console.log('mobile after next:', mobileResearch)
assert(
  mobileResearch.label === '调研' && mobileResearch.index === '02',
  'mobile next goes to research'
)
await mobile.close()

/* 减少动画：关闭吸附，跳转不过渡 */
const reduced = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
  reducedMotion: 'reduce',
})
watch(reduced, 'reduced')
await reduced.goto(BASE, { waitUntil: 'networkidle' })
await reduced.waitForSelector('.deck-nav')
await reduced.waitForTimeout(500)
const reducedSnap = await reduced.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)
console.log('reduced snap:', reducedSnap)
assert(reducedSnap === 'none', 'reduced motion disables snap')
await reduced.locator('[data-deck-next]').click()
await reduced.waitForTimeout(500)
const reducedResearch = await deckState(reduced)
console.log('reduced after next:', reducedResearch)
assert(reducedResearch.label === '调研', 'reduced deck next works')
await reduced.close()

await page.close()
await browser.close()

if (errors.length) {
  console.log('\n--- errors ---')
  for (const error of [...new Set(errors)]) console.log(error)
  process.exitCode = 1
} else {
  console.log('\ndeck checks passed, no console errors')
}
