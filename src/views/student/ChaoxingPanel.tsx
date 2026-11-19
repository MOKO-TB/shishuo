import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
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
import { Badge, Modal } from '../../components/ui'
import {
  chaoxingOverview,
  logoutChaoxing,
  markChaoxingRead,
  pollChaoxingLogin,
  selectChaoxingCourse,
  startChaoxingLogin,
  syncChaoxing,
  type ChaoxingItem,
  type ChaoxingKind,
  type ChaoxingLoginStart,
  type ChaoxingOverview,
  loginChaoxingPassword,
} from '../../lib/chaoxing'

const KIND_META: Record<
  ChaoxingKind,
  { label: string; icon: typeof MessageCircle; tone: 'jade' | 'blue' | 'gold' }
> = {
  message: { label: '消息', icon: MessageCircle, tone: 'jade' },
  assignment: { label: '作业', icon: ClipboardList, tone: 'blue' },
  material: { label: '资料', icon: FolderOpen, tone: 'gold' },
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

function shortTime(ts: number | null | undefined) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function ChaoxingRailCard() {
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState<ChaoxingOverview | null>(null)

  const load = useCallback(async () => {
    try {
      setOverview(await chaoxingOverview())
    } catch {
      // 未登录/接口暂时不可用时保持静默，点开绑定面板再提示。
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const unread = overview?.unread ?? 0
  const connected = Boolean(overview?.connected)
  const latest = overview?.items.slice(0, 3) ?? []

  return (
    <>
      <div className="rail-card cx-rail-card">
        <div className="rail-card-head">
          <div>
            <div className="eyebrow">学习通</div>
            <h3>{connected ? '课程消息与待办' : '绑定学习通'}</h3>
          </div>
          {unread > 0 ? (
            <Badge tone="gold">{unread} 条未读</Badge>
          ) : (
            <BookOpen size={17} className="rail-head-icon" />
          )}
        </div>
        {connected ? (
          <>
            <div className="cx-rail-counts">
              {(Object.keys(KIND_META) as ChaoxingKind[]).map((kind) => (
                <span key={kind}>
                  {KIND_META[kind].label} {overview?.counts[kind] ?? 0}
                </span>
              ))}
            </div>
            {latest.length > 0 ? (
              <div className="cx-rail-list">
                {latest.map((item) => (
                  <button
                    key={item.id}
                    className={`cx-rail-item ${item.read_at ? '' : 'is-unread'}`}
                    onClick={() => setOpen(true)}
                  >
                    <span>{item.title}</span>
                    <em>{item.course_name || KIND_META[item.kind].label}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rail-empty-line">已绑定，点开同步作业、资料和课程消息。</p>
            )}
            <button className="text-button class-card-link" onClick={() => setOpen(true)}>
              查看全部
              <ExternalLink size={13} />
            </button>
          </>
        ) : (
          <>
            <p className="rail-empty-line">
              绑定后接收老师在学习通发布的作业、资料和课程消息；只读同步，不保存密码。
            </p>
            <button className="text-button class-card-link" onClick={() => setOpen(true)}>
              扫码绑定学习通
              <QrCode size={13} />
            </button>
          </>
        )}
      </div>

      <ChaoxingModal open={open} onClose={() => setOpen(false)} onChanged={load} />
    </>
  )
}

export function ChaoxingModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [overview, setOverview] = useState<ChaoxingOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [login, setLogin] = useState<ChaoxingLoginStart | null>(null)
  const [pollState, setPollState] = useState<'waiting' | 'scanned' | 'syncing'>('waiting')
  const [cxAccount, setCxAccount] = useState('')
  const [cxPassword, setCxPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [tab, setTab] = useState<ChaoxingKind>('message')
  const [courseFilter, setCourseFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await chaoxingOverview()
      setOverview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习通数据加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setLogin(null)
    setError('')
    setNotice('')
    setCourseFilter('')
    setTab('message')
    void load()
  }, [open, load])

  const syncNow = useCallback(async () => {
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
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习通同步失败。')
    } finally {
      setSyncing(false)
    }
  }, [load, onChanged])

  useEffect(() => {
    if (!login) return
    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const result = await pollChaoxingLogin(login.loginId)
        if (cancelled) return
        if (result.status === 'connected') {
          window.clearInterval(timer)
          setPollState('syncing')
          setLogin(null)
          setNotice('学习通绑定成功，正在同步课程内容…')
          await syncNow()
        } else if (result.status === 'expired') {
          window.clearInterval(timer)
          setLogin(null)
          setError('二维码已过期，请重新生成。')
        } else if (result.status === 'scanned') {
          setPollState('scanned')
          setNotice(`已扫码${result.nickname ? `：${result.nickname}` : ''}，请在手机上点确认。`)
        } else if (result.status === 'refreshed' && result.qr) {
          setLogin((current) => (current ? { ...current, qr: result.qr! } : current))
          setPollState('waiting')
          setNotice('二维码已自动刷新，请重新扫码。')
        } else {
          setPollState('waiting')
        }
      } catch (err) {
        if (cancelled) return
        window.clearInterval(timer)
        setLogin(null)
        setError(err instanceof Error ? err.message : '学习通登录状态检查失败。')
      }
    }, 2600)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [login, syncNow])

  const startLogin = async () => {
    setStarting(true)
    setError('')
    setNotice('')
    try {
      setLogin(await startChaoxingLogin())
      setPollState('waiting')
    } catch (err) {
      setError(err instanceof Error ? err.message : '二维码生成失败。')
    } finally {
      setStarting(false)
    }
  }

  const submitPassword = async () => {
    if (!cxAccount.trim() || !cxPassword) {
      setError('请填写学习通账号和密码。')
      return
    }
    setPasswordBusy(true)
    setError('')
    setNotice('')
    try {
      await loginChaoxingPassword(cxAccount.trim(), cxPassword)
      setCxAccount('')
      setCxPassword('')
      setLogin(null)
      setNotice('学习通绑定成功，正在同步课程内容…')
      await syncNow()
    } catch (err) {
      setError(err instanceof Error ? err.message : '账号密码登录失败。')
    } finally {
      setPasswordBusy(false)
    }
  }

  const logout = async () => {
    try {
      await logoutChaoxing()
      setLogin(null)
      setOverview((current) => (current ? { ...current, connected: false } : current))
      setNotice('已退出学习通，服务器端登录态已清除。')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出学习通失败。')
    }
  }

  const openItem = async (item: ChaoxingItem) => {
    try {
      if (!item.read_at) {
        const next = await markChaoxingRead(item.id)
        setOverview(next)
        onChanged()
      }
    } catch {
      // 标记已读失败不挡打开原文。
    }
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  const toggleCourse = async (id: string, selected: boolean) => {
    try {
      setOverview(await selectChaoxingCourse(id, selected))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '课程选择保存失败。')
    }
  }

  const items = useMemo(() => {
    const list = overview?.items ?? []
    return list.filter(
      (item) => item.kind === tab && (!courseFilter || item.course_id === courseFilter),
    )
  }, [overview?.items, tab, courseFilter])

  const connected = Boolean(overview?.connected)

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="学生账号 · 只读同步"
      title="学习通消息、作业与资料"
      size="lg"
      className="cx-modal"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="cx-modal-foot-note">
            只同步标题、正文和原页面链接，不代交作业，不批量下载受版权保护的资料。
          </span>
          <div className="modal-actions-right">
            {connected && (
              <button className="button button-ghost" onClick={() => void logout()}>
                <LogOut size={14} />
                退出学习通
              </button>
            )}
            {connected && (
              <button
                className="button button-primary"
                onClick={() => void syncNow()}
                disabled={syncing}
              >
                {syncing ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
                {syncing ? '同步中…' : '同步全部'}
              </button>
            )}
            <button className="button button-ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="inline-note danger cx-note">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="inline-note cx-note">
          <Check size={14} />
          <span>{notice}</span>
        </div>
      )}

      {!connected ? (
        <div className="cx-bind">
          {login ? (
            <>
              <div className="cx-qr">
                <img src={login.qr} alt="学习通登录二维码" />
                <div>
                  <strong>用学习通 App 扫码</strong>
                  <p>打开学习通 → 右上角「扫一扫」→ 扫描二维码 → 在手机上点「确认登录」。</p>
                  <p className={`cx-scan-status is-${pollState}`}>
                    {pollState === 'scanned'
                      ? '已扫码，请在手机上点「确认登录」…'
                      : pollState === 'syncing'
                        ? '已确认，正在同步课程内容…'
                        : '等待扫码…'}
                  </p>
                  <p className="cx-hint">二维码约 5 分钟失效；绑定成功后会自动同步课程内容。</p>
                </div>
              </div>
              <div className="cx-bind-actions">
                <button
                  className="button button-ghost"
                  onClick={() => void startLogin()}
                  disabled={starting}
                >
                  <RefreshCw size={14} className={starting ? 'spin-icon' : undefined} />
                  换一张二维码
                </button>
              </div>
            </>
          ) : (
            <div className="cx-bind-empty">
              <span className="cx-big-icon">
                <QrCode size={28} />
              </span>
              <strong>绑定你的学习通</strong>
              <p>
                扫码后，师说只读同步老师发布的课程消息、作业和资料；不保存学习通密码，也不会代你提交作业。
              </p>
              <button
                className="button button-primary"
                onClick={() => void startLogin()}
                disabled={starting}
              >
                {starting ? <Loader2 size={14} className="spin-icon" /> : <QrCode size={14} />}
                {starting ? '正在生成二维码…' : '生成学习通登录二维码'}
              </button>
              <p className="cx-hint">
                当前站点是 HTTP 演示环境；正式使用前建议启用 HTTPS。学习通接口可能随平台改版失效。
              </p>
            </div>
          )}
          <details className="cx-password-box">
            <summary>扫码不方便？用账号密码登录（备用）</summary>
            <p className="cx-hint">
              密码只用于本次登录换取学习通 Cookie，不保存；当前 HTTP 演示环境不建议使用真实密码。
            </p>
            <div className="cx-password-grid">
              <input
                className="input"
                value={cxAccount}
                onChange={(event) => setCxAccount(event.target.value)}
                placeholder="手机号 / 超星号"
                autoComplete="username"
              />
              <input
                className="input"
                type="password"
                value={cxPassword}
                onChange={(event) => setCxPassword(event.target.value)}
                placeholder="学习通密码"
                autoComplete="current-password"
              />
              <button
                className="button button-secondary"
                onClick={() => void submitPassword()}
                disabled={passwordBusy}
              >
                {passwordBusy ? <Loader2 size={14} className="spin-icon" /> : <LogOut size={14} />}
                {passwordBusy ? '登录中…' : '账号密码登录'}
              </button>
            </div>
          </details>
        </div>
      ) : (
        <>
          <div className="cx-status-row">
            <div>
              <Badge tone="jade">已绑定</Badge>
              <span className="cx-status-meta">
                {overview?.lastSyncAt ? `上次同步 ${fmt(overview.lastSyncAt)}` : '还没有同步过'}
              </span>
            </div>
            {overview?.lastError && (
              <span className="cx-status-error" title={overview.lastError}>
                {overview.lastError.slice(0, 60)}
              </span>
            )}
          </div>

          <div className="cx-toolbar">
            <div className="cx-kind-tabs" role="tablist" aria-label="学习通内容">
              {(Object.keys(KIND_META) as ChaoxingKind[]).map((kind) => {
                const Icon = KIND_META[kind].icon
                return (
                  <button
                    key={kind}
                    role="tab"
                    aria-selected={tab === kind}
                    className={tab === kind ? 'is-active' : ''}
                    onClick={() => setTab(kind)}
                  >
                    <Icon size={14} />
                    {KIND_META[kind].label}
                    <span>{overview?.counts[kind] ?? 0}</span>
                  </button>
                )
              })}
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

          <div className="cx-item-list">
            {loading ? (
              <p className="cx-empty">
                <Loader2 size={16} className="spin-icon" /> 加载中…
              </p>
            ) : items.length === 0 ? (
              <p className="cx-empty">
                {syncing
                  ? '正在同步学习通内容…'
                  : `还没有${KIND_META[tab].label}。点右上角「同步全部」拉取。`}
              </p>
            ) : (
              items.map((item) => {
                const Icon = KIND_META[item.kind].icon
                return (
                  <button
                    key={item.id}
                    className={`cx-item ${item.read_at ? '' : 'is-unread'}`}
                    onClick={() => void openItem(item)}
                  >
                    <span className="cx-item-icon">
                      <Icon size={16} />
                    </span>
                    <span className="cx-item-body">
                      <span className="cx-item-top">
                        <strong>{item.title}</strong>
                        {!item.read_at && <i className="cx-unread-dot" />}
                      </span>
                      <span className="cx-item-meta">
                        {item.course_name}
                        {item.due_at ? ` · 截止 ${fmt(item.due_at)}` : ''}
                        {item.published_at ? ` · ${shortTime(item.published_at)}` : ''}
                      </span>
                      {item.body && <span className="cx-item-text">{item.body}</span>}
                    </span>
                    {item.url && <ExternalLink size={14} className="cx-item-link" />}
                  </button>
                )
              })
            )}
          </div>

          <details className="cx-courses">
            <summary>
              <Link2 size={14} />
              同步课程（{(overview?.courses ?? []).filter((course) => course.selected).length}/
              {overview?.courses.length ?? 0}）
            </summary>
            <div className="cx-course-list">
              {(overview?.courses ?? []).map((course) => (
                <label key={course.id} className="cx-course-row">
                  <input
                    type="checkbox"
                    checked={Boolean(course.selected)}
                    onChange={(event) => void toggleCourse(course.id, event.target.checked)}
                  />
                  <span>
                    <strong>{course.name}</strong>
                    {course.teacher && <em>{course.teacher}</em>}
                  </span>
                </label>
              ))}
              {(overview?.courses ?? []).length === 0 && (
                <p className="cx-empty">还没有课程；点「同步全部」重新拉取课程列表。</p>
              )}
            </div>
          </details>
        </>
      )}
    </Modal>
  )
}
