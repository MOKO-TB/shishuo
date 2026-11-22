import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { AppNotification } from '../types'

/**
 * 手机系统通知（前台/短后台）：
 * 数据来自 Store 的轮询；只有新出现的未读通知才弹系统通知。
 * App 被系统回收后的提醒由原生 WorkManager（NotificationPollWorker）兜底。
 */

const CHANNEL_ID = 'shishuo-alerts'
const SEEN_PREFIX = 'shishuo.localnotif.seen.v1.'
const ENABLED_KEY = 'shishuo.localnotif.enabled.v1'

let permissionAsked = false
let actionListenerInstalled = false

function nativeReady() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications')
}

function notificationId(id: string) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 2147483647 || 1
}

function readSeen(userId: string) {
  try {
    const raw = localStorage.getItem(`${SEEN_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { seen?: string[]; cursor?: number }
    return {
      seen: new Set(Array.isArray(parsed.seen) ? parsed.seen : []),
      cursor: Number(parsed.cursor) || 0,
    }
  } catch {
    return null
  }
}

function writeSeen(userId: string, seen: Set<string>, cursor: number) {
  try {
    localStorage.setItem(
      `${SEEN_PREFIX}${userId}`,
      JSON.stringify({ seen: Array.from(seen).slice(-500), cursor }),
    )
  } catch {
    // 存储不可用时退回仅当前会话去重。
  }
}

export function isLocalNotificationsEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

export function setLocalNotificationsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    // 忽略。
  }
}

async function ensurePermission() {
  if (!nativeReady()) return false
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  if (current.display === 'denied') return false
  if (permissionAsked) return false
  permissionAsked = true
  const next = await LocalNotifications.requestPermissions()
  return next.display === 'granted'
}

export async function initLocalNotifications() {
  if (!nativeReady()) return
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '课程消息',
      description: '老师回复、同问、转交与账号通知',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    })
  } catch {
    // 渠道已存在或系统不支持时忽略。
  }

  if (!actionListenerInstalled) {
    actionListenerInstalled = true
    try {
      await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const extra = (event.notification.extra ?? {}) as {
          threadId?: string
          notificationId?: string
        }
        window.dispatchEvent(
          new CustomEvent('shishuo:open-thread', {
            detail: {
              threadId: extra.threadId ?? '',
              notificationId: extra.notificationId ?? '',
            },
          }),
        )
      })
    } catch {
      // 旧 APK 没有插件时忽略。
    }
  }
}

export async function syncLocalNotifications(input: {
  userId: string
  audience: 'student' | 'teacher'
  recipientId: string
  courseIds: Set<string>
  notifications: AppNotification[]
}) {
  if (!nativeReady() || !isLocalNotificationsEnabled()) return
  if (document.visibilityState !== 'visible') return
  if (!(await ensurePermission())) return

  const relevant = input.notifications
    .filter(
      (notification) =>
        !notification.read &&
        notification.audience === input.audience &&
        notification.recipientId === input.recipientId &&
        input.courseIds.has(notification.courseId),
    )
    .sort((a, b) => a.createdAt - b.createdAt)

  const stored = readSeen(input.userId)
  if (!stored) {
    // 首次只建立基线，避免把种子/历史未读一次弹出来。
    writeSeen(
      input.userId,
      new Set(relevant.map((notification) => notification.id)),
      relevant.reduce((max, notification) => Math.max(max, notification.createdAt), Date.now()),
    )
    return
  }

  const fresh = relevant
    .filter((notification) => !stored.seen.has(notification.id))
    .filter((notification) => notification.createdAt >= stored.cursor || stored.cursor === 0)
    .slice(0, 5)
  if (fresh.length === 0) return

  try {
    await LocalNotifications.schedule({
      notifications: fresh.map((notification) => ({
        id: notificationId(notification.id),
        title: notification.title.slice(0, 80),
        body: notification.body.replace(/\s+/g, ' ').slice(0, 160),
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_shishuo',
        autoCancel: true,
        extra: {
          threadId: notification.threadId,
          notificationId: notification.id,
          kind: notification.kind,
        },
      })),
    })
  } catch {
    return
  }

  for (const notification of fresh) stored.seen.add(notification.id)
  writeSeen(
    input.userId,
    stored.seen,
    fresh.reduce((max, notification) => Math.max(max, notification.createdAt), stored.cursor),
  )
}
