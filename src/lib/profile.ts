import { useSyncExternalStore } from 'react'
import {
  COURSES,
  allCourses,
  allTeachers,
  isSeededCourse,
  isSeededTeacher,
  registerExtraCourses,
} from '../data/seed'
import { PILOT_COURSE_IDS, PILOT_DEFAULT_COURSE_ID, isPilotCourse } from '../data/pilot'
import { apiPut } from './api'
import type { Course, CourseAccent } from '../types'

export interface ScheduleEntry {
  id: string
  course: string
  teacher: string
  room: string
  /** 1 = 周一 … 7 = 周日 */
  day: number
  startSection: number
  endSection: number
  /** 教务里写的周次，例如 "1-16"、"2-16(双周)"；空表示每周都上。 */
  weeks?: string
  startTime?: string
  endTime?: string
  matchedCourseId?: string
}

export interface ScoreRow {
  id: string
  course: string
  score: string
  credit: number | null
  semester: string
  kind: string
}

export interface StudentProfile {
  name: string
  college: string
  /** Used by the major mentor; manually chosen, independent of the timetable. */
  major: string
  studentNo: string
  defaultCourseId: string
  schedule: ScheduleEntry[]
  scheduleSource: 'jw' | 'manual' | null
  scheduleSyncedAt: number | null
  /** Monday of teaching week 1 (timestamp). The school calendar is not on the timetable page. */
  termStart: number | null
  scores: ScoreRow[]
  scoresSyncedAt: number | null
  /** Courses derived from the real timetable, kept separate from the seeded demo courses. */
  customCourses: Course[]
  /** Real timetable teachers hidden from the quick course switcher and teacher identity list. */
  hiddenTeacherNames: string[]
  /** Opt-in: email the student when a teacher replies. Requires server SMTP. */
  emailOnTeacherReply: boolean
  /** 错题本：复习卡自评「还没会」的次数与最近复习时间，按问答 ID 保存。 */
  reviewLapses: Record<string, { lapses: number; lastReviewAt: number }>
}

/** Set by AuthProvider; seeded demo questions use lin-xiao so they stay "mine" for that account. */
let currentUserId = ''

export function setCurrentUserId(userId: string) {
  currentUserId = userId
}

export function currentStudentId() {
  return currentUserId
}

/** Earlier reads could store a table footnote as if it were a class; hide those saved rows too. */
function isFootnoteEntry(entry: ScheduleEntry) {
  const course = entry.course ?? ''
  return (
    !entry.teacher &&
    !entry.room &&
    /[;；]/.test(course) &&
    (course.match(/周/g)?.length ?? 0) >= 2
  )
}

/** 2026-2027 学年第一学期第 1 周周一；学生仍可在账号设置里改。 */
export const DEFAULT_TERM_START = new Date(2026, 7, 31).getTime()

export const DEFAULT_PROFILE: StudentProfile = {
  name: '林晓',
  college: '计算机学院 · 2024 级',
  major: '计算机科学与技术',
  studentNo: '',
  defaultCourseId: PILOT_DEFAULT_COURSE_ID,
  schedule: [],
  scheduleSource: null,
  scheduleSyncedAt: null,
  termStart: DEFAULT_TERM_START,
  scores: [],
  scoresSyncedAt: null,
  customCourses: [],
  hiddenTeacherNames: [],
  emailOnTeacherReply: false,
  reviewLapses: {},
}

/** Merge the account's server profile over the demo defaults without writing it back. */
export function hydrateProfile(raw: Partial<StudentProfile> | null, displayName?: string) {
  const next = normalizeProfile({
    ...DEFAULT_PROFILE,
    ...(raw ?? {}),
    name: String(raw?.name ?? '').trim() || displayName?.trim() || DEFAULT_PROFILE.name,
    schedule: Array.isArray(raw?.schedule) ? raw.schedule : [],
    scores: Array.isArray(raw?.scores) ? raw.scores : [],
    customCourses: Array.isArray(raw?.customCourses) ? raw.customCourses : [],
    hiddenTeacherNames: Array.isArray(raw?.hiddenTeacherNames) ? raw.hiddenTeacherNames : [],
    emailOnTeacherReply: raw?.emailOnTeacherReply === true,
    reviewLapses: normalizeReviewLapses(raw?.reviewLapses),
  })
  registerExtraCourses(next.customCourses)
  currentProfile = next
  profileListeners.forEach((listener) => listener())
  return next
}

