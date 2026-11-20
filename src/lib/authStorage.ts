/**
 * 登录态的本机记忆：
 * - rememberToken 用来在 Cookie 被清掉（微信内置浏览器常见）后换一个新会话；
 * - 只记邮箱用于预填，不保存密码。
 */

const REMEMBER_KEY = 'shishuo.remember.v1'
const EMAIL_KEY = 'shishuo.login.email.v1'

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // 隐私模式或存储被禁用时静默失败，不影响正常登录。
  }
}

export function readRememberToken() {
  return read(REMEMBER_KEY)
}

export function writeRememberToken(token: string) {
  write(REMEMBER_KEY, token)
}

export function readRememberedEmail() {
  return read(EMAIL_KEY)
}

export function writeRememberedEmail(email: string) {
  write(EMAIL_KEY, email.trim())
}
