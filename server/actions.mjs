/**
 * 事务化动作 API 的载荷构建：把「单个动作」翻译成对工作区文档的最小变更，
 * 再交给 authorizeAndMerge 复用既有的角色 / 课程 / 字段校验，由 api.mjs 以
 * revision 乐观锁事务化落库。前端整包同步（PUT /api/state）保持不变。
 */
import { HttpError } from './http-error.mjs'
import { courseTeacherName } from './policy.mjs'

function bad(message) {
  throw new HttpError(400, message)
}

function notFound(label) {
  throw new HttpError(404, `找不到对应的${label}。`)
}

function makeActionId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function threadMapOf(data) {
  return new Map((data.threads ?? []).map((thread) => [thread.id, thread]))
}

function withThread(data, threadId, mutator) {
  const thread = threadMapOf(data).get(threadId)
  if (!thread) notFound('问答')
  return {
    ...data,
    threads: (data.threads ?? []).map((item) => (item.id === threadId ? mutator(thread) : item)),
  }
}

function omitKey(object, key) {
  const clone = { ...object }
  delete clone[key]
  return clone
}

function teacherNotification(thread, kind, { title, body }, now) {
  return {
    id: makeActionId('n'),
    audience: 'student',
    recipientId: thread.student.id,
    courseId: thread.courseId,
    threadId: thread.id,
    kind,
    title,
    body,
    createdAt: now,
    read: false,
  }
}

function studentTeacherNotification(thread, kind, { title, body }, user, now) {
  return {
    id: makeActionId('n'),
    audience: 'teacher',
    recipientId: courseTeacherName(thread.courseId),
    courseId: thread.courseId,
    threadId: thread.id,
    kind,
    title,
    body,
    createdAt: now,
    read: false,
    ...(thread.student.anonymous ? { anonymous: true } : {}),
  }
}

function upsertFaq(data, faq) {
  if (!faq || typeof faq !== 'object' || !String(faq.id ?? '')) bad('FAQ 格式不正确。')
  const existing = (data.faqs ?? []).find((item) => item.id === faq.id)
  if (!existing) {
    return { ...data, faqs: [{ ...faq }, ...(data.faqs ?? [])] }
  }
  const snapshot = {
    question: existing.question,
    answer: existing.answer,
    tags: existing.tags,
    aliases: existing.aliases,
    ...(existing.chapter ? { chapter: existing.chapter } : {}),
    author: existing.author,
    updatedAt: existing.updatedAt,
  }
  const updated = { ...faq, history: [snapshot, ...(existing.history ?? [])] }
  return {
    ...data,
    faqs: (data.faqs ?? []).map((item) => (item.id === faq.id ? updated : item)),
  }
}

function excerpt(text, length = 90) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, length)
}

/**
 * 把动作翻译成「下一个工作区文档」。返回 null 表示动作未知。
 * 越权 / 语义错误由 authorizeAndMerge 在合并阶段统一裁决。
 */