function persistProfile(profile: StudentProfile) {
  return apiPut('/api/profile', { profile }).catch(() => undefined)
}

const CUSTOM_ACCENTS: CourseAccent[] = ['jade', 'clay', 'blue', 'gold']

function courseKey(name: string) {
  return name.replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '').trim()
}

function customCourseId(name: string) {
  let hash = 5381
  for (const char of courseKey(name)) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0
  return `jw-${Math.abs(hash).toString(36)}`
}

function customShortName(name: string) {
  const cleaned = name.replace(/\s+/g, ' ').replace(/[（(].*?[)）]/g, '').trim()
  return cleaned.length > 12 ? `${cleaned.slice(0, 12)}…` : cleaned
}

/**
 * Bind every timetable row to either a seeded demo course or a stable generated course.
 * The same function is used for previews and for saved profiles, so clicking a real class
 * always lands on the same course id that later threads and FAQs use.
 */
export function bindScheduleCourses(schedule: ScheduleEntry[], previous: Course[] = []) {
  const previousByName = new Map(previous.map((course) => [courseKey(course.name), course]))
  const bound: Course[] = []
  const byKey = new Map<string, Course>()
  const nextSchedule = schedule.map((entry) => {
    const name = (entry.course ?? '').trim()
    const teacher = (entry.teacher ?? '').trim()
    const seeded = matchCourseId(name)
    if (seeded) return { ...entry, matchedCourseId: seeded }
    const key = courseKey(name)
    if (!key) return entry
    let course = byKey.get(key) ?? previousByName.get(key)
    if (!course) {
      course = {
        id: customCourseId(name),
        name: name.slice(0, 60),
        shortName: customShortName(name),
        code: '',
        teacher: teacher || '未指定',
        teacherTitle: '任课教师',
        accent: CUSTOM_ACCENTS[bound.length % CUSTOM_ACCENTS.length],
        students: 0,
        chapter: '',
      }
    } else if (course.teacher === '未指定' && teacher) {
      course = { ...course, teacher }
    }
    if (!byKey.has(key)) bound.push(course)
    byKey.set(key, course)
    return { ...entry, matchedCourseId: course.id }
  })
  // Keep past timetable courses resolvable so threads and FAQs from an earlier
  // semester still show their real course and teacher instead of "未命名课程".
  const boundIds = new Set(bound.map((course) => course.id))
  const archived = previous.filter((course) => !boundIds.has(course.id))
  return { schedule: nextSchedule, customCourses: [...bound, ...archived] }
}

function normalizeReviewLapses(raw: unknown): Record<string, { lapses: number; lastReviewAt: number }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, { lapses: number; lastReviewAt: number }> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as { lapses?: unknown; lastReviewAt?: unknown } | null
    if (!entry || typeof entry !== 'object') continue
    const lapses = Number(entry.lapses)
    const lastReviewAt = Number(entry.lastReviewAt)
    if (!Number.isFinite(lapses) || !Number.isFinite(lastReviewAt)) continue
    result[id] = {
      lapses: Math.max(0, Math.min(99, Math.round(lapses))),
      lastReviewAt,
    }
  }
  const entries = Object.entries(result)
  if (entries.length > 200) {
    entries.sort((a, b) => b[1].lastReviewAt - a[1].lastReviewAt)
    return Object.fromEntries(entries.slice(0, 200))
  }
  return result
}

export function normalizeProfile(next: StudentProfile): StudentProfile {
  const schedule = (Array.isArray(next.schedule) ? next.schedule : []).filter(
    (entry) => !isFootnoteEntry(entry),
  )
  const bound = bindScheduleCourses(schedule, next.customCourses ?? [])
  const validDefaults = new Set([
    ...PILOT_COURSE_IDS,
    ...bound.customCourses.map((course) => course.id),
    ...bound.schedule
      .map((entry) => entry.matchedCourseId)
      .filter((id): id is string => Boolean(id)),
  ])
  const defaultCourseId = validDefaults.has(next.defaultCourseId)
    ? next.defaultCourseId
    : (bound.schedule.find((entry) => entry.matchedCourseId)?.matchedCourseId ??
      PILOT_DEFAULT_COURSE_ID)
  const hiddenTeacherNames = Array.from(
    new Set((next.hiddenTeacherNames ?? []).filter((name) => !isSeededTeacher(name))),
  )
  return {
    ...next,
    schedule: bound.schedule,
    customCourses: bound.customCourses,
    defaultCourseId,
    hiddenTeacherNames,
    termStart: next.termStart ?? DEFAULT_TERM_START,
    emailOnTeacherReply: next.emailOnTeacherReply === true,
    reviewLapses: normalizeReviewLapses(next.reviewLapses),
  }
}

