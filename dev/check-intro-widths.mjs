import { chromium } from 'playwright-core'

const BASE = process.env.INTRO_URL || 'http://127.0.0.1:8899/intro/'
const browser = await chromium.launch({ channel: 'msedge' })

for (const [width, height, name] of [
  [1920, 1080, '1920'],
  [1024, 768, '1024'],
  [768, 900, '768'],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: '.reveal{opacity:1!important;transform:none!important;transition:none!important}',
  })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `dev/screenshots/intro-${name}-hero.png` })
  console.log(
    name,
    await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }))
  )
  await page.close()
}

await browser.close()
