import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleAlert,
  ImageOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
} from 'lucide-react'
import { apiDelete, apiGet, apiPost } from '../../lib/api'
import { Badge } from '../../components/ui'
import type {
  AdminUser,
  ModerationImage,
  ModerationOverview,
  ModerationTerm,
  ModerationThread,
  UserStatus,
} from '../../data/adminTypes'
import { courseLabel, shortTime } from './helpers'

interface AdminModerationPanelProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

type ModerationView = 'terms' | 'images' | 'users' | 'threads'

const VIEWS: Array<{ key: ModerationView; label: string }> = [
  { key: 'terms', label: '敏感词' },
  { key: 'images', label: '图片审核' },
  { key: 'users', label: '用户风控' },
  { key: 'threads', label: '内容队列' },
]

function statusLabel(status: UserStatus) {
  if (status === 'muted') return '禁言中'
  if (status === 'banned') return '已封禁'
  return '正常'
}

function statusTone(status: UserStatus) {
  if (status === 'banned') return 'danger' as const
  if (status === 'muted') return 'medium' as const
  return 'jade' as const
}

function reviewTone(status: string) {
  if (status === 'approved') return 'jade' as const
  if (status === 'rejected' || status === 'withdrawn') return 'danger' as const
  return 'medium' as const
}

function reviewLabel(status: string) {
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '已拒绝'
  if (status === 'withdrawn') return '已撤下'
  return '待审核'
}

