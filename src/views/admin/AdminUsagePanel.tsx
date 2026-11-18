import { useEffect, useState } from 'react'
import { Activity, CircleAlert, RefreshCw } from 'lucide-react'
import { apiGet } from '../../lib/api'
import { Badge } from '../../components/ui'
import type { AiUsageSummary } from '../../data/adminTypes'
import { formatNumber, roleLabel } from './helpers'

export function AdminUsagePanel() {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUsage = async () => {
    setLoading(true)
    setError(null)
    try {
      setUsage(await apiGet<AiUsageSummary>('/api/admin/ai-usage'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 用量加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxCalls = usage ? Math.max(1, ...usage.days.map((day) => day.calls)) : 1

  return (
    <div className="admin-panel admin-panel-usage">
      <div className="admin-panel-toolbar">
        <div>
          <strong>AI 用量</strong>
          <span>按天统计调用、Token 与失败次数；数据来自服务端 ai_usage 表</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadUsage()} disabled={loading}>
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

      {!usage ? (
        <p className="admin-empty">用量数据加载中…</p>
      ) : (
        <>
          {!usage.configured && (
            <div className="admin-config-warning">
              <Activity size={16} />
              <div>
                <strong>AI 网关还没有配置</strong>
                <span>
                  需要同时设置 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL`，重启服务后这里才会产生调用。
                </span>
              </div>
            </div>
          )}

          <div className="admin-usage-grid">
            <div className="admin-usage-card">
              <span>今日调用</span>
              <strong>{usage.totals.callsToday}</strong>
              <em>次 · 每人每日上限 {usage.dailyLimit}</em>
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
            <Activity size={14} />
            <span>
              用量只统计服务端 AI 网关调用；学生浏览器里配置的“外部 AI”不会进入这张表。配额按角色在
              `AI_DAILY_LIMIT_*` 环境变量中调整。
            </span>
          </div>
        </>
      )}
    </div>
  )
}
