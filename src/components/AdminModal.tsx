import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BookOpen,
  Check,
  CircleAlert,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { PILOT_COURSE_IDS, PILOT_COURSE_LABELS } from '../data/pilot'
import { useAuth } from '../auth'
import { Badge, Modal } from './ui'

interface AdminUser {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher'
  courses: string[]
  isAdmin: boolean
  createdAt: number
}

interface AuditEntry {
  id: number
  revision: number
  userId: string
  userName: string
  role: string
  actions: string[]
  courseIds: string[]
  summary: string
  mode: string | null
  createdAt: number
}

interface AiUsageDay {
  date: string
  calls: number
  tokens: number
  errors: number
}

interface AiUsageUser {
  userId: string
  name: string
  role: string
  calls: number
  tokens: number
}

interface AiUsageSummary {
  configured: boolean
  model: string
  dailyLimit: number
  totals: { calls: number; tokens: number; errors: number; callsToday: number }
  days: AiUsageDay[]
  topUsers: AiUsageUser[]
}

interface AdminModalProps {
  open: boolean
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

type Tab = 'users' | 'audit' | 'usage'

const ACTION_LABELS: Record<string, string> = {
  'thread-create': '新建提问',
  'thread-escalate': '转交',
  'thread-join': '同问',
  'thread-follow-up': '追问',
  'thread-resolve': '已解决',
  'thread-unresolve': '撤销解决',
  'thread-withdraw': '撤下',
  'thread-reopen': '重新发起',
  'thread-feedback': '反馈',
  'thread-delete': '删除提问',
  'teacher-reply': '老师回复',
  'reply-undone': '撤回回复',
  'thread-info-request': '请学生补充',
  'thread-supplement': '学生补充',
  'thread-group': '调整同题组',
  'faq-add': '新增 FAQ',
  'faq-update': '编辑 FAQ',
  'faq-delete': '删除 FAQ',
  'course-note-update': '更新课程公告',
  'password-reset': '重置密码',
  'user-create': '创建账号',
  'user-update': '修改账号',
  'permission-denied': '越权拒绝',
  reset: '重置空间',
  restore: '恢复备份',
  'state-save': '同步状态',
}

function roleLabel(role: string) {
  return role === 'teacher' ? '教师' : role === 'admin' ? '管理员' : '学生'
}

function courseLabel(courseId: string) {
  return PILOT_COURSE_LABELS[courseId] ?? courseId
}

function timeLabel(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminModal({ open, onClose, notify }: AdminModalProps) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [usage, setUsage] = useState<AiUsageSummary | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'teacher' as 'student' | 'teacher',
    courses: [] as string[],
  })
  const [editName, setEditName] = useState('')
  const [editCourses, setEditCourses] = useState<string[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [resetArmed, setResetArmed] = useState(false)

  const selected = useMemo(
    () => users.find((item) => item.id === selectedId) ?? users[0],
    [selectedId, users],
  )
  const isSelf = selected?.id === user?.id
  const teacherCount = users.filter((item) => item.role === 'teacher').length
  const studentCount = users.filter((item) => item.role === 'student').length
  const usageMaxCalls = usage ? Math.max(1, ...usage.days.map((day) => day.calls)) : 1

  const loadUsers = async () => {
    const result = await apiGet<{ users: AdminUser[] }>('/api/admin/users')
    setUsers(result.users)
    if (!result.users.some((item) => item.id === selectedId)) {
      setSelectedId(result.users[0]?.id ?? '')
    }
  }

  const loadAudit = async () => {
    const result = await apiGet<{ logs: AuditEntry[] }>('/api/admin/audit?limit=100')
    setAudit(result.logs)
  }

  const loadUsage = async () => {
    const result = await apiGet<AiUsageSummary>('/api/admin/ai-usage')
    setUsage(result)
  }

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadUsers(), loadAudit(), loadUsage()])
    } catch (err) {
      setError(err instanceof Error ? err.message : '后台数据加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setTab('users')
    setCreateOpen(false)
    setNewUser({ name: '', email: '', password: '', role: 'teacher', courses: [] })
    setNewPassword('')
    setResetArmed(false)
    void loadAll()
    // Reload only when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!selected) {
      setEditName('')
      setEditCourses([])
      return
    }
    setEditName(selected.name)
    setEditCourses([...selected.courses])
    setNewPassword('')
    setResetArmed(false)
  }, [selected?.id, selected?.name, selected?.courses?.join(',')])

  const toggleCourse = (courseId: string, target: 'new' | 'edit') => {
    const setter = target === 'new' ? setNewUser : null
    if (target === 'new') {
      setter!((current) => ({
        ...current,
        courses: current.courses.includes(courseId)
          ? current.courses.filter((id) => id !== courseId)
          : [...current.courses, courseId],
      }))
      return
    }
    setEditCourses((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    )
  }

  const createUser = async () => {
    if (saving) return
    setError(null)
    if (newUser.role === 'teacher' && newUser.courses.length === 0) {
      setError('教师账号至少选择一门课程。')
      return
    }
    setSaving(true)
    try {
      const result = await apiPost<{ user: AdminUser }>('/api/admin/users', {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        courses: newUser.role === 'teacher' ? newUser.courses : [],
      })
      await loadAll()
      setSelectedId(result.user.id)
      setCreateOpen(false)
      setNewUser({ name: '', email: '', password: '', role: 'teacher', courses: [] })
      notify(`已创建${newUser.role === 'teacher' ? '教师' : '学生'}账号`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建账号失败。')
    } finally {
      setSaving(false)
    }
  }

  const saveUser = async () => {
    if (!selected || saving) return
    setError(null)
    if (selected.role === 'teacher' && editCourses.length === 0) {
      setError('教师账号至少保留一门课程。')
      return
    }
    setSaving(true)
    try {
      const result = await apiPatch<{ user: AdminUser }>(`/api/admin/users/${selected.id}`, {
        name: editName,
        ...(selected.role === 'teacher' ? { courses: editCourses } : {}),
      })
      await loadAll()
      setSelectedId(result.user.id)
      notify('账号已更新')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存账号失败。')
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async () => {
    if (!selected || saving) return
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await apiPost(`/api/admin/users/${selected.id}/password`, { password: newPassword })
      setNewPassword('')
      setResetArmed(false)
      notify(isSelf ? '自己的密码已更新' : `已重置 ${selected.name} 的密码，旧会话已退出`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置密码失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="管理员 · 账号与审计"
      title="试点后台"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            账号与课程分配立即生效；重置密码会注销该账号的其它登录。所有操作都会写入审计日志。
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={() => void loadAll()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
              刷新
            </button>
            <button className="button button-primary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="admin-tabs" role="tablist" aria-label="试点后台">
        <button
          role="tab"
          aria-selected={tab === 'users'}
          className={tab === 'users' ? 'is-active' : ''}
          onClick={() => setTab('users')}
        >
          <Users size={15} />
          账号管理
          <span>{users.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'audit'}
          className={tab === 'audit' ? 'is-active' : ''}
          onClick={() => setTab('audit')}
        >
          <ShieldCheck size={15} />
          操作审计
          <span>{audit.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'usage'}
          className={tab === 'usage' ? 'is-active' : ''}
          onClick={() => setTab('usage')}
        >
          <Activity size={15} />
          AI 用量
          <span>{usage?.totals.calls ?? 0}</span>
        </button>
      </div>

      {error && (
        <div className="inline-note danger admin-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {tab === 'users' ? (
        <div className="admin-users">
          <aside className="admin-user-list">
            <div className="admin-list-head">
              <div>
                <strong>{teacherCount}</strong> 位教师 · <strong>{studentCount}</strong> 位学生
              </div>
              <button className="text-button" onClick={() => setCreateOpen((current) => !current)}>
                <Plus size={14} />
                新建账号
              </button>
            </div>

            {createOpen && (
              <div className="admin-create">
                <label className="field">
                  <span className="field-label">角色</span>
                  <select
                    className="input"
                    value={newUser.role}
                    onChange={(event) =>
                      setNewUser({
                        ...newUser,
                        role: event.target.value as 'student' | 'teacher',
                      })
                    }
                  >
                    <option value="teacher">教师</option>
                    <option value="student">学生</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">姓名</span>
                  <input
                    className="input"
                    value={newUser.name}
                    onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                    placeholder="例如：王老师"
                  />
                </label>
                <label className="field">
                  <span className="field-label">邮箱</span>
                  <input
                    className="input"
                    value={newUser.email}
                    onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                    placeholder="teacher@school.edu.cn"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span className="field-label">初始密码</span>
                  <input
                    className="input"
                    type="password"
                    value={newUser.password}
                    onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                  />
                </label>
                {newUser.role === 'teacher' && (
                  <div className="admin-course-picker">
                    <span className="field-label">分配课程</span>
                    <div>
                      {PILOT_COURSE_IDS.map((courseId) => (
                        <button
                          key={courseId}
                          type="button"
                          className={newUser.courses.includes(courseId) ? 'is-active' : ''}
                          onClick={() => toggleCourse(courseId, 'new')}
                        >
                          {newUser.courses.includes(courseId) && <Check size={12} />}
                          {courseLabel(courseId)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="admin-create-actions">
                  <button className="button button-ghost" onClick={() => setCreateOpen(false)}>
                    取消
                  </button>
                  <button className="button button-primary" onClick={() => void createUser()} disabled={saving}>
                    {saving ? <Loader2 size={14} className="spin-icon" /> : <Plus size={14} />}
                    创建账号
                  </button>
                </div>
              </div>
            )}

            <div className="admin-user-rows">
              {users.map((item) => (
                <button
                  key={item.id}
                  className={`admin-user-row ${selected?.id === item.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className={`admin-user-icon is-${item.role}`}>
                    {item.role === 'teacher' ? <UserCog size={15} /> : <GraduationCap size={15} />}
                  </span>
                  <span className="admin-user-info">
                    <strong>{item.name}</strong>
                    <em>{item.email}</em>
                  </span>
                  <span className="admin-user-side">
                    {item.isAdmin && <Badge tone="gold">管理员</Badge>}
                    <small>{item.courses.map(courseLabel).join(' / ') || roleLabel(item.role)}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="admin-user-editor">
            {selected ? (
              <>
                <div className="admin-editor-head">
                  <div>
                    <span className="eyebrow">{roleLabel(selected.role)}账号</span>
                    <h3>{selected.name}</h3>
                    <p>{selected.email}</p>
                  </div>
                  {selected.isAdmin && (
                    <Badge tone="gold">
                      <ShieldCheck size={12} /> 管理员
                    </Badge>
                  )}
                </div>

                <label className="field">
                  <span className="field-label">显示姓名</span>
                  <input
                    className="input"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </label>

                {selected.role === 'teacher' && (
                  <div className="admin-course-picker">
                    <span className="field-label">可管理课程</span>
                    <div>
                      {PILOT_COURSE_IDS.map((courseId) => (
                        <button
                          key={courseId}
                          type="button"
                          disabled={isSelf}
                          className={editCourses.includes(courseId) ? 'is-active' : ''}
                          onClick={() => toggleCourse(courseId, 'edit')}
                        >
                          {editCourses.includes(courseId) && <Check size={12} />}
                          {courseLabel(courseId)}
                        </button>
                      ))}
                    </div>
                    {isSelf && (
                      <span className="field-hint">管理员不能修改自己的课程分配，避免把自己锁在后台之外。</span>
                    )}
                  </div>
                )}

                <div className="admin-editor-actions">
                  <button className="button button-primary" onClick={() => void saveUser()} disabled={saving}>
                    {saving ? <Loader2 size={14} className="spin-icon" /> : null}
                    保存账号
                  </button>
                  <span className="field-hint">创建于 {timeLabel(selected.createdAt)}</span>
                </div>

                <div className="admin-password-block">
                  <div className="admin-password-head">
                    <div>
                      <strong>重置密码</strong>
                      <p>
                        {isSelf
                          ? '更新自己的密码，其它设备会退出登录。'
                          : '适用于学生或教师忘记密码；保存后该账号的旧会话全部失效。'}
                      </p>
                    </div>
                    <BookOpen size={16} />
                  </div>
                  <div className="admin-password-row">
                    <input
                      className="input"
                      type="password"
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value)
                        setResetArmed(false)
                      }}
                      placeholder="输入新密码（至少 8 位）"
                      autoComplete="new-password"
                    />
                    <button
                      className={`button ${resetArmed ? 'button-danger' : 'button-secondary'}`}
                      onClick={() => void resetPassword()}
                      disabled={saving || (resetArmed && newPassword.length < 8)}
                    >
                      {resetArmed ? '确认重置' : '重置密码'}
                    </button>
                  </div>
                  {resetArmed && (
                    <p className="admin-password-warn">
                      再点一次「确认重置」才会生效。当前输入不会显示在页面上。
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="admin-empty">先创建一个账号。</p>
            )}
          </section>
        </div>
      ) : tab === 'audit' ? (
        <div className="admin-audit">
          {audit.length === 0 ? (
            <p className="admin-empty">还没有操作记录。</p>
          ) : (
            audit.map((entry) => (
              <article className="admin-audit-row" key={entry.id}>
                <div className="admin-audit-main">
                  <div className="admin-audit-top">
                    <strong>{entry.userName}</strong>
                    <Badge tone={entry.role === 'teacher' ? 'jade' : 'neutral'}>
                      {roleLabel(entry.role)}
                    </Badge>
                    <span>{timeLabel(entry.createdAt)}</span>
                    {entry.revision > 0 && <em>rev {entry.revision}</em>}
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
      ) : (
        <div className="admin-usage">
          {!usage ? (
            <p className="admin-empty">用量数据加载中…</p>
          ) : (
            <>
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
                  <strong>{usage.totals.tokens.toLocaleString()}</strong>
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
                          style={{
                            width: `${Math.max(4, (day.calls / usageMaxCalls) * 100)}%`,
                          }}
                        />
                      </span>
                      <em>
                        {day.calls} 次 · {day.tokens.toLocaleString()} tokens
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
                        {item.calls} 次 · {item.tokens.toLocaleString()} tokens
                      </em>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
