import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleAlert,
  Inbox,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ApiError, apiDelete, apiGet, apiPost } from '../../lib/api'
import { Badge } from '../../components/ui'
import type {
  AdminStudentThread,
  AdminStudentThreadInbox,
} from '../../data/adminTypes'
import { courseLabel, shortTime, timeLabel } from './helpers'

interface AdminCampusPanelProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

type Scope = 'all' | 'campus' | 'course'
type StatusFilter = 'all' | 'pending' | 'answered' | 'needs-info'

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'all', label: '全部问题' },
  { key: 'campus', label: '校园生活' },
  { key: 'course', label: '课程问答' },
]

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '全部状态' },
  { key: 'pending', label: '待回复' },
  { key: 'answered', label: '已回复' },
  { key: 'needs-info', label: '待补充' },
]

function threadStatus(thread: AdminStudentThread): {
  label: string
  tone: 'neutral' | 'pending' | 'answered' | 'blue' | 'ai'
} {
  if (thread.withdrawnAt) return { label: '已撤下', tone: 'neutral' }
  if (thread.status === 'answered') return { label: '已回复', tone: 'answered' }
  if (thread.status === 'needs-info') return { label: '待补充', tone: 'blue' }
  if (thread.status === 'pending') {
    return {
      label: thread.courseId === 'campus' ? '待校园主理人回复' : '待老师回复',
      tone: 'pending',
    }
  }
  return { label: 'AI 已答', tone: 'ai' }
}

