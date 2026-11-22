import { chromium } from 'playwright-core'

const BASE = process.env.INTRO_URL || 'http://127.0.0.1:8899/intro/'
const browser = await chromium.launch({ channel: 'msedge' })

/* App 下载配置：填了 data-download-url 后按钮应变成可下载链接 */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('**/intro/**', async (route) => {
    if (!route.request().url().endsWith('/intro/')) return route.continue()
    const response = await route.fetch()
    let body = await response.text()
    body = body
      .replace('data-download-url=""', 'data-download-url="/downloads/shishuo-1.0.0.apk"')
      .replace('data-download-version=""', 'data-download-version="1.0.0"')
      .replace('data-download-size=""', 'data-download-size="18 MB"')
    await route.fulfill({ response, body })
  })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.download-card.is-ready', { timeout: 5000 })
  const result = await page.evaluate(() => ({
    ready: document.querySelector('.download-card').classList.contains('is-ready'),
    badge: document.querySelector('[data-download-badge]').textContent.trim(),
    meta: document.querySelector('[data-download-meta]').textContent.trim(),
    button: document.querySelector('.btn-download').tagName,
    href: document.querySelector('.btn-download').getAttribute('href'),
    text: document.querySelector('.btn-download').textContent.trim(),
  }))
  console.log('download config:', result)
  await page.close()
}

/* 窄屏横向溢出 */
for (const width of [360, 320]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }))
  console.log(`viewport ${width}:`, overflow)
  await page.close()
}

await browser.close()
