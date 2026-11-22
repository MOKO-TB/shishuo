import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import {
  allTeachers,
  courseById,
  isSeededCourse,
  isSeededTeacher,
} from '../data/seed'
import { majorOptions } from '../data/major'
import { useStore } from '../store'
import { useAuth } from '../auth'
import {
  rememberAttachmentConsent,
  resetAttachmentConsent,
  shouldAskAttachmentConsent,
} from '../lib/attachmentConsent'
import {
  DEFAULT_JW_BASE,
  JW_BROWSER_HELP,
  finishJwLogin,
  jwStatus,
  logoutJw,
  readJwScores,
  readJwTimetable,
  startJwLogin,
  type JwAutoQuery,
  type JwDiagnostic,
  type JwLoginStart,
} from '../lib/jw'
import {
  bindScheduleCourses,
  courseToneMap,
  dateInputValue,
  getProfile,
  mondayOf,
  monthDayOf,
  parseDateInput,
  periodTime,
  runsInWeek,
  scoreStats,
  sectionBell,
  setProfile,
  sortSchedule,
  studentCourses,
  teachingWeek,
  useProfile,
  weekLabel,
  weekMonday,
  weekdayLabel,
  weekdayNumber,
  withMatchedCourse,
  type CourseTone,
  type ScheduleEntry,
  type ScoreRow,
  type StudentProfile,
} from '../lib/profile'
import { errorMessage } from '../lib/ai'
import {
  downloadScheduleIcs,
  downloadScoresCsv,
  scheduleEventCount,
  scheduleExportReady,
} from '../lib/export'
import {
  downloadNativeUpdate,
  getNativeAppInfo,
  installPendingNativeUpdate,
  isNativeApp,
  openExternalUrl,
  openNativeBatterySettings,
  openNativeInstallPermissionSettings,
  requestPinScheduleWidget,
  subscribeUpdateDownload,
  syncNativeSchedule,
  triggerHaptic,
  type NativeAppInfo,
  type UpdateDownloadProgress,
} from '../lib/nativeShell'
import {
  readClassReminderPrefs,
  syncClassReminders,
  writeClassReminderPrefs,
  type ClassReminderPrefs,
} from '../lib/classReminders'
import { checkAndroidAppUpdate, type AppUpdateCheckResult } from '../lib/appUpdate'
import { makeId } from '../lib/utils'
import { Avatar, Badge, EmptyState, Modal } from './ui'
import { PageSheet } from './PageSheet'

interface AccountModalProps {
  open: boolean
  initialTab?: TabKey
  onClose: () => void
  onOpenFeedback?: (tab?: 'compose' | 'mine') => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  /** page：作为二级页面展示（默认，设置场景）；dialog：保留弹窗形态 */
  variant?: 'page' | 'dialog'
}

type TabKey = 'identity' | 'schedule' | 'scores' | 'teachers'

const emptyManual = { course: '', teacher: '', room: '', day: 1, start: 1, end: 2 }

function WeekGrid({
  entries,
  week,
  termStart,
  tones,
}: {
  entries: ScheduleEntry[]
  week: number
  termStart: number | null
  tones: Map<string, CourseTone>
}) {
  if (entries.length === 0) {
    return <p className="account-bind-hint">这一周没有课（周次范围之外的课程不会显示）。</p>
  }
  const days = [1, 2, 3, 4, 5, 6, 7]
  const today = weekdayNumber()
  const monday = weekMonday(termStart, week)
  const maxSection = Math.max(12, ...entries.map((entry) => entry.endSection))
  const rows = Array.from({ length: maxSection }, (_, index) => index + 1)
  return (
    <div className="week-grid" role="table" aria-label="周课表">
      <div className="week-grid-corner" style={{ gridColumn: 1, gridRow: 1 }} />
      {days.map((day) => (
        <div
          className={`week-grid-day ${day === today ? 'is-today' : ''}`}
          key={day}
          style={{ gridColumn: day + 1, gridRow: 1 }}
        >
          <strong>{weekdayLabel(day)}</strong>
          <span>{monthDayOf(monday + (day - 1) * 86_400_000)}</span>
        </div>
      ))}
      {rows.map((section) => (
        <Fragment key={section}>
          <div className="week-grid-period" style={{ gridColumn: 1, gridRow: section + 1 }}>
            <strong>{section}</strong>
            <em>{sectionBell(section)}</em>
          </div>
          {days.map((day) => (
            <div
              className={`week-grid-cell ${day === today ? 'is-today' : ''}`}
              key={day}
              style={{ gridColumn: day + 1, gridRow: section + 1 }}
            />
          ))}
        </Fragment>
      ))}
      {entries.map((entry) => (
        <div
          className={`week-class tone-${tones.get(entry.course) ?? 'jade'}`}
          key={entry.id}
          style={{
            gridColumn: entry.day + 1,
            gridRow: `${entry.startSection + 1} / ${entry.endSection + 2}`,
          }}
          title={`${entry.course}${entry.teacher ? ` · ${entry.teacher}` : ''}${entry.room ? ` · ${entry.room}` : ''}${entry.weeks ? ` · ${entry.weeks}` : ''}`}
        >
          <strong>{entry.course}</strong>
          {periodTime(entry) && <span className="week-class-time">{periodTime(entry)}</span>}
          {entry.teacher && <span>{entry.teacher}</span>}
          {entry.room && <span>{entry.room}</span>}
          <span className="week-class-weeks">{weekLabel(entry.weeks)}</span>
        </div>
      ))}
    </div>
  )
}

function WeekBoard({
  entries,
  week,
  termStart,
  tones,
  label,
  onPrev,
  onNext,
  onReset,
  resetLabel,
  busy,
  zoom,
  onToggleZoom,
}: {
  entries: ScheduleEntry[]
  week: number
  termStart: number | null
  tones: Map<string, CourseTone>
  label: string
  onPrev?: () => void
  onNext?: () => void
  onReset?: () => void
  resetLabel?: string
  busy?: boolean
  zoom: boolean
  onToggleZoom: () => void
}) {
  return (
    <div className={`week-board ${zoom ? 'is-zoomed' : ''}`}>
      <div className="week-toolbar">
        <div className="week-nav">
          {onPrev && (
            <button className="week-nav-button" onClick={onPrev} aria-label="上一周" disabled={busy}>
              ‹
            </button>
          )}
          <strong>
            {label}
            {busy && <Loader2 size={13} className="spin-icon week-loading" />}
          </strong>
          {onNext && (
            <button className="week-nav-button" onClick={onNext} aria-label="下一周" disabled={busy}>
              ›
            </button>
          )}
          {onReset && (
            <button className="text-button" onClick={onReset}>
              {resetLabel ?? '回到教务当前周'}
            </button>
          )}
        </div>
        {zoom && (
          <button className="text-button" onClick={onToggleZoom}>
            收起
          </button>
        )}
      </div>
      <WeekGrid entries={entries} week={week} termStart={termStart} tones={tones} />
      <p className="week-footnote">左栏节次时间是学校标准作息；课程块里的时间来自教务课表，教务没写时按节次推算。「第 X 周」是教务标注的上课周次。</p>
    </div>
  )
}

function JwLoginFields({
  session,
  account,
  password,
  captcha,
  busy,
  onAccount,
  onPassword,
  onCaptcha,
  onRefresh,
}: {
  session: JwLoginStart
  account: string
  password: string
  captcha: string
  busy: boolean
  onAccount: (value: string) => void
  onPassword: (value: string) => void
  onCaptcha: (value: string) => void
  onRefresh: () => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  return (
    <div className="account-jw-login">
      <div className="account-jw-login-head">
        <strong>服务器代登录</strong>
        <span>账号密码只用于本次登录，服务端不保存；登录态按学生账号隔离。</span>
      </div>
      <div className="account-jw-login-grid">
        <label className="field">
          <span className="field-label">教务账号</span>
          <input
            className="input"
            value={account}
            onChange={(event) => onAccount(event.target.value)}
            placeholder="学号"
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <div className="account-password-wrap">
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => onPassword(event.target.value)}
              placeholder="教务密码"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="account-password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              title={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="field account-jw-captcha">
          <span className="field-label">验证码</span>
          <div>
            <input
              className="input"
              value={captcha}
              onChange={(event) => onCaptcha(event.target.value)}
              placeholder="验证码"
              maxLength={8}
              autoComplete="off"
            />
            {session.captcha ? (
              <img src={session.captcha} alt="教务验证码" />
            ) : (
              <span className="account-jw-captcha-empty">验证码加载失败</span>
            )}
            <button
              type="button"
              className="button button-ghost"
              onClick={onRefresh}
              disabled={busy}
            >
              换一张
            </button>
          </div>
        </label>
      </div>
    </div>
  )
}

