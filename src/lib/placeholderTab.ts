import { useEffect } from 'react'

/**
 * 演示快捷键（默认不干扰标准键盘操作）：
 * - Ctrl/Cmd + Tab：聚焦的输入框为空且有 placeholder 时，填入 placeholder 文本。
 * - Enter：仅在单行 input 内触发最近的提交按钮；textarea 保留换行，不做拦截。
 *
 * 之所以要加修饰键：Tab 是浏览器与读屏用户切换焦点的标准方式，
 * 全局劫持会让键盘用户无法离开空输入框（无障碍回归）。
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

      const withModifier = event.ctrlKey || event.metaKey

      if (
        event.key === 'Tab' &&
        withModifier &&
        !event.shiftKey &&
        !el.value.trim() &&
        el.placeholder
      ) {
        event.preventDefault()
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

      // 单行输入框回车提交；多行 textarea 一律不拦截，保留换行。
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !withModifier &&
        el instanceof HTMLInputElement
      ) {
        const form = el.closest('form')
        if (form) {
          event.preventDefault()
          form.requestSubmit()
          return
        }
        const container = el.closest(
          '.ask-card, .admin-thread-compose, .field, .account-browser, .admin-panel',
        )
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
