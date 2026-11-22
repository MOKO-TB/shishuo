import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  SECTION_BELL,
  runsInWeek,
  teachingWeek,
  type ScheduleEntry,
} from './profile'

/**
 * 课前本地自动提醒：
 * - 纯本机排期未来 7 天内的课程，不依赖服务器推送；
 * - 使用独立频道 shishuo-class-reminder 和固定 ID 段 (200001..200060)，与问答通知互不冲突；
 * - 点击提醒直达课程表页。
 */

const CHANNEL_ID = 'shishuo-class-reminder'
const PREFS_KEY = 'shishuo.classReminder.v1'
const BASE_ID = 200001
const MAX_SCHEDULED = 48

export interface ClassReminderPrefs {
  enabled: boolean
  leadMinutes: 10 | 15 | 20 | 30
}

const DEFAULT_PREFS: ClassReminderPrefs = {
  enabled: false,
  leadMinutes: 15,
}

function nativeReady() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications')
}

export function readClassReminderPrefs(): ClassReminderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<ClassReminderPrefs>
    const lead = parsed.leadMinutes
    return {
      enabled: parsed.enabled === true,
      leadMinutes: lead === 10 || lead === 15 || lead === 20 || lead === 30 ? lead : 15,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writeClassReminderPrefs(next: ClassReminderPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

function startClockOf(entry: ScheduleEntry): { hour: number; minute: number } | null {
  const raw = entry.startTime || SECTION_BELL[entry.startSection]?.start || ''
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim())
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

async function ensureChannel() {
  if (!nativeReady()) return
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '上课前提醒',
      description: '按个人课程表在开课前发送本地提醒',
      importance: 4,
      visibility: 1,
      vibration: true,
    })
  } catch {
    // 频道已存在或不支持时忽略。
  }
}

async function clearScheduledClassReminders() {
  if (!nativeReady()) return
  try {
    const pending = await LocalNotifications.getPending()
    const own = pending.notifications
      .filter((item) => item.id >= BASE_ID && item.id < BASE_ID + MAX_SCHEDULED + 20)
      .map((item) => ({ id: item.id }))
    if (own.length > 0) {
      await LocalNotifications.cancel({ notifications: own })
    }
  } catch {
    // ignore
  }
}

export async function syncClassReminders(input: {
  schedule: ScheduleEntry[]
  termStart: number | null
  requestPermission?: boolean
}): Promise<{ scheduled: number; permissionDenied?: boolean }> {
  if (!nativeReady()) return { scheduled: 0 }
  const prefs = readClassReminderPrefs()
  await clearScheduledClassReminders()
  if (!prefs.enabled || input.schedule.length === 0) {
    return { scheduled: 0 }
  }

  let perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') {
    if (!input.requestPermission) return { scheduled: 0, permissionDenied: true }
    perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return { scheduled: 0, permissionDenied: true }
  }

  await ensureChannel()

  const now = Date.now()
  const items: Array<{
    at: number
    entry: ScheduleEntry
    startText: string
  }> = []

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + offset)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay()
    const week = teachingWeek(input.termStart, date.getTime())

    for (const entry of input.schedule) {
      if (entry.day !== dayOfWeek) continue
      if (week != null && !runsInWeek(entry.weeks, week)) continue
      const clock = startClockOf(entry)
      if (!clock) continue
      const classStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        clock.hour,
        clock.minute,
        0,
        0,
      ).getTime()
      const triggerAt = classStart - prefs.leadMinutes * 60_000
      if (triggerAt <= now + 15_000) continue
      const startText = `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`
      items.push({ at: triggerAt, entry, startText })
    }
  }

  items.sort((a, b) => a.at - b.at)
  const limited = items.slice(0, MAX_SCHEDULED)
  if (limited.length === 0) return { scheduled: 0 }

  try {
    await LocalNotifications.schedule({
      notifications: limited.map((item, index) => {
        const room = item.entry.room?.trim()
        const bodyParts = [
          `${item.startText} 开课`,
          room ? `教室 ${room}` : '',
          item.entry.teacher?.trim() ? `${item.entry.teacher.trim()}老师` : '',
        ].filter(Boolean)
        return {
          id: BASE_ID + index,
          title: `${prefs.leadMinutes} 分钟后上课：${item.entry.course}`,
          body: bodyParts.join(' · '),
          channelId: CHANNEL_ID,
          smallIcon: 'ic_stat_shishuo',
          autoCancel: true,
          schedule: { at: new Date(item.at), allowWhileIdle: true },
          extra: {
            kind: 'class-reminder',
            view: 'schedule',
          },
        }
      }),
    })
    return { scheduled: limited.length }
  } catch {
    return { scheduled: 0 }
  }
}
