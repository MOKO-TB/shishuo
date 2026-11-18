/**
 * AI 网关配置：数据库优先，环境变量兜底。
 *
 * 管理员在 /admin/ 写入 apiKey/baseUrl/model/额度；学生和教师的 AI 调用都走
 * 服务端解析后的配置。API 永远不会返回完整 Key，只返回掩码。
 *
 * 注意：Key 存在 app_settings 表里，数据库备份等同于包含 Key；.env 仍可兜底。
 */
const SETTING_KEY = 'ai_gateway'

function parse(value) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

export function readStoredAiSettings(db) {
  const row = db
    .prepare('SELECT value_json, updated_at, updated_by FROM app_settings WHERE key = ?')
    .get(SETTING_KEY)
  const value = parse(row?.value_json ?? '{}')
  return {
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    model: typeof value.model === 'string' ? value.model : '',
    dailyLimitStudent: positiveNumber(value.dailyLimitStudent),
    dailyLimitTeacher: positiveNumber(value.dailyLimitTeacher),
    enabled: value.enabled !== false,
    updatedAt: row?.updated_at == null ? null : Number(row.updated_at),
    updatedBy: typeof row?.updated_by === 'string' ? row.updated_by : '',
  }
}

/** 合并数据库配置与环境变量默认值；数据库只要有 Key 且启用就视为已配置。 */
export function resolveAiConfig(db, baseConfig) {
  const stored = readStoredAiSettings(db)
  const apiKey = stored.apiKey || baseConfig.apiKey || ''
  const baseUrl = (stored.baseUrl || baseConfig.baseUrl || '').replace(/\/+$/, '')
  const model = stored.model || baseConfig.model
  return {
    ...baseConfig,
    apiKey,
    baseUrl,
    model,
    dailyLimitStudent: stored.dailyLimitStudent || baseConfig.dailyLimitStudent,
    dailyLimitTeacher: stored.dailyLimitTeacher || baseConfig.dailyLimitTeacher,
    enabled: stored.enabled,
    configured: Boolean(apiKey) && stored.enabled,
    source: stored.apiKey ? 'database' : baseConfig.apiKey ? 'env' : 'none',
    stored,
  }
}

export function saveAiSettings(
  db,
  {
    apiKey,
    baseUrl,
    model,
    dailyLimitStudent,
    dailyLimitTeacher,
    enabled,
    clearKey = false,
    updatedBy = '',
  },
) {
  const current = readStoredAiSettings(db)
  const next = {
    apiKey: clearKey
      ? ''
      : apiKey === undefined || apiKey === ''
        ? current.apiKey
        : String(apiKey).trim(),
    baseUrl:
      baseUrl === undefined || baseUrl === ''
        ? current.baseUrl
        : String(baseUrl).trim().replace(/\/+$/, ''),
    model: model === undefined || model === '' ? current.model : String(model).trim(),
    dailyLimitStudent:
      dailyLimitStudent === undefined || dailyLimitStudent === ''
        ? current.dailyLimitStudent
        : positiveNumber(dailyLimitStudent),
    dailyLimitTeacher:
      dailyLimitTeacher === undefined || dailyLimitTeacher === ''
        ? current.dailyLimitTeacher
        : positiveNumber(dailyLimitTeacher),
    enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
  }
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(SETTING_KEY, JSON.stringify(next), Date.now(), updatedBy)
  return readStoredAiSettings(db)
}

export function maskApiKey(key) {
  if (!key) return ''
  if (key.length <= 8) return `…${key.slice(-2)}`
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}
