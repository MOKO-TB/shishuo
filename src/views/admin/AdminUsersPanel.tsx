import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  CircleAlert,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import { apiGet, apiPatch, apiPost } from '../../lib/api'
import { PILOT_COURSE_IDS } from '../../data/pilot'
import { useAuth } from '../../auth'
import { Badge } from '../../components/ui'
import type { AdminUser } from '../../data/adminTypes'
import { courseLabel, roleLabel, shortTime } from './helpers'

interface AdminUsersPanelProps {
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

export function AdminUsersPanel({ notify }: AdminUsersPanelProps) {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
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

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiGet<{ users: AdminUser[] }>('/api/admin/users')
      setUsers(result.users)
      if (!result.users.some((item) => item.id === selectedId)) {
        setSelectedId(result.users[0]?.id ?? '')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '账号数据加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (target === 'new') {
      setNewUser((current) => ({
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
      await loadUsers()
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
      await loadUsers()
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
    <div className="admin-panel admin-panel-users">
      <div className="admin-panel-toolbar">
        <div>
          <strong>账号管理</strong>
          <span>
            {teacherCount} 位教师 · {studentCount} 位学生 · 管理员默认拥有校园生活域
          </span>
        </div>
        <div className="admin-panel-actions">
          <button className="button button-ghost" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : undefined} />
            刷新
          </button>
          <button className="button button-primary" onClick={() => setCreateOpen((current) => !current)}>
            <Plus size={14} />
            新建账号
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-note danger admin-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {createOpen && (
        <div className="admin-create admin-create-wide">
          <label className="field">
            <span className="field-label">角色</span>
            <select
              className="input"
              value={newUser.role}
              onChange={(event) =>
                setNewUser({ ...newUser, role: event.target.value as 'student' | 'teacher' })
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
              <span className="field-hint">校园生活域由管理员自动拥有，不需要在这里分配。</span>
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

      <div className="admin-users">
        <aside className="admin-user-list">
          <div className="admin-list-head">
            <div>
              <strong>{users.length}</strong> 个账号
            </div>
            <span className="field-hint">点击左侧账号编辑</span>
          </div>
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
                  <small>
                    {item.isAdmin
                      ? '校园主理人'
                      : item.courses.map(courseLabel).join(' / ') || roleLabel(item.role)}
                  </small>
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
                    <ShieldCheck size={12} /> 管理员 · 校园主理人
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
                    <span className="field-hint">
                      管理员不能修改自己的课程分配，避免把自己锁在后台之外。
                    </span>
                  )}
                  <span className="field-hint">
                    校园生活域对所有管理员开放，不需要额外勾选。
                  </span>
                </div>
              )}

              <div className="admin-editor-actions">
                <button className="button button-primary" onClick={() => void saveUser()} disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin-icon" /> : null}
                  保存账号
                </button>
                <span className="field-hint">创建于 {shortTime(selected.createdAt)}</span>
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
    </div>
  )
}
