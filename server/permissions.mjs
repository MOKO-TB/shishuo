import { HttpError } from './http-error.mjs'
import {
  CAMPUS_COURSE_ID,
  courseTeacherName,
  isCampusCourse,
  PILOT_COURSE_IDS,
  studentCourseTeacherMap,
  teacherCourseSet,
} from './policy.mjs'

const THREAD_KINDS = new Set(['ask', 'same', 'follow-up'])
const URGENCIES = new Set(['today', 'week', 'later'])
const NOTIFICATION_KINDS = new Set([
  'teacher-reply',
  'question-escalated',
  'same-question-joined',
  'teacher-new-question',
  'teacher-same-question',
  'teacher-follow-up',
  'teacher-faq-review',
  'teacher-question-resolved',
  'teacher-question-withdrawn',
  'teacher-needs-info',
  'teacher-supplement',
])
const STUDENT_NOTIFICATION_KINDS = new Set([
  'question-escalated',
  'same-question-joined',
  'teacher-new-question',
  'teacher-same-question',
  'teacher-follow-up',
  'teacher-faq-review',
  'teacher-question-resolved',
  'teacher-question-withdrawn',
  'teacher-supplement',
])
const TEACHER_REPLY_NOTIFICATION_KINDS = new Set([
  'teacher-reply',
  'teacher-question-resolved',
  'teacher-needs-info',
])
const STUDENT_THREAD_FIELDS = new Set([
  'feedback',
  'resolvedAt',
  'withdrawnAt',
  'favorite',
  'escalation',
  'clusterId',
  'status',
  'studentSupplement',
])
const STUDENT_FAQ_FIELDS = new Set([
  'citations',
  'helpful',
  'unhelpful',
  'recentUnhelpful',
  'reviewNeeded',
  'reviewNote',
])
const TEACHER_THREAD_FIELDS = new Set([
  'status',
  'teacherReply',
  'teacherRequest',
  'resolvedAt',
  'clusterId',
  'groupLocked',
])
const MAX_NEW_THREADS = 4
const MAX_NEW_NOTIFICATIONS = 40
const MAX_THREAD_TEXT = 20_000
const MAX_FAQS = 2_000
const MAX_THREADS = 20_000
const MAX_NOTIFICATIONS = 20_000

function fail(message) {
  throw new HttpError(403, message)
}

function bad(message) {
  throw new HttpError(400, message)
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function without(object, keys) {
  const copy = { ...object }
  for (const key of keys) delete copy[key]
  return copy
}

function assertOnlyChanged(prev, next, allowedKeys, message) {
  if (!sameValue(without(prev, allowedKeys), without(next, allowedKeys))) fail(message)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value, max = 20_000, allowEmpty = false) {
  return (
    typeof value === 'string' &&
    (allowEmpty || value.trim().length > 0) &&
    value.length <= max
  )
}

function isNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isStringArray(value, maxItems = 100) {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === 'string' && item.length <= 200)
  )
}

function assertIdMap(list, label) {
  if (!Array.isArray(list)) bad(`${label}格式不正确。`)
  const map = new Map()
  for (const item of list) {
    if (!item || typeof item.id !== 'string' || !item.id) bad(`${label}缺少有效 ID。`)
    if (map.has(item.id)) fail(`${label}里出现重复 ID：${item.id}`)
    map.set(item.id, item)
  }
  return map
}

function assertEscalation(value) {
  if (!isObject(value)) fail('转交信息格式不正确。')
  if (!isString(value.title, 120)) fail('转交标题不能为空或过长。')
  if (!isString(value.note, 4_000, true)) fail('补充说明过长。')
  if (typeof value.anonymous !== 'boolean') fail('匿名标记格式不正确。')
  if (!URGENCIES.has(value.urgency)) fail('紧急程度不合法。')
  if (!isNumber(value.at)) fail('转交时间格式不正确。')
  if (value.auto !== undefined && typeof value.auto !== 'boolean') fail('自动转交标记格式不正确。')
}

function assertTeacherInfoRequest(value) {
  if (!isObject(value)) fail('补充要求格式不正确。')
  if (!isString(value.text, 2_000)) fail('补充要求不能为空或过长。')
  if (!isNumber(value.at)) fail('补充要求时间不合法。')
  if (!isString(value.by, 120, true)) fail('补充要求发送人不合法。')
}

function assertStudentSupplement(value) {
  if (!isObject(value)) fail('补充内容格式不正确。')
  if (!isString(value.text, 4_000)) fail('补充内容不能为空或过长。')
  if (!isNumber(value.at)) fail('补充时间不合法。')
}

