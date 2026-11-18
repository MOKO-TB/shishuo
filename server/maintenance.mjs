/**
 * 工作区实体镜像与归档维护。
 *
 * data_json 仍是同步协议的权威来源；workspace_entities 把
 * 问答 / FAQ / 通知 / 课程公告拆成行存储，方便 SQL 查询与后续动作 API 迁移。
 * archived_threads 保存归档前的问答原文，长期留证。
 */
import { WORKSPACE_ID } from './db.mjs'
import { recordAudit } from './audit.mjs'

function entityRows(data) {
  const rows = []
  for (const thread of data.threads ?? []) {
    if (!thread?.id) continue
    rows.push([
      'thread',
      thread.id,
      thread.courseId ?? '',
      thread.student?.id ?? '',
      thread.status ?? '',
      thread,
    ])
  }
  for (const faq of data.faqs ?? []) {
    if (!faq?.id) continue
    rows.push([
      'faq',
      faq.id,
      faq.courseId ?? '',
      '',
      faq.reviewNeeded ? 'review' : 'active',
      faq,
    ])
  }
  for (const note of data.courseNotes ?? []) {
    if (!note?.courseId) continue
    rows.push(['courseNote', note.courseId, note.courseId, '', '', note])
  }
  for (const notification of data.notifications ?? []) {
    if (!notification?.id) continue
    rows.push([
      'notification',
      notification.id,
      notification.courseId ?? '',
      notification.recipientId ?? '',
      notification.kind ?? '',
      notification,
    ])
  }
  return rows
}

function writeEntityRows(db, data, now) {
  db.prepare('DELETE FROM workspace_entities WHERE workspace_id = ?').run(WORKSPACE_ID)
  const insert = db.prepare(
    `INSERT INTO workspace_entities
       (workspace_id, entity_type, entity_id, course_id, owner_id, status, updated_at, data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const [type, id, courseId, ownerId, status, entity] of entityRows(data)) {
    insert.run(WORKSPACE_ID, type, id, courseId, ownerId, status, now, JSON.stringify(entity))
  }
}

/** 把工作区当前实体整体镜像进 workspace_entities（事务内替换）。 */
export function syncWorkspaceEntities(db, data, now = Date.now()) {
  db.exec('BEGIN')
  try {
    writeEntityRows(db, data, now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/**
 * 归档「早已结束」的问答：resolved / withdrawn 且结束时间早于阈值。
 * 移出工作区 JSON 写入 archived_threads，revision 乐观锁 +1，并写审计。
 */
export function archiveOldThreads(
  db,
  { olderThanMs = 90 * 86_400_000, now = Date.now() } = {},
) {
  const row = db
    .prepare('SELECT data_json, revision FROM workspaces WHERE id = ?')
    .get(WORKSPACE_ID)
  const data = row?.data_json ? JSON.parse(row.data_json) : null
  const revision = Number(row?.revision ?? 0)
  if (!data) return { archived: 0, revision }

  const cutoff = now - olderThanMs
  const keep = []
  const moving = []
  for (const thread of data.threads ?? []) {
    const closedAt = Number(thread.resolvedAt ?? thread.withdrawnAt ?? 0)
    const oldEnough =
      closedAt > 0 && closedAt < cutoff && Number(thread.createdAt ?? now) < cutoff
    if (oldEnough) moving.push(thread)
    else keep.push(thread)
  }
  if (moving.length === 0) return { archived: 0, revision }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO archived_threads
       (id, course_id, owner_id, question, archived_at, thread_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const next = { ...data, threads: keep }
  db.exec('BEGIN')
  try {
    for (const thread of moving) {
      insert.run(
        thread.id,
        thread.courseId ?? '',
        thread.student?.id ?? '',
        String(thread.question ?? '').slice(0, 200),
        now,
        JSON.stringify(thread),
      )
    }
    const result = db
      .prepare(
        `UPDATE workspaces
            SET data_json = ?, revision = revision + 1, updated_at = ?, updated_by = 'maintenance'
          WHERE id = ? AND revision = ?`,
      )
      .run(JSON.stringify(next), now, WORKSPACE_ID, revision)
    if (Number(result.changes) === 0) {
      db.exec('ROLLBACK')
      return { archived: 0, revision, conflict: true }
    }
    writeEntityRows(db, next, now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const nextRevision = revision + 1
  recordAudit(db, {
    user: { id: 'maintenance', name: '维护脚本', role: 'teacher' },
    revision: nextRevision,
    action: 'archived-threads',
    actions: ['archived-threads'],
    summary: `归档了 ${moving.length} 条超过 ${Math.round(olderThanMs / 86_400_000)} 天的已结束问答`,
    courseIds: Array.from(new Set(moving.map((thread) => thread.courseId ?? ''))),
    mode: 'maintenance',
  })
  return { archived: moving.length, revision: nextRevision }
}

export function listArchivedThreads(db, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  return db
    .prepare(
      `SELECT id, course_id, owner_id, question, archived_at, thread_json
         FROM archived_threads
        ORDER BY archived_at DESC, id DESC
        LIMIT ?`,
    )
    .all(safeLimit)
    .map((row) => ({
      id: row.id,
      courseId: row.course_id,
      ownerId: row.owner_id,
      question: row.question,
      archivedAt: row.archived_at,
      thread: JSON.parse(row.thread_json),
    }))
}
