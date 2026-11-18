/** Server-side course/teacher policy for the five-course pilot. */
export const PILOT_COURSES = {
  math: { teacher: '李芸', name: '高等数学' },
  ds: { teacher: '陈砚', name: '数据结构' },
  circuit: { teacher: '石岩', name: '电路' },
  analog: { teacher: '陆衡', name: '模电' },
  digital: { teacher: '顾明', name: '数电' },
}

export const PILOT_COURSE_IDS = Object.keys(PILOT_COURSES)

/** 校园生活域：复用 FAQ / 问答 / 权限模型，但不占用课程白名单。 */
export const CAMPUS_COURSE_ID = 'campus'
export const CAMPUS_OWNER_NAME = '系统管理员'

export function isCampusCourse(courseId) {
  return courseId === CAMPUS_COURSE_ID
}

export function courseTeacherName(courseId) {
  if (courseId === CAMPUS_COURSE_ID) return CAMPUS_OWNER_NAME
  return PILOT_COURSES[courseId]?.teacher ?? ''
}

export const TEACHER_COURSES = {
  李芸: ['math'],
  陈砚: ['ds'],
  石岩: ['circuit'],
  陆衡: ['analog'],
  顾明: ['digital'],
}

export function parseJsonObject(value, fallback = null) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function parseCourseList(value) {
  if (Array.isArray(value)) return value.filter((id) => typeof id === 'string')
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function userProfile(row) {
  return parseJsonObject(row?.profile_json, {})
}

export function teacherCourses(row) {
  const stored = parseCourseList(row?.courses_json)
  if (stored.length > 0) return stored
  return TEACHER_COURSES[row?.name] ?? []
}

/** Pilot courses plus the student's own timetable courses, with their teacher names. */
export function studentCourseTeacherMap(row) {
  const map = new Map(Object.entries(PILOT_COURSES).map(([id, item]) => [id, item.teacher]))
  map.set(CAMPUS_COURSE_ID, CAMPUS_OWNER_NAME)
  const profile = userProfile(row)
  const custom = Array.isArray(profile.customCourses) ? profile.customCourses : []
  for (const course of custom) {
    if (!course || typeof course.id !== 'string') continue
    if (map.has(course.id)) continue
    map.set(course.id, typeof course.teacher === 'string' ? course.teacher : '')
  }
  return map
}

export function teacherCourseSet(row) {
  const courses = new Set(teacherCourses(row))
  // 管理员兼任校园主理人；普通课程教师看不到校园问答。
  if (row?.is_admin) courses.add(CAMPUS_COURSE_ID)
  return courses
}
