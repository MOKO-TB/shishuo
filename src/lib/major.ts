import type { AnswerResult, AppData, Course, Thread } from '../types'
import { courseById } from '../data/seed'
import {
  GENERIC_GUIDE,
  resolveMajor,
  type MajorFaq,
  type MajorGuide,
  type MajorStage,
} from '../data/major'
import { questionSimilarity, retrieve } from './engine'
import {
  currentStudentId,
  runsInWeek,
  scoreToNumber,
  sectionLabel,
  studentCourses,
  teachingWeek,
  todayClasses,
  weekdayLabel,
  type ScoreRow,
  type StudentProfile,
} from './profile'
import { truncate } from './utils'

export type MentorAnswerKind = 'briefing' | 'guide' | 'route' | 'fallback'

export interface MentorSource {
  label: string
  detail?: string
  tone?: 'jade' | 'gold' | 'blue' | 'neutral'
}

export interface MentorRoute {
  courseId: string
  courseName: string
  teacher: string
  question: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

export interface MentorAnswer {
  kind: MentorAnswerKind
  title: string
  text: string
  bullets?: string[]
  sources: MentorSource[]
  route?: MentorRoute
  stages?: MajorStage[]
}

export interface MentorMessage {
  id: string
  role: 'user' | 'mentor'
  text: string
  answer?: MentorAnswer
}

const COURSE_HINTS: Record<string, string[]> = {
  ds: ['数据结构', '数据结构与算法', '图论', '动态规划', 'ds'],
  algo: ['算法设计与分析', '算法设计', '算法'],
  math: ['高等数学', '高数', '微积分'],
  net: ['计算机网络', '计网'],
}

const BRIEFING_PATTERN =
  /(这周|本周|这学期|本学期|我的进度|学习计划|怎么安排|先补什么|我该先|哪里薄弱|哪门弱|最近怎么学)/

const MAP_PATTERN = /(课程|先修|顺序|关系|地图|先学|怎么学|规划)/

function majorKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .trim()
}

function myThreads(data: AppData): Thread[] {
  return data.threads.filter((thread) => thread.student.id === currentStudentId())
}

function pendingThreads(data: AppData) {
  return myThreads(data)
    .filter((thread) => thread.status === 'pending' && !thread.withdrawnAt)
    .sort((a, b) => b.createdAt - a.createdAt)
}

function repliedThreads(data: AppData) {
  return myThreads(data)
    .filter((thread) => thread.status === 'answered' && !thread.resolvedAt && !thread.withdrawnAt)
    .sort((a, b) => b.createdAt - a.createdAt)
}

function weakestScore(profile: StudentProfile) {
  return profile.scores
    .map((row) => ({ row, value: scoreToNumber(row.score) }))
    .filter((item): item is { row: ScoreRow; value: number } => item.value !== null)
    .sort((a, b) => a.value - b.value)[0]
}

function sectionEntriesThisWeek(profile: StudentProfile) {
  const week = teachingWeek(profile.termStart)
  return [...profile.schedule]
    .filter((entry) => (week ? runsInWeek(entry.weeks, week) : true))
    .sort((a, b) => a.day - b.day || a.startSection - b.startSection)
}

function entryLabel(entry: StudentProfile['schedule'][number]) {
  return `${weekdayLabel(entry.day)} ${sectionLabel(entry)} ${entry.course}`
}

function matchByName(question: string, hint: string) {
  const q = majorKey(question)
  const h = majorKey(hint)
  if (!q || !h || h.length < 2) return false
  return q.includes(h)
}

function courseHints(course: Course, profile: StudentProfile) {
  const scheduleNames = profile.schedule
    .filter((entry) => entry.matchedCourseId === course.id)
    .map((entry) => entry.course)
  return [
    course.name,
    course.shortName,
    ...(COURSE_HINTS[course.id] ?? []),
    ...scheduleNames,
  ].filter(Boolean)
}

function aliasHit(question: string, aliases: string[]) {
  const q = majorKey(question)
  if (!q) return false
  return aliases.some((alias) => {
    const a = majorKey(alias)
    if (!a || a.length < 2) return false
    return q.includes(a) || (q.length >= 4 && a.includes(q))
  })
}

function bestGuideFaq(question: string, guide: MajorGuide) {
  const q = majorKey(question)
  let best: { faq: MajorFaq; score: number } | undefined
  for (const faq of guide.faqs) {
    const similarity = questionSimilarity(question, faq.question)
    const alias = aliasHit(question, faq.aliases) ? 0.35 : 0
    const tag = faq.tags.some((item) => q.includes(majorKey(item))) ? 0.08 : 0
    const score = Math.min(1, similarity + alias + tag)
    if (!best || score > best.score) best = { faq, score }
  }
  return best
}