function NativeMobileSettingsGroup({
  isStudent,
  schedule,
  termStart,
  studentName,
  appInfo,
  notify,
}: {
  isStudent: boolean
  schedule: ScheduleEntry[]
  termStart: number | null
  studentName?: string
  appInfo: NativeAppInfo | null
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<AppUpdateCheckResult | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<UpdateDownloadProgress | null>(null)
  const [reminder, setReminder] = useState<ClassReminderPrefs>(() => readClassReminderPrefs())

  useEffect(() => {
    if (!isNativeApp()) return
    return subscribeUpdateDownload(setDownloadProgress)
  }, [])

  useEffect(() => {
    if (downloadProgress?.status !== 'permission_required') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void installPendingNativeUpdate().then((status) => {
        if (status === 'installing') {
          setDownloadProgress((prev) =>
            prev
              ? { ...prev, status: 'installing', message: '已调起系统安装界面，请确认安装' }
              : null,
          )
        }
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [downloadProgress?.status])

  if (!isNativeApp()) return null

  const updateReminder = async (next: ClassReminderPrefs) => {
    writeClassReminderPrefs(next)
    setReminder(next)
    triggerHaptic('light')
    const result = await syncClassReminders({
      schedule,
      termStart,
      requestPermission: next.enabled,
    })
    if (next.enabled && result.permissionDenied) {
      const reverted = { ...next, enabled: false }
      writeClassReminderPrefs(reverted)
      setReminder(reverted)
      notify('未获得系统通知权限，请在系统设置里允许师说发通知', 'info')
      return
    }
    if (next.enabled) {
      notify(
        result.scheduled > 0
          ? `已开启课前 ${next.leadMinutes} 分钟提醒（已排期未来 7 天 ${result.scheduled} 节课）`
          : `已开启课前 ${next.leadMinutes} 分钟提醒`,
      )
    } else {
      notify('已关闭上课前本地提醒', 'info')
    }
  }

  const handlePinWidget = async () => {
    triggerHaptic('light')
    if (appInfo && appInfo.versionCode < 2) {
      notify('当前版本不支持桌面小组件，请先在上方检查更新到最新版', 'info')
      return
    }
    await syncNativeSchedule({ schedule, termStart, studentName })
    const status = await requestPinScheduleWidget()
    if (status === 'requested') {
      notify('已发起添加；若桌面没有弹窗，请长按桌面空白处 → 小组件 → 搜索「师说」')
    } else {
      notify('请长按桌面空白处 → 小组件 → 搜索「师说」；OPPO 若找不到，请选「师说 · 今日课表（兼容版）」', 'info')
    }
  }

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    try {
      const result = await checkAndroidAppUpdate()
      setUpdateInfo(result)
      if (!result) {
        notify('检查更新失败，请稍后重试', 'danger')
        return
      }
      if (result.hasUpdate) {
        notify(`发现新版本 v${result.latest.versionName}，点击即可下载安装`)
      } else {
        notify(`当前已是最新版 v${result.current.versionName}`, 'info')
      }
    } catch {
      notify('检查更新失败，请检查网络连接', 'danger')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    if (!updateInfo) return
    triggerHaptic('medium')
    if (updateInfo.signatureMismatch) {
      const url = new URL(updateInfo.latest.downloadUrl, window.location.origin).href
      await openExternalUrl(url)
      notify('已开始下载正式版安装包；下载完成后请先卸载当前旧版再安装，以免签名冲突 (-7)')
      return
    }
    setDownloadProgress({
      status: 'downloading',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      message: '正在准备下载…',
    })
    const res = await downloadNativeUpdate(
      updateInfo.latest.downloadUrl,
      updateInfo.latest.versionName,
      updateInfo.latest.fallbackUrl,
    )
    if (res.mode === 'browser') {
      setDownloadProgress(null)
      notify('当前旧版壳层需通过系统浏览器安装本次更新，升级后支持应用内直接更新', 'info')
    } else if (res.mode === 'downloadManager') {
      setDownloadProgress(null)
      notify('已开始下载安装包，请在系统通知栏查看进度并点击安装')
    } else if (res.status === 'error') {
      notify(res.message || '应用内下载失败，请重试', 'danger')
    }
  }

  const handleOpenBattery = async () => {
    const ok = await openNativeBatterySettings()
    if (!ok) {
      notify('请到手机「设置 → 应用 → 师说 → 电池」设为无限制，减少后台通知延迟', 'info')
    }
  }

  return (
    <section className="settings-group" aria-labelledby="settings-native-mobile">
      <h3 className="settings-group-title" id="settings-native-mobile">
        安卓手机端
      </h3>
      <div className="settings-row-list">
        {isStudent && (
          <>
            <label className="settings-row">
              <span className="settings-row-copy">
                <strong>上课前本地自动提醒</strong>
                <small>
                  按当前课表在本机定时提醒（{reminder.leadMinutes} 分钟前），断网也能按时响。
                </small>
              </span>
              <input
                className="settings-switch"
                type="checkbox"
                checked={reminder.enabled}
                onChange={(event) =>
                  void updateReminder({ ...reminder, enabled: event.target.checked })
                }
              />
            </label>
            {reminder.enabled && (
              <div className="settings-row">
                <span className="settings-row-copy">
                  <strong>提前提醒时间</strong>
                  <small>修改后会立即重新排期未来 7 天的课程提醒。</small>
                </span>
                <select
                  aria-label="提前提醒时间"
                  value={reminder.leadMinutes}
                  onChange={(event) =>
                    void updateReminder({
                      ...reminder,
                      leadMinutes: Number(event.target.value) as ClassReminderPrefs['leadMinutes'],
                    })
                  }
                >
                  <option value={10}>提前 10 分钟</option>
                  <option value={15}>提前 15 分钟</option>
                  <option value={20}>提前 20 分钟</option>
                  <option value={30}>提前 30 分钟</option>
                </select>
              </div>
            )}
            <div className="settings-row">
              <span className="settings-row-copy">
                <strong>桌面课程表小组件</strong>
                <small>
                  把今日课程与教室放到手机桌面；断网时兜底页也会自动显示缓存的离线课表。
                </small>
              </span>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void handlePinWidget()}
              >
                <LayoutGrid size={14} />
                添加到桌面
              </button>
            </div>
          </>
        )}

        <div className="settings-row">
          <span className="settings-row-copy">
            <strong>后台通知保活</strong>
            <small>
              部分国产手机省电策略会延迟后台消息，可在电池设置中把师说设为“无限制”。
            </small>
          </span>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void handleOpenBattery()}
          >
            <ShieldCheck size={14} />
            去设置
          </button>
        </div>

        <div className="settings-row is-keep-hint">
          <span className="settings-row-copy">
            <strong>
              手机端版本号：
              {appInfo ? `v${appInfo.versionName} (Build ${appInfo.versionCode})` : '读取中…'}
            </strong>
            <small>
              {downloadProgress?.status === 'downloading' ||
              downloadProgress?.status === 'verifying' ||
              downloadProgress?.status === 'permission_required'
                ? downloadProgress.message
                : updateInfo?.hasUpdate && updateInfo.signatureMismatch
                  ? `发现正式版 v${updateInfo.latest.versionName}：当前为早期测试签名，请先点右侧下载再卸载旧版安装（避免 -7 签名错误）。`
                  : updateInfo?.hasUpdate
                    ? `有新版本 v${updateInfo.latest.versionName}：${updateInfo.latest.notes.replace(/\n+/g, ' ')}`
                    : appInfo && (appInfo.debuggable || appInfo.versionCode <= 2)
                      ? '当前为早期内测签名版；网页内容自动热更新。'
                      : '当前为正式签名版；网页自动热更新，客户端更新可在应用内直接下载安装。'}
            </small>
          </span>
          {downloadProgress?.status === 'permission_required' ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => void openNativeInstallPermissionSettings()}
            >
              允许安装权限
            </button>
          ) : updateInfo?.hasUpdate ? (
            <button
              type="button"
              className="button button-primary"
              disabled={
                downloadProgress?.status === 'downloading' ||
                downloadProgress?.status === 'verifying'
              }
              onClick={() => void handleDownloadUpdate()}
            >
              <Download size={14} />
              {downloadProgress?.status === 'downloading'
                ? downloadProgress.progress >= 0
                  ? `${downloadProgress.progress}%`
                  : '下载中'
                : downloadProgress?.status === 'verifying'
                  ? '校验中'
                  : updateInfo.signatureMismatch
                    ? `下载正式版 v${updateInfo.latest.versionName}`
                    : `更新 v${updateInfo.latest.versionName}`}
            </button>
          ) : (
            <button
              type="button"
              className="button button-ghost"
              disabled={checkingUpdate}
              onClick={() => void handleCheckUpdate()}
            >
              {checkingUpdate ? (
                <Loader2 size={14} className="spin-icon" />
              ) : (
                <Smartphone size={14} />
              )}
              {checkingUpdate ? '检查中' : '检查更新'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function FeedbackSettingsGroup({
  onOpenFeedback,
}: {
  onOpenFeedback?: (tab?: 'compose' | 'mine') => void
}) {
  if (!onOpenFeedback) return null
  return (
    <section className="settings-group" aria-labelledby="settings-feedback">
      <h3 className="settings-group-title" id="settings-feedback">
        意见反馈
      </h3>
      <div className="settings-row-list">
        <div className="settings-row is-keep-hint">
          <span className="settings-row-copy">
            <strong>告诉我们哪里不对</strong>
            <small>提交异常、体验建议或违规举报，查看处理进度与管理员回复。</small>
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => onOpenFeedback('mine')}
            >
              我的反馈
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => onOpenFeedback('compose')}
            >
              <MessageSquarePlus size={14} />
              写反馈
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function AttachmentPrivacyGroup({
  ask,
  onChange,
}: {
  ask: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <section className="settings-group" aria-labelledby="settings-attachment-privacy">
      <h3 className="settings-group-title" id="settings-attachment-privacy">
        隐私与附件
      </h3>
      <div className="settings-row-list">
        <label className="settings-row">
          <span className="settings-row-copy">
            <strong>上传前确认</strong>
            <small>网页版与文件上传前确认；App 内照片由系统相册权限管理。</small>
          </span>
          <input
            className="settings-switch"
            type="checkbox"
            checked={ask}
            onChange={(event) => onChange(event.target.checked)}
          />
        </label>
        <div className="settings-row is-static">
          <span className="settings-row-copy">
            <strong>照片走系统权限，文件逐次授权</strong>
            <small>
              App 内允许相册权限后可以浏览相册，但只会发送你本次选中的照片；文件由系统选择器逐次授权，安卓没有普通应用的“访问全部文件”权限。
            </small>
          </span>
        </div>
        <div className="settings-row is-static">
          <span className="settings-row-copy">
            <strong>附件可见性</strong>
            <small>
              学生题图可选择是否让任课老师查看原图；课程 FAQ 附件对本课程学生可见；管理员可能因内容审核查看附件。
            </small>
          </span>
        </div>
      </div>
    </section>
  )
}

export function AccountModal({
  open,
  initialTab = 'identity',
  variant = 'page',
  onClose,
  onOpenFeedback,
  notify,
}: AccountModalProps) {
  const profile = useProfile()
  const { user, logout: logoutAccount } = useAuth()
  const { data } = useStore()
  const [askAttachment, setAskAttachment] = useState(() => shouldAskAttachmentConsent())
  const [nativeAppInfo, setNativeAppInfo] = useState<NativeAppInfo | null>(null)
  const [tab, setTab] = useState<TabKey>('identity')

  useEffect(() => {
    if (!isNativeApp()) return
    void getNativeAppInfo().then(setNativeAppInfo)
  }, [])
  const [teacherQuery, setTeacherQuery] = useState('')
  const tabsRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState(profile)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_JW_BASE)
  const [connected, setConnected] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginSession, setLoginSession] = useState<JwLoginStart | null>(null)
  const [jwAccount, setJwAccount] = useState('')
  const [jwPassword, setJwPassword] = useState('')
  const [jwCaptcha, setJwCaptcha] = useState('')
  const [busy, setBusy] = useState<'open' | 'schedule' | 'scores' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ScheduleEntry[] | null>(null)
  const [unparsed, setUnparsed] = useState<string[]>([])
  const [diagnostics, setDiagnostics] = useState<JwDiagnostic[]>([])
  const [tried, setTried] = useState<string[]>([])
  const [tableSample, setTableSample] = useState('')
  const [scorePreview, setScorePreview] = useState<ScoreRow[] | null>(null)
  const [autoQuery, setAutoQuery] = useState<JwAutoQuery | null>(null)
  const [semester, setSemester] = useState('all')
  const [manual, setManual] = useState(emptyManual)
  const [courseHubOpen, setCourseHubOpen] = useState(false)
  const [courseHubTab, setCourseHubTab] = useState<'add' | 'manage'>('add')
  const [week, setWeek] = useState(1)
  const [pageWeek, setPageWeek] = useState<number | null>(null)
  const [zoom, setZoom] = useState(false)
  const [weekOptions, setWeekOptions] = useState<Array<{ value: string; text: string }>>([])
  const [weeksAvailable, setWeeksAvailable] = useState(false)
  const [remoteIndex, setRemoteIndex] = useState(0)
  const [remoteWeekLabel, setRemoteWeekLabel] = useState('')
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [termStart, setTermStart] = useState<number | null>(profile.termStart ?? null)
  const currentWeek = teachingWeek(termStart)
  const toneMap = courseToneMap(preview ?? profile.schedule)
  const isLocalMock = /127\.0\.0\.1|localhost/i.test(baseUrl)

  useEffect(() => {
    if (!open) return
    setForm(profile)
    setTermStart(profile.termStart ?? null)
    const preferredWeek = teachingWeek(profile.termStart)
    if (preferredWeek) setWeek(preferredWeek)
    setTab(initialTab)
    setTeacherQuery('')
    setError(null)
    setLoginOpen(false)
    setLoginSession(null)
    setJwPassword('')
    setJwCaptcha('')
    void jwStatus()
      .then((status) => {
        setConnected(status.connected)
        if (status.base) setBaseUrl(status.base)
      })
      .catch(() => undefined)
    // Only reset when the dialog opens; saving a tab must not jump back to identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return

    // 首次进入与再次切换回来都从最顶端开始，避免用户进来先看到页面中段。
    const toTop = () => {
      window.scrollTo({ top: 0, behavior: 'auto' })
      document.querySelector<HTMLElement>('.page-sheet-page')?.scrollTo?.({ top: 0 })
    }
    toTop()
    // 布局与动画结束后再兜一次，防止浏览器恢复上一次的滚动位置
    const timer = window.setTimeout(toTop, 60)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const strip = tabsRef.current
    const active = strip?.querySelector<HTMLElement>('button[aria-selected="true"]')
    if (!strip || !active) return
    const stripRect = strip.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    if (activeRect.left < stripRect.left || activeRect.right > stripRect.right) {
      strip.scrollBy({ left: activeRect.left - stripRect.left - 4, behavior: 'smooth' })
    }
  }, [tab, open])

  const realTeachers = useMemo(
    () => allTeachers().filter((teacher) => !isSeededTeacher(teacher.name)),
    [profile.customCourses],
  )
  const teacherRows = useMemo(() => {
    const normalizedQuery = teacherQuery.trim().toLowerCase()
    return realTeachers
      .map((teacher) => {
        const courses = teacher.courses.map((id) => courseById(id))
        const waiting = data.threads.filter(
          (thread) =>
            thread.status === 'pending' &&
            !thread.withdrawnAt &&
            teacher.courses.includes(thread.courseId),
        ).length
        return { teacher, courses, waiting }
      })
      .filter(({ teacher, courses }) => {
        if (!normalizedQuery) return true
        return (
          teacher.name.toLowerCase().includes(normalizedQuery) ||
          teacher.title.toLowerCase().includes(normalizedQuery) ||
          courses.some(
            (course) =>
              course.name.toLowerCase().includes(normalizedQuery) ||
              course.shortName.toLowerCase().includes(normalizedQuery),
          )
        )
      })
  }, [realTeachers, teacherQuery, data.threads])

  if (!open) return null

  const persist = (next: StudentProfile) => {
    const stored = setProfile(next)
    setForm(stored)
  }

  const persistDraft = (draft: StudentProfile, nextTermStart = termStart) => {
    const visibleCourses = studentCourses(draft)
    const defaultCourseId = visibleCourses.some((course) => course.id === draft.defaultCourseId)
      ? draft.defaultCourseId
      : (visibleCourses[0]?.id ?? 'ds')
    const next: StudentProfile = {
      ...draft,
      name: draft.name.trim() || '林晓',
      college: draft.college.trim(),
      major: draft.major.trim(),
      studentNo: draft.studentNo.trim(),
      schedule: sortSchedule(draft.schedule),
      defaultCourseId,
      termStart: nextTermStart,
    }
    persist(next)
  }

  const resetTransient = () => {
    setError(null)
    setUnparsed([])
    setDiagnostics([])
    setTried([])
    setTableSample('')
    setPreview(null)
    setScorePreview(null)
    setSemester('all')
  }

  const toggleTeacher = (name: string, waiting: number) => {
    const visible = !form.hiddenTeacherNames.includes(name)
    if (visible && waiting > 0) {
      notify(`${name}老师还有 ${waiting} 个待办，处理完再隐藏`, 'info')
      return
    }
    const next: StudentProfile = {
      ...form,
      hiddenTeacherNames: visible
        ? [...form.hiddenTeacherNames, name]
        : form.hiddenTeacherNames.filter((item) => item !== name),
    }
    persistDraft(next)
  }

  const startLogin = async () => {
    setBusy('open')
    setError(null)
    try {
      const session = await startJwLogin(baseUrl)
      setLoginSession(session)
      if (session.base) setBaseUrl(session.base)
      setJwPassword('')
      setJwCaptcha('')
      setLoginOpen(true)
      notify('请输入教务账号、密码和验证码；账号密码只用于本次登录，不保存。', 'info')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const refreshCaptcha = async () => {
    setBusy('open')
    setError(null)
    try {
      const session = await startJwLogin(baseUrl)
      setLoginSession(session)
      if (session.base) setBaseUrl(session.base)
      setJwCaptcha('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const completeLogin = async () => {
    if (!loginSession) {
      setError('验证码已失效，请重新登录教务。')
      return
    }
    if (!jwAccount.trim() || !jwPassword || !jwCaptcha.trim()) {
      setError('请填写教务账号、密码和验证码。')
      return
    }
    setBusy('open')
    setError(null)
    try {
      await finishJwLogin({
        loginId: loginSession.loginId,
        account: jwAccount.trim(),
        password: jwPassword,
        captcha: jwCaptcha.trim(),
      })
      setLoginOpen(false)
      setLoginSession(null)
      setConnected(true)
      setJwPassword('')
      setJwCaptcha('')
      notify('教务已连接，正在同步课表和成绩…', 'info')
      await readSchedule()
      await readScores()
    } catch (err) {
      setError(errorMessage(err))
      setJwCaptcha('')
      // 教务登录失败后旧验证码会话已失效，自动换一张，避免用户只能手动刷新。
      try {
        const next = await startJwLogin(baseUrl)
        setLoginSession(next)
        if (next.base) setBaseUrl(next.base)
      } catch {
        // 换验证码失败时保留原错误，用户可以手动点「换一张」。
      }
    } finally {
      setBusy(null)
    }
  }

  const logout = async () => {
    await logoutJw()
    setConnected(false)
    setLoginOpen(false)
    setLoginSession(null)
    setJwPassword('')
    setJwCaptcha('')
    notify('已退出教务，服务器端登录状态已清除', 'info')
  }

  const readSchedule = async (visible = false) => {
    setBusy('schedule')
    setError(null)
    try {
      // 强智 filters weeks server-side: read with 周次=全部 so cells carry their week ranges.
      const result = await readJwTimetable('all', visible)
      setDiagnostics(result.diagnostics)
      setTried(result.tried)
      setTableSample(result.tableSample)
      setUnparsed(result.unparsed)
      const entries = result.entries.map((entry) => ({ ...entry, id: entry.id || makeId('cls') }))
      setPreview(bindScheduleCourses(entries, form.customCourses).schedule)
      setWeekOptions(result.weekOptions)
      setWeeksAvailable(result.weeksAvailable)
      const index = result.weekOptions.findIndex((option) => option.value === result.selectedWeek)
      setRemoteIndex(index >= 0 ? index : 0)
      setRemoteWeekLabel(result.weekOptions[index >= 0 ? index : 0]?.text ?? '')
      const originalWeek = Number(result.currentWeekValue) || Number(result.selects?.zc)
      if (Number.isFinite(originalWeek) && originalWeek > 0) {
        setPageWeek(originalWeek)
        setWeek(originalWeek)
        if (!termStart) {
          // The page tells us which week it is; the calendar start is a human fact.
          const inferred = mondayOf() - (originalWeek - 1) * 7 * 86_400_000
          setTermStart(inferred)
          setForm((current) => ({ ...current, termStart: inferred }))
        }
      }
      if (entries.length === 0) {
        const tableCount = result.diagnostics.reduce((sum, item) => sum + item.tables, 0)
        setError(
          tableCount > 0
            ? `页面读到了 ${tableCount} 张表，但没认出课表结构。展开「查看读取诊断」能看到表格前几行；把地址和样例发我，就能按你们学校这版表格适配。`
            : '没有在当前页面读到表格。请确认已经登录、并且停在「学期课表」页，再试一次。',
        )
      }
    } catch (err) {
      setError(
        `${errorMessage(err)}${form.schedule.length > 0 ? ' 下面显示的是上次保存的课表。' : ''}`,
      )
    } finally {
      setBusy(null)
    }
  }

  const loadRemoteWeek = async (delta: number) => {
    const nextIndex = remoteIndex + delta
    const option = weekOptions[nextIndex]
    if (!option) return
    setLoadingWeek(true)
    setError(null)
    try {
      const result = await readJwTimetable(option.value)
      setPreview(
        bindScheduleCourses(
          result.entries.map((entry) => ({ ...entry, id: entry.id || makeId('cls') })),
          form.customCourses,
        ).schedule,
      )
      setDiagnostics(result.diagnostics)
      setRemoteIndex(nextIndex)
      setRemoteWeekLabel(option.text)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingWeek(false)
    }
  }

  const readScores = async (visible = false) => {
    setBusy('scores')
    setError(null)
    try {
      const result = await readJwScores(visible)
      setDiagnostics(result.diagnostics)
      setTried(result.tried)
      setTableSample(result.tableSample)
      const rows = result.rows.map((row) => ({ ...row, id: row.id || makeId('score') }))
      setScorePreview(rows)
      setAutoQuery(result.autoQuery ?? null)
      setSemester('all')
      if (rows.length > 0) {
        // 读取成功后直接保存到账号，校园工具 GPA 页会立即同步。
        persist({ ...getProfile(), scores: rows, scoresSyncedAt: Date.now() })
        setScorePreview(null)
        notify(`已同步 ${rows.length} 条成绩，GPA 已更新`)
      } else {
        const tableCount = result.diagnostics.reduce((sum, item) => sum + item.tables, 0)
        setError(
          tableCount > 0
            ? `页面读到了 ${tableCount} 张表，但没认出成绩表头。请确认停在「成绩查询」页；展开诊断能看到表格前几行。`
            : result.autoQuery?.clicked
              ? '已自动选择学期并点过查询，但仍没读到成绩表。请确认登录没有过期；必要时点「重新登录」再试一次。'
              : '没有在当前页面找到成绩表。请确认登录没有过期；必要时点「重新登录」再试一次。',
        )
      }
    } catch (err) {
      setError(
        `${errorMessage(err)}${form.scores.length > 0 ? ' 下面显示的是上次保存的成绩。' : ''}`,
      )
    } finally {
      setBusy(null)
    }
  }

  const saveProfile = () => {
    const visibleCourses = studentCourses(form)
    const defaultCourseId = visibleCourses.some((course) => course.id === form.defaultCourseId)
      ? form.defaultCourseId
      : (visibleCourses[0]?.id ?? 'ds')
    const next: StudentProfile = {
      ...form,
      name: form.name.trim() || '林晓',
      college: form.college.trim(),
      major: form.major.trim(),
      studentNo: form.studentNo.trim(),
      schedule: sortSchedule(form.schedule),
      defaultCourseId,
      termStart,
    }
    persist(next)
    notify('账号设置已同步到服务端')
  }

  const saveSchedule = () => {
    if (!preview || preview.length === 0) return
    const next: StudentProfile = {
      ...form,
      schedule: sortSchedule(preview),
      scheduleSource: 'jw',
      scheduleSyncedAt: Date.now(),
      termStart,
    }
    persist(next)
    setPreview(null)
    notify(`已绑定 ${preview.length} 节课，提问时默认选中今天的课`)
  }

  const saveScores = () => {
    if (!scorePreview || scorePreview.length === 0) return
    const next: StudentProfile = { ...form, scores: scorePreview, scoresSyncedAt: Date.now() }
    persist(next)
    setScorePreview(null)
    notify(`已保存 ${scorePreview.length} 条成绩`)
  }

  const addManualClass = () => {
    const course = manual.course.trim()
    if (!course) {
      setError('课程名不能为空。')
      return
    }
    const entry = withMatchedCourse({
      id: makeId('cls'),
      course,
      teacher: manual.teacher.trim(),
      room: manual.room.trim(),
      day: manual.day,
      startSection: Math.min(manual.start, manual.end),
      endSection: Math.max(manual.start, manual.end),
    })
    const next: StudentProfile = {
      ...form,
      schedule: sortSchedule([...form.schedule, entry]),
      scheduleSource: form.scheduleSource ?? 'manual',
      scheduleSyncedAt: Date.now(),
    }
    persist(next)
    setManual(emptyManual)
    setError(null)
    notify('已添加这节课')
  }

  const removeClass = (id: string) => {
    const next: StudentProfile = { ...form, schedule: form.schedule.filter((entry) => entry.id !== id) }
    if (next.schedule.length === 0) {
      next.scheduleSource = null
      next.scheduleSyncedAt = null
    }
    persist(next)
  }

  const clearScores = () => {
    const next: StudentProfile = { ...form, scores: [], scoresSyncedAt: null }
    persist(next)
    setSemester('all')
    notify('已清除本机保存的成绩', 'info')
  }

  const rowsForScores = scorePreview ?? form.scores
  const semesterOptions = Array.from(new Set(rowsForScores.map((row) => row.semester).filter(Boolean))).sort()
  const scopedScores = rowsForScores.filter((row) => semester === 'all' || row.semester === semester)
  const stats = scoreStats(scopedScores)
  const displayEntries = preview ?? form.schedule
  const ownCourseCount = new Set(
    displayEntries
      .map((entry) => entry.matchedCourseId)
      .filter((id): id is string => Boolean(id) && !isSeededCourse(id as string)),
  ).size
  const hasWeekData = weeksAvailable || displayEntries.some((entry) => Boolean(entry.weeks))
  const remoteMode = !hasWeekData && weekOptions.length > 1
  const visibleEntries = hasWeekData
    ? displayEntries.filter((entry) => runsInWeek(entry.weeks, week))
    : displayEntries
  const weekLabelText = hasWeekData
    ? `第 ${week} 周`
    : remoteMode
      ? remoteWeekLabel || '教务当前周'
      : '课程表'
  const staleSchedule = displayEntries.length > 0 && displayEntries.every((entry) => !entry.startTime && !entry.weeks)

  const updateAttachmentAsking = (next: boolean) => {
    setAskAttachment(next)
    if (next) resetAttachmentConsent()
    else rememberAttachmentConsent()
  }

  // 教师端没有学生课表/成绩，设置页只展示账号与退出，避免误改学生资料。
  if (user?.role === 'teacher') {
    const TeacherShell = variant === 'page' ? PageSheet : Modal
    return (
      <TeacherShell
        open={open}
        onClose={onClose}
        eyebrow="教师账号 · 服务端同步"
        title="设置"
        footer={
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        }
      >
        <div className="settings-sheet">
          <section className="settings-account" aria-label="当前账号">
            <span className="settings-account-avatar">
              <Avatar name={user.name} tone="jade" size="lg" />
            </span>
            <div className="settings-account-copy">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            {nativeAppInfo && (
              <Badge tone="jade">Android v{nativeAppInfo.versionName}</Badge>
            )}
            <Badge tone="neutral">教师账号</Badge>
          </section>

          <section className="settings-group" aria-labelledby="settings-teacher-notes">
            <h3 className="settings-group-title" id="settings-teacher-notes">
              说明
            </h3>
            <div className="settings-row-list">
              <div className="settings-row is-static">
                <span className="settings-row-copy">
                  <strong>教师账号由管理员分配</strong>
                  <small>课程、学生与共享空间的内容在教师端维护；账号资料如需修改，请联系管理员。</small>
                </span>
              </div>
            </div>
          </section>

          <NativeMobileSettingsGroup
            isStudent={false}
            schedule={[]}
            termStart={null}
            appInfo={nativeAppInfo}
            notify={notify}
          />

          <FeedbackSettingsGroup onOpenFeedback={onOpenFeedback} />

          <AttachmentPrivacyGroup ask={askAttachment} onChange={updateAttachmentAsking} />

          <section className="settings-group is-danger" aria-labelledby="settings-teacher-danger">
            <h3 className="settings-group-title" id="settings-teacher-danger">
              账号操作
            </h3>
            <div className="settings-row-list">
              <div className="settings-row is-static">
                <span className="settings-row-copy">
                  <strong>退出登录</strong>
                  <small>退出后需要重新输入邮箱和密码。</small>
                </span>
                <button
                  className="button button-danger-ghost"
                  onClick={() => {
                    onClose()
                    void logoutAccount()
                  }}
                >
                  <LogOut size={14} />
                  退出
                </button>
              </div>
            </div>
          </section>
        </div>
      </TeacherShell>
    )
  }

  const studentBody = (
    <>
      <div className="account-tabs" role="tablist" aria-label="账号设置" ref={tabsRef}>
        <button
          role="tab"
          aria-selected={tab === 'identity'}
          className={tab === 'identity' ? 'is-active' : ''}
          onClick={() => setTab('identity')}
        >
          <UserRound size={15} />
          身份资料
        </button>
        <button
          role="tab"
          aria-selected={tab === 'schedule'}
          className={tab === 'schedule' ? 'is-active' : ''}
          onClick={() => setTab('schedule')}
        >
          <CalendarDays size={15} />
          课程表
          {form.schedule.length > 0 && <span>{form.schedule.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'scores'}
          className={tab === 'scores' ? 'is-active' : ''}
          onClick={() => setTab('scores')}
        >
          <GraduationCap size={15} />
          成绩
          {form.scores.length > 0 && <span>{form.scores.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'teachers'}
          className={tab === 'teachers' ? 'is-active' : ''}
          onClick={() => setTab('teachers')}
        >
          <Users size={15} />
          任课老师
          {realTeachers.length > 0 && <span>{realTeachers.length}</span>}
        </button>
      </div>

      {tab === 'identity' ? (
        <div className="settings-sheet">
          {/* 账号头卡：头像与身份从侧栏收进来 */}
          <section className="settings-account" aria-label="当前账号">
            <span className="settings-account-avatar">
              <Avatar name={form.name || profile.name} tone="jade" size="lg" />
            </span>
            <div className="settings-account-copy">
              <strong>{form.name || profile.name}</strong>
              <span>{user?.email ?? '未登录'}</span>
            </div>
            {nativeAppInfo && (
              <Badge tone="jade">Android v{nativeAppInfo.versionName}</Badge>
            )}
            <Badge tone="neutral">学生账号</Badge>
          </section>

          <section className="settings-group settings-group-identity" aria-labelledby="settings-identity">
            <h3 className="settings-group-title" id="settings-identity">
              身份信息
            </h3>
            <p className="settings-group-lede">老师看到的是这里填的姓名与专业，其余信息只给自己看。</p>
            <div className="account-fields settings-identity-fields">
              <label className="field">
                <span className="field-label">姓名</span>
                <input
                  className="input"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  onBlur={() => persistDraft(form)}
                  placeholder="例如：林晓"
                />
              </label>
              <label className="field">
                <span className="field-label">学院</span>
                <input
                  className="input"
                  value={form.college}
                  onChange={(event) => setForm({ ...form, college: event.target.value })}
                  onBlur={() => persistDraft(form)}
                  placeholder="例如：计算机学院"
                />
              </label>
              <label className="field">
                <span className="field-label">年级</span>
                <input
                  className="input"
                  value={form.grade}
                  onChange={(event) => setForm({ ...form, grade: event.target.value })}
                  onBlur={() => persistDraft(form)}
                  placeholder="例如：2024级"
                />
              </label>
              <label className="field">
                <span className="field-label">专业</span>
                <input
                  className="input"
                  list="major-options"
                  value={form.major}
                  onChange={(event) => setForm({ ...form, major: event.target.value })}
                  onBlur={() => persistDraft(form)}
                  placeholder="例如：计算机科学与技术"
                />
                <datalist id="major-options">
                  {majorOptions().map((major) => (
                    <option key={major} value={major} />
                  ))}
                </datalist>
                <span className="field-hint">
                  手动填写或从建议里选；没有演示资料的专业会用通用模式，不编课程地图。
                </span>
              </label>
              <label className="field">
                <span className="field-label">学号</span>
                <input
                  className="input"
                  value={form.studentNo}
                  onChange={(event) => setForm({ ...form, studentNo: event.target.value })}
                  onBlur={() => persistDraft(form)}
                  inputMode="numeric"
                />
              </label>
            </div>
          </section>

          <section className="settings-group" aria-labelledby="settings-notify">
            <h3 className="settings-group-title" id="settings-notify">
              通知
            </h3>
            <div className="settings-row-list">
              <label className="settings-row">
                <span className="settings-row-copy">
                  <strong>老师回复时邮件提醒我</strong>
                  <small>需要服务端配置 SMTP 才会真正发信；站内铃铛通知不受影响。</small>
                </span>
                <input
                  className="settings-switch"
                  type="checkbox"
                  checked={form.emailOnTeacherReply}
                  onChange={(event) =>
                    persistDraft({ ...form, emailOnTeacherReply: event.target.checked })
                  }
                />
              </label>
            </div>
          </section>

          <NativeMobileSettingsGroup
            isStudent={true}
            schedule={profile.schedule}
            termStart={profile.termStart}
            studentName={profile.name}
            appInfo={nativeAppInfo}
            notify={notify}
          />

          <FeedbackSettingsGroup onOpenFeedback={onOpenFeedback} />

          {/* 退出账号 */}
          <section className="settings-group is-danger" aria-label="退出账号">
            <button
              type="button"
              className="button button-danger-ghost settings-logout-btn"
              onClick={() => {
                onClose()
                void logoutAccount()
              }}
            >
              <LogOut size={17} />
              退出账号
            </button>
          </section>
        </div>
      ) : tab === 'schedule' ? (
        <div className="account-schedule">
          <div className="account-browser">
            <div className="account-browser-row">
              {!connected && !loginOpen && (
                <button
                  className="button button-primary account-jw-login-btn"
                  onClick={startLogin}
                  disabled={busy !== null}
                >
                  {busy === 'open' ? <Loader2 size={16} className="spin-icon" /> : <ExternalLink size={16} />}
                  登录教务
                </button>
              )}
              {loginOpen && (
                <button className="button button-primary" onClick={completeLogin} disabled={busy !== null}>
                  {busy === 'open' ? <Loader2 size={15} className="spin-icon" /> : <GraduationCap size={15} />}
                  登录
                </button>
              )}
              {loginOpen && (
                <button className="button button-ghost" onClick={logout}>
                  取消登录
                </button>
              )}
              {connected && (
                <button className="button button-ghost" onClick={startLogin} disabled={busy !== null}>
                  重新登录
                </button>
              )}
              {connected && (
                <button className="button button-ghost" onClick={logout}>
                  退出登录
                </button>
              )}
            </div>
            <p className="account-bind-hint">
              {connected
                ? `已连接教务（${baseUrl}）：读取课表在后台完成。`
                : loginOpen
                  ? '输入教务账号、密码和验证码，点「登录」；账号密码只用于本次登录。'
                  : JW_BROWSER_HELP}
            </p>
            {loginOpen && loginSession && (
              <JwLoginFields
                session={loginSession}
                account={jwAccount}
                password={jwPassword}
                captcha={jwCaptcha}
                busy={busy !== null}
                onAccount={setJwAccount}
                onPassword={setJwPassword}
                onCaptcha={setJwCaptcha}
                onRefresh={refreshCaptcha}
              />
            )}
            {isLocalMock && (
              <div className="inline-note warning">
                <CircleAlert size={14} />
                <span>
                  当前连接的是本机模拟教务（{baseUrl}），读取结果是测试数据，不是学校真实课表。要读真实数据，请点「退出登录」，把上方地址改成学校教务地址后重新登录。
                </span>
              </div>
            )}
            <label className="field account-term">
              <span className="field-label">第一周周一</span>
              <input
                type="date"
                className="input"
                value={dateInputValue(termStart)}
                onChange={(event) => {
                  const parsed = parseDateInput(event.target.value)
                  setTermStart(parsed)
                  persistDraft({ ...form, termStart: parsed }, parsed)
                  const computed = teachingWeek(parsed)
                  if (computed) setWeek(computed)
                }}
              />
              <span className="field-hint">
                教务页面不提供校历。填了它，周标题的日期和「当前周」才和学校一致；不填只能按今天倒推。
              </span>
            </label>
            <div className="account-bind-actions">
              <button
                className="button button-secondary"
                onClick={() => void readSchedule()}
                disabled={busy !== null || !connected}
              >
                {busy === 'schedule' ? <Loader2 size={15} className="spin-icon" /> : <RefreshCw size={15} />}
                读取课表
              </button>
              <button
                className="button button-ghost"
                onClick={() => {
                  downloadScheduleIcs(form)
                  notify(`已导出 ${scheduleEventCount(form)} 个课程事件（.ics）`)
                }}
                disabled={!scheduleExportReady(form)}
              >
                <CalendarDays size={15} />
                导出日历 .ics
              </button>
              {!connected && <span className="account-bind-hint">登录状态保存在服务器，并按学生账号隔离</span>}
              {form.schedule.length > 0 && !form.termStart && (
                <span className="account-bind-hint">填好「第一周周一」后可导出日历</span>
              )}
            </div>
          </div>

          {displayEntries.length > 0 && (
            <div className="account-week">
              <div className="account-current-head">
                {preview && <strong>读取到 {preview.length} 节课</strong>}
                <span className="account-current-updated">
                  {preview
                    ? '确认无误再保存'
                    : form.scheduleSyncedAt
                      ? `最新更新 · ${new Date(form.scheduleSyncedAt).toLocaleDateString('zh-CN')}`
                      : '最新更新'}
                </span>
              </div>
              {ownCourseCount > 0 && (
                <p className="account-bind-hint">
                  其中 {ownCourseCount} 门课表课程会接入首页答疑；任课老师也会自动加入教师端切换列表。
                </p>
              )}
              {staleSchedule && (
                <div className="inline-note warning">
                  <CircleAlert size={14} />
                  <span>
                    这份课表是旧版本读取的：没有节次时间与周次，所以无法按周切换。点上面的「读取课表」重新读一次即可补齐，保存后会覆盖旧数据。
                  </span>
                </div>
              )}
              <WeekBoard
                entries={visibleEntries}
                week={week}
                termStart={termStart}
                tones={toneMap}
                label={weekLabelText}
                onPrev={
                  hasWeekData
                    ? () => setWeek(Math.max(1, week - 1))
                    : remoteMode
                      ? () => void loadRemoteWeek(-1)
                      : undefined
                }
                onNext={
                  hasWeekData
                    ? () => setWeek(week + 1)
                    : remoteMode
                      ? () => void loadRemoteWeek(1)
                      : undefined
                }
                onReset={
                  hasWeekData && (currentWeek ?? pageWeek) !== null && (currentWeek ?? pageWeek) !== week
                    ? () => setWeek((currentWeek ?? pageWeek) as number)
                    : undefined
                }
                resetLabel={
                  currentWeek
                    ? `回到当前周（第 ${currentWeek} 周）`
                    : pageWeek !== null
                      ? `回到教务当前周（第 ${pageWeek} 周）`
                      : '回到当前周'
                }
                busy={loadingWeek}
                zoom={false}
                onToggleZoom={() => setZoom(true)}
              />
              {zoom && (
                <div className="week-zoom" role="dialog" aria-label="放大的周课表">
                  <div className="week-zoom-head">
                    <strong>课程表</strong>
                    <button className="button button-ghost" onClick={() => setZoom(false)}>
                      收起
                    </button>
                  </div>
                  <WeekBoard
                    entries={visibleEntries}
                    week={week}
                    termStart={termStart}
                    tones={toneMap}
                    label={weekLabelText}
                    onPrev={
                      hasWeekData
                        ? () => setWeek(Math.max(1, week - 1))
                        : remoteMode
                          ? () => void loadRemoteWeek(-1)
                          : undefined
                    }
                    onNext={
                      hasWeekData
                        ? () => setWeek(week + 1)
                        : remoteMode
                          ? () => void loadRemoteWeek(1)
                          : undefined
                    }
                    onReset={
                      hasWeekData && (currentWeek ?? pageWeek) !== null && (currentWeek ?? pageWeek) !== week
                        ? () => setWeek((currentWeek ?? pageWeek) as number)
                        : undefined
                    }
                    resetLabel={
                      currentWeek
                        ? `回到当前周（第 ${currentWeek} 周）`
                        : pageWeek !== null
                          ? `回到教务当前周（第 ${pageWeek} 周）`
                          : '回到当前周'
                    }
                    busy={loadingWeek}
                    zoom
                    onToggleZoom={() => setZoom(false)}
                  />
                </div>
              )}
              {unparsed.length > 0 && (
                <p className="account-bind-hint">有 {unparsed.length} 个格子没读懂，已跳过：{unparsed.join('；')}</p>
              )}
              {preview && !remoteMode && (
                <div className="account-jw-foot">
                  <button className="button button-ghost" onClick={() => setPreview(null)}>
                    放弃这次读取
                  </button>
                  <button className="button button-primary" onClick={saveSchedule}>
                    保存到我的账号
                  </button>
                </div>
              )}
              {preview && remoteMode && (
                <div className="account-jw-foot">
                  <p className="account-bind-hint">
                    教务页面只返回了单周课表。请在教务窗口里把「周次」选成「全部」再读取一次，才能保存整学期；现在只能逐周查看。
                  </p>
                  <button className="button button-ghost" onClick={() => setPreview(null)}>
                    放弃这次读取
                  </button>
                </div>
              )}
            </div>
          )}

          {error && !courseHubOpen && <div className="inline-note danger">{error}</div>}
          {diagnostics.length > 0 && (
            <details className="account-diagnostics">
              <summary>查看读取诊断（{diagnostics.length} 个帧）</summary>
              <ul>
                {diagnostics.map((item, index) => (
                  <li key={`${item.url}-${index}`}>
                    <code>{item.url}</code>
                    <span>
                      {item.title || '无标题'} · {item.tables} 张表
                    </span>
                  </li>
                ))}
              </ul>
              {tried.length > 0 && (
                <p>
                  尝试过：<code>{tried.join(' · ')}</code>
                </p>
              )}
              {tableSample && (
                <>
                  <p>表格前几行：</p>
                  <pre className="account-table-sample">{tableSample}</pre>
                </>
              )}
            </details>
          )}

          {!preview && (
            <div className="account-course-hub-entry">
              <button
                type="button"
                className="button button-ghost account-course-hub-btn"
                onClick={() => {
                  setError(null)
                  setCourseHubTab(form.schedule.length > 0 ? 'manage' : 'add')
                  setCourseHubOpen(true)
                }}
              >
                <SlidersHorizontal size={15} />
                管理与添加课程
              </button>
            </div>
          )}

          <Modal
            open={courseHubOpen}
            onClose={() => {
              setCourseHubOpen(false)
              setError(null)
            }}
            title="管理与添加课程"
            size="md"
          >
            <div className="account-course-hub">
              <div className="account-course-hub-tabs" role="tablist" aria-label="课程操作">
                <button
                  type="button"
                  role="tab"
                  aria-selected={courseHubTab === 'add'}
                  className={courseHubTab === 'add' ? 'is-active' : ''}
                  onClick={() => {
                    setCourseHubTab('add')
                    setError(null)
                  }}
                >
                  <Plus size={14} />
                  添加课程
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={courseHubTab === 'manage'}
                  className={courseHubTab === 'manage' ? 'is-active' : ''}
                  onClick={() => {
                    setCourseHubTab('manage')
                    setError(null)
                  }}
                >
                  <Trash2 size={14} />
                  管理课程
                  {form.schedule.length > 0 && <span>{form.schedule.length}</span>}
                </button>
              </div>

              {courseHubTab === 'add' ? (
                <div className="account-manual account-manual-in-modal">
                  {error && <div className="inline-note danger">{error}</div>}
                  <div className="account-manual-grid">
                    <input
                      className="input"
                      value={manual.course}
                      onChange={(event) => setManual({ ...manual, course: event.target.value })}
                      placeholder="课程名，例如 数据结构与算法"
                    />
                    <input
                      className="input"
                      value={manual.teacher}
                      onChange={(event) => setManual({ ...manual, teacher: event.target.value })}
                      placeholder="教师"
                    />
                    <input
                      className="input"
                      value={manual.room}
                      onChange={(event) => setManual({ ...manual, room: event.target.value })}
                      placeholder="教室"
                    />
                    <select
                      className="input"
                      value={manual.day}
                      onChange={(event) => setManual({ ...manual, day: Number(event.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                        <option key={day} value={day}>
                          {weekdayLabel(day)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={manual.start}
                      onChange={(event) => setManual({ ...manual, start: Number(event.target.value) })}
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((section) => (
                        <option key={section} value={section}>
                          第 {section} 节起
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={manual.end}
                      onChange={(event) => setManual({ ...manual, end: Number(event.target.value) })}
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((section) => (
                        <option key={section} value={section}>
                          到第 {section} 节
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="button button-primary" onClick={addManualClass}>
                    <Plus size={15} />
                    添加到课程表
                  </button>
                </div>
              ) : form.schedule.length === 0 ? (
                <p className="account-bind-hint">当前还没有课程，切换到「添加课程」手动添加。</p>
              ) : (
                <div className="account-days account-days-in-modal">
                  {form.schedule.map((entry) => (
                    <div className="account-class" key={entry.id}>
                      <span className="account-class-main">
                        <strong>
                          {weekdayLabel(entry.day)} · {entry.course}
                        </strong>
                        <em>
                          第 {entry.startSection}
                          {entry.endSection !== entry.startSection ? `-${entry.endSection}` : ''} 节
                          {entry.room ? ` · ${entry.room}` : ''}
                        </em>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removeClass(entry.id)}
                        aria-label="删除这节课"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>

          {displayEntries.length === 0 && !error && (
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="还没有课程表"
              description="登录教务后读取「学期课表」；也可以手动添加。"
            />
          )}
        </div>
      ) : tab === 'scores' ? (
        <div className="account-scores">
          <div className="account-browser">
            <div className="account-bind-actions">
              {connected ? (
                <>
                  <button className="button button-secondary" onClick={() => void readScores()} disabled={busy !== null}>
                    {busy === 'scores' ? <Loader2 size={15} className="spin-icon" /> : <RefreshCw size={15} />}
                    读取成绩（不弹窗）
                  </button>
                  <button className="button button-ghost" onClick={startLogin} disabled={busy !== null}>
                    重新登录
                  </button>
                  <button className="button button-ghost" onClick={logout}>
                    退出登录
                  </button>
                </>
              ) : loginOpen ? (
                <>
                  <button className="button button-primary" onClick={completeLogin} disabled={busy !== null}>
                    {busy === 'open' ? <Loader2 size={15} className="spin-icon" /> : <GraduationCap size={15} />}
                    登录
                  </button>
                  <button className="button button-ghost" onClick={logout}>
                    取消登录
                  </button>
                </>
              ) : (
                <button className="button button-primary" onClick={startLogin} disabled={busy !== null}>
                  {busy === 'open' ? <Loader2 size={15} className="spin-icon" /> : <ExternalLink size={15} />}
                  登录教务（只需一次）
                </button>
              )}
            </div>
            {loginOpen && loginSession && (
              <JwLoginFields
                session={loginSession}
                account={jwAccount}
                password={jwPassword}
                captcha={jwCaptcha}
                busy={busy !== null}
                onAccount={setJwAccount}
                onPassword={setJwPassword}
                onCaptcha={setJwCaptcha}
                onRefresh={refreshCaptcha}
              />
            )}
            {isLocalMock && (
              <div className="inline-note warning">
                <CircleAlert size={14} />
                <span>
                  当前连接的是本机模拟教务（{baseUrl}），读取结果是测试成绩，不是学校真实数据。要读真实成绩，请点「退出登录」，把上方地址改成学校教务地址后重新登录。
                </span>
              </div>
            )}
            {autoQuery && scorePreview && scorePreview.length > 0 && (
              <p className="account-bind-hint">
                {autoQuery.semesters > 0
                  ? `没有「全部学期」选项，已逐个学期读取 ${autoQuery.semesters} 个学期并合并。`
                  : autoQuery.allSemester
                    ? `已自动选择「${autoQuery.optionText || '全部学期'}」并点击查询。`
                    : autoQuery.clicked
                      ? '没有找到「全部学期」选项，已按当前学期查询。'
                      : '成绩页没有学期选择框，已直接读取当前页面。'}
              </p>
            )}
          </div>

          <div className="account-score-toolbar">
            <label className="field">
              <span className="field-label">学期</span>
              <select className="input" value={semester} onChange={(event) => setSemester(event.target.value)}>
                <option value="all">全部学期</option>
                {semesterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <span className="account-bind-hint">
              {rowsForScores.length > 0
                ? scorePreview
                  ? '读取结果确认后保存'
                  : form.scoresSyncedAt
                    ? `读取于 ${new Date(form.scoresSyncedAt).toLocaleDateString('zh-CN')}`
                    : ''
                : ''}
            </span>
          </div>

          {rowsForScores.length > 0 && (
            <div className="account-score-stats">
              <div>
                <strong>{stats.counted}</strong>
                <span>科目数</span>
              </div>
              <div>
                <strong>{stats.credits || '—'}</strong>
                <span>总学分</span>
              </div>
              <div>
                <strong>{stats.averageScore?.toFixed(1) ?? '—'}</strong>
                <span>平均成绩</span>
              </div>
              <div>
                <strong>{stats.weightedAverage?.toFixed(1) ?? '—'}</strong>
                <span>加权平均</span>
              </div>
              <div>
                <strong>{stats.gpaFive?.toFixed(2) ?? '—'}</strong>
                <span>GPA（5.0）</span>
              </div>
            </div>
          )}

          {rowsForScores.length > 0 && (
            <>
              <div className="account-preview account-score-table">
                <div className="account-preview-row account-score-row is-head">
                  <span>学期</span>
                  <span>课程</span>
                  <span>成绩</span>
                  <span>学分</span>
                  <span>性质</span>
                </div>
                {scopedScores.slice(0, 60).map((row) => (
                  <div className="account-preview-row account-score-row" key={row.id}>
                    <span>{row.semester || '—'}</span>
                    <span>{row.course}</span>
                    <span>{row.score}</span>
                    <span>{row.credit ?? '—'}</span>
                    <span>{row.kind || '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && <div className="inline-note danger">{error}</div>}
          {diagnostics.length > 0 && (
            <details className="account-diagnostics">
              <summary>查看读取诊断（{diagnostics.length} 个帧）</summary>
              <ul>
                {diagnostics.map((item, index) => (
                  <li key={`${item.url}-${index}`}>
                    <code>{item.url}</code>
                    <span>
                      {item.title || '无标题'} · {item.tables} 张表
                    </span>
                  </li>
                ))}
              </ul>
              {tried.length > 0 && (
                <p>
                  尝试过：<code>{tried.join(' · ')}</code>
                </p>
              )}
              {tableSample && (
                <>
                  <p>表格前几行：</p>
                  <pre className="account-table-sample">{tableSample}</pre>
                </>
              )}
            </details>
          )}

          <div className="account-jw-foot">
            {scopedScores.length > 0 && (
              <button
                className="button button-ghost"
                onClick={() => {
                  downloadScoresCsv(scopedScores)
                  notify(`已导出 ${scopedScores.length} 条成绩（CSV）`)
                }}
              >
                <Download size={15} />
                导出 CSV
              </button>
            )}
            {scorePreview && scorePreview.length > 0 && (
              <button className="button button-ghost" onClick={() => setScorePreview(null)}>
                放弃这次读取
              </button>
            )}
            {scorePreview && scorePreview.length > 0 && (
              <button className="button button-primary" onClick={saveScores}>
                保存到我的账号
              </button>
            )}
            {!scorePreview && form.scores.length > 0 && (
              <button className="text-button danger" onClick={clearScores}>
                <Trash2 size={14} />
                清除本机保存的成绩
              </button>
            )}
          </div>

          {!scorePreview && form.scores.length === 0 && (
            <EmptyState
              icon={<GraduationCap size={20} />}
              title="还没有成绩"
              description="登录教务后，师说会自动选择「全部学期」并点查询，再读取成绩。"
            />
          )}
        </div>
      ) : (
        <div className="account-teachers">
          <div className="account-teacher-intro">
            <div>
              <strong>只留下你要找的老师</strong>
              <p>
                课表读到的任课老师默认全部显示。隐藏后只影响首页课程快捷切换和教师身份列表，
                课表、成绩和已有答疑都会保留；演示老师固定保留。
              </p>
            </div>
            <Badge tone="neutral">
              {realTeachers.filter((teacher) => !form.hiddenTeacherNames.includes(teacher.name)).length}
              {' / '}
              {realTeachers.length} 显示中
            </Badge>
          </div>

          {realTeachers.length === 0 ? (
            <EmptyState
              icon={<Users size={20} />}
              title="还没有课表老师"
              description="先绑定教务课表，课表上的任课老师会出现在这里，你可以逐个选择显示或隐藏。"
            />
          ) : (
            <>
              <div className="account-teacher-toolbar">
                <label className="account-teacher-search">
                  <Search size={15} />
                  <input
                    value={teacherQuery}
                    onChange={(event) => setTeacherQuery(event.target.value)}
                    placeholder="搜索老师或课程"
                    aria-label="搜索任课老师或课程"
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => persistDraft({ ...form, hiddenTeacherNames: [] })}
                  disabled={form.hiddenTeacherNames.length === 0}
                >
                  全部显示
                </button>
              </div>

              <div className="account-teacher-list">
                {teacherRows.map(({ teacher, courses, waiting }) => {
                  const visible = !form.hiddenTeacherNames.includes(teacher.name)
                  return (
                    <button
                      key={teacher.id}
                      type="button"
                      role="switch"
                      aria-checked={visible}
                      className={`account-teacher-row ${visible ? 'is-on' : 'is-off'} ${
                        waiting > 0 && visible ? 'is-locked' : ''
                      }`}
                      onClick={() => toggleTeacher(teacher.name, waiting)}
                      title={
                        waiting > 0 && visible
                          ? '还有未处理待办，处理完才能隐藏'
                          : visible
                            ? '点击隐藏'
                            : '点击显示'
                      }
                    >
                      <span className="account-teacher-toggle" aria-hidden="true" />
                      <span className="account-teacher-copy">
                        <strong>
                          {teacher.name}
                          <em>{teacher.title}</em>
                        </strong>
                        <span>
                          {courses.map((course) => course.shortName).join(' · ')}
                        </span>
                      </span>
                      {waiting > 0 ? (
                        <Badge tone="gold">{waiting} 个待办</Badge>
                      ) : (
                        <span className="account-teacher-state">
                          {visible ? '显示中' : '已隐藏'}
                        </span>
                      )}
                    </button>
                  )
                })}
                {teacherRows.length === 0 && (
                  <p className="account-bind-hint">没有匹配的老师，换个关键词试试。</p>
                )}
              </div>

              <p className="account-teacher-foot">
                有未处理待办的老师暂时不能隐藏，处理完会自动解锁。修改后会自动同步保存。
              </p>
            </>
          )}
        </div>
      )}
    </>
  )

  if (variant === 'page') {
    return (
      <PageSheet open={open} onClose={onClose} title="设置" hideBack>
        {studentBody}
      </PageSheet>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="学生账号 · 服务端同步"
      title="账号与课表绑定"
      size="lg"
      footer={
        <>
          <span className="page-sheet-fineprint">
            姓名、学院、专业、学号、课表、成绩与老师显示设置会同步到当前账号；教务账号和密码只在登录时提交给服务器换取登录态，不保存。
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            <button className="button button-primary" onClick={saveProfile}>
              保存设置
            </button>
          </div>
        </>
      }
    >
      {studentBody}
    </Modal>
  )
}
