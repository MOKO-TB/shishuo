import type { Course } from '../types'

/** 校园生活是一个独立的「知识域」，复用课程 FAQ / 问答 / 权限模型。 */
export const CAMPUS_COURSE_ID = 'campus'

/**
 * 校园域的负责人。
 * 目前由演示管理员陈砚兼任；接入真实运营账号后，只需改这一处和
 * server/policy.mjs 里的同名字段。
 */
export const CAMPUS_OWNER_NAME = '陈砚'

export const CAMPUS_COURSE: Course = {
  id: CAMPUS_COURSE_ID,
  name: '校园生活',
  shortName: '校园',
  code: 'CAMPUS',
  teacher: CAMPUS_OWNER_NAME,
  teacherTitle: '校园主理人',
  accent: 'gold',
  students: 0,
  chapter: '校园经验',
}

export function isCampusCourse(courseId: string) {
  return courseId === CAMPUS_COURSE_ID
}
