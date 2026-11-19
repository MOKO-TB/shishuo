#!/usr/bin/env node
/**
 * UI 规范卡口（ratchet 式）：
 *   node dev/check-ui.mjs              # 检查，超出基线则退出码 1
 *   node dev/check-ui.mjs --write      # 把当前计数写成新基线（只允许在"确实减少"时用）
 *
 * 规则：
 *   1) 字面色值（#hex / rgba() / hsl()）只允许出现在 tokens.css 与 base.css（色板）
 *   2) border-radius 只允许 var(--radius-*) / 50% / 0 / <=5px 装饰值
 *   3) font-size 不允许 < 11px
 *
 * 基线存在 dev/ui-baseline.json，目的是让存量债务不再增长；
 * 每清掉一批就把基线往下调，最终归零。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const STYLE_DIR = 'src/styles'
const BASELINE_FILE = 'dev/ui-baseline.json'
const COLOR_WHITELIST = new Set(['tokens.css', 'base.css'])
const RADIUS_WHITELIST = new Set(['50%', '0', '0px'])

const files = readdirSync(STYLE_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => path.join(STYLE_DIR, f))

const findings = { colorLiteral: [], radiusLiteral: [], tinyFont: [] }

for (const file of files) {
  const name = path.basename(file)
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, index) => {
    const where = `${name}:${index + 1}`
    const isWhitelisted = COLOR_WHITELIST.has(name)

    if (!isWhitelisted) {
      const colors = line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)
      if (colors) findings.colorLiteral.push({ where, text: colors.join(' ') })
    }

    const radius = line.match(/border-radius:\s*([^;]+)/)
    if (radius && !RADIUS_WHITELIST.has(radius[1].trim()) && !radius[1].includes('var(--radius')) {
      const px = radius[1].match(/(\d+)px/)
      if (!px || Number(px[1]) > 5) findings.radiusLiteral.push({ where, text: radius[1].trim() })
    }

    const font = line.match(/font-size:\s*([0-9.]+)px/)
    if (font && Number(font[1]) < 11) findings.tinyFont.push({ where, text: `${font[1]}px` })
  })
}

const counts = Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]))
const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  : { colorLiteral: 0, radiusLiteral: 0, tinyFont: 0 }

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`)
  console.log('已写入基线', counts)
  process.exit(0)
}

let failed = false
for (const [rule, list] of Object.entries(findings)) {
  const allowed = baseline[rule] ?? 0
  const ok = list.length <= allowed
  if (!ok) failed = true
  console.log(`${ok ? '✓' : '✗'} ${rule}: ${list.length} / 基线 ${allowed}`)
  if (!ok) {
    for (const item of list.slice(0, 8)) console.log(`    ${item.where}  ${item.text}`)
    if (list.length > 8) console.log(`    …还有 ${list.length - 8} 处`)
  }
}

if (failed) {
  console.error('\nUI 规范检查未通过。新增样式请使用 tokens.css 的变量；必要时用 --write 收紧基线。')
  process.exit(1)
}
console.log('\nUI 规范检查通过。')