function guideMatch(question: string, guide: MajorGuide) {
  const best = bestGuideFaq(question, guide)
  if (!best || best.score < 0.3) return undefined
  return best
}

interface CourseRouteHit {
  course: Course
  result: AnswerResult
  matchedByName: boolean
  score: number
}

function findCourseRoute(
  question: string,
  profile: StudentProfile,
  data: AppData,
): CourseRouteHit | undefined {
  let best: CourseRouteHit | undefined
  for (const course of studentCourses(profile)) {
    const result = retrieve(data.faqs, question, course.id)
    const matchedByName = courseHints(course, profile).some((hint) => matchByName(question, hint))
    const score = result.score + (matchedByName ? 1 : 0)
    if (!best || score > best.score) {
      best = { course, result, matchedByName, score }
    }
  }
  if (!best) return undefined
  if (best.matchedByName) return best
  return best.result.confidence === 'low' ? undefined : best
}

function routeAnswer(hit: CourseRouteHit, question: string): MentorAnswer {
  const { course, result, matchedByName } = hit
  const top = result.top
  const reason = matchedByName
    ? top
      ? `课程知识库里有一条相近内容《${truncate(top.faq.question, 26)}》，去课程里问会带上出处。`
      : '你提到了这门课或相关关键词，先去课程里问。'
    : `课程知识库里找到了相近内容（相关度 ${Math.round(result.score * 100)}%），去课程里问会按课程依据答。`
  return {
    kind: 'route',
    title: '这个问题该去课程里问',
    text: `${reason} 没把握时会自动转交${course.teacher}老师。`,
    sources: [
      {
        label: top ? '课程知识库' : '课程路由',
        detail: `${course.name} · ${course.teacher}老师`,
        tone: 'jade',
      },
    ],
    route: {
      courseId: course.id,
      courseName: course.name,
      teacher: course.teacher,
      question,
      reason: matchedByName
        ? `由课程名或关键词判断：${course.name}`
        : `知识库相近，相关度 ${Math.round(result.score * 100)}%`,
      confidence: matchedByName ? (result.confidence === 'low' ? 'low' : result.confidence) : result.confidence,
    },
  }
}

function briefingAnswer(profile: StudentProfile, data: AppData): MentorAnswer {
  const sections = sectionEntriesThisWeek(profile)
  const week = teachingWeek(profile.termStart)
  const today = todayClasses(profile).filter((entry) =>
    week ? runsInWeek(entry.weeks, week) : true,
  )
  const pending = pendingThreads(data)
  const replied = repliedThreads(data)
  const weakest = weakestScore(profile)
  const guideReady = Boolean(resolveMajor(profile.major))
  const bullets: string[] = []
  const sources: MentorSource[] = []

  if (sections.length > 0) {
    const labels = sections.slice(0, 3).map(entryLabel)
    bullets.push(
      `本周 ${sections.length} 节课：${labels.join('、')}${sections.length > 3 ? ` 等 ${sections.length} 节` : ''}`,
    )
    sources.push({ label: '你的课表', tone: 'blue' })
  }
  if (today.length > 0) {
    bullets.push(`今天有 ${today.map(entryLabel).join('、')}`)
  }
  if (pending.length > 0) {
    const items = pending
      .slice(0, 2)
      .map((thread) => `《${courseById(thread.courseId).shortName}》${truncate(thread.question, 18)}`)
    bullets.push(`在等老师：${items.join('；')}`)
    sources.push({ label: '你的答疑记录', tone: 'blue' })
  } else if (replied.length > 0) {
    const items = replied
      .slice(0, 2)
      .map((thread) => `《${courseById(thread.courseId).shortName}》${truncate(thread.question, 18)}`)
    bullets.push(`老师已回复、你还没确认：${items.join('；')}`)
    sources.push({ label: '你的答疑记录', tone: 'blue' })
  }
  if (weakest) {
    bullets.push(`相对薄弱：《${weakest.row.course}》${weakest.row.score} 分`)
    sources.push({ label: '你的成绩', tone: 'blue' })
  }
  if (bullets.length === 0) {
    bullets.push('还没有课表、成绩或答疑记录')
    sources.push({ label: '演示身份', tone: 'neutral' })
  }

  let text: string
  if (pending.length > 0) {
    const first = pending[0]
    text = `先处理《${courseById(first.courseId).shortName}》的待回复；老师回复后，把没懂的点继续追问。`
  } else if (replied.length > 0) {
    const first = replied[0]
    text = `先确认《${courseById(first.courseId).shortName}》的回复是否解决；没解决就继续追问，别让问题挂着。`
  } else if (weakest) {
    text = `这周先补《${weakest.row.course}》的基础，再做新题；每次 45 分钟，别同时铺几门。`
  } else if (sections.length > 0) {
    text = '这周没有紧急待办；按课程进度各留一次复盘，重点抓最影响后续的那门。'
  } else {
    text = '先绑定课表或成绩；没有数据时，我只能给通用建议，不能假装知道你的进度。'
  }
  if (!guideReady) {
    text += '\n\n当前没有该专业的演示培养方案，以上只根据你的课表、成绩和答疑记录整理。'
  }

  return {
    kind: 'briefing',
    title: '这周先做这几件事',
    text,
    bullets,
    sources,
  }
}

