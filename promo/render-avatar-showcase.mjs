import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = process.cwd()
const FPS = 30
const FRAMES_DIR = path.join(ROOT, 'promo', 'avatar_frames_tmp')
const OUT_MP4 = path.join(ROOT, 'promo', '书灵动作骨骼展示_1080p.mp4')
const OUT_GREEN_RUN = path.join(ROOT, 'promo', '书灵进度条奔跑_绿幕素材.mp4')
const MUSIC_WAV = path.join(ROOT, 'promo', 'audio', 'music.wav')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0]
      const filePath = path.join(ROOT, decodeURIComponent(cleanUrl))
      if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
      createReadStream(filePath).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` })
    })
  })
}

async function main() {
  rmSync(FRAMES_DIR, { recursive: true, force: true })
  mkdirSync(FRAMES_DIR, { recursive: true })

  const { server, baseUrl } = await startStaticServer()
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  })

  try {
    // ---- 1. 渲染 1920x1080 主展示片 ----
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      locale: 'zh-CN',
    })
    page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message))

    await page.goto(`${baseUrl}/promo/avatar-showcase.html?manual=1`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })

    const duration = await page.evaluate(() => window.__TOTAL__ || 33)
    const totalFrames = Math.ceil(duration * FPS)
    console.log(`Rendering ${totalFrames} frames (${duration}s @ ${FPS}fps)...`)

    for (let i = 0; i < totalFrames; i += 1) {
      const t = i / FPS
      await page.evaluate((sec) => window.__render(sec), t)
      await page.screenshot({
        path: path.join(FRAMES_DIR, `f_${String(i).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 94,
      })
      if (i % 150 === 0 || i === totalFrames - 1) {
        console.log(`  main frame ${i + 1}/${totalFrames} (t=${t.toFixed(2)}s)`)
      }
    }
    await page.close()

    // 编码 1080p MP4（带温和配乐淡入淡出）
    const hasMusic = existsSync(MUSIC_WAV)
    const ffArgs = [
      '-y',
      '-framerate',
      String(FPS),
      '-i',
      path.join(FRAMES_DIR, 'f_%05d.jpg'),
    ]
    if (hasMusic) {
      ffArgs.push(
        '-i',
        MUSIC_WAV,
        '-filter_complex',
        `[1:a]atrim=0:${duration},afade=t=in:st=0:d=1.2,afade=t=out:st=${(duration - 2).toFixed(2)}:d=2.0,volume=0.85[a]`,
        '-map',
        '0:v',
        '-map',
        '[a]',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      )
    }
    ffArgs.push(
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-movflags',
      '+faststart',
      OUT_MP4,
    )
    execFileSync('ffmpeg', ffArgs, { stdio: 'inherit' })
    console.log(`Encoded ${OUT_MP4}`)

    // ---- 2. 额外导出一份 6 秒 720x720 纯绿幕「进度条奔跑」循环素材供剪映/PR直接使用 ----
    const greenDir = path.join(FRAMES_DIR, 'green')
    mkdirSync(greenDir, { recursive: true })
    const gPage = await browser.newPage({
      viewport: { width: 720, height: 720 },
      deviceScaleFactor: 1,
    })
    await gPage.goto(`${baseUrl}/promo/avatar-showcase.html?manual=1&export=run&bg=green`, {
      waitUntil: 'networkidle',
    })
    await gPage.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })
    const gFrames = 6 * FPS
    for (let i = 0; i < gFrames; i += 1) {
      await gPage.evaluate((sec) => window.__render(sec), i / FPS)
      await gPage.screenshot({
        path: path.join(greenDir, `g_${String(i).padStart(4, '0')}.png`),
        type: 'png',
      })
    }
    await gPage.close()

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        String(FPS),
        '-i',
        path.join(greenDir, 'g_%04d.png'),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '16',
        '-preset',
        'medium',
        '-movflags',
        '+faststart',
        OUT_GREEN_RUN,
      ],
      { stdio: 'inherit' },
    )
    console.log(`Encoded ${OUT_GREEN_RUN}`)
  } finally {
    await browser.close()
    server.close()
    rmSync(FRAMES_DIR, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
