import { useMemo } from 'react'
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CornerDownRight,
  Inbox,
  MessageCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { courseById, isSeededCourse, teacherByName } from '../data/seed'
import { isPilotCourse } from '../data/pilot'
import { studentCourses, useProfile } from '../lib/profile'
import type { AppNotification, NotificationKind, Role, ViewKey } from '../types'
import { formatRelative } from '../lib/utils'
import { Modal } from './ui'

const kindMeta: Record<
  NotificationKind,
  { icon: typeof Bell; tone: string; label: string }
> = {
  'teacher-reply': { icon: MessageCircle, tone: 'jade', label: '老师回复' },
  'question-escalated': { icon: Send, tone: 'clay', label: '转交老师' },
  'teacher-new-question': { icon: Inbox, tone: 'gold', label: '新问题' },
  'teacher-same-question': { icon: Users, tone: 'gold', label: '同问' },
  'teacher-follow-up': { icon: CornerDownRight, tone: 'blue', label: '追问' },
  'teacher-faq-review': { icon: CircleAlert, tone: 'clay', label: '待完善' },
  'teacher-question-resolved': { icon: CircleCheck, tone: 'jade', label: '已解决' },
  'teacher-question-withdrawn': { icon: Undo2, tone: 'blue', label: '已撤下' },
  'teacher-needs-info': { icon: CircleAlert, tone: 'blue', label: '请你补充' },
  'teacher-supplement': { icon: CornerDownRight, tone: 'jade', label: '学生补充' },
  'same-question-joined': { icon: Users, tone: 'gold', label: '同问' },
  'account-banned': { icon: ShieldAlert, tone: 'danger', label: '账号封禁' },
  'account-muted': { icon: ShieldAlert, tone: 'clay', label: '账号禁言' },
  'account-restored': { icon: ShieldCheck, tone: 'jade', label: '账号恢复' },
}

export function NotificationCenter({
  open,
  onClose,
  role,
  teacherName,
  onNavigate,
  onOpenThread,
}: {
  open: boolean
  onClose: () => void
  role: Role
  teacherName: string
  onNavigate: (view: ViewKey) => void
  onOpenThread: (threadId: string) => void
}) {
  const { data, dispatch } = useStore()
  const { user } = useAuth()
  const profile = useProfile()
  const audience = role
  const recipientId = role === 'student' ? user?.id ?? '' : teacherName
  const courseScope = useMemo(() => {
    if (role === 'student') {
      return new Set(studentCourses(profile).map((course) => course.id))
    }
    return new Set(
      teacherByName(teacherName).courses.filter(
        (id) => isPilotCourse(id) || !isSeededCourse(id),
      ),
    )
  }, [role, profile, teacherName])
  const notifications = data.notifications
    .filter(
      (notification) =>
        notification.audience === audience &&
        notification.recipientId === recipientId &&
        courseScope.has(notification.courseId),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
  const unread = notifications.filter((notification) => !notification.read)

  const markAll = () => {
    dispatch({ type: 'notifications-read-all', audience, recipientId })
  }

  const openNotification = (notification: AppNotification) => {
    dispatch({ type: 'notifications-read', ids: [notification.id] })
    if (notification.kind === 'teacher-faq-review') {
      onNavigate('knowledge')
      onClose()
      return
    }
    const thread = data.threads.find((item) => item.id === notification.threadId)
    if (thread) {
      onOpenThread(thread.id)
    } else {
      onNavigate(role === 'student' ? 'student' : 'teacher')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={role === 'student' ? '学生端 · 本地消息' : `教师端 · ${teacherName}`}
      title="消息通知"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            消息保存在共享课程空间，不会发送短信或微信。
          </span>
          <button className="button button-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      <div className="notif-toolbar">
        <span>
          共 {notifications.length} 条 · 未读 {unread.length}
        </span>
        <button className="text-button" onClick={markAll} disabled={unread.length === 0}>
          <CheckCheck size={14} />
          全部已读
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="notif-empty">
          <Bell size={20} />
          <h3>暂时没有新消息</h3>
          <p>老师回复、问题转交、同问和追问都会出现在这里。</p>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map((notification) => {
            const meta = kindMeta[notification.kind]
            const Icon = meta.icon
            const course = courseById(notification.courseId)
            const label =
              notification.kind === 'teacher-reply' && notification.courseId === 'campus'
                ? '校园主理人回复'
                : meta.label
            return (
              <button
                className={`notif-item ${notification.read ? '' : 'is-unread'}`}
                key={notification.id}
                onClick={() => openNotification(notification)}
              >
                <span className={`notif-icon ${meta.tone}`}>
                  <Icon size={16} />
                </span>
                <span className="notif-copy">
                  <span className="notif-head">
                    <strong>{notification.title}</strong>
                    <span>{formatRelative(notification.createdAt)}</span>
                  </span>
                  <span className="notif-body">{notification.body}</span>
                  <span className="notif-meta">
                    {label} · {course.shortName}
                  </span>
                </span>
                {!notification.read && <i className="notif-dot" />}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
