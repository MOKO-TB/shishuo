import { useCallback, useEffect, useState } from 'react'
import { Activity, CircleAlert, KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { apiGet, apiPost } from '../../lib/api'
import { Badge } from '../../components/ui'
import type { AiSettingsView, AiUsageSummary } from '../../data/adminTypes'
import { formatNumber, roleLabel } from './helpers'

interface AdminUsagePanelProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

interface AiForm {
  apiKey: string
  baseUrl: string
  model: string
  dailyLimitStudent: string
  dailyLimitTeacher: string
  enabled: boolean
  vision: boolean
}

const emptyForm: AiForm = {
  apiKey: '',
  baseUrl: '',
  model: '',
  dailyLimitStudent: '120',
  dailyLimitTeacher: '120',
  enabled: true,
  vision: true,
}

export function AdminUsagePanel({ notify }: AdminUsagePanelProps) {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null)
  const [settings, setSettings] = useState<AiSettingsView | null>(null)
  const [form, setForm] = useState<AiForm>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fillForm = (next: AiSettingsView) => {
    setForm((current) => ({
      ...current,
      apiKey: '',
      baseUrl: next.baseUrl || '',
      model: next.model || '',
      dailyLimitStudent: String(next.dailyLimitStudent || 120),
      dailyLimitTeacher: String(next.dailyLimitTeacher || 120),
      enabled: next.enabled,
      vision: next.vision !== false,
    }))
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [usageResult, settingsResult] = await Promise.all([
        apiGet<AiUsageSummary>('/api/admin/ai-usage'),
        apiGet<{ settings: AiSettingsView }>('/api/admin/ai-settings'),
      ])
      setUsage(usageResult)
      setSettings(settingsResult.settings)
      fillForm(settingsResult.settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 配置加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await apiPost<{ settings: AiSettingsView }>('/api/admin/ai-settings', {
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        dailyLimitStudent: Number(form.dailyLimitStudent),
        dailyLimitTeacher: Number(form.dailyLimitTeacher),
        enabled: form.enabled,
        vision: form.vision,
      })
      setSettings(result.settings)
      fillForm(result.settings)
      await load()
      notify('AI 配置已保存；学生端和教师端立即使用新配置。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存 AI 配置失败。')
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async () => {
    if (!window.confirm('清除 API Key 后，学生端和教师端会回到“低置信转人工”模式。确认清除？')) {
      return
    }
    setSaving(true)
    try {
      const result = await apiPost<{ settings: AiSettingsView }>('/api/admin/ai-settings', {
        clearKey: true,
      })
      setSettings(result.settings)
      fillForm(result.settings)
      await load()
      notify('API Key 已清除。', 'info')
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除 Key 失败。')
    } finally {
      setSaving(false)
    }
  }

  const maxCalls = usage ? Math.max(1, ...usage.days.map((day) => day.calls)) : 1

  return (
    <div className="admin-panel admin-panel-usage">
      <div className="admin-panel-toolbar">
        <div>
          <strong>AI 网关与用量</strong>
          <span>管理员在这里配置 API Key、Base URL、模型和每日额度；学生端和教师端统一使用</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-note danger admin-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      <section className="admin-ai-settings">
        <div className="admin-ai-head">
          <div>
            <strong>
              <KeyRound size={16} />
              API Key 配置
            </strong>
            <span>
              Key 只保存在服务端数据库/配置中，接口只返回掩码；保存后立即生效，不需要重启服务。
            </span>
          </div>
          <div className="admin-ai-badges">
            <Badge tone={settings?.configured ? 'jade' : 'medium'}>
              {settings?.configured ? '已配置' : '未配置'}
            </Badge>
            {settings?.source && <Badge tone="neutral">来源：{settings.source === 'database' ? '管理台' : settings.source === 'env' ? '环境变量' : '无'}</Badge>}
            {settings?.vision && <Badge tone="jade">图片识别</Badge>}
            {settings && !settings.enabled && <Badge tone="danger">已停用</Badge>}
          </div>
        </div>

        <div className="admin-ai-grid">
          <label className="admin-ai-field is-wide">
            <span>API Key</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder={
                settings?.apiKeyMasked
                  ? `已配置 ${settings.apiKeyMasked}；留空保持不变`
                  : '粘贴管理员提供的 API Key'
              }
              autoComplete="off"
            />
          </label>
          <label className="admin-ai-field">
            <span>Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://api.deepseek.com/v1"
            />
          </label>
          <label className="admin-ai-field">
            <span>模型</span>
            <input
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              placeholder="deepseek-chat"
            />
          </label>
          <label className="admin-ai-field">
            <span>学生每日上限</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={form.dailyLimitStudent}
              onChange={(event) =>
                setForm((current) => ({ ...current, dailyLimitStudent: event.target.value }))
              }
            />
          </label>
          <label className="admin-ai-field">
            <span>教师每日上限</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={form.dailyLimitTeacher}
              onChange={(event) =>
                setForm((current) => ({ ...current, dailyLimitTeacher: event.target.value }))
              }
            />
          </label>
          <label className="admin-ai-enabled">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <span>启用 AI 网关（关闭后保留 Key，但学生/教师端不会调用）</span>
          </label>
          <label className="admin-ai-enabled">
            <input
              type="checkbox"
              checked={form.vision}
              onChange={(event) =>
                setForm((current) => ({ ...current, vision: event.target.checked }))
              }
            />
            <span>
              模型支持图片识别（图片题会随问题发给模型；学生端和教师端共用此能力）
            </span>
          </label>
        </div>

        <div className="admin-ai-actions">
          <button className="button button-primary" onClick={() => void save()} disabled={saving}>
            <Save size={14} />
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button
            className="button button-danger-ghost"
            onClick={() => void clearKey()}
            disabled={saving || !settings?.configured}
          >
            清除 Key
          </button>
          {settings?.updatedAt && (
            <span className="admin-ai-meta">
              上次更新：{new Date(settings.updatedAt).toLocaleString('zh-CN')}
              {settings.updatedBy ? ` · ${settings.updatedBy}` : ''}
            </span>
          )}
        </div>
      </section>

      {!usage ? (
        <p className="admin-empty">用量数据加载中…</p>
      ) : (
        <>
          {!usage.configured && (
            <div className="admin-config-warning">
              <Activity size={16} />
              <div>
                <strong>AI 网关当前不可用</strong>
                <span>在上方填入 Key、Base URL 和模型后保存；未配置时低置信问题会直接转交老师。</span>
              </div>
            </div>
          )}

          <div className="admin-usage-grid">
            <div className="admin-usage-card">
              <span>今日调用</span>
              <strong>{usage.totals.callsToday}</strong>
              <em>次 · 学生上限 {settings?.dailyLimitStudent ?? usage.dailyLimit}</em>
            </div>
            <div className="admin-usage-card">
              <span>近 7 天调用</span>
              <strong>{usage.totals.calls}</strong>
              <em>次 · 失败 {usage.totals.errors}</em>
            </div>
            <div className="admin-usage-card">
              <span>近 7 天 Token</span>
              <strong>{formatNumber(usage.totals.tokens)}</strong>
              <em>{usage.configured ? `模型 ${usage.model}` : 'AI 网关未配置'}</em>
            </div>
          </div>

          <div className="admin-usage-days">
            <div className="admin-usage-users-head">按天用量</div>
            {usage.days.length === 0 ? (
              <p className="admin-empty">近 7 天没有模型调用。</p>
            ) : (
              usage.days.map((day) => (
                <div className="admin-usage-day" key={day.date}>
                  <span className="admin-usage-day-date">{day.date.slice(5)}</span>
                  <span className="admin-usage-bar">
                    <span
                      className="admin-usage-bar-fill"
                      style={{ width: `${Math.max(4, (day.calls / maxCalls) * 100)}%` }}
                    />
                  </span>
                  <em>
                    {day.calls} 次 · {formatNumber(day.tokens)} tokens
                    {day.errors > 0 ? ` · 失败 ${day.errors}` : ''}
                  </em>
                </div>
              ))
            )}
          </div>

          {usage.topUsers.length > 0 && (
            <div className="admin-usage-days">
              <div className="admin-usage-users-head">调用最多的账号</div>
              {usage.topUsers.map((item) => (
                <div className="admin-usage-user" key={item.userId}>
                  <strong>{item.name}</strong>
                  <Badge tone={item.role === 'teacher' ? 'jade' : 'neutral'}>
                    {roleLabel(item.role)}
                  </Badge>
                  <em>
                    {item.calls} 次 · {formatNumber(item.tokens)} tokens
                  </em>
                </div>
              ))}
            </div>
          )}

          <div className="admin-panel-note">
            <ShieldCheck size={14} />
            <span>
              用量只统计服务端 AI 网关调用；配额按角色由上方配置控制。学生和教师无需、也不能在浏览器里配置 Key。
            </span>
          </div>
        </>
      )}
    </div>
  )
}
