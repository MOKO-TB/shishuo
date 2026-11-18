/**
 * Visual + geometry check for the timetable: distinct course colours, bell times, mini glyphs.
 * Needs a dev server:  npm run dev -- --port 5199
 *   node dev/check-timetable.mjs
 */
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const BASE = process.env.APP_URL || 'http://localhost:5199/'
const SHOTS = path.resolve('dev/screenshots')
mkdirSync(SHOTS, { recursive: true })

const at = (course, teacher, room, day, startSection, endSection, weeks = '1-16') => ({
  id: `cls-${course}-${day}-${startSection}`,
  course,
  teacher,
  room,
  day,
  startSection,
  endSection,
  weeks,
  startTime: '',
  endTime: '',
})

const SCHEDULE = [
  at('大学英语Ⅲ', '刘培榕', 'J1-602', 1, 5, 6),
  at('复变函数与积分变换', '李劼', 'J1-607', 1, 7, 8),
  at('劳动教育 麦晓婷 1-5周', '', 'J1-201', 1, 11, 11, '1-5周'),
  at('大学生创业基础与实训', '刘佳', 'J2-803', 2, 3, 4),
  at('概率论与数理统计B', '李穆兰', 'J2-605', 2, 5, 6),
  at('习近平新时代中国特色社会主义思想概论', '杨特', 'J2-601', 2, 7, 8, '1-18'),
  at('居室美化与装饰', '王佳丽', 'J1-202', 2, 9, 10, '3-12'),
  at('数字电子技术A', '欧阳凯祺', 'J1-609', 3, 1, 2, '1-17'),
  at('模拟电子技术', '周德全', 'J1-607', 3, 3, 4, '1-17'),
  at('数字电子技术A', '欧阳凯祺', 'S1306', 4, 1, 2, '1-17'),
  at('大学体育专项I（橄榄球）', '温宝兴', '足球场（4）', 4, 9, 10, '1-18'),
  at('鸿蒙移动应用开发', '何俊权', 'S5402', 5, 3, 4),
  at('毛泽东思想和中国特色社会主义理论体系概论', '梁梦茵', 'J1-603', 5, 5, 6),
]

const PROFILE = {
  name: '林晓',
  college: '计算机学院 · 2024 级',
  studentNo: '',
  defaultCourseId: 'ds',
  schedule: SCHEDULE,
  scheduleSource: 'jw',
  scheduleSyncedAt: Date.now(),
  termStart: Date.parse('2026-10-19T00:00:00'),
  scores: [],
  scoresSyncedAt: null,
}

const executablePath = BROWSERS.find((candidate) => existsSync(candidate))
if (!executablePath) {
  console.error('没有找到 Edge 或 Chrome，无法运行检查。')
  process.exit(2)
}

let failures = 0
function check(ok, label) {
  console.log(`${ok ? 'ok ' : 'BAD'} ${label}`)
  if (!ok) failures += 1
}

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1.5 })
await context.addInitScript((profile) => {
  localStorage.setItem('shishuo.profile.v1', JSON.stringify(profile))
}, PROFILE)
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.side-week-block', { timeout: 20000 })
await page.waitForTimeout(500)
for (let attempt = 0; attempt < 3; attempt += 1) {
  const closer = page.locator('.modal-layer .modal-close')
  if ((await closer.count()) === 0) break
  await closer.first().click().catch(() => undefined)
  await page.waitForTimeout(300)
}

// ——— mini timetable ———
const mini = await page.$$eval('.side-week-block', (nodes) =>
  nodes.map((node) => ({
    title: node.getAttribute('title') || '',
    glyph: (node.textContent || '').trim(),
    bg: getComputedStyle(node).backgroundColor,
  })),
)
const weekOne = SCHEDULE.filter((entry) => entry.weeks === '1-16' || /^1-/.test(entry.weeks))
check(mini.length === weekOne.length, `迷你课表渲染第 1 周的 ${weekOne.length} 个课程块（实际 ${mini.length}）`)
check(mini.every((item) => item.glyph.length === 1), '每个块里只有一个课程字')
const expectedGlyphs = { 大学英语Ⅲ: '英', 大学生创业基础与实训: '创', 模拟电子技术: '模', 数字电子技术A: '数', 鸿蒙移动应用开发: '鸿' }
for (const [course, glyph] of Object.entries(expectedGlyphs)) {
  const found = mini.find((item) => item.title.startsWith(course))
  check(Boolean(found) && found.glyph === glyph, `「${course}」显示「${glyph}」（实际 ${found?.glyph ?? '缺失'}）`)
}
const miniCourses = [...new Set(mini.map((item) => item.title.split(' · ')[0]))]
const miniColors = [...new Set(mini.map((item) => item.bg))]
check(miniCourses.length === miniColors.length, `迷你课表 ${miniCourses.length} 门课用 ${miniColors.length} 种颜色（互不重复）`)
await page.locator('.side-timetable').screenshot({ path: path.join(SHOTS, 'timetable-mini.png') })

// ——— week grid ———
await page.click('.side-timetable-link')
await page.waitForSelector('.week-grid', { timeout: 10000 })
const periods = await page.$$eval('.week-grid-period', (nodes) =>
  nodes.map((node) => ({
    n: node.querySelector('strong')?.textContent ?? '',
    t: node.querySelector('em')?.textContent ?? '',
  })),
)
const bell = { 1: '08:20-09:05', 2: '09:10-09:55', 3: '10:15-11:00', 4: '11:05-11:50', 5: '14:30-15:15', 6: '15:20-16:05', 7: '16:25-17:10', 8: '17:15-18:00', 9: '19:00-19:45', 10: '19:50-20:35', 11: '20:40-21:25' }
for (const [section, text] of Object.entries(bell)) {
  const row = periods.find((item) => item.n === section)
  check(row?.t === text, `左栏第 ${section} 节时间 ${text}（实际 ${row?.t || '空'}）`)
}
const blocks = await page.$$eval('.week-class', (nodes) =>
  nodes.map((node) => ({
    course: node.querySelector('strong')?.textContent ?? '',
    time: node.querySelector('.week-class-time')?.textContent ?? '',
    bg: getComputedStyle(node).backgroundColor,
  })),
)
const courseColors = new Map()
let clash = ''
for (const block of blocks) {
  const seen = courseColors.get(block.course)
  if (!seen) courseColors.set(block.course, block.bg)
  else if (seen !== block.bg) clash = `${block.course} 同课不同色`
}
const colorSet = new Set(blocks.map((block) => block.bg))
check(colorSet.size === courseColors.size, `周课表 ${courseColors.size} 门课用 ${colorSet.size} 种颜色（互不重复）`)
check(!clash, `同一门课跨天颜色一致${clash ? `（${clash}）` : ''}`)
check(blocks.every((block) => block.time), '每个课程块都显示了时间')
const english = blocks.find((block) => block.course === '大学英语Ⅲ')
check(english?.time === '14:30-16:05', `大学英语按节次补出时间（实际 ${english?.time || '空'}）`)
await page.locator('.week-board').first().screenshot({ path: path.join(SHOTS, 'timetable-week.png') })

check(errors.length === 0, `无页面脚本错误${errors.length ? `：${errors[0]}` : ''}`)
await browser.close()
console.log(`\n${failures === 0 ? '全部通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
