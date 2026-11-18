/**
 * AI 网关的敏感信息脱敏：发往上游模型前，把题目文本里混入的联系方式 /
 * 证件编号替换成占位符。只处理「明确是个人信息」的形态，避免误伤数学式子
 * 里的数字（比如 0.00000001、10^8）。
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// 中国大陆手机号：11 位、1 开头第二位 3-9，前后不能还是数字。
const MOBILE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g
// 带标签的编号：学号：20240312 / QQ 12345678 / 微信：abc_123 之类。
const LABELED_ID_PATTERN =
  /(学号|考号|准考证号?|身份证号?|QQ号?|微信号?|手机号?|电话号?|座机)[:：\s]*([A-Za-z0-9_-]{5,20})/g

export function redactText(text) {
  return String(text ?? '')
    .replace(EMAIL_PATTERN, '[已隐藏邮箱]')
    .replace(MOBILE_PATTERN, '[已隐藏手机号]')
    .replace(LABELED_ID_PATTERN, '$1[已隐藏]')
}

/** OpenAI 兼容消息数组：只处理字符串 content，数组里的 text 分段单独处理。 */
export function redactMessages(messages) {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return { ...message, content: redactText(message.content) }
    }
    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((part) =>
          part && part.type === 'text' && typeof part.text === 'string'
            ? { ...part, text: redactText(part.text) }
            : part,
        ),
      }
    }
    return message
  })
}
