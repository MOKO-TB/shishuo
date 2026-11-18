import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

export const SESSION_COOKIE = 'shishuo_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$')
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltText, hashText] = String(stored).split('$')
    if (scheme !== 'scrypt' || !saltText || !hashText) return false
    const expected = Buffer.from(hashText, 'base64url')
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function newId(prefix) {
  return `${prefix}_${randomBytes(10).toString('hex')}`
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function parseCookies(header = '') {
  const map = new Map()
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      map.set(key, decodeURIComponent(value))
    } catch {
      map.set(key, value)
    }
  }
  return map
}

export function sessionTokenFromRequest(req) {
  return parseCookies(req.headers.cookie).get(SESSION_COOKIE) ?? ''
}

export function sessionCookie(token, { secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function expiredSessionCookie({ secure = false } = {}) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function createSession(db, userId) {
  const token = newSessionToken()
  const now = Date.now()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(hashToken(token), userId, now, now + SESSION_TTL_MS)
  return token
}

export function deleteSession(db, token) {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

export function userForRequest(db, req) {
  const token = sessionTokenFromRequest(req)
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.profile_json, u.courses_json, u.is_admin, u.created_at, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(hashToken(token))
  if (!row) return null
  if (Number(row.expires_at) <= Date.now()) {
    deleteSession(db, token)
    return null
  }
  return row
}

export function publicUser(row) {
  let profile = null
  if (row.profile_json) {
    try {
      profile = JSON.parse(row.profile_json)
    } catch {
      profile = null
    }
  }
  let courses = []
  if (row.courses_json) {
    try {
      const parsed = JSON.parse(row.courses_json)
      courses = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
    } catch {
      courses = []
    }
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    profile,
    courses,
    isAdmin: Boolean(row.is_admin),
    createdAt: Number(row.created_at),
  }
}
