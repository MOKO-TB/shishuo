/**
 * 附件发送前的隐私授权偏好。
 *
 * 默认每次上传都确认；用户勾选「记住我的选择」后本机不再询问，
 * 可以在「账号 · 隐私与附件」里重新开启。偏好只存本机，不随账号同步。
 */

const CONSENT_KEY = 'shishuo.attachment.consent.v1'

export type AttachmentScene = 'student-ask' | 'teacher-faq' | 'teacher-reply'
export type AttachmentKind = 'image' | 'file'

export interface AttachmentConsentOptions {
  scene: AttachmentScene
  kind: AttachmentKind
  /** 本次选中的文件名，用于弹窗里展示“只发送这些”。 */
  fileNames?: string[]
  totalBytes?: number
  /** 学生题图：允许任课老师查看原图。 */
  allowTeacherVisibleToggle?: boolean
  defaultTeacherVisible?: boolean
}

export interface AttachmentConsentResult {
  teacherVisible: boolean
}

interface ConsentPrefs {
  remember: boolean
  at: number
  /** 上次勾选“记住”时，题图是否允许任课老师查看原图。 */
  teacherVisible?: boolean
}

function readPrefs(): ConsentPrefs {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return { remember: false, at: 0 }
    const parsed = JSON.parse(raw) as Partial<ConsentPrefs>
    return { remember: parsed.remember === true, at: Number(parsed.at) || 0 }
  } catch {
    return { remember: false, at: 0 }
  }
}

export function shouldAskAttachmentConsent() {
  return !readPrefs().remember
}

export function isAttachmentConsentRemembered() {
  return readPrefs().remember
}

export function readRememberedTeacherVisible(): boolean | undefined {
  return readPrefs().teacherVisible
}

export function rememberAttachmentConsent(teacherVisible?: boolean) {
  try {
    const current = readPrefs()
    const visibility =
      typeof teacherVisible === 'boolean' ? teacherVisible : current.teacherVisible
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        remember: true,
        at: Date.now(),
        ...(typeof visibility === 'boolean' ? { teacherVisible: visibility } : {}),
      } satisfies ConsentPrefs),
    )
  } catch {
    // 存储被禁用时仍然每次询问，不影响上传。
  }
}

export function resetAttachmentConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    // 忽略。
  }
}
