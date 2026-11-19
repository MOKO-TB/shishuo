import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword } from './auth.mjs'
import { ensureModerationSeed } from './moderation.mjs'

export const WORKSPACE_ID = 'pilot'

export function openDatabase(dbPath) {
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      password_hash TEXT NOT NULL,
      profile_json TEXT NOT NULL DEFAULT '{}',
      courses_json TEXT NOT NULL DEFAULT '[]',
      is_admin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      status_reason TEXT,
      status_until INTEGER,
      status_updated_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      data_json TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage(user_id, created_at);

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_uploads_user_time ON uploads(user_id, created_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revision INTEGER NOT NULL DEFAULT 0,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      actions_json TEXT NOT NULL DEFAULT '[]',
      course_ids_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL,
      mode TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

    CREATE TABLE IF NOT EXISTS email_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      consumed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_email_codes_lookup
      ON email_codes(email, purpose, created_at);

    CREATE TABLE IF NOT EXISTS workspace_entities (
      workspace_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      course_id TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_entities_scope
      ON workspace_entities(workspace_id, entity_type, course_id);

    CREATE TABLE IF NOT EXISTS archived_threads (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL DEFAULT '',
      archived_at INTEGER NOT NULL,
      thread_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_archived_threads_time ON archived_threads(archived_at);

    CREATE TABLE IF NOT EXISTS moderation_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL UNIQUE COLLATE NOCASE,
      category TEXT NOT NULL DEFAULT '通用',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_terms_enabled
      ON moderation_terms(enabled);

    CREATE TABLE IF NOT EXISTS moderation_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      thread_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      UNIQUE(kind, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_reviews_kind
      ON moderation_reviews(kind, status);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS chaoxing_accounts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      connected INTEGER NOT NULL DEFAULT 0,
      last_sync_at INTEGER,
      last_error TEXT,
      cookies_json TEXT,
      ua TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chaoxing_courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      cpi TEXT NOT NULL,
      name TEXT NOT NULL,
      teacher TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      selected INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chaoxing_courses_user
      ON chaoxing_courses(user_id, selected);

    CREATE TABLE IF NOT EXISTS chaoxing_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_pk TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('assignment', 'material', 'message')),
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      due_at INTEGER,
      published_at INTEGER,
      read_at INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, kind, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_chaoxing_items_user
      ON chaoxing_items(user_id, kind, created_at DESC);

    CREATE TABLE IF NOT EXISTS chaoxing_chapters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_pk TEXT NOT NULL,
      chapter_no TEXT NOT NULL DEFAULT '',
      chapter_title TEXT NOT NULL DEFAULT '',
      section_no TEXT NOT NULL DEFAULT '',
      section_title TEXT NOT NULL,
      task_count INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, course_pk, section_no, section_title)
    );

    CREATE INDEX IF NOT EXISTS idx_chaoxing_chapters_user
      ON chaoxing_chapters(user_id, course_pk, done);
  `)
  try {
    const columns = db.prepare('PRAGMA table_info(users)').all()
    if (!columns.some((column) => column.name === 'courses_json')) {
      db.exec("ALTER TABLE users ADD COLUMN courses_json TEXT NOT NULL DEFAULT '[]'")
    }
    if (!columns.some((column) => column.name === 'is_admin')) {
      db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
    }
    if (!columns.some((column) => column.name === 'status')) {
      db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
    }
    if (!columns.some((column) => column.name === 'status_reason')) {
      db.exec('ALTER TABLE users ADD COLUMN status_reason TEXT')
    }
    if (!columns.some((column) => column.name === 'status_until')) {
      db.exec('ALTER TABLE users ADD COLUMN status_until INTEGER')
    }
    if (!columns.some((column) => column.name === 'status_updated_at')) {
      db.exec('ALTER TABLE users ADD COLUMN status_updated_at INTEGER')
    }
    const cxColumns = db.prepare('PRAGMA table_info(chaoxing_accounts)').all()
    if (!cxColumns.some((column) => column.name === 'cookies_json')) {
      db.exec('ALTER TABLE chaoxing_accounts ADD COLUMN cookies_json TEXT')
    }
    if (!cxColumns.some((column) => column.name === 'ua')) {
      db.exec('ALTER TABLE chaoxing_accounts ADD COLUMN ua TEXT')
    }
  } catch {
    // Very old SQLite builds may reject PRAGMA via prepare; the fresh schema still works.
  }
  ensureModerationSeed(db)
  db.prepare(
    'INSERT OR IGNORE INTO workspaces (id, data_json, revision, updated_at) VALUES (?, NULL, 0, ?)',
  ).run(WORKSPACE_ID, Date.now())
  return db
}

const DEMO_USERS = [
  {
    id: 'lin-xiao',
    email: 'student@shishuo.local',
    name: '林晓',
    role: 'student',
    passwordKey: 'demoStudentPassword',
    profile: { college: '计算机学院 · 2024 级', major: '计算机科学与技术', defaultCourseId: 'ds' },
    courses: [],
  },
  {
    id: 'zhou-ke',
    email: 'student2@shishuo.local',
    name: '周可',
    role: 'student',
    passwordKey: 'demoStudentPassword',
    profile: { college: '电子信息学院 · 2024 级', major: '电子信息工程', defaultCourseId: 'circuit' },
    courses: [],
  },
  {
    id: 'teacher-chen-yan',
    email: 'teacher@shishuo.local',
    name: '陈砚',
    role: 'teacher',
    passwordKey: 'demoTeacherPassword',
    profile: null,
    courses: ['ds'],
  },
  {
    id: 'teacher-li-yun',
    email: 'teacher.math@shishuo.local',
    name: '李芸',
    role: 'teacher',
    passwordKey: 'demoTeacherPassword',
    profile: null,
    courses: ['math'],
  },
  {
    id: 'teacher-shi-yan',
    email: 'teacher.circuit@shishuo.local',
    name: '石岩',
    role: 'teacher',
    passwordKey: 'demoTeacherPassword',
    profile: null,
    courses: ['circuit'],
  },
  {
    id: 'teacher-lu-heng',
    email: 'teacher.analog@shishuo.local',
    name: '陆衡',
    role: 'teacher',
    passwordKey: 'demoTeacherPassword',
    profile: null,
    courses: ['analog'],
  },
  {
    id: 'teacher-gu-ming',
    email: 'teacher.digital@shishuo.local',
    name: '顾明',
    role: 'teacher',
    passwordKey: 'demoTeacherPassword',
    profile: null,
    courses: ['digital'],
  },
]

export function seedDemoAccounts(db, config) {
  if (!config.demoAccounts) return []
  const inserted = []
  const findUser = db.prepare('SELECT id, courses_json FROM users WHERE email = ? OR id = ?')
  const insertUser = db.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, profile_json, courses_json, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const fillCourses = db.prepare(
    `UPDATE users SET courses_json = ?
      WHERE id = ? AND (courses_json IS NULL OR courses_json = '' OR courses_json = '[]')`,
  )
  const promoteAdmin = db.prepare(
    'UPDATE users SET is_admin = 1 WHERE id = ? AND is_admin = 0',
  )
  for (const account of DEMO_USERS) {
    const existing = findUser.get(account.email, account.id)
    if (existing) {
      if (account.courses.length > 0) {
        fillCourses.run(JSON.stringify(account.courses), existing.id)
      }
      if (account.isAdmin) promoteAdmin.run(existing.id)
      continue
    }
    insertUser.run(
      account.id,
      account.email,
      account.name,
      account.role,
      hashPassword(config[account.passwordKey] || 'shishuo-demo'),
      JSON.stringify(account.profile ?? {}),
      JSON.stringify(account.courses ?? []),
      account.isAdmin ? 1 : 0,
      Date.now(),
    )
    inserted.push(account.email)
  }
  return inserted
}

export function seedAdminAccount(db, config) {
  const email = String(config.adminEmail || '').trim().toLowerCase()
  if (!email) return { created: false, reason: 'missing-email' }
  const name = String(config.adminName || '系统管理员').trim() || '系统管理员'
  const password = String(config.adminPassword || 'admin123')
  const existing = db.prepare('SELECT id, email, is_admin FROM users WHERE email = ?').get(email)

  let created = false
  if (!existing) {
    const idTaken = db.prepare('SELECT id, email FROM users WHERE id = ?').get('admin-system')
    if (idTaken && String(idTaken.email).toLowerCase() !== email) {
      return { created: false, reason: 'id-taken' }
    }
    db.prepare(
      `INSERT INTO users
         (id, email, name, role, password_hash, profile_json, courses_json, is_admin, created_at)
       VALUES (?, ?, ?, 'teacher', ?, '{}', '[]', 1, ?)`,
    ).run('admin-system', email, name, hashPassword(password), Date.now())
    created = true
  } else if (existing.id === 'admin-system' && !existing.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id)
  }

  // 旧版本把演示教师 teacher@shishuo.local 当成管理员；独立管理员上线后收回这个权限。
  db.prepare(
    "UPDATE users SET is_admin = 0 WHERE id = 'teacher-chen-yan' AND lower(email) <> ?",
  ).run(email)

  return { created, reason: existing ? 'existing' : 'created' }
}

export function demoAccountSummary(config) {
  if (!config.demoAccounts) return []
  return DEMO_USERS.map((account) => ({
    role: account.role,
    email: account.email,
    password: config[account.passwordKey] || 'shishuo-demo',
    name: account.name,
    isAdmin: Boolean(account.isAdmin),
  }))
}