let currentProfile: StudentProfile = {
  ...DEFAULT_PROFILE,
  schedule: [],
  scores: [],
  customCourses: [],
  hiddenTeacherNames: [],
  emailOnTeacherReply: false,
  reviewLapses: {},
}
const profileListeners = new Set<() => void>()

export function setProfile(next: StudentProfile) {
  const normalized = normalizeProfile(next)
  registerExtraCourses(normalized.customCourses)
  currentProfile = normalized
  void persistProfile(normalized)
  profileListeners.forEach((listener) => listener())
  return normalized
}

/** Latest in-memory profile; use when merging an async result into the current settings. */
export function getProfile() {
  return currentProfile
}

export function resetProfile() {
  const next: StudentProfile = {
    ...DEFAULT_PROFILE,
    schedule: [],
    scores: [],
    customCourses: [],
    hiddenTeacherNames: [],
  }
  registerExtraCourses([])
  currentProfile = next
  void persistProfile(next)
  profileListeners.forEach((listener) => listener())
}

/** Drop the signed-in student's profile without touching the server copy. */
export function clearProfileMemory() {
  registerExtraCourses([])
  currentProfile = {
    ...DEFAULT_PROFILE,
    schedule: [],
    scores: [],
    customCourses: [],
    hiddenTeacherNames: [],
  }
  profileListeners.forEach((listener) => listener())
}

function subscribeProfile(listener: () => void) {
  profileListeners.add(listener)
  return () => profileListeners.delete(listener)
}

export function useProfile() {
  return useSyncExternalStore(subscribeProfile, () => currentProfile)
}

/** Pilot courses plus real timetable courses; other seeded demo courses stay out of the UI. */
export function studentCourseIds(profile: StudentProfile) {
  const fromSchedule = Array.from(
    new Set(profile.schedule.map((entry) => entry.matchedCourseId).filter((id): id is string => Boolean(id))),
  ).filter((id) => isPilotCourse(id) || !isSeededCourse(id))
  const seeded = [...PILOT_COURSE_IDS]
  const allowed = new Set(allCourses().map((course) => course.id))
  const merged = [...fromSchedule, ...seeded].filter((id) => allowed.has(id))
  return Array.from(new Set(merged))
}

export function isTeacherVisible(profile: StudentProfile, name: string) {
  if (isSeededTeacher(name)) return true
  return !(profile.hiddenTeacherNames ?? []).includes(name)
}

export function visibleTeachers(profile: StudentProfile) {
  const allowedIds = new Set([
    ...PILOT_COURSE_IDS,
    ...profile.customCourses.map((course) => course.id),
  ])
  return allTeachers()
    .filter((teacher) => teacher.courses.some((courseId) => allowedIds.has(courseId)))
    .filter((teacher) => isTeacherVisible(profile, teacher.name))
}

export function studentCourses(profile: StudentProfile) {
  const byId = new Map(allCourses().map((course) => [course.id, course]))
  return studentCourseIds(profile)
    .map((id) => byId.get(id))
    .filter((course): course is Course => Boolean(course))
    .filter((course) => isSeededCourse(course.id) || isTeacherVisible(profile, course.teacher))
}

