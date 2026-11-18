import { useEffect, useMemo, useState } from 'react'
import { CircleAlert, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { apiGet } from '../../lib/api'
import { Badge } from '../../components/ui'
import type { AuditEntry } from '../../data/adminTypes'
import { ACTION_LABELS, courseLabel, roleLabel, shortTime } from './helpers'

export function AdminAuditPanel() {
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const loadAudit = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiGet<{ logs: AuditEntry[] }>('/api/admin/audit?limit=200')
      setAudit(result.logs)
    } catch (err) {
      setError(err instanceof Error ? err.message : '审计日志加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const actions = useMemo(
    () => Array.from(new Set(audit.flatMap((entry) => entry.actions))).sort(),
    [audit],
  )

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return audit.filter((entry) => {
      if (actionFilter !== 'all' && !entry.actions.includes(actionFilter)) return false
      if (!normalized) return true
      const haystack = [
        entry.userName,
        entry.summary,
        entry.role,
        ...entry.actions.map((action) => ACTION_LABELS[action] ?? action),
        ...entry.courseIds.map(courseLabel),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [actionFilter, audit, query])

  return (
    <div className="admin-panel admin-panel-audit">
      <div className="admin-panel-toolbar">
        <div>
          <strong>操作审计</strong>
          <span>最近 {audit.length} 条写入记录 · 所有账号与内容操作都会留痕</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadAudit()} disabled={loading}>
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

      <div className="admin-filter-bar">
        <label className="admin-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜账号、动作、课程或摘要…"
            aria-label="搜索审计日志"
          />
        </label>
        <label className="admin-filter-select">
          <span>动作</span>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">全部动作</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action] ?? action}
              </option>
            ))}
          </select>
        </label>
        <span className="knowledge-result">{visible.length} 条结果</span>
      </div>

      <div className="admin-audit">
        {visible.length === 0 ? (
          <p className="admin-empty">
            {audit.length === 0 ? '还没有操作记录。' : '当前筛选下没有匹配记录。'}
          </p>
        ) : (
          visible.map((entry) => (
            <article className="admin-audit-row" key={entry.id}>
              <div className="admin-audit-main">
                <div className="admin-audit-top">
                  <strong>{entry.userName}</strong>
                  <Badge tone={entry.role === 'teacher' ? 'jade' : 'neutral'}>
                    {roleLabel(entry.role)}
                  </Badge>
                  <span>{shortTime(entry.createdAt)}</span>
                  {entry.revision > 0 && <em>rev {entry.revision}</em>}
                  {entry.mode && <em>{entry.mode}</em>}
                </div>
                <p>{entry.summary}</p>
                <div className="admin-audit-tags">
                  {entry.actions.slice(0, 6).map((action) => (
                    <span key={action}>{ACTION_LABELS[action] ?? action}</span>
                  ))}
                  {entry.courseIds.map((courseId) => (
                    <span key={courseId} className="is-course">
                      {courseLabel(courseId)}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="admin-panel-note">
        <ShieldCheck size={14} />
        <span>
          审计数据来自服务端 `audit_log` 表；导出或长期留存请在服务器侧做备份，不要只依赖浏览器。
        </span>
      </div>
    </div>
  )
}
