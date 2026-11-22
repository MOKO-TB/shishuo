import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * 二级页面（PageSheet）：设置类界面用它，而不是弹窗。
 *
 * 与 Modal 的区别：
 * - 占据整块内容区，左侧有返回，页面标题行与主站一致；
 * - 打开时不锁 body 滚动，用户仍然可以滚到下面的内容；
 * - 移动端占满宽度，桌面端限制最大宽度并居中；
 * - 保留 dialog 语义与焦点圈定，Esc 返回。
 */
export function PageSheet({
  open,
  onClose,
  eyebrow,
  title,
  actions,
  footer,
  children,
  className,
  hideBack = false,
}: {
  open: boolean
  onClose: () => void
  eyebrow?: ReactNode
  title: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  hideBack?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousRef.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => panelRef.current?.focus(), 20)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const root = panelRef.current
      if (!root) return
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !root.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      previousRef.current?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="page-sheet" role="region" aria-label={typeof title === 'string' ? title : '设置'}>
      <div className="page-sheet-bar">
        {!hideBack && (
          <button className="page-sheet-back" onClick={onClose} type="button">
            <ArrowLeft size={16} />
            返回
          </button>
        )}
        <div className="page-sheet-heading">
          {eyebrow && <span className="page-sheet-eyebrow">{eyebrow}</span>}
          <strong>{title}</strong>
        </div>
        {actions && <div className="page-sheet-actions">{actions}</div>}
      </div>
      <div
        ref={panelRef}
        className={cn('page-sheet-body', className)}
        tabIndex={-1}
      >
        {children}
      </div>
      {footer && <div className="page-sheet-foot">{footer}</div>}
    </div>
  )
}