export function AdminModerationPanel({ notify }: AdminModerationPanelProps) {
  const [view, setView] = useState<ModerationView>('terms')
  const [overview, setOverview] = useState<ModerationOverview | null>(null)
  const [terms, setTerms] = useState<ModerationTerm[]>([])
  const [images, setImages] = useState<ModerationImage[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [threads, setThreads] = useState<ModerationThread[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newTerm, setNewTerm] = useState('')
  const [newCategory, setNewCategory] = useState('通用')
  const [termTest, setTermTest] = useState('')
  const [threadQuery, setThreadQuery] = useState('')
  const [threadFilter, setThreadFilter] = useState('all')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [overviewResult, termsResult, imagesResult, usersResult, threadsResult] =
        await Promise.all([
          apiGet<ModerationOverview>('/api/admin/moderation/overview'),
          apiGet<{ terms: ModerationTerm[] }>('/api/admin/moderation/terms'),
          apiGet<{ images: ModerationImage[] }>('/api/admin/moderation/images'),
          apiGet<{ users: AdminUser[] }>('/api/admin/users'),
          apiGet<{ threads: ModerationThread[] }>('/api/admin/moderation/threads?limit=200'),
        ])
      setOverview(overviewResult)
      setTerms(termsResult.terms)
      setImages(imagesResult.images)
      setUsers(usersResult.users)
      setThreads(threadsResult.threads)
    } catch (err) {
      setError(err instanceof Error ? err.message : '风控数据加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const visibleThreads = useMemo(() => {
    const normalized = threadQuery.trim().toLowerCase()
    return threads.filter((thread) => {
      if (threadFilter === 'flagged' && !thread.matchedTerm) return false
      if (threadFilter === 'images' && !thread.attachment) return false
      if (
        threadFilter === 'pending' &&
        thread.review !== 'pending' &&
        thread.attachment?.review !== 'pending' &&
        !thread.matchedTerm
      ) {
        return false
      }
      if (!normalized) return true
      return [thread.question, thread.student.name, thread.matchedTerm ?? '', thread.courseId]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
  }, [threadFilter, threadQuery, threads])

  const testHit = useMemo(() => {
    const text = termTest.trim().toLowerCase().replace(/\s+/g, '')
    if (!text) return null
    return (
      terms.find(
        (term) =>
          term.enabled &&
          text.includes(term.term.trim().toLowerCase().replace(/\s+/g, '')),
      )?.term ?? null
    )
  }, [termTest, terms])

  const addNewTerm = async () => {
    const term = newTerm.trim()
    if (term.length < 2) {
      notify('敏感词至少 2 个字符。', 'info')
      return
    }
    try {
      await apiPost('/api/admin/moderation/terms', { term, category: newCategory })
      setNewTerm('')
      await loadAll()
      notify(`已加入敏感词「${term}」。`)
    } catch (err) {
      notify(err instanceof Error ? err.message : '新增敏感词失败。', 'danger')
    }
  }

  const removeTerm = async (term: ModerationTerm) => {
    if (!window.confirm(`删除敏感词「${term.term}」？`)) return
    try {
      await apiDelete(`/api/admin/moderation/terms/${term.id}`)
      await loadAll()
      notify('敏感词已删除。')
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败。', 'danger')
    }
  }

  const reviewImage = async (image: ModerationImage, action: 'approve' | 'reject') => {
    const reason =
      action === 'reject' ? window.prompt('撤下这张图片的原因（会写入审计）：') ?? '' : ''
    if (action === 'reject' && reason.trim().length < 2) {
      if (reason !== null) notify('请填写撤下原因。', 'info')
      return
    }
    try {
      await apiPost('/api/admin/moderation/images/review', {
        threadId: image.threadId,
        url: image.url,
        action,
        reason,
      })
      await loadAll()
      notify(action === 'approve' ? '图片已通过。' : '图片已撤下。')
    } catch (err) {
      notify(err instanceof Error ? err.message : '图片审核失败。', 'danger')
    }
  }

  const reviewThread = async (thread: ModerationThread, action: 'approve' | 'reject' | 'withdraw') => {
    const reason =
      action === 'approve' ? '' : window.prompt('填写撤下原因（会写入审计）：') ?? ''
    if (action !== 'approve' && reason.trim().length < 2) {
      if (reason !== null) notify('请填写撤下原因。', 'info')
      return
    }
    try {
      await apiPost(`/api/admin/moderation/threads/${encodeURIComponent(thread.id)}/review`, {
        action,
        reason,
      })
      await loadAll()
      notify(
        action === 'approve'
          ? '问答已通过。'
          : action === 'reject'
            ? '问答已拒绝并撤下。'
            : '问答已撤下。',
      )
    } catch (err) {
      notify(err instanceof Error ? err.message : '内容审核失败。', 'danger')
    }
  }

  const setUserStatus = async (user: AdminUser, status: UserStatus) => {
    const reason =
      status === 'active'
        ? ''
        : window.prompt(
            status === 'banned' ? '封禁原因（会写入审计）：' : '禁言原因（会写入审计）：',
          ) ?? ''
    if (status !== 'active' && reason.trim().length < 2) {
      if (reason !== null) notify('请填写原因。', 'info')
      return
    }
    try {
      await apiPost(`/api/admin/users/${user.id}/status`, {
        status,
        reason,
        ...(status === 'muted' ? { until: Date.now() + 24 * 60 * 60 * 1000 } : {}),
      })
      await loadAll()
      notify(
        status === 'active'
          ? `${user.name} 已恢复正常。`
          : status === 'muted'
            ? `${user.name} 已禁言 24 小时。`
            : `${user.name} 已封禁。`,
      )
    } catch (err) {
      notify(err instanceof Error ? err.message : '账号风控操作失败。', 'danger')
    }
  }

  return (
    <div className="admin-panel admin-panel-moderation">
      <div className="admin-panel-toolbar">
        <div>
          <strong>内容风控</strong>
          <span>敏感词、图片审核、学生/教师禁言封禁与内容队列；所有动作写入审计</span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadAll()} disabled={loading}>
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

      <div className="admin-stat-grid admin-mod-stats">
        <div className="admin-stat-card">
          <span>敏感词</span>
          <strong>{overview?.terms.enabled ?? '—'}</strong>
          <em>共 {overview?.terms.total ?? 0} 条 · 启用中</em>
        </div>
        <div className="admin-stat-card is-warn">
          <span>待审图片</span>
          <strong>{overview?.images.pending ?? '—'}</strong>
          <em>共 {overview?.images.total ?? 0} 张</em>
        </div>
        <div className="admin-stat-card">
          <span>禁言 / 封禁</span>
          <strong>
            {overview ? `${overview.users.muted} / ${overview.users.banned}` : '—'}
          </strong>
          <em>当前生效账号</em>
        </div>
        <div className="admin-stat-card">
          <span>命中内容</span>
          <strong>{overview?.threads.flagged ?? '—'}</strong>
          <em>命中敏感词 · 未撤下</em>
        </div>
      </div>

      <div className="admin-tabs admin-mod-tabs" role="tablist" aria-label="内容风控">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={view === item.key}
            className={view === item.key ? 'is-active' : ''}
            onClick={() => setView(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === 'terms' && (
        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>敏感词表</strong>
              <span>学生提问、转交、补充和 AI 调用都会过这张表</span>
            </div>
            <ShieldAlert size={16} />
          </div>
          <div className="admin-term-form">
            <input
              value={newTerm}
              onChange={(event) => setNewTerm(event.target.value)}
              placeholder="新增敏感词，例如：代写"
              maxLength={50}
            />
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="分类"
              maxLength={30}
            />
            <button className="button button-primary" onClick={() => void addNewTerm()}>
              加入词表
            </button>
          </div>
          <div className="admin-term-test">
            <input
              value={termTest}
              onChange={(event) => setTermTest(event.target.value)}
              placeholder="测试一句话是否会被拦截…"
            />
            <span className={testHit ? 'is-hit' : ''}>
              {termTest.trim()
                ? testHit
                  ? `命中：${testHit}`
                  : '未命中'
                : '输入后即时测试'}
            </span>
          </div>
          <div className="admin-term-list">
            {terms.length === 0 ? (
              <p className="admin-empty">还没有敏感词。</p>
            ) : (
              terms.map((term) => (
                <div className="admin-term-row" key={term.id}>
                  <strong>{term.term}</strong>
                  <Badge tone={term.enabled ? 'medium' : 'neutral'}>{term.category}</Badge>
                  <span>{term.createdBy === 'system' ? '系统预置' : term.createdBy}</span>
                  <em>{shortTime(term.createdAt)}</em>
                  <button
                    className="icon-button"
                    aria-label={`删除敏感词 ${term.term}`}
                    onClick={() => void removeTerm(term)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {view === 'images' && (
        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>图片审核</strong>
              <span>所有带图问答都会进入这里；拒绝会移除附件并记入审计</span>
            </div>
            <ImageOff size={16} />
          </div>
          {images.length === 0 ? (
            <p className="admin-empty">当前没有待审图片。</p>
          ) : (
            <div className="admin-image-grid">
              {images.map((image) => (
                <article className="admin-image-card" key={`${image.threadId}-${image.url}`}>
                  <a href={image.url} target="_blank" rel="noreferrer" className="admin-image-thumb">
                    <img src={image.url} alt={image.name || '学生上传图片'} loading="lazy" />
                  </a>
                  <div className="admin-image-meta">
                    <div>
                      <Badge tone={reviewTone(image.review)}>{reviewLabel(image.review)}</Badge>
                      <span>{shortTime(image.createdAt)}</span>
                    </div>
                    <strong>{image.question}</strong>
                    <em>
                      {image.student.name} · {courseLabel(image.courseId)}
                    </em>
                  </div>
                  <div className="admin-image-actions">
                    <button
                      className="button button-ghost"
                      onClick={() => void reviewImage(image, 'approve')}
                      disabled={image.review === 'approved'}
                    >
                      <ShieldCheck size={13} />
                      通过
                    </button>
                    <button
                      className="button button-danger-ghost"
                      onClick={() => void reviewImage(image, 'reject')}
                    >
                      <UserX size={13} />
                      撤下
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'users' && (
        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>用户风控</strong>
              <span>禁言会阻止提问、转交、补充、上传和 AI 调用；封禁还会注销所有会话</span>
            </div>
            <UserX size={16} />
          </div>
          <div className="admin-risk-list">
            {users.map((user) => (
              <div className="admin-risk-row" key={user.id}>
                <span className="admin-risk-avatar">{user.name.slice(0, 1)}</span>
                <div className="admin-risk-info">
                  <strong>
                    {user.name}
                    {user.isAdmin && <Badge tone="gold">管理员</Badge>}
                  </strong>
                  <em>
                    {user.email} · {user.role === 'teacher' ? '教师' : '学生'}
                  </em>
                </div>
                <Badge tone={statusTone(user.status)}>{statusLabel(user.status)}</Badge>
                <span className="admin-risk-reason">
                  {user.statusUntil
                    ? `至 ${shortTime(user.statusUntil)}`
                    : user.statusReason || '—'}
                </span>
                <div className="admin-risk-actions">
                  <button
                    className="button button-ghost"
                    disabled={user.isAdmin || user.status === 'muted'}
                    onClick={() => void setUserStatus(user, 'muted')}
                  >
                    禁言 24h
                  </button>
                  <button
                    className="button button-danger-ghost"
                    disabled={user.isAdmin || user.status === 'banned'}
                    onClick={() => void setUserStatus(user, 'banned')}
                  >
                    封禁
                  </button>
                  <button
                    className="button button-ghost"
                    disabled={user.isAdmin || user.status === 'active'}
                    onClick={() => void setUserStatus(user, 'active')}
                  >
                    恢复
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="admin-panel-note-inline">
            管理员账号不能被禁言/封禁，避免把自己锁在后台之外。禁言默认 24 小时，可在后端扩展为更长时间。
          </p>
        </section>
      )}

      {view === 'threads' && (
        <section className="admin-content-card">
          <div className="admin-content-head">
            <div>
              <strong>内容队列</strong>
              <span>学生问题、命中的敏感词和附件；可撤下问题或移除违规图片</span>
            </div>
            <ShieldAlert size={16} />
          </div>
          <div className="admin-filter-bar">
            <label className="admin-search">
              <input
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="搜问题、学生、课程或敏感词…"
                aria-label="搜索内容队列"
              />
            </label>
            <label className="admin-filter-select">
              <span>筛选</span>
              <select value={threadFilter} onChange={(event) => setThreadFilter(event.target.value)}>
                <option value="all">全部</option>
                <option value="pending">待处理</option>
                <option value="flagged">命中敏感词</option>
                <option value="images">带图片</option>
              </select>
            </label>
            <span className="knowledge-result">{visibleThreads.length} 条</span>
          </div>
          <div className="admin-mod-thread-list">
            {visibleThreads.length === 0 ? (
              <p className="admin-empty">没有匹配的内容。</p>
            ) : (
              visibleThreads.map((thread) => (
                <article className="admin-mod-thread" key={thread.id}>
                  <div className="admin-mod-thread-top">
                    <Badge tone={thread.withdrawn ? 'danger' : reviewTone(thread.review)}>
                      {thread.withdrawn ? '已撤下' : reviewLabel(thread.review)}
                    </Badge>
                    {thread.matchedTerm && <Badge tone="danger">命中：{thread.matchedTerm}</Badge>}
                    <span>
                      {thread.student.name} · {courseLabel(thread.courseId)} ·{' '}
                      {shortTime(thread.createdAt)}
                    </span>
                  </div>
                  <strong>{thread.question}</strong>
                  {thread.attachment && (
                    <div className="admin-mod-attachment">
                      <a href={thread.attachment.url} target="_blank" rel="noreferrer">
                        <img src={thread.attachment.url} alt="附件" loading="lazy" />
                      </a>
                      <span>
                        附件：{thread.attachment.name || '图片'} · {reviewLabel(thread.attachment.review)}
                      </span>
                    </div>
                  )}
                  {thread.reviewReason && <p>审核备注：{thread.reviewReason}</p>}
                  <div className="admin-mod-actions">
                    <button
                      className="button button-ghost"
                      disabled={thread.withdrawn}
                      onClick={() => void reviewThread(thread, 'approve')}
                    >
                      通过
                    </button>
                    <button
                      className="button button-danger-ghost"
                      disabled={thread.withdrawn}
                      onClick={() => void reviewThread(thread, 'reject')}
                    >
                      拒绝并撤下
                    </button>
                    <button
                      className="button button-ghost"
                      disabled={thread.withdrawn}
                      onClick={() => void reviewThread(thread, 'withdraw')}
                    >
                      仅撤下
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
