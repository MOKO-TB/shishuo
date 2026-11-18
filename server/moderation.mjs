/**
 * 内容风控：敏感词、用户禁言/封禁、内容与图片审核。
 *
 * 说明：
 * - 敏感词存在 SQLite moderation_terms，管理员可在管理台增删；
 * - 用户状态存在 users.status/status_reason/status_until；
 * - 图片审核是「事后审核」：上传先落对象存储，管理员在管理台通过或撤下。
 *   如需前置自动审核，可在 saveUpload 后接入外部内容安全 API（见 docs/admin-console.md）。
 */
import { HttpError } from './http-error.mjs'

const TERM_MAX = 50
const CATEGORY_MAX = 30

/** 首次建库时写入的基础词；管理员可以删除或补充。 */
const SEED_TERMS = [
  ['代写', '学术不端'],
  ['代考', '学术不端'],
  ['校园贷', '金融风险'],
  ['赌博', '违法违规'],
  ['博彩', '违法违规'],
  ['刷单', '诈骗风险'],
  ['裸聊', '低俗色情'],
  ['约炮', '低俗色情'],
]

export function ensureModerationSeed(db) {
  const count = Number(
    db.prepare('SELECT COUNT(*) AS n FROM moderation_terms').get()?.n ?? 0,
  )
  if (count > 0) return
  const insert = db.prepare(
    `INSERT OR IGNORE INTO moderation_terms (term, category, enabled, created_by, created_at)
     VALUES (?, ?, 1, 'system', ?)`,
  )
  const now = Date.now()
  for (const [term, category] of SEED_TERMS) insert.run(term, category, now)
}

export function normalizeTerm(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

export function normalizeText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '')
}

export function listTerms(db) {
  return db
    .prepare(
      `SELECT id, term, category, enabled, created_by, created_at
         FROM moderation_terms
        ORDER BY enabled DESC, created_at DESC, id DESC`,
    )
    .all()
    .map((row) => ({
      id: Number(row.id),
      term: String(row.term),
      category: String(row.category ?? ''),
      enabled: Boolean(row.enabled),
      createdBy: String(row.created_by ?? ''),
      createdAt: Number(row.created_at),
    }))
}

export function activeTerms(db) {
  return db
    .prepare('SELECT term FROM moderation_terms WHERE enabled = 1 ORDER BY length(term) DESC')
    .all()
    .map((row) => String(row.term))
}

export function addTerm(db, { term, category = '通用', createdBy = '' }) {
  const cleaned = String(term ?? '').trim()
  if (cleaned.length < 2 || cleaned.length > TERM_MAX) {
    throw new HttpError(400, `敏感词长度需要在 2–${TERM_MAX} 个字符之间。`)
  }
  const normalized = normalizeTerm(cleaned)
  const existing = db
    .prepare('SELECT id FROM moderation_terms WHERE lower(term) = ?')
    .get(normalized)
  if (existing) throw new HttpError(409, '这个敏感词已经存在。')
  const result = db
    .prepare(
      `INSERT INTO moderation_terms (term, category, enabled, created_by, created_at)
       VALUES (?, ?, 1, ?, ?)`,
    )
    .run(
      cleaned,
      String(category ?? '通用').trim().slice(0, CATEGORY_MAX) || '通用',
      String(createdBy ?? '').slice(0, 200),
      Date.now(),
    )
  return listTerms(db).find((item) => item.id === Number(result.lastInsertRowid))
}

export function deleteTerm(db, id) {
  const numeric = Number(id)
  if (!Number.isInteger(numeric) || numeric <= 0) throw new HttpError(400, '敏感词 ID 不合法。')
  const result = db.prepare('DELETE FROM moderation_terms WHERE id = ?').run(numeric)
  if (Number(result.changes) === 0) throw new HttpError(404, '敏感词不存在。')
}

export function findBlockedTerm(text, terms) {
  const normalized = normalizeText(text)
  if (!normalized) return null
  for (const term of terms) {
    const needle = normalizeTerm(term)
    if (needle && normalized.includes(needle)) return term
  }
  return null
}

/** 扫描一条问答里学生可写的所有文本，返回命中的第一个敏感词。 */
export function findBlockedTermInThread(thread, terms) {
  if (!thread || typeof thread !== 'object') return null
  const fields = [
    thread.question,
    thread.attachment?.name,
    thread.escalation?.title,
    thread.escalation?.note,
    thread.studentSupplement?.text,
  ]
  for (const field of fields) {
    const match = findBlockedTerm(field ?? '', terms)
    if (match) return match
  }
  return null
}

export function effectiveUserStatus(row, now = Date.now()) {
  const status = String(row?.status ?? 'active')
  const until = row?.status_until == null ? null : Number(row.status_until)
  if (status === 'muted' && until && until <= now) {
    return { status: 'active', reason: '', until: null }
  }
  if (!['active', 'muted', 'banned'].includes(status)) {
    return { status: 'active', reason: '', until: null }
  }
  return {
    status,
    reason: String(row?.status_reason ?? ''),
    until,
  }
}

export function assertUserCanWrite(user, action = 'post', now = Date.now()) {
  const status = effectiveUserStatus(user, now)
  if (status.status === 'banned') {
    throw new HttpError(403, '账号已被封禁，不能发布内容。请联系管理员。')
  }
  if (action === 'post' && status.status === 'muted') {
    const untilText = status.until
      ? `到 ${new Date(status.until).toLocaleString('zh-CN')}`
      : ''
    throw new HttpError(403, `账号已被禁言${untilText}，暂时不能发布内容。`)
  }
  return status
}

export function listReviews(db, kind) {
  const rows = db
    .prepare(
      `SELECT id, kind, target_id, thread_id, status, reason, reviewed_by, created_at, reviewed_at
         FROM moderation_reviews
        WHERE kind = ?
        ORDER BY reviewed_at DESC, created_at DESC`,
    )
    .all(kind)
  return rows.map((row) => ({
    id: Number(row.id),
    kind: String(row.kind),
    targetId: String(row.target_id),
    threadId: String(row.thread_id ?? ''),
    status: String(row.status),
    reason: String(row.reason ?? ''),
    reviewedBy: String(row.reviewed_by ?? ''),
    createdAt: Number(row.created_at),
    reviewedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
  }))
}

export function reviewFor(db, kind, targetId) {
  const row = db
    .prepare(
      `SELECT status, reason, reviewed_by, reviewed_at
         FROM moderation_reviews WHERE kind = ? AND target_id = ?`,
    )
    .get(kind, targetId)
  if (!row) return { status: 'pending', reason: '', reviewedBy: '', reviewedAt: null }
  return {
    status: String(row.status),
    reason: String(row.reason ?? ''),
    reviewedBy: String(row.reviewed_by ?? ''),
    reviewedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
  }
}

export function upsertReview(
  db,
  { kind, targetId, threadId = '', status, reason = '', reviewer = '' },
) {
  const now = Date.now()
  db.prepare(
    `INSERT INTO moderation_reviews
       (kind, target_id, thread_id, status, reason, reviewed_by, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, target_id) DO UPDATE SET
       thread_id = excluded.thread_id,
       status = excluded.status,
       reason = excluded.reason,
       reviewed_by = excluded.reviewed_by,
       reviewed_at = excluded.reviewed_at`,
  ).run(kind, String(targetId), String(threadId), status, String(reason).slice(0, 500), reviewer, now, now)
}
