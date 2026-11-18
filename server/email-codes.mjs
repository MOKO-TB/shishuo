import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { newId } from './auth.mjs'

const PURPOSES = new Set(['register', 'reset'])
const WINDOW_MS = 15 * 60_000
const sendAttempts = new Map()

export function validPurpose(purpose) {
  return PURPOSES.has(purpose)
}

function codeHash(config, email, purpose, code) {
  return createHmac('sha256', config.authSecret)
    .update(`${email.toLowerCase()}:${purpose}:${code}`)
    .digest('hex')
}

export function recentCodeAt(db, email, purpose) {
  const row = db
    .prepare(
      `SELECT created_at FROM email_codes
        WHERE email = ? AND purpose = ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(email.toLowerCase(), purpose)
  return row ? Number(row.created_at) : 0
}

export function checkSendRate(req, email, purpose, config) {
  const ip = req.socket.remoteAddress || 'unknown'
  const key = `${ip}:${purpose}:${email.toLowerCase()}`
  const now = Date.now()
  const list = (sendAttempts.get(key) ?? []).filter((ts) => now - ts < WINDOW_MS)
  if (list.length >= config.mail.maxSendsPerWindow) {
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - list[0])) / 1000) }
  }
  const last = list.at(-1) ?? 0
  if (last && now - last < config.mail.resendCooldownMs) {
    return { ok: false, retryAfter: Math.ceil((config.mail.resendCooldownMs - (now - last)) / 1000) }
  }
  list.push(now)
  sendAttempts.set(key, list)
  return { ok: true, retryAfter: 0 }
}

export function issueEmailCode(db, config, { email, purpose }) {
  const normalized = email.toLowerCase()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const now = Date.now()
  db.prepare(
    'DELETE FROM email_codes WHERE created_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)',
  ).run(now - 24 * 60 * 60_000, now - 24 * 60 * 60_000)
  db.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ? AND consumed_at IS NULL').run(
    normalized,
    purpose,
  )
  const id = newId('code')
  db.prepare(
    `INSERT INTO email_codes
       (id, email, purpose, code_hash, expires_at, attempts, created_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, NULL)`,
  ).run(id, normalized, purpose, codeHash(config, normalized, purpose, code), now + config.mail.codeTtlMs, now)
  return { id, code, expiresAt: now + config.mail.codeTtlMs }
}

export function deleteEmailCode(db, id) {
  db.prepare('DELETE FROM email_codes WHERE id = ?').run(id)
}

export function verifyEmailCode(db, config, { email, purpose, code }) {
  const normalized = email.toLowerCase()
  const normalizedCode = String(code ?? '').trim()
  if (!/^\d{6}$/.test(normalizedCode)) return { ok: false, reason: 'invalid' }
  const row = db
    .prepare(
      `SELECT id, code_hash, attempts, expires_at FROM email_codes
        WHERE email = ? AND purpose = ? AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(normalized, purpose)
  if (!row) return { ok: false, reason: 'missing' }
  if (Number(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id)
    return { ok: false, reason: 'expired' }
  }
  if (Number(row.attempts) >= config.mail.maxAttempts) {
    db.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id)
    return { ok: false, reason: 'attempts' }
  }
  const expected = Buffer.from(row.code_hash, 'hex')
  const actual = Buffer.from(codeHash(config, normalized, purpose, normalizedCode), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    const attempts = Number(row.attempts) + 1
    if (attempts >= config.mail.maxAttempts) {
      db.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id)
    } else {
      db.prepare('UPDATE email_codes SET attempts = ? WHERE id = ?').run(attempts, row.id)
    }
    return { ok: false, reason: attempts >= config.mail.maxAttempts ? 'attempts' : 'invalid' }
  }
  db.prepare('UPDATE email_codes SET consumed_at = ? WHERE id = ?').run(Date.now(), row.id)
  return { ok: true }
}
