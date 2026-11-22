import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  Loader2,
  Presentation,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../auth'
import { ApiError, apiGet, apiPost } from '../lib/api'
import { readRememberedEmail } from '../lib/authStorage'
import { isNativeApp, setAuthStatusDark } from '../lib/nativeShell'
import { PILOT_COURSE_LABELS, PILOT_COURSE_IDS } from '../data/pilot'
import { majorOptions } from '../data/major'
import { BrandMark } from './ui'

type Mode = 'login' | 'register' | 'reset'

const DEMO_STUDENT = { email: 'student@shishuo.local', password: 'student123' }
const DEMO_TEACHER = { email: 'teacher@shishuo.local', password: 'teacher123' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthScreen() {
  const { login, register, error: sessionError } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState(() => readRememberedEmail())
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [name, setName] = useState('')
  const [college, setCollege] = useState('')
  const [grade, setGrade] = useState('')
  const [major, setMajor] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [codeSending, setCodeSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 演示账号区块只在服务端开启演示账号时显示（SHISHUO_DEMO_ACCOUNTS）。
  const [demoEnabled, setDemoEnabled] = useState(false)
  // 教师自助注册只在服务端配置了邀请码时开放（TEACHER_INVITE_CODE）。
  const [teacherOpen, setTeacherOpen] = useState(false)
  const [registerRole, setRegisterRole] = useState<'student' | 'teacher'>('student')
  const [inviteCode, setInviteCode] = useState('')
  const [teacherCourses, setTeacherCourses] = useState<string[]>([])

  // 登录页顶部是深色 hero：状态栏用浅色图标；滚到表单区后恢复主题色。
  useEffect(() => {
    if (!isNativeApp()) return
    const story = document.querySelector<HTMLElement>('.auth-story')
    const sync = () => {
      const inset =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'),
        ) || 0
      setAuthStatusDark(story ? story.getBoundingClientRect().bottom > inset + 1 : true)
    }
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      setAuthStatusDark(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiGet<{ demoAccounts?: boolean; teacherRegistration?: boolean }>('/api/health')
      .then((health) => {
        if (cancelled) return
        setDemoEnabled(health.demoAccounts === true)
        setTeacherOpen(health.teacherRegistration === true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    setCode('')
    setDevCode(null)
    setCooldown(0)
    // 注册页不自动带入上次登录邮箱，避免覆盖新账号；回到登录仍保留记忆邮箱。
    setEmail(next === 'register' ? '' : readRememberedEmail())
    setRegisterRole('student')
    setInviteCode('')
    setTeacherCourses([])
    setCollege('')
    setGrade('')
    setMajor('')
    setStudentNo('')
  }

  const fillDemo = (account: 'student' | 'teacher') => {
    const demo = account === 'teacher' ? DEMO_TEACHER : DEMO_STUDENT
    setMode('login')
    setEmail(demo.email)
    setPassword(demo.password)
    setError(null)
    setNotice(null)
    setCode('')
    setDevCode(null)
  }

  const sendCode = async () => {
    if (codeSending || cooldown > 0) return
    const target = email.trim()
    if (!EMAIL_RE.test(target)) {
      setError('请先输入有效的邮箱。')
      return
    }
    setCodeSending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await apiPost<{
        expiresIn: number
        devMode?: boolean
        delivery?: string
        devCode?: string
      }>('/api/auth/email-code', {
        email: target,
        purpose: mode === 'reset' ? 'reset' : 'register',
      })
      setCooldown(60)
      setDevCode(result.devCode ?? null)
      if (result.delivery === 'hidden') {
        setNotice('如果该邮箱已注册，验证码会发送到邮箱。')
      } else if (result.devMode && result.devCode) {
        setNotice('本地开发模式：验证码已生成，可直接填入。')
      } else {
        setNotice('验证码已发送，请查收邮箱。')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '验证码发送失败，请稍后重试。')
    } finally {
      setCodeSending(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else if (mode === 'register') {
        if (!/^\d{6}$/.test(code.trim())) {
          setError('请输入 6 位邮箱验证码。')
          return
        }
        const asTeacher = registerRole === 'teacher'
        if (asTeacher && !inviteCode.trim()) {
          setError('教师注册需要邀请码，请向管理员获取。')
          return
        }
        if (asTeacher && teacherCourses.length === 0) {
          setError('请选择至少一门要任教的课程。')
          return
        }
        if (!asTeacher) {
          if (!college.trim()) {
            setError('请填写学院。')
            return
          }
          if (!grade.trim()) {
            setError('请填写年级，例如 2024级。')
            return
          }
          if (!major.trim()) {
            setError('请填写专业。')
            return
          }
          if (!/^[A-Za-z0-9]{6,24}$/.test(studentNo.trim())) {
            setError('请填写有效学号（6–24 位数字或字母）。')
            return
          }
        }
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          code: code.trim(),
          ...(asTeacher
            ? { role: 'teacher' as const, inviteCode: inviteCode.trim(), courses: teacherCourses }
            : {
                college: college.trim(),
                grade: grade.trim(),
                major: major.trim(),
                studentNo: studentNo.trim(),
              }),
        })
      } else {
        if (!/^\d{6}$/.test(code.trim())) {
          setError('请输入 6 位邮箱验证码。')
          return
        }
        await apiPost('/api/auth/reset-password', {
          email: email.trim(),
          code: code.trim(),
          newPassword,
        })
        setMode('login')
        setPassword('')
        setNewPassword('')
        setCode('')
        setDevCode(null)
        setCooldown(0)
        setNotice('密码已重置，请用新密码登录。')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const isTeacherRegister = mode === 'register' && registerRole === 'teacher'
  const title =
    mode === 'register'
      ? isTeacherRegister
        ? '创建一个教师账号'
        : '创建一个学生账号'
      : mode === 'reset'
        ? '用邮箱重置密码'
        : '回到你的课程空间'
  const lede =
    mode === 'register'
      ? isTeacherRegister
        ? '教师注册需要管理员邀请码；注册后进入所任课程的待办台。'
        : '先验证邮箱，再自动登录；教师账号由学校管理员分配。'
      : mode === 'reset'
        ? '输入注册邮箱，获取验证码后设置新密码。'
        : ''

  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand">
          <BrandMark size={40} />
          <div>
            <strong>师说</strong>
            <span>AI 双通道课程答疑</span>
          </div>
        </div>

        <div className="auth-story-main">
          <h1>
            学生问得清楚
            <br />
            老师答得省力
          </h1>

          <div className="auth-pilot-row" aria-label="本期试点课程">
            {PILOT_COURSE_IDS.map((id) => (
              <span key={id}>{PILOT_COURSE_LABELS[id]}</span>
            ))}
          </div>
        </div>

        <p className="auth-story-foot">演示数据均为虚构教师与学生，不冒充任何真实授课老师。</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <span className="eyebrow">
              {mode === 'reset'
                ? '账号找回'
                : mode === 'register'
                  ? isTeacherRegister
                    ? '教师注册'
                    : '学生注册'
                  : '账号登录'}
            </span>
            <h2>{title}</h2>
            {lede && <p>{lede}</p>}
          </div>

          {mode === 'reset' ? (
            <button className="auth-back-button" type="button" onClick={() => switchMode('login')}>
              <ArrowLeft size={15} />
              返回登录
            </button>
          ) : (
            <div className="auth-tabs" role="tablist" aria-label="登录或注册">
              <button
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'is-active' : ''}
                onClick={() => switchMode('login')}
              >
                登录
              </button>
              <button
                role="tab"
                aria-selected={mode === 'register'}
                className={mode === 'register' ? 'is-active' : ''}
                onClick={() => switchMode('register')}
              >
                {teacherOpen ? '注册' : '学生注册'}
              </button>
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && teacherOpen && (
              <div className="auth-role-toggle" role="group" aria-label="注册身份">
                <button
                  type="button"
                  className={registerRole === 'student' ? 'is-active' : ''}
                  aria-pressed={registerRole === 'student'}
                  onClick={() => {
                    setRegisterRole('student')
                    setError(null)
                  }}
                >
                  学生
                </button>
                <button
                  type="button"
                  className={registerRole === 'teacher' ? 'is-active' : ''}
                  aria-pressed={registerRole === 'teacher'}
                  onClick={() => {
                    setRegisterRole('teacher')
                    setError(null)
                  }}
                >
                  教师
                </button>
              </div>
            )}
            {mode === 'register' && (
              <label className="field">
                <span className="field-label">姓名</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={isTeacherRegister ? '例如：李芸' : '老师看到的提问人姓名'}
                  autoComplete="name"
                  required
                />
              </label>
            )}
            {mode === 'register' && !isTeacherRegister && (
              <div className="auth-info-grid">
                <label className="field">
                  <span className="field-label">学院</span>
                  <input
                    className="input"
                    value={college}
                    onChange={(event) => setCollege(event.target.value)}
                    placeholder="例如：计算机学院"
                    autoComplete="organization"
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">年级</span>
                  <input
                    className="input"
                    value={grade}
                    onChange={(event) => setGrade(event.target.value)}
                    placeholder="例如：2024级"
                    list="register-grade-options"
                    required
                  />
                  <datalist id="register-grade-options">
                    {['2026级', '2025级', '2024级', '2023级', '2022级', '2021级'].map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  <span className="field-label">专业</span>
                  <input
                    className="input"
                    value={major}
                    onChange={(event) => setMajor(event.target.value)}
                    placeholder="例如：计算机科学与技术"
                    list="register-major-options"
                    required
                  />
                  <datalist id="register-major-options">
                    {majorOptions().map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  <span className="field-label">学号</span>
                  <input
                    className="input"
                    value={studentNo}
                    onChange={(event) => setStudentNo(event.target.value)}
                    placeholder="例如：202410010031"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={24}
                    required
                  />
                  <span className="field-hint">仅用于个人资料，不会公开展示。</span>
                </label>
              </div>
            )}
            <label className="field">
              <span className="field-label">邮箱</span>
              <input
                className="input"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@school.edu.cn"
                autoComplete={mode === 'register' ? 'off' : 'username'}
                required
              />
            </label>
            {mode !== 'reset' && (
              <label className="field">
                <span className="field-label">密码</span>
                <input
                  className="input"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'register' ? '至少 8 位' : '输入密码'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  required
                />
              </label>
            )}
            {mode === 'login' && (
              <div className="auth-forgot-row">
                <span />
                <button type="button" className="auth-forgot" onClick={() => switchMode('reset')}>
                  忘记密码？
                </button>
              </div>
            )}

            {mode !== 'login' && (
              <label className="field">
                <span className="field-label">邮箱验证码</span>
                <div className="auth-code-row">
                  <input
                    className="input"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 位验证码"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                  />
                  <button
                    className="button button-secondary auth-send-code"
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={codeSending || cooldown > 0}
                  >
                    {codeSending ? (
                      <Loader2 size={14} className="spin-icon" />
                    ) : cooldown > 0 ? (
                      `${cooldown}s`
                    ) : (
                      '获取验证码'
                    )}
                  </button>
                </div>
                {devCode && (
                  <div className="auth-dev-code">
                    <span>本地开发验证码</span>
                    <strong>{devCode}</strong>
                    <button
                      type="button"
                      onClick={() => {
                        setCode(devCode)
                        setNotice(null)
                      }}
                    >
                      填入
                    </button>
                  </div>
                )}
                <span className="field-hint">
                  {mode === 'reset'
                    ? '验证码会发送到注册邮箱，10 分钟内有效。'
                    : '注册前需要验证邮箱，验证码 10 分钟内有效。'}
                </span>
              </label>
            )}

            {isTeacherRegister && (
              <label className="field">
                <span className="field-label">教师邀请码</span>
                <input
                  className="input"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="向管理员获取"
                  autoComplete="off"
                />
                <span className="field-hint">没有邀请码？请联系课程管理员开通。</span>
              </label>
            )}

            {isTeacherRegister && (
              <div className="field">
                <span className="field-label">任课课程（至少选一门）</span>
                <div className="auth-course-picker">
                  {PILOT_COURSE_IDS.map((courseId) => {
                    const active = teacherCourses.includes(courseId)
                    return (
                      <button
                        key={courseId}
                        type="button"
                        className={active ? 'auth-course-option is-active' : 'auth-course-option'}
                        aria-pressed={active}
                        onClick={() =>
                          setTeacherCourses((current) =>
                            current.includes(courseId)
                              ? current.filter((id) => id !== courseId)
                              : [...current, courseId],
                          )
                        }
                      >
                        {active ? '✓ ' : ''}
                        {PILOT_COURSE_LABELS[courseId] ?? courseId}
                      </button>
                    )
                  })}
                </div>
                <span className="field-hint">
                  选中的课程会决定登录后能看到哪些待办台与知识库。
                </span>
              </div>
            )}

            {mode === 'reset' && (
              <label className="field">
                <span className="field-label">新密码</span>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            )}

            {(error || sessionError) && (
              <div className="inline-note danger">
                <ShieldCheck size={14} />
                <span>{error || sessionError}</span>
              </div>
            )}
            {notice && !error && !sessionError && (
              <div className="auth-success">
                <ShieldCheck size={14} />
                <span>{notice}</span>
              </div>
            )}

            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin-icon" /> : <ArrowRight size={16} />}
              {busy
                ? '正在处理…'
                : mode === 'login'
                  ? '登录'
                  : mode === 'register'
                    ? '注册并进入'
                    : '重置密码'}
            </button>

            {mode === 'login' && (
              <p className="auth-remember-hint">
                本机会保留登录状态 30 天，下次打开不用再输账号密码；公用设备请用完退出。
              </p>
            )}
          </form>

          {mode !== 'reset' && demoEnabled && (
            <div className="auth-demo">
              <div className="auth-demo-head">
                <span>演示账号</span>
              </div>
              <div className="auth-demo-actions">
                <button type="button" onClick={() => fillDemo('student')}>
                  <GraduationCap size={16} />
                  <span>
                    <strong>学生 · 林晓</strong>
                    <em>student@shishuo.local</em>
                  </span>
                </button>
                <button type="button" onClick={() => fillDemo('teacher')}>
                  <Presentation size={16} />
                  <span>
                    <strong>教师 · 陈砚（管理员）</strong>
                    <em>teacher@shishuo.local</em>
                  </span>
                </button>
              </div>
            </div>
          )}

        </div>
      </section>
    </div>
  )
}
