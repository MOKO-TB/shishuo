import { useEffect } from 'react'

/**
 * 全局 Tab 填入 placeholder + Enter 提交：
 * - 聚焦的 input/textarea 为空且有 placeholder 时，按 Tab 直接填入 placeholder 文本。
 * - 填入后按 Enter 触发最近的 form submit 或点击最近的 submit 按钮。
 * 适用于学生端、教师端、管理端所有带 placeholder 的输入框。
 */
export function usePlaceholderTab() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const isInput =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      if (!isInput) return
      const el = target as HTMLInputElement | HTMLTextAreaElement
      if (el.disabled || el.readOnly) return

      if (event.key === 'Tab' && !event.shiftKey && !el.value.trim() && el.placeholder) {
        event.preventDefault()
        // 用原生 setter 触发 React 受控组件的 onChange
        const nativeSetter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          'value',
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, el.placeholder)
        } else {
          el.value = el.placeholder
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        // 多行 textarea 里如果已有内容且不是刚 Tab 填入的，保留换行行为
        if (el instanceof HTMLTextAreaElement && el.value.includes('\n')) return
        // 单行 input 或单行 textarea：尝试提交
        const form = el.closest('form')
        if (form) {
          event.preventDefault()
          form.requestSubmit()
          return
        }
        // 没有 form 时，找同容器内的 submit/primary 按钮
        const container = el.closest('.ask-card, .admin-thread-compose, .field, .account-browser, .admin-panel')
        if (container) {
          const btn = container.querySelector<HTMLButtonElement>(
            'button[type="submit"], button.button-primary:not(:disabled)',
          )
          if (btn) {
            event.preventDefault()
            btn.click()
          }
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