export function profileMeta(profile: StudentProfile) {
  const parts = [
    profile.college.trim(),
    profile.studentNo.trim() ? `学号 ${profile.studentNo.trim()}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '学生账号'
}

/** Day numbers are ISO-like: 1 = 周一 … 7 = 周日 (see weekdayNumber). */
const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

export function weekdayNumber(ts = Date.now()) {
  const day = new Date(ts).getDay()
  return day === 0 ? 7 : day
}

export function weekdayLabel(day: number) {
  return `周${WEEKDAY_NAMES[day - 1] ?? '一'}`
}

export function sectionLabel(entry: ScheduleEntry) {
  return entry.startSection === entry.endSection
    ? `第 ${entry.startSection} 节`
    : `第 ${entry.startSection}-${entry.endSection} 节`
}

/**
 * Bell schedule used when the 教务 table only prints section numbers.
 * Matches the school's published 24h settings (上午 4 节 / 下午 4 节 / 晚上 3 节).
 */
export const SECTION_BELL: Record<number, { start: string; end: string }> = {
  1: { start: '08:20', end: '09:05' },
  2: { start: '09:10', end: '09:55' },
  3: { start: '10:15', end: '11:00' },
  4: { start: '11:05', end: '11:50' },
  5: { start: '14:30', end: '15:15' },
  6: { start: '15:20', end: '16:05' },
  7: { start: '16:25', end: '17:10' },
  8: { start: '17:15', end: '18:00' },
  9: { start: '19:00', end: '19:45' },
  10: { start: '19:50', end: '20:35' },
  11: { start: '20:40', end: '21:25' },
}

export function sectionBell(section: number) {
  const bell = SECTION_BELL[section]
  return bell ? `${bell.start}-${bell.end}` : ''
}

export function periodTime(entry: ScheduleEntry) {
  if (entry.startTime && entry.endTime) return `${entry.startTime}-${entry.endTime}`
  const start = SECTION_BELL[entry.startSection]
  const end = SECTION_BELL[entry.endSection]
  return start && end ? `${start.start}-${end.end}` : ''
}

export const COURSE_TONES = [
  'jade',
  'clay',
  'blue',
  'gold',
  'mint',
  'rose',
  'sea',
  'plum',
  'olive',
  'sky',
  'sand',
  'iris',
] as const

export type CourseTone = (typeof COURSE_TONES)[number]

/** Assign tones by first appearance so two courses never share a colour until the palette runs out. */
export function courseToneMap(courses: Array<{ course: string }>): Map<string, CourseTone> {
  const unique: string[] = []
  for (const item of courses) {
    if (item.course && !unique.includes(item.course)) unique.push(item.course)
  }
  return new Map(
    unique.map((course, index) => [course, COURSE_TONES[index % COURSE_TONES.length]]),
  )
}

/** One character for the compact timetable: 大学英语 → 英, 大学生创业基础与实训 → 创. */
export function courseGlyph(course: string) {
  const trimmed = (course || '').trim()
  const stripped = trimmed.replace(/^(大学生|大学|高等|基础)/, '')
  const source = stripped || trimmed
  const cjk = source.match(/[\u4e00-\u9fa5]/)
  if (cjk) return cjk[0]
  const latin = source.match(/[a-zA-Z0-9]/)
  return latin ? latin[0].toUpperCase() : '课'
}

/** Monday 00:00 of the week containing ts. */
export function mondayOf(ts = Date.now()) {
  const date = new Date(ts)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Which teaching week a date falls in, given the Monday of week 1. */
export function teachingWeek(termStart: number | null | undefined, ts = Date.now()) {
  if (!termStart) return null
  const diff = mondayOf(ts) - mondayOf(termStart)
  return Math.max(1, Math.floor(diff / (7 * 86_400_000)) + 1)
}

/** Monday of the selected teaching week. */
export function weekMonday(termStart: number | null | undefined, week: number, fallback = Date.now()) {
  const base = termStart ? mondayOf(termStart) : mondayOf(fallback)
  return base + (week - 1) * 7 * 86_400_000
}

/** "2026-09-28" → timestamp (local midnight), for <input type="date">. */
export function dateInputValue(ts: number | null | undefined) {
  if (!ts) return ''
  const date = new Date(ts)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

/** "1-16" / "1-8,10-16" / "2-16(双周)" → does this class run in the given week? */
export function runsInWeek(weeks: string | undefined, week: number) {
  const text = (weeks ?? '').trim()
  if (!text) return true
  if (/单周/.test(text) && week % 2 === 0) return false
  if (/双周/.test(text) && week % 2 === 1) return false
  const ranges = [...text.matchAll(/(\d{1,2})\s*[-–~]\s*(\d{1,2})/g)]
  if (ranges.length === 0) {
    const singles = [...text.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]))
    return singles.length === 0 ? true : singles.includes(week)
  }
  return ranges.some((match) => week >= Number(match[1]) && week <= Number(match[2]))
}

export function weekLabel(weeks: string | undefined) {
  const text = (weeks ?? '').trim()
  if (!text) return '每周'
  return `第 ${text.replace(/[（(]周[)）]/g, '').replace(/\(/g, ' ').replace(/\)/g, '')} 周`
}

/** Bind a timetable course name to one of the seeded courses so the two views agree. */
export function matchCourseId(courseName: string) {
  const normalized = courseName.replace(/\s+/g, '')
  if (!normalized) return undefined
  let best: { id: string; length: number } | undefined
  for (const course of COURSES.filter((item) => isPilotCourse(item.id))) {
    for (const name of [course.name, course.shortName]) {
      const key = name.replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '')
      if (key.length >= 2 && (normalized.includes(key) || key.includes(normalized))) {
        if (!best || key.length > best.length) best = { id: course.id, length: key.length }
      }
    }
  }
  return best?.id
}

export function withMatchedCourse(entry: ScheduleEntry): ScheduleEntry {
  return { ...entry, matchedCourseId: entry.matchedCourseId ?? matchCourseId(entry.course) }
}

export function sortSchedule(entries: ScheduleEntry[]) {
  return [...entries].sort(
    (a, b) => a.day - b.day || a.startSection - b.startSection || a.course.localeCompare(b.course, 'zh-Hans-CN'),
  )
}

export function todayClasses(profile: StudentProfile, ts = Date.now()) {
  const day = weekdayNumber(ts)
  return sortSchedule(profile.schedule.filter((entry) => entry.day === day))
}

function timeToMinutes(value: string | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '')
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function entryEndMinutes(entry: ScheduleEntry) {
  return timeToMinutes(entry.endTime) ?? timeToMinutes(SECTION_BELL[entry.endSection]?.end)
}

/** 今天还没下课的课程；教务没写时间时按学校节次表推算。 */
export function upcomingTodayClasses(profile: StudentProfile, ts = Date.now()) {
  const now = new Date(ts)
  const minutes = now.getHours() * 60 + now.getMinutes()
  return todayClasses(profile, ts).filter((entry) => {
    const end = entryEndMinutes(entry)
    return end === null || end > minutes
  })
}

export function nextClass(profile: StudentProfile, ts = Date.now()) {
  const upcoming = upcomingTodayClasses(profile, ts)
  if (upcoming.length > 0) return upcoming[0]
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = ((weekdayNumber(ts) - 1 + offset) % 7) + 1
    const list = sortSchedule(profile.schedule.filter((entry) => entry.day === day))
    if (list.length > 0) return list[0]
  }
  return undefined
}

/** 等级成绩按常见折算；学校另有规定的以学校为准（界面上会写明口径）。 */
const GRADE_SCORE: Record<string, number> = { 优: 95, 良: 85, 中: 75, 及格: 65, 合格: 65 }

export function scoreToNumber(value: string) {
  const text = (value ?? '').trim()
  if (text in GRADE_SCORE) return GRADE_SCORE[text]
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function gpa5(score: number) {
  return score >= 60 ? Math.max(0, score / 10 - 5) : 0
}

export interface ScoreStats {
  counted: number
  skipped: number
  credits: number
  weightedAverage: number | null
  averageScore: number | null
  gpaFive: number | null
  semesters: string[]
}

export function scoreStats(rows: ScoreRow[]): ScoreStats {
  const usable = rows
    .map((row) => ({ row, score: scoreToNumber(row.score) }))
    .filter((item): item is { row: ScoreRow; score: number } => item.score !== null && (item.row.credit ?? 0) > 0)
  const credits = usable.reduce((sum, item) => sum + (item.row.credit ?? 0), 0)
  const weighted = (fn: (score: number) => number) =>
    credits > 0
      ? usable.reduce((sum, item) => sum + fn(item.score) * (item.row.credit ?? 0), 0) / credits
      : null
  return {
    counted: usable.length,
    skipped: rows.length - usable.length,
    credits,
    weightedAverage:
      credits > 0
        ? usable.reduce((sum, item) => sum + item.score * (item.row.credit ?? 0), 0) / credits
        : null,
    averageScore:
      usable.length > 0
        ? usable.reduce((sum, item) => sum + item.score, 0) / usable.length
        : null,
    gpaFive: weighted(gpa5),
    semesters: Array.from(new Set(rows.map((row) => row.semester).filter(Boolean))),
  }
}

/** Monday 00:00 of the current week, for the timetable header. */
export function startOfWeek(ts = Date.now()) {
  const date = new Date(ts)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function monthDayOf(ts: number) {
  const date = new Date(ts)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