export function buildActionNext(action, payload, prev, user, now) {
  const p = payload ?? {}
  switch (action) {
    case 'thread-create': {
      const thread = p.thread
      if (!thread || typeof thread !== 'object' || !thread.id) bad('问答格式不正确。')
      return { ...prev, threads: [...(prev.threads ?? []), thread] }
    }
    case 'thread-escalate': {
      if (!p.threadId) bad('缺少问答 ID。')
      const thread = threadMapOf(prev).get(p.threadId)
      if (!thread) notFound('问答')
      let next = withThread(prev, p.threadId, (item) => ({
        ...item,
        status: 'pending',
        escalation: { ...(p.escalation ?? {}), at: p.escalation?.at ?? now },
        ...(p.clusterId !== undefined ? { clusterId: p.clusterId } : {}),
      }))
      const updated = threadMapOf(next).get(p.threadId)
      next = {
        ...next,
        notifications: [
          studentTeacherNotification(
            updated,
            'question-escalated',
            {
              title: `${user.name}把问题转交给你`,
              body: excerpt(updated.escalation?.note || updated.question),
            },
            user,
            now,
          ),
          ...(next.notifications ?? []),
        ],
      }
      return next
    }
    case 'thread-feedback': {
      if (!p.threadId) bad('缺少问答 ID。')
      if (!['helpful', 'unhelpful', null].includes(p.feedback)) bad('反馈标记不合法。')
      return withThread(prev, p.threadId, (thread) => ({ ...thread, feedback: p.feedback }))
    }
    case 'thread-resolve': {
      if (!p.threadId) bad('缺少问答 ID。')
      const thread = threadMapOf(prev).get(p.threadId)
      if (!thread) notFound('问答')
      const resolve = p.resolved !== false
      let next = withThread(prev, p.threadId, (item) =>
        resolve
          ? { ...item, resolvedAt: item.resolvedAt ?? now }
          : omitKey(item, 'resolvedAt'),
      )
      if (resolve) {
        const updated = threadMapOf(next).get(p.threadId)
        next = {
          ...next,
          notifications: [
            studentTeacherNotification(
              updated,
              'teacher-question-resolved',
              {
                title: `${user.name}确认问题已解决`,
                body: excerpt(updated.teacherReply?.text || updated.question, 60),
              },
              user,
              now,
            ),
            ...(next.notifications ?? []),
          ],
        }
      }
      return next
    }
    case 'thread-withdraw': {
      if (!p.threadId) bad('缺少问答 ID。')
      const thread = threadMapOf(prev).get(p.threadId)
      if (!thread) notFound('问答')
      const withdraw = p.withdrawn !== false
      let next = withThread(prev, p.threadId, (item) =>
        withdraw ? { ...item, withdrawnAt: item.withdrawnAt ?? now } : omitKey(item, 'withdrawnAt'),
      )
      if (withdraw) {
        const updated = threadMapOf(next).get(p.threadId)
        next = {
          ...next,
          notifications: [
            studentTeacherNotification(
              updated,
              'teacher-question-withdrawn',
              { title: `${user.name}撤下了问题`, body: excerpt(updated.question) },
              user,
              now,
            ),
            ...(next.notifications ?? []),
          ],
        }
      }
      return next
    }
    case 'thread-favorite': {
      if (!p.threadId) bad('缺少问答 ID。')
      return withThread(prev, p.threadId, (thread) => ({ ...thread, favorite: p.favorite !== false }))
    }
    case 'thread-supplement': {
      if (!p.threadId) bad('缺少问答 ID。')
      const text = String(p.supplement ?? '').trim()
      if (!text) bad('补充内容不能为空。')
      const thread = threadMapOf(prev).get(p.threadId)
      if (!thread) notFound('问答')
      let next = withThread(prev, p.threadId, (item) => ({
        ...item,
        status: 'pending',
        studentSupplement: { text, at: now },
      }))
      const updated = threadMapOf(next).get(p.threadId)
      next = {
        ...next,
        notifications: [
          studentTeacherNotification(
            updated,
            'teacher-supplement',
            { title: `${user.name}补充了说明`, body: excerpt(text) },
            user,
            now,
          ),
          ...(next.notifications ?? []),
        ],
      }
      return next
    }
    case 'thread-reply': {
      const reply = p.reply
      if (!reply || typeof reply !== 'object') bad('回复格式不正确。')
      const ids = Array.isArray(p.threadIds) && p.threadIds.length > 0 ? p.threadIds : [p.threadId]
      if (!ids.length || ids.some((id) => !id)) bad('缺少问答 ID。')
      let next = prev
      for (const id of ids) {
        next = withThread(next, id, (thread) => ({ ...thread, status: 'answered', teacherReply: reply }))
      }
      const notifications = []
      const prevMap = threadMapOf(prev)
      for (const id of ids) {
        const thread = threadMapOf(next).get(id)
        const before = prevMap.get(id)
        if (!before?.teacherReply || before.teacherReply.at !== reply.at) {
          notifications.push(
            teacherNotification(
              thread,
              'teacher-reply',
              { title: `${reply.by}老师回复了你的问题`, body: excerpt(reply.text) },
              now,
            ),
          )
        }
      }
      next = { ...next, notifications: [...notifications, ...(next.notifications ?? [])] }
      if (p.faq) next = upsertFaq(next, p.faq)
      return next
    }
    case 'thread-undo-reply': {
      const ids = Array.isArray(p.threadIds) && p.threadIds.length > 0 ? p.threadIds : [p.threadId]
      if (!ids.length || ids.some((id) => !id)) bad('缺少问答 ID。')
      let next = prev
      for (const id of ids) {
        next = withThread(next, id, (thread) => {
          if (!thread.teacherReply) return thread
          const cleared = omitKey({ ...thread, status: 'pending' }, 'teacherReply')
          return omitKey(cleared, 'resolvedAt')
        })
      }
      const undoneIds = new Set(
        ids.filter((id) => {
          const before = threadMapOf(prev).get(id)
          return Boolean(before?.teacherReply)
        }),
      )
      next = {
        ...next,
        notifications: (next.notifications ?? []).filter(
          (notification) =>
            !(
              undoneIds.has(notification.threadId) &&
              notification.kind === 'teacher-reply' &&
              notification.audience === 'student'
            ),
        ),
      }
      return next
    }
    case 'thread-request-info': {
      if (!p.threadId) bad('缺少问答 ID。')
      const text = String(p.request?.text ?? '').trim()
      if (!text) bad('补充要求不能为空。')
      const thread = threadMapOf(prev).get(p.threadId)
      if (!thread) notFound('问答')
      let next = withThread(prev, p.threadId, (item) => ({
        ...item,
        status: 'needs-info',
        teacherRequest: {
          text,
          at: p.request?.at ?? now,
          by: courseTeacherName(item.courseId),
        },
      }))
      const updated = threadMapOf(next).get(p.threadId)
      next = {
        ...next,
        notifications: [
          teacherNotification(
            updated,
            'teacher-needs-info',
            { title: `${updated.teacherRequest.by}老师想了解更多`, body: excerpt(text) },
            now,
          ),
          ...(next.notifications ?? []),
        ],
      }
      return next
    }
    case 'thread-withdraw-request': {
      if (!p.threadId) bad('缺少问答 ID。')
      return withThread(prev, p.threadId, (thread) => {
        if (thread.status !== 'needs-info') return thread
        const cleared = { ...thread, status: 'pending' }
        return omitKey(cleared, 'teacherRequest')
      })
    }
    case 'faq-save': {
      return upsertFaq(prev, p.faq)
    }
    case 'faq-remove': {
      if (!p.faqId) bad('缺少 FAQ ID。')
      return { ...prev, faqs: (prev.faqs ?? []).filter((item) => item.id !== p.faqId) }
    }
    case 'notifications-read': {
      const ids = new Set(Array.isArray(p.ids) ? p.ids : [])
      if (ids.size === 0) bad('缺少通知 ID。')
      const read = p.read !== false
      return {
        ...prev,
        notifications: (prev.notifications ?? []).map((notification) =>
          ids.has(notification.id) ? { ...notification, read } : notification,
        ),
      }
    }
    default:
      return undefined
  }
}
