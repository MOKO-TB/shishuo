import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  FolderOpen,
  Link2,
  Loader2,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '../../components/ui'
import {
  chaoxingOverview,
  logoutChaoxing,
  markChaoxingRead,
  syncChaoxing,
  type ChaoxingItem,
  type ChaoxingKind,
  type ChaoxingOverview,
} from '../../lib/chaoxing'
import { ChaoxingModal } from './ChaoxingPanel'

const KIND_META: Record<
  ChaoxingKind,
  { label: string; icon: typeof MessageCircle; hint: string }
> = {
  message: { label: '课程消息', icon: MessageCircle, hint: '老师发布的课程通知与消息' },
  assignment: { label: '作业', icon: ClipboardList, hint: '待完成与已完成的作业' },
  material: { label: '资料', icon: FolderOpen, hint: '课程课件与参考资料' },
}

function fmt(ts: number | null | undefined) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dayLabel(ts: number | null | undefined) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function ChaoxingView() {
  const [overview, setOverview] = useState<ChaoxingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<ChaoxingKind>('message')
  const [courseFilter, setCourseFilter] = useState('')
  const [bindOpen, setBindOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOverview(await chaoxingOverview())
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习通数据加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const syncNow = async () => {
    setSyncing(true)
    setError('')
    setNotice('')
    try {
      const result = await syncChaoxing()
      const failed = result.errors?.length ?? 0
      setNotice(
        `同步完成：消息 ${result.messages}、作业 ${result.assignments}、资料 ${result.materials}${
          failed ? `；${failed} 项未读到` : ''
        }`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习通同步失败。')
    } finally {
      setSyncing(false)
    }
  }

  const logout = async () => {
    try {
      await logoutChaoxing()
      setOverview((current) => (current ? { ...current, connected: false } : current))
      setNotice('已退出学习通。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出学习通失败。')
    }
  }

  const openItem = async (item: ChaoxingItem) => {
    try {
      if (!item.read_at) {
        setOverview(await markChaoxingRead(item.id))
      }
    } catch {
      // 标记已读失败不挡打开原文
    }
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  const items = useMemo(() => {
    return (overview?.items ?? []).filter(
      (item) =>
        item.kind === tab && (!courseFilter || item.course_id === courseFilter),
    )
  }, [overview?.items, tab, courseFilter])

  const connected = Boolean(overview?.connected)

  return (
    <div className="page cx-page">
      <header className="cx-page-head">
        <div>
          <div className="eyebrow">学生端 / 学习通</div>
          <h1 className="display-title">
            课程消息、作业与资料，
            <br />
            <span>从一个地方看。</span>
          </h1>
          <p className="page-lede">
            绑定学习通后，师说只读同步老师发布的课程消息、作业和资料。不保存学习通密码，不代交作业，也不会影响你在学习通里的原始内容。
          </p>
        </div>
        <div className="cx-page-head-side">
          {connected ? (
            <>
              <Badge tone="jade">已绑定</Badge>
              <span>{overview?.lastSyncAt ? `上次同步 ${fmt(overview.lastSyncAt)}` : '还没有同步'}</span>
              <button className="button button-primary" onClick={() => void syncNow()} disabled={syncing}>
                {syncing ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
                {syncing ? '同步中…' : '同步全部'}
              </button>
              <button className="button button-ghost" onClick={() => setBindOpen(true)}>
                <Link2 size={14} />
                课程与绑定
              </button>
              <button className="button button-ghost" onClick={() => void logout()}>
                <LogOut size={14} />
                退出学习通
              </button>
            </>
          ) : (
            <button className="button button-primary" onClick={() => setBindOpen(true)}>
              <QrCode size={14} />
              扫码绑定学习通
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="inline-note danger cx-note">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="inline-note cx-note">
          <BookOpen size={14} />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="cx-page-loading">
          <Loader2 size={20} className="spin-icon" />
          正在加载学习通…
        </div>
      ) : !connected ? (
        <section className="cx-page-bind">
          <span className="cx-big-icon">
            <QrCode size={30} />
          </span>
          <h2>绑定你的学习通</h2>
          <p>
            用学习通 App 扫码确认后，师说会同步你的课程消息、作业和资料。密码不经过师说，登录态按学生账号隔离。
          </p>
          <div className="cx-page-bind-actions">
            <button className="button button-primary" onClick={() => setBindOpen(true)}>
              <QrCode size={14} />
              生成登录二维码
            </button>
            {(overview?.items.length ?? 0) > 0 && (
              <button className="button button-ghost" onClick={() => void load()}>
                查看已同步内容
              </button>
            )}
          </div>
          <p className="cx-hint">
            当前站点是 HTTP 演示环境；正式使用前建议启用 HTTPS。学习通接口可能随平台改版失效。
          </p>
        </section>
      ) : (
        <>
          <div className="cx-page-stats">
            {(Object.keys(KIND_META) as ChaoxingKind[]).map((kind) => {
              const Icon = KIND_META[kind].icon
              return (
                <button
                  key={kind}
                  className={`cx-page-stat ${tab === kind ? 'is-active' : ''}`}
                  onClick={() => setTab(kind)}
                >
                  <span className="cx-page-stat-icon">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{overview?.counts[kind] ?? 0}</strong>
                    <em>{KIND_META[kind].label}</em>
                  </span>
                </button>
              )
            })}
            <div className="cx-page-stat is-static">
              <span className="cx-page-stat-icon">
                <BookOpen size={16} />
              </span>
              <span>
                <strong>{overview?.unread ?? 0}</strong>
                <em>未读</em>
              </span>
            </div>
          </div>

          <div className="cx-page-toolbar">
            <div className="cx-page-tabs" role="tablist" aria-label="学习通内容">
              {(Object.keys(KIND_META) as ChaoxingKind[]).map((kind) => (
                <button
                  key={kind}
                  role="tab"
                  aria-selected={tab === kind}
                  className={tab === kind ? 'is-active' : ''}
                  onClick={() => setTab(kind)}
                >
                  {KIND_META[kind].label}
                  <span>{overview?.counts[kind] ?? 0}</span>
                </button>
              ))}
            </div>
            <select
              className="cx-course-filter"
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              aria-label="按课程筛选"
            >
              <option value="">全部课程</option>
              {(overview?.courses ?? []).map((course) => (
                <option key={course.id} value={course.course_id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div className="cx-page-list">
            {items.length === 0 ? (
              <div className="cx-page-empty">
                <span className="cx-big-icon">
                  {tab === 'message' ? <MessageCircle size={24} /> : tab === 'assignment' ? <ClipboardList size={24} /> : <FolderOpen size={24} />}
                </span>
                <strong>还没有{KIND_META[tab].label}</strong>
                <p>{KIND_META[tab].hint}。点「同步全部」拉取最新内容。</p>
                <button className="button button-primary" onClick={() => void syncNow()} disabled={syncing}>
                  {syncing ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
                  同步全部
                </button>
              </div>
            ) : (
              items.map((item) => {
                const Icon = KIND_META[item.kind].icon
                return (
                  <button
                    key={item.id}
                    className={`cx-page-item ${item.read_at ? '' : 'is-unread'}`}
                    onClick={() => void openItem(item)}
                  >
                    <span className="cx-page-item-icon">
                      <Icon size={17} />
                    </span>
                    <span className="cx-page-item-body">
                      <span className="cx-page-item-top">
                        <strong>{item.title}</strong>
                        {!item.read_at && <i className="cx-unread-dot" />}
                      </span>
                      <span className="cx-page-item-meta">
                        <em>{item.course_name}</em>
                        {item.due_at ? <span>截止 {fmt(item.due_at)}</span> : null}
                        {item.published_at ? <span>{dayLabel(item.published_at)}</span> : null}
                      </span>
                      {item.body && <span className="cx-page-item-text">{item.body}</span>}
                    </span>
                    {item.url && <ExternalLink size={15} className="cx-page-item-link" />}
                  </button>
                )
              })
            )}
          </div>
        </>
      )}

      <ChaoxingModal open={bindOpen} onClose={() => setBindOpen(false)} onChanged={load} />
    </div>
  )
}
