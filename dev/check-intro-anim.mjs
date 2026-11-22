import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.INTRO_URL || 'http://localhost:5173/intro/'
const OUT = 'dev/screenshots'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const errors = []

async function open(viewport, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport, locale: 'zh-CN', reducedMotion })
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
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1200)
  return page
}

async function scrollToStory(page, index) {
  await page.evaluate((i) => {
    const step = document.querySelectorAll('.story-step')[i]
    const y = step.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.36
    window.scrollTo(0, Math.max(0, y))
  }, index)
  await page.waitForTimeout(950)
}

async function readStory(page) {
  return page.evaluate(() => {
    const steps = [...document.querySelectorAll('.story-step')]
    const frames = [...document.querySelectorAll('.story-frame')]
    const visual = document.querySelector('.story-visual')
    return {
      activeStep: steps.findIndex((step) => step.classList.contains('is-active')),
      activeFrame: frames.findIndex((frame) => frame.classList.contains('is-active')),
      caption: document.querySelector('.story-caption')?.textContent,
      no: document.querySelector('.story-no')?.textContent,
      visualTop: Math.round(visual.getBoundingClientRect().top),
      stepOpacity: getComputedStyle(
        steps.find((step) => step.classList.contains('is-active'))?.querySelector('.story-step-inner') ||
          steps[0]
      ).opacity,
    }
  })
}

/* ---------- 桌面 ---------- */
{
  const page = await open({ width: 1440, height: 900 })
  await page.screenshot({ path: `${OUT}/anim-desktop-hero.png` })
  console.log(
    'hero line transform:',
    await page.evaluate(() => getComputedStyle(document.querySelector('.hero h1 .line > span')).transform)
  )

  const hero = await page.locator('.hero-visual').boundingBox()
  if (hero) {
    await page.mouse.move(hero.x + hero.width * 0.8, hero.y + hero.height * 0.2)
    await page.waitForTimeout(250)
    console.log(
      'hero parallax vars:',
      await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('.hero-visual'))
        return { px: style.getPropertyValue('--px').trim(), py: style.getPropertyValue('--py').trim() }
      })
    )
  }

  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.45)))
  await page.waitForTimeout(350)
  console.log(
    'hero scroll layers:',
    await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.hero-visual'))
      return {
        bg: style.getPropertyValue('--scroll-bg').trim(),
        mid: style.getPropertyValue('--scroll-mid').trim(),
        fg: style.getPropertyValue('--scroll-fg').trim(),
        frame: getComputedStyle(document.querySelector('.story-frame')).transitionTimingFunction,
      }
    })
  )
  await page.screenshot({ path: `${OUT}/anim-hero-scroll.png` })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  for (let i = 0; i < 5; i++) {
    await scrollToStory(page, i)
    console.log(`desktop story ${i + 1}:`, await readStory(page))
    await page.screenshot({ path: `${OUT}/anim-story-${i + 1}.png` })
  }

  await page.evaluate(() => {
    const band = document.querySelector('.stats-band')
    window.scrollTo(0, band.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4)
  })
  await page.waitForTimeout(2000)
  console.log(
    'stats counts:',
    await page.evaluate(() => [...document.querySelectorAll('[data-count]')].map((el) => el.textContent))
  )
  console.log(
    'scroll progress:',
    await page.evaluate(() => ({
      width: document.querySelector('.scroll-progress i').style.width,
      viewport: window.innerWidth,
    }))
  )
  await page.screenshot({ path: `${OUT}/anim-stats.png` })
  await page.close()
}

/* ---------- 手机 ---------- */
{
  const page = await open({ width: 390, height: 844 })
  await page.screenshot({ path: `${OUT}/anim-mobile-hero.png` })
  for (const i of [0, 2, 4]) {
    await scrollToStory(page, i)
    console.log(`mobile story ${i + 1}:`, await readStory(page))
    await page.screenshot({ path: `${OUT}/anim-mobile-story-${i + 1}.png` })
  }
  await page.close()
}

/* ---------- 下载双卡配置 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('**/intro/**', async (route) => {
    if (!route.request().url().endsWith('/intro/')) return route.continue()
    const response = await route.fetch()
    let body = await response.text()
    body = body
      .replace('data-download-url=""', 'data-download-url="/downloads/shishuo-1.0.0.apk"')
      .replace('data-download-url=""', 'data-download-url="https://apps.apple.com/app/id0000000000"')
      .replace('data-download-version=""', 'data-download-version="1.0.0"')
      .replace('data-download-size=""', 'data-download-size="18 MB"')
    await route.fulfill({ response, body })
  })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  console.log(
    'download cards:',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-download-card]')].map((card) => ({
        ready: card.classList.contains('is-ready'),
        badge: card.querySelector('[data-download-badge]').textContent.trim(),
        meta: card.querySelector('[data-download-meta]').textContent.trim(),
        tag: card.querySelector('.btn-download').tagName,
        href: card.querySelector('.btn-download').getAttribute('href'),
        text: card.querySelector('.btn-download').textContent.trim(),
        target: card.querySelector('.btn-download').getAttribute('target'),
        download: card.querySelector('.btn-download').hasAttribute('download'),
      }))
    )
  )
  await page.close()
}

/* ---------- 减少动画 ---------- */
{
  const page = await open({ width: 1280, height: 900 }, 'reduce')
  console.log(
    'reduced motion:',
    await page.evaluate(() => ({
      lineTransform: getComputedStyle(document.querySelector('.hero h1 .line > span')).transform,
      counts: [...document.querySelectorAll('[data-count]')].map((el) => el.textContent),
      stepOpacity: getComputedStyle(document.querySelector('.story-step-inner')).opacity,
      reviews: [...document.querySelectorAll('.reveal')].every(
        (el) => getComputedStyle(el).opacity === '1'
      ),
    }))
  )
  await page.close()
}

await browser.close()

if (errors.length) {
  console.log('\n--- errors ---')
  for (const error of [...new Set(errors)]) console.log(error)
} else {
  console.log('\nno console / network errors')
}
