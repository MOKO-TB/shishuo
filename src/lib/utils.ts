import type { Confidence, Thread, Urgency } from '../types'

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function formatRelative(ts: number, now = Date.now()) {
  const diff = Math.max(0, now - ts)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`

  const date = new Date(ts)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = new Date(ts)
  start.setHours(0, 0, 0, 0)
  const calendarDays = Math.round((today.getTime() - start.getTime()) / day)

  if (calendarDays === 1) return '昨天'
  if (calendarDays < 7) return `${calendarDays} 天前`
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

/** Compact duration for teacher queue aging, e.g. "3 小时" / "2 天". */
export function waitDuration(ts: number, now = Date.now()) {
  const diff = Math.max(0, now - ts)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

export function formatDateTime(ts: number) {
  const date = new Date(ts)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month} 月 ${day} 日 ${hour}:${minute}`
}

export function formatShortDate(ts: number) {
  const date = new Date(ts)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatWeekday(ts: number) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(ts).getDay()]
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(value))
}

export function percent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

export function initials(name: string) {
  return name.trim().slice(0, 1) || '问'
}

export function confidenceLabel(confidence?: Confidence) {
  if (confidence === 'high') return '高置信'
  if (confidence === 'medium') return '中置信'
  if (confidence === 'low') return '低置信'
  return '待判断'
}

export function confidenceDescription(confidence?: Confidence) {
  if (confidence === 'high') return '知识库依据充分'
  if (confidence === 'medium') return '可以看，建议老师确认'
  if (confidence === 'low') return 'AI 没有把握，不编答案'
  return '等待 AI 判断'
}

export function urgencyLabel(urgency: Urgency) {
  if (urgency === 'today') return '今天要用'
  if (urgency === 'week') return '本周内'
  return '不着急'
}

export function urgencyShort(urgency: Urgency) {
  if (urgency === 'today') return '今日'
  if (urgency === 'week') return '本周'
  return '稍后'
}

export function statusLabel(thread: Thread) {
  if (thread.withdrawnAt) return '已撤下'
  if (thread.resolvedAt) return '已解决'
  if (thread.status === 'needs-info') return '待补充'
  if (thread.status === 'pending') return '待老师回复'
  if (thread.status === 'answered') return '老师已回复'
  if (thread.externalAnswer) return 'AI 补充'
  if (thread.confidence === 'low') return 'AI 没把握'
  return 'AI 已答'
}

export function statusTone(thread: Thread) {
  if (thread.withdrawnAt) return 'neutral' as const
  if (thread.resolvedAt) return 'high' as const
  if (thread.status === 'needs-info') return 'blue' as const
  if (thread.status === 'pending') return 'pending' as const
  if (thread.status === 'answered') return 'answered' as const
  if (thread.externalAnswer) return 'medium' as const
  if (thread.confidence === 'low') return 'low' as const
  return 'ai' as const
}

export function displayStudentName(thread: Thread, forTeacher = false) {
  const anonymous = forTeacher
    ? thread.escalation?.anonymous || thread.student.anonymous
    : thread.student.anonymous
  return anonymous ? '匿名同学' : thread.student.name
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** 生成可直接发给同学 / 老师的深链：#/faq/:id 或 #/thread/:id。 */
export function shareLink(kind: 'faq' | 'thread', id: string) {
  return `${window.location.origin}${window.location.pathname}#/${kind}/${encodeURIComponent(id)}`
}

export async function copyText(text: string) {
  // HTTP 部署下 navigator.clipboard 不可用，保留 execCommand 兜底。
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 浏览器拒绝权限时继续尝试旧接口。
    }
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

export function makeEscalationTitle(question: string) {
  const first = question
    .split(/[。！？!?\n]/)
    .map((part) => part.trim())
    .filter(Boolean)[0]
  return (first ?? question).replace(/[？?]$/, '').slice(0, 30)
}

export function truncate(text: string, length: number) {
  if (text.length <= length) return text
  return `${text.slice(0, length).trimEnd()}…`
}

export function excerpt(text: string, length: number) {
  const singleLine = text.replace(/\s+/g, ' ').replace(/\*\*/g, '')
  return truncate(singleLine, length)
}

export function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Mean minutes between handing a question to a teacher and that teacher replying. */
export function averageFirstResponseMinutes(threads: Thread[]) {
  const spans = threads
    .filter((thread) => thread.teacherReply && thread.escalation)
    .map(
      (thread) =>
        (thread.teacherReply!.at - thread.escalation!.at) / 60_000,
    )
    .filter((minutes) => minutes >= 0)
  return spans.length > 0 ? average(spans) : 0
}

export function durationLabel(minutes: number) {
  if (minutes <= 0) return { value: '—', unit: '' }
  if (minutes < 60) return { value: `${Math.round(minutes)}`, unit: '分钟' }
  return { value: (minutes / 60).toFixed(1), unit: '小时' }
}

export function pct(part: number, total: number) {
  if (total <= 0) return 0
  return part / total
}
