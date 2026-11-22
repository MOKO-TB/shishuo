import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react'
import { apiGet, apiPatch } from '../../lib/api'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS_META,
  feedbackCategoryLabel,
  type FeedbackItem,
  type FeedbackStatus,
} from '../../lib/feedback'
import { Badge, EmptyState } from '../../components/ui'
import { roleLabel, shortTime } from './helpers'

interface FeedbackStats {
  total: number
  pending: number
  reviewing: number
  resolved: number
}

export function AdminFeedbackPanel({
  notify,
}: {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [stats, setStats] = useState<FeedbackStats>({
    total: 0,
    pending: 0,
    reviewing: 0,
    resolved: 0,
  })
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { status: FeedbackStatus; reply: string }>>(
    {},
  )
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        category: categoryFilter,
        q: query.trim(),
      })
      const res = await apiGet<{ stats: FeedbackStats; items: FeedbackItem[] }>(
        `/api/admin/feedback?${params.toString()}`,
      )
      setStats(res.stats)
      setItems(res.items)
      setDrafts((prev) => {
        const next = { ...prev }
        for (const item of res.items) {
          if (!next[item.id]) {
            next[item.id] = {
              status: item.status,
              reply: item.adminReply || '',
            }
          }
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载意见反馈失败。')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, categoryFilter, query])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async (item: FeedbackItem) => {
    const draft = drafts[item.id] ?? { status: item.status, reply: item.adminReply }
    setSavingId(item.id)
    try {
      const res = await apiPatch<{ feedback: FeedbackItem }>(`/api/admin/feedback/${item.id}`, {
        status: draft.status,
        adminReply: draft.reply,
      })
      setItems((prev) => prev.map((row) => (row.id === item.id ? res.feedback : row)))
      setDrafts((prev) => ({
        ...prev,
        [item.id]: { status: res.feedback.status, reply: res.feedback.adminReply },
      }))
      notify('反馈处理结果已保存，提交人可在「我的反馈」查看')
      void load()
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存处理失败', 'danger')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-stat-grid" style={{ marginBottom: 14 }}>
        <div className="admin-stat-card">
          <span>全部反馈</span>
          <strong>{stats.total}</strong>
          <em>学生端 / 教师端 / 手机端汇总</em>
        </div>
        <div className={`admin-stat-card ${stats.pending > 0 ? 'is-warn' : ''}`}>
          <span>待处理</span>
          <strong>{stats.pending}</strong>
          <em>等待管理员核查回复</em>
        </div>
        <div className="admin-stat-card">
          <span>处理中</span>
          <strong>{stats.reviewing}</strong>
          <em>正在排查或跟进</em>
        </div>
        <div className="admin-stat-card">
          <span>已解决 / 关闭</span>
          <strong>{stats.resolved}</strong>
          <em>已完成回复归档</em>
        </div>
      </div>

      <div className="admin-fb-filters">
        <select
          className="input"
          aria-label="按状态筛选"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="pending">待处理</option>
          <option value="reviewing">处理中</option>
          <option value="resolved">已回复</option>
          <option value="closed">已关闭</option>
        </select>

        <select
          className="input"
          aria-label="按类型筛选"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">全部类型</option>
          {FEEDBACK_CATEGORIES.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {cat.label}
            </option>
          ))}
        </select>

        <div className="admin-search" style={{ flex: 1, minWidth: 180 }}>
          <Search size={14} />
          <input
            className="input"
            placeholder="搜索反馈内容、提交人、联系方式…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <button className="button button-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
          刷新
        </button>
      </div>

      {error && (
        <div className="inline-note danger admin-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<MessageSquareText size={20} />}
            title="暂无符合条件的意见反馈"
            description="学生端、教师端与手机端提交的反馈都会汇总到这里。"
          />
        </div>
      ) : (
        <div className="fb-list">
          {items.map((item) => {
            const statusMeta = FEEDBACK_STATUS_META[item.status] ?? FEEDBACK_STATUS_META.pending
            const draft = drafts[item.id] ?? { status: item.status, reply: item.adminReply }
            return (
              <article className="fb-item" key={item.id}>
                <div className="fb-item-head">
                  <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  <span className="fb-item-cat">{feedbackCategoryLabel(item.category)}</span>
                  <span className="admin-recent-user">
                    {item.userName}
                    <em>{roleLabel(item.userRole)}</em>
                  </span>
                  <span className="fb-item-time">{shortTime(item.createdAt)}</span>
                </div>

                <p className="fb-item-content">{item.content}</p>

                {item.screenshotUrl && (
                  <a href={item.screenshotUrl} target="_blank" rel="noreferrer">
                    <img className="fb-item-shot" src={item.screenshotUrl} alt="反馈截图" />
                  </a>
                )}

                <div className="fb-item-meta">
                  {item.userEmail && <span>账号：{item.userEmail}</span>}
                  {item.contact && <span>联系方式：{item.contact}</span>}
                  {item.clientMeta?.appVersion && <span>版本：{item.clientMeta.appVersion}</span>}
                  {item.clientMeta?.viewport && <span>视口：{item.clientMeta.viewport}</span>}
                  {item.clientMeta?.view && <span>来源页：{item.clientMeta.view}</span>}
                </div>

                <div className="admin-fb-reply-form">
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="填写给反馈人的处理结果或回复（保存后对方可在「我的反馈」看到）…"
                    value={draft.reply}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...draft, reply: event.target.value },
                      }))
                    }
                  />
                  <div className="admin-fb-reply-controls">
                    <select
                      className="input"
                      style={{ width: 130 }}
                      value={draft.status}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...draft,
                            status: event.target.value as FeedbackStatus,
                          },
                        }))
                      }
                    >
                      <option value="pending">待处理</option>
                      <option value="reviewing">处理中</option>
                      <option value="resolved">已回复</option>
                      <option value="closed">已关闭</option>
                    </select>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={savingId === item.id}
                      onClick={() => void handleSave(item)}
                    >
                      {savingId === item.id ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <Send size={14} />
                      )}
                      {savingId === item.id ? '保存中…' : '保存回复'}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
