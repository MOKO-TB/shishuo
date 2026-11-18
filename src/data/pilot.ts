export const PILOT_COURSE_IDS = ['math', 'ds', 'circuit', 'analog', 'digital'] as const

export const PILOT_DEFAULT_COURSE_ID = 'ds'

export const PILOT_COURSE_LABELS: Record<string, string> = {
  math: '高等数学',
  ds: '数据结构',
  circuit: '电路',
  analog: '模电',
  digital: '数电',
}

export function isPilotCourse(courseId: string) {
  return (PILOT_COURSE_IDS as readonly string[]).includes(courseId)
}