export function AdminCampusPanel({ notify }: AdminCampusPanelProps) {
  const [inbox, setInbox] = useState<AdminStudentThreadInbox | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replySediment, setReplySediment] = useState(true)
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminStudentThread | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadInbox = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInbox(await apiGet<AdminStudentThreadInbox>('/api/admin/student-threads?limit=300'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '学生问题加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInbox()
  }, [loadInbox])

  const threads = inbox?.threads ?? []
  const selected = useMemo(
    () => threads.find((thread) => thread.id === selectedId) ?? null,
    [selectedId, threads],
  )

  const visibleThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return threads.filter((thread) => {
      if (scope === 'campus' && thread.courseId !== 'campus') return false
      if (scope === 'course' && thread.courseId === 'campus') return false
      if (statusFilter !== 'all' && thread.status !== statusFilter) return false
      if (!normalized) return true
      return [
        thread.question,
        thread.student.name,
        courseLabel(thread.courseId),
        threadStatus(thread).label,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
  }, [query, scope, statusFilter, threads])

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedId(null)
      return
    }
    const pool = visibleThreads.length > 0 ? visibleThreads : threads
    if (selectedId && pool.some((thread) => thread.id === selectedId)) return
    const preferred =
      pool.find(
        (thread) =>
          thread.courseId === 'campus' && thread.status === 'pending' && !thread.withdrawnAt,
      ) ?? pool[0]
    setSelectedId(preferred.id)
  }, [selectedId, threads, visibleThreads])

  useEffect(() => {
    setReplyText('')
    setReplySediment(true)
  }, [selected?.id])

  const canSediment = replyText.trim().length >= 40
  const selectedStatus = selected ? threadStatus(selected) : null

  const submitReply = async () => {
    if (!selected || selected.courseId !== 'campus') return
    const text = replyText.trim()
    if (text.length < 8) {
      notify('回复至少写 8 个字。', 'info')
      return
    }
    if (text.length > 8000) {
      notify('回复不能超过 8000 字。', 'info')
      return
    }
    setSending(true)
    try {
      await apiPost(`/api/admin/campus/threads/${encodeURIComponent(selected.id)}/reply`, {
        text,
        sediment: canSediment && replySediment,
        baseRevision: inbox?.revision ?? 0,
      })
      setReplyText('')
      setReplySediment(true)
      await loadInbox()
      notify(
        canSediment && replySediment
          ? '已回复学生，并沉淀为校园 FAQ。'
          : '已回复学生，通知已发出。',
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await loadInbox()
      }
      notify(err instanceof Error ? err.message : '回复失败，请稍后重试。', 'danger')
    } finally {
      setSending(false)
    }
  }

  const removeThread = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await apiDelete(
        `/api/admin/student-threads/${encodeURIComponent(deleteTarget.id)}`,
      )
      notify('学生问题已删除。', 'success')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      await loadInbox()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await loadInbox()
      }
      notify(err instanceof Error ? err.message : '删除失败，请稍后重试。', 'danger')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-panel admin-campus-inbox">
      <div className="admin-panel-toolbar">
        <div>
          <strong>学生问答 · 校园主理人</strong>
          <span>
            查看学生提交的问题；校园生活问题由管理员以「校园主理人」身份回复，回复会通知学生，超过 40 字可沉淀为 FAQ；无效或违规问题可直接删除
          </span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadInbox()} disabled={loading}>
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

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <span>学生问题</span>
          <strong>{inbox?.stats.total ?? '—'}</strong>
          <em>{inbox ? `${inbox.stats.students} 位学生` : '加载中'}</em>
        </div>
        <div className="admin-stat-card is-warn">
          <span>待回复</span>
          <strong>{inbox?.stats.pending ?? '—'}</strong>
          <em>校园待办 {inbox?.stats.campusPending ?? '—'} 条</em>
        </div>
        <div className="admin-stat-card">
          <span>校园问题</span>
          <strong>{inbox?.stats.campusTotal ?? '—'}</strong>
          <em>由管理员担任校园主理人</em>
        </div>
        <div className="admin-stat-card">
          <span>今天新增</span>
          <strong>{inbox?.stats.today ?? '—'}</strong>
          <em>已回复 {inbox?.stats.answered ?? '—'} 条</em>
        </div>
      </div>

      <div className="admin-users admin-thread-layout">
        <section className="admin-user-list">
          <div className="admin-list-head">
            <strong>学生提交的问题</strong>
            <span>{visibleThreads.length} 条</span>
          </div>

          <div className="admin-thread-filters">
            <div className="admin-thread-scope">
              {SCOPES.map((item) => (
                <button
                  key={item.key}
                  className={scope === item.key ? 'is-active' : ''}
                  onClick={() => setScope(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="admin-thread-filter-row">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                aria-label="按状态筛选"
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜问题、学生或课程"
                aria-label="搜索学生问题"
              />
            </div>
          </div>

          <div className="admin-user-rows admin-thread-rows">
            {visibleThreads.length === 0 ? (
              <p className="admin-empty">{loading ? '加载中…' : '没有符合条件的学生问题。'}</p>
            ) : (
              visibleThreads.map((thread) => {
                const status = threadStatus(thread)
                return (
                  <div className="admin-thread-item" key={thread.id}>
                    <button
                      className={`admin-thread-row ${thread.id === selectedId ? 'is-active' : ''}`}
                      onClick={() => setSelectedId(thread.id)}
                    >
                      <span className="admin-thread-row-top">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <span>{shortTime(thread.createdAt)}</span>
                      </span>
                      <strong>{thread.question}</strong>
                      <span className="admin-thread-row-meta">
                        <span>{thread.student.name || '匿名学生'}</span>
                        <span>{courseLabel(thread.courseId)}</span>
                      </span>
                    </button>
                    <button
                      className="admin-thread-delete"
                      type="button"
                      title="删除这条问题"
                      aria-label={`删除问题：${thread.question}`}
                      onClick={() => setDeleteTarget(thread)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <section className="admin-user-editor admin-thread-detail">
          {!selected ? (
            <div className="admin-thread-empty">
              <Inbox size={26} />
              <strong>选择一条学生问题</strong>
              <span>左侧会展示全部学生提交的问题，校园问题可以直接在这里回复。</span>
            </div>
          ) : (
            <>
              <div className="admin-editor-head">
                <div>
                  <span className="eyebrow">
                    {selected.courseId === 'campus' ? '校园主理人 · 学生问答' : '课程问答 · 只读'}
                  </span>
                  <h3>{selected.student.name || '匿名学生'} 的问题</h3>
                  <p>
                    {courseLabel(selected.courseId)} · {timeLabel(selected.createdAt)}
                  </p>
                </div>
                <div className="admin-thread-head-actions">
                  {selectedStatus && (
                    <Badge tone={selectedStatus.tone}>{selectedStatus.label}</Badge>
                  )}
                  <button
                    className="button button-danger-ghost admin-thread-delete-detail"
                    type="button"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 size={14} />
                    删除问题
                  </button>
                </div>
              </div>

              <div className="admin-thread-question">{selected.question}</div>

              {selected.escalation?.note && (
                <div className="admin-panel-note">
                  <MessageCircleQuestion size={14} />
                  <span>{selected.escalation.note}</span>
                </div>
              )}

              <div className="admin-thread-meta">
                <span>学生：{selected.student.name || '匿名学生'}</span>
                <span>来源：{courseLabel(selected.courseId)}</span>
                <span>引用：{selected.sources.length} 条知识库内容</span>
                {selected.attachment && <span>附件：{selected.attachment.name}</span>}
              </div>

              {selected.studentSupplement && (
                <div className="admin-thread-quote">
                  <strong>学生补充</strong>
                  <p>{selected.studentSupplement.text}</p>
                </div>
              )}

              {selected.externalAnswer && (
                <div className="admin-thread-quote admin-thread-ai">
                  <strong>
                    <Sparkles size={12} />
                    AI 参考答复 · {selected.externalAnswer.model}
                  </strong>
                  <p>{selected.externalAnswer.text}</p>
                  <span className="admin-thread-ai-note">
                    已发送给学生，仅供参考；请核实后以校园主理人身份回复。
                  </span>
                </div>
              )}

              {selected.teacherReply ? (
                <div className="admin-thread-reply">
                  <div className="admin-thread-reply-head">
                    <strong>已回复</strong>
                    <span>
                      {selected.teacherReply.by} · {shortTime(selected.teacherReply.at)}
                    </span>
                  </div>
                  <p>{selected.teacherReply.text}</p>
                  {selected.teacherReply.faqId && (
                    <span className="admin-thread-reply-note">
                      <ShieldCheck size={12} />
                      已沉淀为校园 FAQ
                    </span>
                  )}
                </div>
              ) : selected.courseId === 'campus' ? (
                <div className="admin-thread-compose">
                  <div className="admin-thread-compose-head">
                    <strong>以校园主理人身份回复</strong>
                    <span>回复后会发送站内通知；学生开启邮件提醒时会收到邮件。</span>
                  </div>
                  <textarea
                    className="input admin-thread-textarea"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="把学校政策、办理流程或可靠经验写清楚，尽量给出可执行的下一步…"
                    rows={6}
                    maxLength={8000}
                  />
                  <label className={`admin-thread-check ${canSediment ? '' : 'is-disabled'}`}>
                    <input
                      type="checkbox"
                      checked={replySediment && canSediment}
                      disabled={!canSediment}
                      onChange={(event) => setReplySediment(event.target.checked)}
                    />
                    <span>
                      同时沉淀为校园 FAQ
                      <em>{canSediment ? '回复会进入知识库' : '写满 40 字后可勾选'}</em>
                    </span>
                  </label>
                  <div className="admin-thread-compose-actions">
                    <span>{replyText.trim().length} / 8000</span>
                    <button
                      className="button button-primary"
                      onClick={() => void submitReply()}
                      disabled={sending || replyText.trim().length < 8}
                    >
                      <Send size={14} />
                      {sending ? '发送中…' : '回复并通知学生'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-thread-readonly">
                  <ShieldCheck size={16} />
                  <span>课程问题由对应任课教师在教师端处理；管理端只查看，不代替课程老师回复。</span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div
          className="admin-confirm-backdrop"
          role="presentation"
          onClick={() => {
            if (!deleting) setDeleteTarget(null)
          }}
        >
          <div
            className="admin-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-thread-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-confirm-head">
              <Trash2 size={18} />
              <strong id="admin-delete-thread-title">删除这条学生问题？</strong>
            </div>
            <p className="admin-confirm-question">{deleteTarget.question}</p>
            <span className="admin-confirm-note">
              删除后学生端、教师端和管理端都不再显示这条问答，且无法恢复。已沉淀的
              FAQ 和已上传的附件文件会保留。
            </span>
            <div className="admin-confirm-actions">
              <button
                className="button button-ghost"
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={deleting}
                onClick={() => void removeThread()}
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
