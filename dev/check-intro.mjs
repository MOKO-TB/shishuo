import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.INTRO_URL || 'http://localhost:5173/intro/'
const OUT = 'dev/screenshots'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const errors = []

async function prepare(page) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`)
  })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.hero h1', { timeout: 15000 })
  const title = await page.title()
  if (!title.includes('每句有出处')) throw new Error(`unexpected page: ${title}`)
  console.log(
    'font loaded:',
    await page.evaluate(() => document.fonts.check('16px "Noto Serif SC"'))
  )
  await page.addStyleTag({
    content:
      '.reveal{opacity:1 !important;transform:none !important;transition:none !important}' +
      '.line > span{transform:none !important;transition:none !important}',
  })
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important; scroll-snap-type:none !important}' })
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, document.body.scrollHeight)
  })
  await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
}

async function capture(name, viewport, fn) {
  const page = await browser.newPage({ viewport, locale: 'zh-CN' })
  await prepare(page)
  await fn(page)
  await page.close()
  console.log('captured', name)
}

await capture('intro-desktop-hero.png', { width: 1440, height: 900 }, async (page) => {
  await page.screenshot({ path: `${OUT}/intro-desktop-hero.png` })
})

await capture('intro-desktop-full.png', { width: 1440, height: 900 }, async (page) => {
  console.log('desktop overflow:', await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })))
  await page.screenshot({ path: `${OUT}/intro-desktop-full.png`, fullPage: true })
  await page.addStyleTag({
    content:
      '.site-header,.deck-nav,.skip-link,.scroll-progress{display:none !important}',
  })
  for (const id of ['research', 'story', 'ability', 'film', 'team', 'app', 'roadmap', 'faq']) {
    const section = page.locator(`#${id}`)
    await section.scrollIntoViewIfNeeded()
    await page.waitForTimeout(350)
    await section.screenshot({ path: `${OUT}/intro-${id}.png` })
  }
  await page.locator('[data-report-toggle]').click()
  await page.waitForTimeout(350)
  await page.locator('.report-bar').first().click()
  await page.waitForTimeout(200)
  await page.locator('[data-report-panel]').screenshot({ path: `${OUT}/intro-report.png` })
  const about = page.locator('.about')
  await about.scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  await about.screenshot({ path: `${OUT}/intro-about.png` })
})

await capture('intro-lightbox.png', { width: 1440, height: 900 }, async (page) => {
  await page.locator('[data-open-film]').first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/intro-lightbox.png` })
  const opened = await page.locator('#film-lightbox').isVisible()
  console.log('lightbox visible:', opened)
  await page.waitForTimeout(1500)
  console.log(
    'video:',
    await page.evaluate(() => {
      const video = document.getElementById('film-video')
      return {
        paused: video.paused,
        currentTime: Number(video.currentTime.toFixed(2)),
        readyState: video.readyState,
        width: video.videoWidth,
        error: video.error ? video.error.code : null,
        subtitle: video.textTracks[0]?.mode,
      }
    })
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  console.log('lightbox after Esc:', await page.locator('#film-lightbox').isVisible())
})

await capture('intro-mobile', { width: 390, height: 844 }, async (page) => {
  console.log('mobile overflow:', await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })))
  await page.screenshot({ path: `${OUT}/intro-mobile-hero.png` })
  await page.screenshot({ path: `${OUT}/intro-mobile-full.png`, fullPage: true })
  await page.addStyleTag({
    content:
      '.site-header,.deck-nav,.skip-link,.scroll-progress{display:none !important}',
  })
  for (const [id, selector] of [
    ['research', '#research'],
    ['story', '#story'],
    ['ability', '#ability'],
    ['film', '#film'],
    ['team', '#team'],
    ['app', '#app'],
    ['roadmap', '#roadmap'],
    ['faq', '#faq'],
    ['about', '.about'],
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.locator(selector).screenshot({ path: `${OUT}/intro-mobile-${id}.png` })
  }
})

await browser.close()

if (errors.length) {
  console.log('\n--- console / page errors ---')
  for (const error of [...new Set(errors)]) console.log(error)
} else {
  console.log('\nno console errors')
}