function guideAnswer(
  question: string,
  profile: StudentProfile,
): MentorAnswer | undefined {
  const resolved = resolveMajor(profile.major)
  const guide = resolved ?? GENERIC_GUIDE
  const direct = guideMatch(question, guide)
  const matched = direct ?? (resolved ? guideMatch(question, GENERIC_GUIDE) : undefined)
  if (!matched) return undefined
  const usedGeneric = !direct || !resolved
  const answerGuide = direct ? guide : GENERIC_GUIDE
  const showMap = Boolean(resolved) && !usedGeneric && answerGuide.stages.length > 0 && MAP_PATTERN.test(question)
  return {
    kind: 'guide',
    title: usedGeneric ? '通用学习建议' : '专业学习建议',
    text: `${matched.faq.answer}${usedGeneric ? '\n\n当前没有该专业的演示培养方案，以上是通用学习建议，不替代学校培养方案。' : ''}`,
    sources: [
      {
        label: matched.faq.source,
        detail: usedGeneric ? undefined : answerGuide.name,
        tone: 'gold',
      },
    ],
    stages: showMap ? answerGuide.stages : undefined,
  }
}

function fallbackAnswer(): MentorAnswer {
  return {
    kind: 'fallback',
    title: '这个我暂时没有依据',
    text:
      '这个问题我没有专业资料或课程知识库依据，不想编一个像答案的东西。\n你可以：① 先把问题缩到具体课程或知识点，再去对应课程问 AI；② 需要老师定调的，直接在课程里转交任课老师。',
    sources: [],
  }
}

export function mentorQuickPrompts(hasGuide = true) {
  return hasGuide
    ? ['这学期怎么安排？', '这个专业先学什么？', '这些课之间是什么关系？']
    : ['这学期怎么安排？', '基础差怎么补？', '怎么问老师问题才有效？']
}

export function mentorSummary(profile: StudentProfile, data: AppData) {
  if (!profile.major.trim()) return '先填写专业，导师才能按培养路径给建议'
  const pending = pendingThreads(data)
  if (pending.length > 0) {
    const course = courseById(pending[0].courseId)
    return pending.length === 1
      ? `《${course.shortName}》有 1 个问题在等${course.teacher}老师`
      : `你有 ${pending.length} 个问题在等老师，先看《${course.shortName}》`
  }
  const week = teachingWeek(profile.termStart)
  const sections = sectionEntriesThisWeek(profile)
  if (sections.length > 0) {
    const today = todayClasses(profile).filter((entry) =>
      week ? runsInWeek(entry.weeks, week) : true,
    )
    if (today.length > 0) return `今天有 ${today[0].course}（${sectionLabel(today[0])}）`
    return `本周有 ${sections.length} 节课，点开看怎么排`
  }
  const weakest = weakestScore(profile)
  if (weakest) return `《${weakest.row.course}》可以再稳一稳，点开看怎么补`
  return '绑定课表或成绩后，我能按你的真实进度排'
}

export function answerMentorQuestion(
  question: string,
  profile: StudentProfile,
  data: AppData,
): MentorAnswer {
  const text = question.trim()
  if (!text) return fallbackAnswer()

  const earlyRoute = findCourseRoute(text, profile, data)
  if (earlyRoute?.matchedByName) return routeAnswer(earlyRoute, text)
  if (earlyRoute?.result.confidence === 'high' && BRIEFING_PATTERN.test(text) === false) {
    return routeAnswer(earlyRoute, text)
  }

  if (BRIEFING_PATTERN.test(text)) {
    return briefingAnswer(profile, data)
  }

  if (earlyRoute) return routeAnswer(earlyRoute, text)

  const guide = guideAnswer(text, profile)
  if (guide) return guide

  return fallbackAnswer()
}