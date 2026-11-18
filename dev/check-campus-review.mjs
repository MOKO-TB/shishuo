#!/usr/bin/env node
/**
 * 校园内容复核报告（可给 cron / systemd timer 调用）。
 *
 * 用法：
 *   node dev/check-campus-review.mjs --db /opt/shishuo/data/shishuo.db
 *
 * 有未核实或已过期内容时退出码为 1，便于外部告警。
 */
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { campusReviewSummary } from '../server/campus-review.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const index = process.argv.indexOf('--db')
const dbPath = resolve(root, index >= 0 ? process.argv[index + 1] : 'data/shishuo.db')

const db = new DatabaseSync(dbPath, { readOnly: true })
try {
  const row = db.prepare('SELECT data_json, revision FROM workspaces WHERE id = ?').get('pilot')
  if (!row?.data_json) throw new Error('工作区没有初始化')
  const data = JSON.parse(row.data_json)
  const { summary, items } = campusReviewSummary(data)
  console.log(`校园内容复核 · revision ${row.revision}`)
  console.log(
    `总计 ${summary.total} · 待核实 ${summary.unverified} · 已过期 ${summary.overdue} · 14 天内到期 ${summary.soon} · 正常 ${summary.ok}`,
  )
  const due = items.filter((item) => item.status !== 'ok').slice(0, 20)
  if (due.length > 0) {
    console.log('\n需要处理（最多 20 条）：')
    for (const item of due) {
      const next = item.nextReviewAt ? new Date(item.nextReviewAt).toISOString().slice(0, 10) : '—'
      console.log(`  [${item.status}] ${item.id} · ${item.question} · 下次 ${next}`)
    }
  }
  process.exitCode = summary.unverified + summary.overdue > 0 ? 1 : 0
} finally {
  db.close()
}