function assertAttachment(value) {
  if (!isObject(value)) fail('附件格式不正确。')
  const hasDataUrl =
    typeof value.dataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(value.dataUrl)
  const hasUrl =
    typeof value.url === 'string' && /^\/uploads\/img_[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(value.url)
  if (!hasDataUrl && !hasUrl) fail('附件只支持图片。')
  if (hasDataUrl && value.dataUrl.length > 2_000_000) fail('附件图片过大。')
  if (!isString(value.name, 200, true)) fail('附件名称过长。')
  if (!isString(value.type, 100, true)) fail('附件类型过长。')
}

function assertExternalAnswer(value) {
  if (!isObject(value)) fail('外部回答格式不正确。')
  if (!isString(value.text, 20_000)) fail('外部回答内容不合法。')
  if (!isString(value.model, 200, true)) fail('模型名称不合法。')
  if (!isNumber(value.at)) fail('外部回答时间不合法。')
}

function assertReplyAttachment(value) {
  if (!isObject(value)) fail('回复附件格式不正确。')
  if (!isString(value.url, 200) || !/^\/uploads\/img_[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(value.url)) {
    fail('回复图片必须是已上传的题目图片。')
  }
  if (!isString(value.name, 200, true)) fail('回复图片名称过长。')
  if (!isString(value.type, 100, true)) fail('回复图片类型过长。')
}

function assertThreadBasics(thread) {
  if (!isObject(thread)) bad('问答格式不正确。')
  if (!isString(thread.id, 200)) bad('问答 ID 不合法。')
  if (!isString(thread.courseId, 100)) bad('课程 ID 不合法。')
  if (!isObject(thread.student) || !isString(thread.student.id, 200)) {
    bad('提问人信息不合法。')
  }
  if (!isString(thread.student.name, 80)) bad('提问人姓名不合法。')
  if (typeof thread.student.anonymous !== 'boolean') bad('匿名标记不合法。')
  if (!isString(thread.question, MAX_THREAD_TEXT)) bad('问题内容不能为空或过长。')
  if (!isNumber(thread.createdAt)) bad('提问时间不合法。')
  if (thread.kind !== undefined && !THREAD_KINDS.has(thread.kind)) bad('问答类型不合法。')
  if (thread.sources !== undefined && !isStringArray(thread.sources, 20)) {
    bad('引用来源格式不正确。')
  }
  if (thread.attachment !== undefined) assertAttachment(thread.attachment)
  if (thread.externalAnswer !== undefined) assertExternalAnswer(thread.externalAnswer)
  if (thread.escalation !== undefined) assertEscalation(thread.escalation)
  if (thread.teacherRequest !== undefined) assertTeacherInfoRequest(thread.teacherRequest)
  if (thread.studentSupplement !== undefined) assertStudentSupplement(thread.studentSupplement)
  if (thread.clusterId !== undefined && !isString(thread.clusterId, 200)) {
    fail('同题组标记不合法。')
  }
  if (thread.groupLocked !== undefined && typeof thread.groupLocked !== 'boolean') {
    fail('手动分组标记不合法。')
  }
  if (thread.feedback !== undefined && ![null, 'helpful', 'unhelpful'].includes(thread.feedback)) {
    bad('反馈标记不合法。')
  }
}

function assertNewStudentThread(thread, user, allowedCourses, prevFaqMap, prevThreadMap, nextThreadMap) {
  assertThreadBasics(thread)
  if (thread.student.id !== user.id) fail('不能以其他同学的身份提问。')
  if (!allowedCourses.has(thread.courseId)) fail('不能向未加入的课程提问。')
  if (!['ai', 'pending'].includes(thread.status)) fail('新问答状态不合法。')
  if (thread.teacherReply !== undefined) fail('学生不能直接写入老师回复。')
  if (thread.teacherRequest !== undefined) fail('学生不能写入老师补充要求。')
  if (thread.studentSupplement !== undefined) fail('新提问不能带补充内容。')
  if (thread.groupLocked !== undefined) {
    if (thread.kind !== 'same' || !thread.clusterId) fail('学生不能锁定同题组。')
    if (typeof thread.groupLocked !== 'boolean') fail('手动分组标记不合法。')
  }
  if (thread.resolvedAt !== undefined || thread.withdrawnAt !== undefined) {
    fail('新问答不能带已解决或已撤下状态。')
  }
  if (thread.feedback !== undefined && thread.feedback !== null) fail('新问答不能带反馈。')
  if (thread.kind === 'follow-up') {
    const parent = prevThreadMap.get(thread.parentThreadId) ?? nextThreadMap.get(thread.parentThreadId)
    if (!parent || parent.student.id !== user.id) fail('追问只能基于自己的问答。')
  }
  if (thread.kind === 'same') {
    if (!isString(thread.clusterId, 200)) fail('同问缺少同题组。')
    const related = [...prevThreadMap.values(), ...nextThreadMap.values()].some(
      (item) =>
        item.id !== thread.id &&
        item.courseId === thread.courseId &&
        item.status === 'pending' &&
        !item.withdrawnAt &&
        (item.clusterId === thread.clusterId || item.id === thread.clusterId),
    )
    if (!related) fail('同题组不存在或不属于当前课程。')
  }
  const courseFaqs = new Map()
  for (const sourceId of thread.sources ?? []) {
    const faq = prevFaqMap.get(sourceId)
    if (!faq) fail('引用了不存在的课程知识。')
    if (faq.courseId !== thread.courseId) fail('引用来源与课程不匹配。')
    courseFaqs.set(sourceId, faq)
  }
  return courseFaqs
}

function assertTeacherReply(reply, courseId, teacherCourses, nextFaqMap) {
  if (!isObject(reply)) fail('老师回复格式不正确。')
  if (!isString(reply.text, 8_000)) fail('回复内容不能为空或过长。')
  if (!isNumber(reply.at)) fail('回复时间不合法。')
  const expectedTeacher = courseTeacherName(courseId)
  if (isCampusCourse(courseId)) {
    if (!teacherCourses.has(CAMPUS_COURSE_ID)) fail('没有校园内容权限。')
    if (!isString(reply.by, 120)) fail('回复人不能为空。')
  } else {
    if (!expectedTeacher) fail('课程还没有配置任课教师。')
    if (reply.by !== expectedTeacher) fail('回复人必须是该课程的任课教师身份。')
  }
  if (reply.recipientCount !== undefined && !isNumber(reply.recipientCount, { min: 1, max: 500 })) {
    fail('回复人数不合法。')
  }
  if (reply.attachment !== undefined) assertReplyAttachment(reply.attachment)
  if (reply.faqId !== undefined) {
    if (!isString(reply.faqId, 200)) fail('沉淀 FAQ ID 不合法。')
    const faq = nextFaqMap.get(reply.faqId)
    if (!faq) fail('回复引用了不存在的课程 FAQ。')
    if (!teacherCourses.has(faq.courseId)) fail('不能沉淀到未分配课程。')
  }
  if (reply.sedimentPrevious !== undefined && reply.sedimentPrevious !== null) {
    if (!isObject(reply.sedimentPrevious) || !isString(reply.sedimentPrevious.id, 200)) {
      fail('FAQ 回滚快照格式不正确。')
    }
  }
}

function mergeStudentThread(prev, next, user, allowedCourses) {
  assertOnlyChanged(prev, next, STUDENT_THREAD_FIELDS, '不能修改问答正文、引用或老师回复。')
  if (next.feedback !== undefined && ![null, 'helpful', 'unhelpful'].includes(next.feedback)) {
    fail('反馈标记不合法。')
  }
  if (next.resolvedAt !== undefined && !isNumber(next.resolvedAt)) fail('已解决时间不合法。')
  if (next.withdrawnAt !== undefined && !isNumber(next.withdrawnAt)) fail('撤下时间不合法。')
  if (next.favorite !== undefined && typeof next.favorite !== 'boolean') fail('收藏标记不合法。')
  if (next.escalation !== undefined) assertEscalation(next.escalation)
  if (next.clusterId !== undefined && !isString(next.clusterId, 200)) fail('同题组标记不合法。')
  const supplementChanged = !sameValue(prev.studentSupplement, next.studentSupplement)
  if (supplementChanged) {
    if (!(prev.status === 'needs-info' && next.status === 'pending')) {
      fail('只有老师请求补充后才能提交补充。')
    }
    if (!next.studentSupplement) fail('补充内容不能为空。')
    assertStudentSupplement(next.studentSupplement)
  }
  if (next.status !== prev.status) {
    if (prev.status === 'ai' && next.status === 'pending') {
      if (!next.escalation) fail('转交老师时必须带转交信息。')
    } else if (prev.status === 'needs-info' && next.status === 'pending') {
      if (!next.studentSupplement) fail('请先补充内容，再回到老师待办。')
    } else {
      fail('学生只能把自己的 AI 问答转交老师，或补充老师要求的信息。')
    }
  }
  if (!allowedCourses.has(prev.courseId)) fail('课程不在当前账号范围。')
  return {
    ...prev,
    feedback: next.feedback,
    resolvedAt: next.resolvedAt,
    withdrawnAt: next.withdrawnAt,
    favorite: next.favorite,
    escalation: next.escalation,
    clusterId: next.clusterId,
    status: next.status,
    studentSupplement: next.studentSupplement,
  }
}

function buildStudentFaqAllowance(newThreads, prevThreadMap, mergedThreads, prevFaqMap) {
  const allowance = new Map()
  const get = (faqId) => {
    const current = allowance.get(faqId) ?? {
      citations: 0,
      helpful: 0,
      unhelpful: 0,
      recentUnhelpful: 0,
      reviewNeeded: false,
    }
    allowance.set(faqId, current)
    return current
  }
  for (const thread of newThreads) {
    if (thread.kind === 'same' || thread.kind === 'follow-up') continue
    for (const sourceId of new Set(thread.sources ?? [])) {
      get(sourceId).citations += 1
    }
  }
  for (const [threadId, prevThread] of prevThreadMap) {
    const nextThread = mergedThreads.get(threadId)
    if (!nextThread || prevThread.student.id !== nextThread.student.id) continue
    if (prevThread.feedback === nextThread.feedback) continue
    const faqId = prevThread.sources?.[0]
    if (!faqId) continue
    const prevFaq = prevFaqMap.get(faqId)
    if (!prevFaq) continue
    const item = get(faqId)
    if (prevThread.feedback === 'helpful') item.helpful -= 1
    if (prevThread.feedback === 'unhelpful') item.unhelpful -= 1
    if (nextThread.feedback === 'helpful') item.helpful += 1
    if (nextThread.feedback === 'unhelpful') item.unhelpful += 1
    const recentDelta =
      nextThread.feedback === 'unhelpful'
        ? 1
        : prevThread.feedback === 'unhelpful'
          ? -1
          : 0
    item.recentUnhelpful += recentDelta
    const nextRecent = Math.max(0, (prevFaq.recentUnhelpful ?? 0) + recentDelta)
    if (
      nextThread.feedback === 'unhelpful' &&
      !prevFaq.reviewNeeded &&
      nextRecent >= 2
    ) {
      item.reviewNeeded = true
    }
  }
  for (const [faqId, item] of allowance) {
    const prevFaq = prevFaqMap.get(faqId)
    if (!prevFaq) continue
    item.helpful = Math.max(item.helpful, -prevFaq.helpful)
    item.unhelpful = Math.max(item.unhelpful, -prevFaq.unhelpful)
    item.recentUnhelpful = Math.max(item.recentUnhelpful, -(prevFaq.recentUnhelpful ?? 0))
  }
  return allowance
}

function validateStudentFaqChange(prev, next, allowance) {
  assertOnlyChanged(prev, next, STUDENT_FAQ_FIELDS, '学生不能改写课程 FAQ 正文。')
  const expected = allowance ?? {
    citations: 0,
    helpful: 0,
    unhelpful: 0,
    recentUnhelpful: 0,
    reviewNeeded: false,
  }
  const delta = (field) => Number(next[field] ?? 0) - Number(prev[field] ?? 0)
  if (delta('citations') !== expected.citations) fail('引用次数变化与当前操作不一致。')
  if (delta('helpful') !== expected.helpful) fail('有帮助计数变化与当前操作不一致。')
  if (delta('unhelpful') !== expected.unhelpful) fail('不够清楚计数变化与当前操作不一致。')
  if (delta('recentUnhelpful') !== expected.recentUnhelpful) {
    fail('近期负反馈计数变化与当前操作不一致。')
  }
  const expectedReview = Boolean(prev.reviewNeeded || expected.reviewNeeded)
  if (Boolean(next.reviewNeeded) !== expectedReview) {
    fail('学生不能解除待完善标记。')
  }
  if (!prev.reviewNeeded && expected.reviewNeeded) {
    if (typeof next.reviewNote !== 'string') fail('待完善说明格式不正确。')
  } else if (!sameValue(prev.reviewNote, next.reviewNote)) {
    fail('学生不能修改待完善说明。')
  }
  return {
    ...prev,
    citations: next.citations,
    helpful: next.helpful,
    unhelpful: next.unhelpful,
    recentUnhelpful: next.recentUnhelpful,
    reviewNeeded: next.reviewNeeded,
    reviewNote: next.reviewNote,
  }
}

function validateFaqVersion(version) {
  if (!isObject(version)) bad('FAQ 历史版本格式不正确。')
  if (!isString(version.question, 4_000)) bad('FAQ 历史问题不合法。')
  if (!isString(version.answer, 40_000)) bad('FAQ 历史答案不合法。')
  if (!isStringArray(version.tags ?? [], 80) || !isStringArray(version.aliases ?? [], 80)) {
    bad('FAQ 历史标签或别名不合法。')
  }
  if (!isString(version.author, 120, true)) bad('FAQ 历史作者不合法。')
  if (!isNumber(version.updatedAt)) bad('FAQ 历史时间不合法。')
  if (version.chapter !== undefined && !isString(version.chapter, 200, true)) {
    bad('FAQ 历史章节不合法。')
  }
}

function assertCourseNote(note) {
  if (!isObject(note)) bad('课程公告格式不正确。')
  if (!isString(note.courseId, 100)) bad('课程公告课程不合法。')
  if (!isString(note.teacher, 120, true)) bad('课程公告教师不合法。')
  if (!isString(note.announcement, 2_000, true)) bad('课程公告内容过长。')
  if (!isString(note.officeHours, 500, true)) bad('答疑时段过长。')
  if (!isNumber(note.updatedAt)) bad('课程公告时间不合法。')
}

function courseNoteMap(list) {
  if (list === undefined) return new Map()
  if (!Array.isArray(list)) bad('课程公告格式不正确。')
  const map = new Map()
  for (const note of list) {
    assertCourseNote(note)
    if (map.has(note.courseId)) fail('同一课程只能有一条公告。')
    map.set(note.courseId, note)
  }
  return map
}

function validateFaqShape(faq) {
  if (!isObject(faq)) bad('FAQ 格式不正确。')
  if (!isString(faq.id, 200) || !isString(faq.courseId, 100)) bad('FAQ ID 或课程不合法。')
  if (!isString(faq.question, 4_000)) bad('FAQ 问题不能为空或过长。')
  if (!isString(faq.answer, 40_000)) bad('FAQ 答案不能为空或过长。')
  if (!isStringArray(faq.tags ?? [], 80) || !isStringArray(faq.aliases ?? [], 80)) {
    bad('FAQ 标签或别名格式不正确。')
  }
  if (!isString(faq.author, 120, true)) bad('FAQ 作者不合法。')
  if (!['teacher', 'sediment'].includes(faq.source)) bad('FAQ 来源不合法。')
  if (!isNumber(faq.createdAt) || !isNumber(faq.updatedAt)) bad('FAQ 时间不合法。')
  for (const field of ['citations', 'helpful', 'unhelpful']) {
    if (!isNumber(faq[field])) bad('FAQ 计数不合法。')
  }
  if (faq.recentUnhelpful !== undefined && !isNumber(faq.recentUnhelpful)) {
    bad('FAQ 负反馈计数不合法。')
  }
  if (faq.reviewNeeded !== undefined && typeof faq.reviewNeeded !== 'boolean') {
    bad('FAQ 待完善标记不合法。')
  }
  if (faq.reviewNote !== undefined && !isString(faq.reviewNote, 2_000, true)) {
    bad('FAQ 待完善说明不合法。')
  }
  if (faq.chapter !== undefined && !isString(faq.chapter, 200, true)) bad('FAQ 章节不合法。')
  for (const [field, max] of [
    ['credibility', 80],
    ['sourceUrl', 2_000],
    ['sourceChannel', 300],
    ['collectedAt', 40],
    ['verifiedBy', 120],
  ]) {
    if (faq[field] !== undefined && !isString(faq[field], max, true)) {
      bad('FAQ 溯源字段不合法。')
    }
  }
  for (const field of ['lastVerifiedAt', 'reviewIntervalDays', 'nextReviewAt']) {
    if (faq[field] !== undefined && !isNumber(faq[field])) {
      bad('FAQ 复核字段不合法。')
    }
  }
  if (faq.history !== undefined) {
    if (!Array.isArray(faq.history) || faq.history.length > 5) {
      bad('FAQ 历史版本数量不合法。')
    }
    faq.history.forEach(validateFaqVersion)
  }
}

function assertNotificationShape(notification) {
  if (!isObject(notification)) fail('通知格式不正确。')
  if (!isString(notification.id, 200)) fail('通知 ID 不合法。')
  if (!['student', 'teacher'].includes(notification.audience)) fail('通知对象不合法。')
  if (!isString(notification.recipientId, 200)) fail('通知接收人不合法。')
  if (!isString(notification.courseId, 100)) fail('通知课程不合法。')
  if (!isString(notification.threadId, 200)) fail('通知关联问答不合法。')
  if (!NOTIFICATION_KINDS.has(notification.kind)) fail('通知类型不合法。')
  if (!isString(notification.title, 300)) fail('通知标题不合法。')
  if (!isString(notification.body, 1_000, true)) fail('通知正文不合法。')
  if (!isNumber(notification.createdAt)) fail('通知时间不合法。')
  if (typeof notification.read !== 'boolean') fail('通知已读状态不合法。')
}

function validateStudentNewNotification(
  notification,
  user,
  courseTeacherMap,
  threadMap,
  clusterParticipants,
) {
  assertNotificationShape(notification)
  if (!STUDENT_NOTIFICATION_KINDS.has(notification.kind)) {
    fail('学生不能创建该类型通知。')
  }
  const thread = threadMap.get(notification.threadId)
  if (!thread) fail('通知关联的问答不存在。')
  if (notification.courseId !== thread.courseId) fail('通知课程与问答不一致。')
  if (!courseTeacherMap.has(notification.courseId)) fail('通知课程不在当前账号范围。')
  if (
    ['teacher-new-question', 'question-escalated'].includes(notification.kind) &&
    !(thread.status === 'pending' && thread.escalation)
  ) {
    fail('转交通知必须对应已转交的问题。')
  }
  if (notification.kind === 'teacher-same-question' && !thread.clusterId && thread.kind !== 'same') {
    fail('同问通知必须对应同题组。')
  }
  if (notification.kind === 'teacher-follow-up' && thread.kind !== 'follow-up') {
    fail('追问通知必须对应追问。')
  }
  if (notification.kind === 'teacher-question-resolved' && !thread.resolvedAt) {
    fail('已解决通知必须对应该问答的已解决状态。')
  }
  if (notification.kind === 'teacher-question-withdrawn' && !thread.withdrawnAt) {
    fail('撤下通知必须对应该问答的撤下状态。')
  }
  if (notification.kind === 'teacher-supplement') {
    if (thread.status !== 'pending' || !thread.studentSupplement) {
      fail('补充通知必须对应学生补充后的待办问题。')
    }
  }
  if (notification.audience === 'teacher') {
    if (thread.student.id !== user.id) fail('只能为自己的问答生成老师通知。')
    if (notification.recipientId !== courseTeacherMap.get(notification.courseId)) {
      fail('通知接收人不是课程教师。')
    }
    return
  }
  if (notification.recipientId === user.id) {
    if (notification.kind !== 'question-escalated') fail('不能给自己创建该类型通知。')
    if (thread.student.id !== user.id) fail('只能为自己的问答生成通知。')
    return
  }
  if (notification.kind !== 'same-question-joined') fail('不能给其他同学创建该类型通知。')
  if (!thread.clusterId) fail('同问通知缺少同题组。')
  if (thread.status !== 'pending' || thread.withdrawnAt) {
    fail('只能通知仍在等待的同题组同学。')
  }
  if (!clusterParticipants.has(`${thread.clusterId}:${notification.recipientId}`)) {
    fail('只能通知同题组里的同学。')
  }
}

function validateTeacherNewNotification(notification, user, teacherCourses, threadMap) {
  assertNotificationShape(notification)
  if (notification.audience !== 'student') fail('教师只能向学生发送回复通知。')
  if (!TEACHER_REPLY_NOTIFICATION_KINDS.has(notification.kind)) {
    fail('教师不能创建该类型通知。')
  }
  const thread = threadMap.get(notification.threadId)
  if (!thread) fail('通知关联的问答不存在。')
  if (!teacherCourses.has(thread.courseId)) fail('不能向未分配课程的问答发通知。')
  if (notification.courseId !== thread.courseId) fail('通知课程与问答不一致。')
  if (notification.recipientId !== thread.student.id) fail('通知接收人必须是提问学生。')
  if (notification.kind === 'teacher-reply' && !thread.teacherReply) {
    fail('回复通知必须对应一条老师回复。')
  }
  if (notification.kind === 'teacher-question-resolved' && !thread.resolvedAt) {
    fail('已解决通知必须对应该问答的已解决状态。')
  }
  if (notification.kind === 'teacher-needs-info') {
    if (thread.status !== 'needs-info' || !thread.teacherRequest) {
      fail('补充要求通知必须对应待补充的问题。')
    }
  }
}

function mergeCounters(prev, next) {
  const dailyMap = new Map((prev.daily ?? []).map((entry) => [entry.date, entry]))
  for (const entry of next.daily ?? []) {
    if (!isObject(entry) || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) {
      bad('每日统计格式不正确。')
    }
    if (!isNumber(entry.ai) || !isNumber(entry.human)) bad('每日统计数值不合法。')
    const before = dailyMap.get(entry.date)
    if (before) {
      if (entry.ai < before.ai || entry.human < before.human) fail('每日统计不能回退。')
      if (entry.ai - before.ai > 5 || entry.human - before.human > 5) {
        fail('单次提交的每日统计变化过大。')
      }
    } else if (entry.ai > 5 || entry.human > 5) {
      fail('单次提交的每日统计变化过大。')
    }
    dailyMap.set(entry.date, { date: entry.date, ai: entry.ai, human: entry.human })
  }
  if (!isNumber(next.duplicatesMerged)) bad('去重计数格式不正确。')
  if (next.duplicatesMerged < (prev.duplicatesMerged ?? 0)) fail('去重计数不能回退。')
  if (next.duplicatesMerged - (prev.duplicatesMerged ?? 0) > 5) {
    fail('单次提交的去重计数变化过大。')
  }
  if (next.guideSeen !== undefined && typeof next.guideSeen !== 'boolean') {
    bad('演示指引状态不合法。')
  }
  if (prev.guideSeen && !next.guideSeen) fail('演示指引状态不能回退。')
  return {
    daily: Array.from(dailyMap.values()).slice(-30),
    duplicatesMerged: next.duplicatesMerged,
    guideSeen: Boolean(prev.guideSeen || next.guideSeen),
  }
}

function assertImmutableHeader(prev, next) {
  if (next.version !== prev.version) fail('工作区版本号不可修改。')
  if (next.seededAt !== prev.seededAt) fail('工作区初始时间不可修改。')
}

function isAnonymousThread(thread) {
  return Boolean(thread?.student?.anonymous || thread?.escalation?.anonymous)
}

function redactThread(thread) {
  const redacted = {
    ...thread,
    student: {
      ...thread.student,
      id: `anon-thread-${thread.id}`,
      name: '匿名同学',
    },
  }
  // 转交说明是学生写给老师的私密补充（如「作业最后一题要用」），同班同学不需要看到。
  if (redacted.escalation && typeof redacted.escalation === 'object') {
    const { note, ...rest } = redacted.escalation
    redacted.escalation = rest
  }
  return redacted
}

function rehydrateRedactedThreads(prev, next, user) {
  if (!prev || !next || !Array.isArray(next.threads)) return next
  const prevThreads = new Map((prev.threads ?? []).map((thread) => [thread.id, thread]))
  return {
    ...next,
    threads: next.threads.map((thread) => {
      const before = prevThreads.get(thread.id)
      if (!before?.student) return thread
      const seesIdentity =
        user.role === 'teacher'
          ? !isAnonymousThread(before)
          : before.student.id === user.id || !isAnonymousThread(before)
      if (seesIdentity) return thread
      return { ...thread, student: before.student }
    }),
  }
}

function normalizeStudentNotificationRecipient(notification, threadMap) {
  if (!isObject(notification) || notification.audience !== 'student') return notification
  const thread = threadMap.get(notification.threadId)
  if (!thread?.student?.id) return notification
  return { ...notification, recipientId: thread.student.id }
}

function rehydrateRestoredThreads(prev, next) {
  if (!prev || !next || !Array.isArray(next.threads)) return next
  const prevThreads = new Map((prev.threads ?? []).map((thread) => [thread.id, thread]))
  let unresolved = false
  const threads = next.threads.map((thread) => {
    if (!String(thread.student?.id ?? '').startsWith('anon-thread-')) return thread
    const before = prevThreads.get(thread.id)
    if (!before?.student) {
      unresolved = true
      return thread
    }
    return { ...thread, student: before.student }
  })
  if (unresolved) fail('备份中的匿名身份无法在当前空间还原，请在原空间恢复。')
  const studentIdByThread = new Map(
    threads.map((thread) => [thread.id, thread.student?.id]).filter((item) => Boolean(item[1])),
  )
  return {
    ...next,
    threads,
    notifications: (next.notifications ?? []).map((notification) =>
      notification.audience === 'student' && studentIdByThread.has(notification.threadId)
        ? { ...notification, recipientId: studentIdByThread.get(notification.threadId) }
        : notification,
    ),
  }
}

export function projectWorkspace(data, user) {
  if (!data) return null
  if (user.role === 'teacher') {
    const courses = teacherCourseSet(user)
    const threads = (data.threads ?? [])
      .filter((thread) => courses.has(thread.courseId))
      .map((thread) => (isAnonymousThread(thread) ? redactThread(thread) : thread))
    return {
      ...data,
      threads,
      faqs: (data.faqs ?? []).filter((faq) => courses.has(faq.courseId)),
      courseNotes: (data.courseNotes ?? []).filter((note) => courses.has(note.courseId)),
      notifications: (data.notifications ?? []).filter(
        (notification) =>
          courses.has(notification.courseId) &&
          (notification.audience === 'teacher' ||
            (notification.audience === 'student' &&
              TEACHER_REPLY_NOTIFICATION_KINDS.has(notification.kind))),
      ),
    }
  }
  const courseTeacherMap = studentCourseTeacherMap(user)
  const courses = new Set(courseTeacherMap.keys())
  return {
    ...data,
    threads: (data.threads ?? [])
      .filter(
        (thread) =>
          (thread.student?.id === user.id && courses.has(thread.courseId)) ||
          (thread.status === 'pending' && !thread.withdrawnAt && courses.has(thread.courseId)),
      )
      // 自己的问答保持完整；同学的待答问题一律脱敏，只保留「同问」所需的信息合集。
      // 原先只对 anonymous===true 的 thread 脱敏，导致默认实名提问会把姓名下发给同班同学。
      .map((thread) => (thread.student?.id === user.id ? thread : redactThread(thread))),
    faqs: (data.faqs ?? []).filter((faq) => courses.has(faq.courseId)),
    courseNotes: (data.courseNotes ?? []).filter((note) => courses.has(note.courseId)),
    notifications: (data.notifications ?? []).filter(
      (notification) =>
        notification.audience === 'student' &&
        notification.recipientId === user.id &&
        courses.has(notification.courseId),
    ),
  }
}

function mergeStudent(prev, next, user) {
  assertImmutableHeader(prev, next)
  const prevNoteMap = courseNoteMap(prev.courseNotes)
  const nextNoteMap = courseNoteMap(next.courseNotes)
  for (const [courseId, nextNote] of nextNoteMap) {
    const prevNote = prevNoteMap.get(courseId)
    if (!prevNote) fail('学生不能新增课程公告。')
    if (!sameValue(prevNote, nextNote)) fail('学生不能修改课程公告或答疑时段。')
  }
  const courseTeacherMap = studentCourseTeacherMap(user)
  const allowedCourses = new Set(courseTeacherMap.keys())
  const prevThreadMap = assertIdMap(prev.threads, '问答')
  const nextThreadMap = assertIdMap(next.threads, '问答')
  if (nextThreadMap.size > MAX_THREADS) bad('问答数量超过限制。')
  const prevFaqMap = assertIdMap(prev.faqs, 'FAQ')
  const nextFaqMap = assertIdMap(next.faqs, 'FAQ')
  if (nextFaqMap.size > MAX_FAQS) bad('FAQ 数量超过限制。')
  const newThreads = []
  for (const thread of next.threads) {
    if (!prevThreadMap.has(thread.id)) newThreads.push(thread)
  }
  if (newThreads.length > MAX_NEW_THREADS) fail('单次提交新增问答过多。')

  const mergedThreads = new Map()
  for (const [id, prevThread] of prevThreadMap) mergedThreads.set(id, prevThread)
  for (const thread of newThreads) {
    assertNewStudentThread(
      thread,
      user,
      allowedCourses,
      prevFaqMap,
      prevThreadMap,
      nextThreadMap,
    )
    mergedThreads.set(thread.id, thread)
  }
  for (const thread of next.threads) {
    const prevThread = prevThreadMap.get(thread.id)
    if (!prevThread) continue
    if (!prevThread.student || prevThread.student.id !== user.id) {
      // 同班同学的待办会脱敏后随投影下发给学生；写回时只接受三种只读形态：
      // 原样（动作 API）、脱敏快照（投影）、匿名线程挂回真实身份（rehydrate 后）。
      // 合并时始终以服务端 prev 为准，防止学生改写其他同学的问答。
      const redacted = redactThread(prevThread)
      const rehydrated = { ...redacted, student: prevThread.student }
      if (
        !sameValue(prevThread, thread) &&
        !sameValue(redacted, thread) &&
        !sameValue(rehydrated, thread)
      ) {
        fail('不能修改其他同学的问答。')
      }
      continue
    }
    if (!allowedCourses.has(prevThread.courseId)) {
      if (!sameValue(prevThread, thread)) fail('问答课程不在当前账号范围。')
      continue
    }
    mergedThreads.set(thread.id, mergeStudentThread(prevThread, thread, user, allowedCourses))
  }

  const faqAllowance = buildStudentFaqAllowance(
    newThreads,
    prevThreadMap,
    mergedThreads,
    prevFaqMap,
  )
  const mergedFaqs = []
  for (const [id, prevFaq] of prevFaqMap) {
    const nextFaq = nextFaqMap.get(id)
    if (!allowedCourses.has(prevFaq.courseId)) {
      if (nextFaq && !sameValue(prevFaq, nextFaq)) fail('不能修改其他课程的 FAQ。')
      mergedFaqs.push(prevFaq)
      continue
    }
    if (!nextFaq) fail('学生不能删除课程 FAQ。')
    mergedFaqs.push(validateStudentFaqChange(prevFaq, nextFaq, faqAllowance.get(id)))
  }
  for (const faq of next.faqs) {
    if (!prevFaqMap.has(faq.id)) fail('学生不能新增课程 FAQ。')
  }

  const threadMap = new Map(mergedThreads)
  const clusterParticipants = new Set()
  for (const thread of threadMap.values()) {
    if (thread.clusterId && thread.student?.id) {
      clusterParticipants.add(`${thread.clusterId}:${thread.student.id}`)
    }
  }

  const prevNotificationMap = assertIdMap(prev.notifications ?? [], '通知')
  const nextNotificationMap = assertIdMap(next.notifications ?? [], '通知')
  if (nextNotificationMap.size > MAX_NOTIFICATIONS) bad('通知数量超过限制。')
  const newNotifications = []
  for (const notification of next.notifications ?? []) {
    if (prevNotificationMap.has(notification.id)) continue
    const normalized = normalizeStudentNotificationRecipient(notification, threadMap)
    validateStudentNewNotification(
      normalized,
      user,
      courseTeacherMap,
      threadMap,
      clusterParticipants,
    )
    newNotifications.push(normalized)
  }
  if (newNotifications.length > MAX_NEW_NOTIFICATIONS) fail('单次提交新增通知过多。')

  const mergedNotifications = []
  for (const [id, prevNotification] of prevNotificationMap) {
    const visible =
      prevNotification.audience === 'student' &&
      prevNotification.recipientId === user.id &&
      allowedCourses.has(prevNotification.courseId)
    const nextNotification = nextNotificationMap.get(id)
    if (visible) {
      if (!nextNotification) {
        mergedNotifications.push(prevNotification)
        continue
      }
      if (nextNotification.read !== prevNotification.read) {
        assertOnlyChanged(prevNotification, nextNotification, new Set(['read']), '不能修改通知内容。')
      } else {
        assertOnlyChanged(prevNotification, nextNotification, new Set(), '不能修改通知内容。')
      }
      mergedNotifications.push({ ...prevNotification, read: nextNotification.read })
      continue
    }
    if (nextNotification && !sameValue(prevNotification, nextNotification)) {
      fail('不能修改其他账号的通知。')
    }
    const reEscalated =
      prevNotification.kind === 'teacher-question-withdrawn' &&
      (() => {
        const thread = threadMap.get(prevNotification.threadId)
        const oldThread = prevThreadMap.get(prevNotification.threadId)
        return (
          oldThread &&
          oldThread.student.id === user.id &&
          oldThread.withdrawnAt !== undefined &&
          thread &&
          thread.withdrawnAt === undefined
        )
      })()
    if (!reEscalated) mergedNotifications.push(prevNotification)
  }

  const counters = mergeCounters(prev, next)
  return {
    ...prev,
    threads: [
      ...newThreads,
      ...prev.threads.map((thread) => mergedThreads.get(thread.id) ?? thread),
    ],
    faqs: mergedFaqs,
    courseNotes: prev.courseNotes ?? [],
    notifications: [...newNotifications, ...mergedNotifications],
    ...counters,
  }
}

function mergeTeacherThread(prev, next, teacherCourses, nextFaqMap) {
  assertOnlyChanged(prev, next, TEACHER_THREAD_FIELDS, '不能修改学生问题、引用或其他教师的数据。')
  if (!['ai', 'pending', 'needs-info', 'answered'].includes(next.status)) {
    fail('问答状态不合法。')
  }
  if (next.resolvedAt !== undefined && !isNumber(next.resolvedAt)) fail('已解决时间不合法。')
  if (next.clusterId !== undefined && !isString(next.clusterId, 200)) fail('同题组标记不合法。')
  if (next.groupLocked !== undefined && typeof next.groupLocked !== 'boolean') {
    fail('手动分组标记不合法。')
  }
  if (next.teacherRequest !== undefined) assertTeacherInfoRequest(next.teacherRequest)
  const requestChanged = !sameValue(prev.teacherRequest, next.teacherRequest)
  if (requestChanged) {
    if (!(prev.status === 'pending' && next.status === 'needs-info')) {
      fail('只有待办问题可以发送补充要求。')
    }
    if (!next.teacherRequest) fail('补充要求不能为空。')
    if (next.teacherRequest.by !== courseTeacherName(prev.courseId)) {
      fail('补充要求必须使用该课程的任课教师身份。')
    }
  }
  if (next.status !== prev.status) {
    if (next.status === 'answered') {
      if (!next.teacherReply) fail('标记已回答时必须带老师回复。')
      if (!['pending', 'ai'].includes(prev.status)) fail('不能直接改写已处理问答的状态。')
    } else if (next.status === 'needs-info') {
      if (prev.status !== 'pending') fail('只有待办问题可以请求补充。')
      if (!next.teacherRequest) fail('请求补充时必须带补充要求。')
      if (next.teacherReply !== undefined) fail('等补充状态不能带老师回复。')
      if (next.resolvedAt !== undefined) fail('等补充状态不能带已解决确认。')
    } else if (next.status === 'pending') {
      if (prev.status === 'answered') {
        if (next.teacherReply !== undefined) fail('退回待办时不能保留老师回复。')
      } else if (prev.status === 'needs-info') {
        if (next.teacherRequest !== undefined) fail('撤回补充要求时需要清除要求。')
        if (next.teacherReply !== undefined) fail('撤回补充要求时不能带老师回复。')
      } else {
        fail('只有撤回回复或补充要求才能把问答退回待办。')
      }
    } else {
      fail('老师不能把问答改成该状态。')
    }
  } else if (!sameValue(prev.teacherReply, next.teacherReply)) {
    fail('已发送的老师回复不能直接改写，请先撤回再重新回复。')
  }
  if (next.status === 'answered' && !next.teacherReply) fail('已回答状态必须带回复。')
  if (next.status === 'needs-info' && next.teacherReply !== undefined) {
    fail('等补充状态不能带老师回复。')
  }
  if (next.teacherReply !== undefined) {
    assertTeacherReply(next.teacherReply, prev.courseId, teacherCourses, nextFaqMap)
  }
  const undoingReply =
    prev.status === 'answered' && next.status === 'pending' && !next.teacherReply
  if (undoingReply) {
    if (next.resolvedAt !== undefined) fail('撤回回复时需要一并清除已解决确认。')
  } else if (!sameValue(prev.resolvedAt, next.resolvedAt)) {
    fail('老师不能修改学生的已解决确认。')
  }
  return {
    ...prev,
    status: next.status,
    teacherReply: next.teacherReply,
    teacherRequest: next.teacherRequest,
    resolvedAt: next.resolvedAt,
    clusterId: next.clusterId,
    groupLocked: next.groupLocked,
  }
}

function mergeTeacher(prev, next, user) {
  assertImmutableHeader(prev, next)
  const teacherCourses = teacherCourseSet(user)
  if (teacherCourses.size === 0) fail('当前教师账号还没有分配课程。')
  const prevNoteMap = courseNoteMap(prev.courseNotes)
  const nextNoteMap = courseNoteMap(
    next.courseNotes === undefined ? (prev.courseNotes ?? []) : next.courseNotes,
  )
  const mergedCourseNotes = []
  for (const [courseId, prevNote] of prevNoteMap) {
    const nextNote = nextNoteMap.get(courseId)
    if (!teacherCourses.has(courseId)) {
      if (nextNote && !sameValue(prevNote, nextNote)) fail('不能修改未分配课程的公告。')
      mergedCourseNotes.push(prevNote)
      continue
    }
    if (!nextNote) continue
    if (nextNote.teacher !== courseTeacherName(courseId)) {
      fail('课程公告必须使用该课程的任课教师身份。')
    }
    mergedCourseNotes.push(nextNote)
  }
  for (const [courseId, nextNote] of nextNoteMap) {
    if (prevNoteMap.has(courseId)) continue
    if (!teacherCourses.has(courseId)) fail('不能向未分配课程发布公告。')
    if (nextNote.teacher !== courseTeacherName(courseId)) {
      fail('课程公告必须使用该课程的任课教师身份。')
    }
    mergedCourseNotes.push(nextNote)
  }
  const prevThreadMap = assertIdMap(prev.threads, '问答')
  const nextThreadMap = assertIdMap(next.threads, '问答')
  for (const id of nextThreadMap.keys()) {
    if (!prevThreadMap.has(id)) fail('老师不能新增学生问答。')
  }
  const prevFaqMap = assertIdMap(prev.faqs, 'FAQ')
  const nextFaqMap = assertIdMap(next.faqs, 'FAQ')
  const newFaqs = []
  for (const faq of next.faqs) {
    if (!prevFaqMap.has(faq.id)) newFaqs.push(faq)
  }
  for (const faq of newFaqs) {
    validateFaqShape(faq)
    if (!teacherCourses.has(faq.courseId)) fail('不能向未分配课程新增 FAQ。')
  }

  const mergedThreads = new Map()
  for (const [id, prevThread] of prevThreadMap) mergedThreads.set(id, prevThread)
  for (const [id, prevThread] of prevThreadMap) {
    const nextThread = nextThreadMap.get(id)
    if (!nextThread) {
      if (teacherCourses.has(prevThread.courseId)) fail('老师不能删除学生问答。')
      continue
    }
    if (!teacherCourses.has(prevThread.courseId)) {
      if (!sameValue(prevThread, nextThread)) fail('不能修改未分配课程的问答。')
      continue
    }
    mergedThreads.set(id, mergeTeacherThread(prevThread, nextThread, teacherCourses, nextFaqMap))
  }

  const mergedFaqs = []
  for (const [id, prevFaq] of prevFaqMap) {
    const nextFaq = nextFaqMap.get(id)
    if (!teacherCourses.has(prevFaq.courseId)) {
      if (nextFaq && !sameValue(prevFaq, nextFaq)) fail('不能修改未分配课程的 FAQ。')
      mergedFaqs.push(prevFaq)
      continue
    }
    if (!nextFaq) continue
    validateFaqShape(nextFaq)
    if (!teacherCourses.has(nextFaq.courseId)) fail('不能把 FAQ 移到未分配课程。')
    mergedFaqs.push(nextFaq)
  }
  if (newFaqs.length + prevFaqMap.size > MAX_FAQS) bad('FAQ 数量超过限制。')

  const mergedNotificationMap = new Map()
  const prevNotificationMap = assertIdMap(prev.notifications ?? [], '通知')
  const nextNotificationMap = assertIdMap(next.notifications ?? [], '通知')
  for (const [id, prevNotification] of prevNotificationMap) {
    const nextNotification = nextNotificationMap.get(id)
    const ownTeacher =
      prevNotification.audience === 'teacher' &&
      teacherCourses.has(prevNotification.courseId)
    if (ownTeacher) {
      if (!nextNotification) {
        mergedNotificationMap.set(id, prevNotification)
        continue
      }
      assertOnlyChanged(prevNotification, nextNotification, new Set(['read']), '不能修改通知内容。')
      mergedNotificationMap.set(id, { ...prevNotification, read: nextNotification.read })
      continue
    }
    const replyNotification =
      prevNotification.audience === 'student' &&
      teacherCourses.has(prevNotification.courseId) &&
      TEACHER_REPLY_NOTIFICATION_KINDS.has(prevNotification.kind)
    if (replyNotification && !nextNotification) {
      const thread = mergedThreads.get(prevNotification.threadId)
      const undoValid =
        prevNotification.kind === 'teacher-reply'
          ? !thread?.teacherReply
          : prevNotification.kind === 'teacher-needs-info'
            ? thread?.status !== 'needs-info'
            : !thread?.resolvedAt
      if (!undoValid) fail('只有撤回回复、补充要求或撤销已解决后才能删除学生通知。')
      continue
    }
    if (replyNotification && nextNotification) {
      assertOnlyChanged(prevNotification, nextNotification, new Set(), '不能修改学生通知。')
    }
    if (!replyNotification && nextNotification && !sameValue(prevNotification, nextNotification)) {
      fail('不能修改未分配课程的通知。')
    }
    mergedNotificationMap.set(id, prevNotification)
  }

  const newNotifications = []
  for (const notification of next.notifications ?? []) {
    if (prevNotificationMap.has(notification.id)) continue
    const normalized = normalizeStudentNotificationRecipient(notification, mergedThreads)
    validateTeacherNewNotification(normalized, user, teacherCourses, mergedThreads)
    newNotifications.push(normalized)
  }
  if (newNotifications.length > MAX_NEW_NOTIFICATIONS) fail('单次提交新增通知过多。')
  if (newNotifications.length + prevNotificationMap.size > MAX_NOTIFICATIONS) bad('通知数量超过限制。')

  const counters = mergeCounters(prev, next)
  return {
    ...prev,
    threads: prev.threads.map((thread) => mergedThreads.get(thread.id) ?? thread),
    faqs: [
      ...newFaqs,
      ...prev.faqs
        .map((faq) => {
          if (!teacherCourses.has(faq.courseId)) return faq
          return mergedFaqs.find((item) => item.id === faq.id)
        })
        .filter(Boolean),
    ],
    courseNotes: mergedCourseNotes,
    notifications: [...newNotifications, ...Array.from(mergedNotificationMap.values())],
    ...counters,
  }
}

function assertResetPayload(data) {
  const courseIds = new Set((data.faqs ?? []).map((faq) => faq.courseId))
  if ((data.faqs ?? []).length < 60) {
    fail('重置数据不完整，至少需要 60 条课程 FAQ。')
  }
  if (!PILOT_COURSE_IDS.every((courseId) => courseIds.has(courseId))) {
    fail('重置或恢复的数据必须覆盖全部 5 门试点课程。')
  }
}

export function authorizeAndMerge({ prev, next, user, mode }) {
  if (!prev) return next
  if (mode !== undefined && mode !== null && !['reset', 'restore'].includes(mode)) {
    bad('工作区写入模式不合法。')
  }
  if (mode === 'reset' || mode === 'restore') {
    if (user.role !== 'teacher') fail('只有教师账号可以重置或恢复共享空间。')
    if (mode === 'reset') {
      assertResetPayload(next)
      return next
    }
    return rehydrateRestoredThreads(prev, next)
  }
  const hydrated = rehydrateRedactedThreads(prev, next, user)
  if (user.role === 'teacher') return mergeTeacher(prev, hydrated, user)
  return mergeStudent(prev, hydrated, user)
}
