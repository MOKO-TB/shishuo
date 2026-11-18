/**
 * 工作区维护：归档 N 天前已结束（已解决 / 已撤下）的问答，并补齐实体镜像。
 *
 * 运行：npm run maintain:archive
 * 环境变量：SHISHUO_DB（默认 data/shishuo.db）、ARCHIVE_DAYS（默认 90）
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase, WORKSPACE_ID } from '../server/db.mjs'
import { archiveOldThreads, syncWorkspaceEntities } from '../server/maintenance.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.env.SHISHUO_DB || path.join(ROOT, 'data', 'shishuo.db')
const days = Math.max(1, Number(process.env.ARCHIVE_DAYS ?? 90) || 90)

const db = openDatabase(dbPath)
try {
  const row = db.prepare('SELECT data_json FROM workspaces WHERE id = ?').get(WORKSPACE_ID)
  if (row?.data_json) {
    // 顺手把实体镜像补齐（老库第一次运行时）。
    syncWorkspaceEntities(db, JSON.parse(row.data_json))
  }
  const result = archiveOldThreads(db, { olderThanMs: days * 86_400_000 })
  if (result.conflict) {
    console.error('归档时工作区刚好被其他写入抢先，请重试。')
    process.exitCode = 1
  } else if (result.archived > 0) {
    console.log(
      `已归档 ${result.archived} 条（结束于 ${days} 天前的问答），工作区 revision=${result.revision}。原文留在 archived_threads。`,
    )
  } else {
    console.log(`没有需要归档的问答（阈值：结束于 ${days} 天前）。`)
  }
} finally {
  db.close()
}
