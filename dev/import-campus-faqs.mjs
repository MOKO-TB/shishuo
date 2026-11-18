#!/usr/bin/env node
/**
 * 把校园 FAQ 幂等导入现有工作区（workspaces.data_json）。
 *
 * 默认 dry-run；--apply 才写入。
 *
 * 用法：
 *   node dev/import-campus-faqs.mjs --db data/shishuo.db
 *   node dev/import-campus-faqs.mjs --db data/shishuo.db --apply --backup-dir data/backups
 *
 * 生产：
 *   node dev/import-campus-faqs.mjs --db /opt/shishuo/data/shishuo.db \
 *     --apply --backup-dir /opt/shishuo/backups
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncWorkspaceEntities } from '../server/maintenance.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值`)
  return value
}

const dbPath = resolve(root, arg('--db', 'data/shishuo.db'))
const sourcePath = resolve(root, arg('--file', 'server/data/campus-faqs.json'))
const apply = process.argv.includes('--apply')
const backupDir = arg('--backup-dir', '')
const workspaceId = arg('--workspace', 'pilot')

const faqs = JSON.parse(readFileSync(sourcePath, 'utf8'))
if (!Array.isArray(faqs) || faqs.length === 0) throw new Error('校园 FAQ 数据为空')
for (const faq of faqs) {
  if (!faq?.id || faq.courseId !== 'campus') throw new Error(`非校园 FAQ：${faq?.id ?? '?'}`)
}

const db = new DatabaseSync(dbPath)
try {
  const row = db.prepare('SELECT data_json, revision FROM workspaces WHERE id = ?').get(workspaceId)
  if (!row?.data_json) throw new Error(`工作区 ${workspaceId} 没有 data_json`)
  const data = JSON.parse(row.data_json)
  if (!Array.isArray(data.faqs)) throw new Error('工作区 faqs 不是数组')

  const existing = new Set(data.faqs.map((faq) => faq.id))
  const missing = faqs.filter((faq) => !existing.has(faq.id))

  console.log(`数据库：${dbPath}`)
  console.log(`工作区：${workspaceId} · revision ${row.revision} · 现有 FAQ ${data.faqs.length} 条`)
  console.log(`校园 FAQ 源：${faqs.length} 条 · 待导入 ${missing.length} 条`)
  if (missing.length > 0) {
    console.log('待导入 ID：', missing.slice(0, 8).map((faq) => faq.id).join(', '), missing.length > 8 ? '…' : '')
  }

  if (!apply || missing.length === 0) {
    console.log(apply ? '没有需要导入的 FAQ，未写入。' : 'dry-run：加 --apply 才会写入。')
    process.exitCode = 0
  } else {
    if (backupDir) {
      const dir = resolve(root, backupDir)
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backup = resolve(dir, `campus-import-${stamp}.db`)
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
      console.log(`已备份：${backup}`)
    }

    const next = { ...data, faqs: [...missing, ...data.faqs] }
    db.prepare(
      'UPDATE workspaces SET data_json = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ?',
    ).run(JSON.stringify(next), Date.now(), 'campus-import', workspaceId)
    syncWorkspaceEntities(db, next)
    console.log(`已写入：新增 ${missing.length} 条，FAQ 总数 ${next.faqs.length} 条，revision +1`)
  }
} finally {
  db.close()
}
