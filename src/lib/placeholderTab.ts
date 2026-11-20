import { useEffect } from 'react'

/**
 * 演示快捷键（只增强明确标记的输入框，不劫持普通表单）：
 * - data-tab-fill：输入框为空时，Tab 填入 placeholder，光标停在末尾，可直接改。
 *   普通输入框仍保留 Tab 切换焦点的标准行为；Ctrl/Cmd + Tab 对所有输入框可用。
 * - data-enter-submit：多行输入框里 Enter 发送，Shift + Enter 换行；
 *   中文输入法组合中（isComposing / keyCode 229）不触发发送。
 * - 单行 input 的 Enter 仍触发最近的提交按钮。
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
      const composing = event.isComposing || event.keyCode === 229
      const plainTabFill = Boolean(el.closest('[data-tab-fill]'))

      if (
        event.key === 'Tab' &&
        !event.shiftKey &&
        (withModifier || plainTabFill) &&
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
        try {
          el.setSelectionRange(el.value.length, el.value.length)
        } catch {
          // 部分 input 类型不支持 setSelectionRange，忽略即可。
        }
        return
      }

      if (event.key !== 'Enter' || event.shiftKey || withModifier || composing) return

      // 多行输入框：只有显式标记的聊天式输入框用 Enter 发送，其余保留换行。
      if (el instanceof HTMLTextAreaElement) {
        if (!el.closest('[data-enter-submit]')) return
        if (!el.value.trim()) {
          // 空输入按 Enter 不插入空行，和常见聊天框一致。
          event.preventDefault()
          return
        }
        const container = el.closest(
          '.ask-card, .campus-queue-item, .admin-thread-compose, .thread-supplement-composer, .drawer-panel, form',
        )
        const btn = container?.querySelector<HTMLButtonElement>(
          'button[type="submit"], button.button-primary:not(:disabled)',
        )
        if (btn) {
          event.preventDefault()
          btn.click()
        }
        return
      }

      // 单行输入框回车提交。
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
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
