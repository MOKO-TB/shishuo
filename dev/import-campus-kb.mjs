#!/usr/bin/env node
/**
 * 把引路学长 kb/knowledge.json 转成师说的校园知识卡数据文件。
 *
 * 用法：
 *   node dev/import-campus-kb.mjs /path/to/yinlu-xuezhang/kb/knowledge.json
 *
 * 只读取源 JSON，生成 src/data/campusKb.ts；不修改源仓库。
 * 源数据：MOKO-TB/yinlu-xuezhang（MIT License, Copyright (c) 2026 MOKO-TB）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COLLECTED_AT = '2026-10-31'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = process.argv[2]

if (!sourcePath) {
  console.error('用法: node dev/import-campus-kb.mjs <knowledge.json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))
if (!Array.isArray(raw)) throw new Error('knowledge.json 顶层必须是数组')

const seen = new Set()
const cards = raw.map((card, index) => {
  if (!card || typeof card !== 'object') throw new Error(`第 ${index + 1} 条不是对象`)
  for (const key of ['id', 'category', 'title', 'content']) {
    if (typeof card[key] !== 'string' || !card[key].trim()) {
      throw new Error(`第 ${index + 1} 条缺少 ${key}`)
    }
  }
  if (!Array.isArray(card.tags)) throw new Error(`${card.id} 的 tags 不是数组`)
  const id = card.id.trim()
  if (seen.has(id)) throw new Error(`重复的知识卡 ID：${id}`)
  seen.add(id)
  return {
    id,
    category: card.category.trim(),
    title: card.title.trim(),
    content: card.content.trim(),
    tags: card.tags.map((tag) => String(tag).trim()).filter(Boolean),
    sourceChannel: String(card.source_channel ?? '').trim(),
    sourceUrl: String(card.source_url ?? '').trim(),
    credibility: String(card.credibility ?? '').trim(),
    collectedAt: COLLECTED_AT,
  }
})

const categories = [...new Set(cards.map((card) => card.category))]
const categoryCounts = Object.fromEntries(
  categories.map((category) => [category, cards.filter((card) => card.category === category).length]),
)
const credibilityCounts = Object.fromEntries(
  [...new Set(cards.map((card) => card.credibility))].map((credibility) => [
    credibility,
    cards.filter((card) => card.credibility === credibility).length,
  ]),
)
const withoutUrl = cards.filter((card) => !card.sourceUrl).length

const quote = (value) => JSON.stringify(value)
const lines = cards
  .map(
    (card) => `  {
    id: ${quote(card.id)},
    category: ${quote(card.category)},
    title: ${quote(card.title)},
    content: ${quote(card.content)},
    tags: [${card.tags.map(quote).join(', ')}],
    sourceChannel: ${quote(card.sourceChannel)},
    sourceUrl: ${quote(card.sourceUrl)},
    credibility: ${quote(card.credibility)},
    collectedAt: ${quote(card.collectedAt)},
  },`,
  )
  .join('\n')

const output = `/**
 * 校园知识卡（数据来自引路学长）。
 *
 * 来源：MOKO-TB/yinlu-xuezhang 的 kb/knowledge.json
 * 许可：MIT License，Copyright (c) 2026 MOKO-TB
 * 采集：${COLLECTED_AT}
 *
 * 注意：${withoutUrl} / ${cards.length} 条没有 source_url，${credibilityCounts['D-待核实'] ?? 0} 条标记为「待核实」。
 * 展示时必须保留可信度与来源，不要把校园经验卡包装成官方结论。
 *
 * 本文件由 dev/import-campus-kb.mjs 生成，请勿手改。
 */

export const CAMPUS_KB_COLLECTED_AT = ${quote(COLLECTED_AT)}

export interface CampusCard {
  id: string
  category: string
  title: string
  content: string
  tags: string[]
  sourceChannel: string
  sourceUrl: string
  credibility: string
  collectedAt: string
}

export const CAMPUS_CARDS: CampusCard[] = [
${lines}
]

export const CAMPUS_CATEGORIES = ${JSON.stringify(categories)} as const

export const CAMPUS_CATEGORY_COUNTS: Record<string, number> = ${JSON.stringify(categoryCounts)}

export const CAMPUS_CREDIBILITY_COUNTS: Record<string, number> = ${JSON.stringify(credibilityCounts)}
`

writeFileSync(resolve(root, 'src/data/campusKb.ts'), output, 'utf8')

console.log(`已生成 src/data/campusKb.ts：${cards.length} 条`)
console.log('分类：', categoryCounts)
console.log('可信度：', credibilityCounts)
console.log(`缺少 source_url：${withoutUrl} 条`)
