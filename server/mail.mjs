import nodemailer from 'nodemailer'
import { HttpError } from './http-error.mjs'

let transporter = null
let transporterKey = ''

function getTransporter(config) {
  const key = `${config.mail.host}:${config.mail.port}:${config.mail.secure}:${config.mail.user}`
  if (transporter && transporterKey === key) return transporter
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user
      ? { user: config.mail.user, pass: config.mail.pass }
      : undefined,
  })
  transporterKey = key
  return transporter
}

export async function sendMail(config, { to, subject, text, html }) {
  if (config.mail.smtpConfigured) {
    try {
      await getTransporter(config).sendMail({
        from: config.mail.from,
        to,
        subject,
        text,
        html,
      })
    } catch (error) {
      console.error('[师说] 邮件发送失败：', error instanceof Error ? error.message : error)
      throw new HttpError(502, '邮件发送失败，请稍后再试或联系管理员。')
    }
    return { delivered: true, dev: false }
  }
  if (config.mail.devMode) {
    console.log(
      `\n[师说] 开发模式邮件\n  收件人：${to}\n  主题：${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`,
    )
    return { delivered: false, dev: true }
  }
  throw new HttpError(
    503,
    '邮件服务尚未配置。管理员可以设置 SMTP_HOST / MAIL_FROM 后重启，或在开发环境启用 MAIL_DEV_MODE=1。',
  )
}

export async function sendVerificationCode(config, { to, code, purpose }) {
  const purposeLabel = purpose === 'reset' ? '重置密码' : '注册账号'
  const minutes = Math.round(config.mail.codeTtlMs / 60_000)
  const subject = `【师说】${purposeLabel}验证码 ${code}`
  const text = [
    `你的师说${purposeLabel}验证码是：${code}`,
    '',
    `验证码 ${minutes} 分钟内有效，只能使用一次。`,
    '如果这不是你本人的操作，请忽略这封邮件。',
    '',
    '—— 师说 · AI 双通道课程答疑',
  ].join('\n')
  const html = `
    <div style="font-family:'Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#fbf9f3;border:1px solid #e2dccf;border-radius:14px;color:#17241e;">
      <div style="font-size:13px;letter-spacing:.16em;color:#146c56;font-weight:700;">师说 · AI 双通道课程答疑</div>
      <h2 style="font-family:serif;font-size:24px;margin:14px 0 8px;">${purposeLabel}验证码</h2>
      <p style="font-size:13px;color:#6f7c75;line-height:1.8;margin:0 0 18px;">请在页面中输入下面的验证码。${minutes} 分钟内有效，只能使用一次。</p>
      <div style="font-family:Consolas,monospace;font-size:34px;letter-spacing:.22em;font-weight:700;background:#fffdf8;border:1px dashed #cec6b6;border-radius:10px;padding:16px 20px;text-align:center;color:#0c4e3d;">${code}</div>
      <p style="font-size:12px;color:#98a29c;line-height:1.8;margin:18px 0 0;">如果这不是你本人的操作，请忽略这封邮件。师说不会通过邮件索要密码。</p>
    </div>`
  return sendMail(config, { to, subject, text, html })
}
