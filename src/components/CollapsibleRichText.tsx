import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { RichText } from './ui'

interface CollapsibleRichTextProps {
  text: string
  className?: string
  /** 回答正文用较高上限，继续对话里的气泡用较低上限。 */
  variant?: 'answer' | 'chat'
}

/**
 * 富文本回答过长时先收起，避免一条长回复把整页/整个弹窗瞬间撑高。
 * 内容没超过上限时不显示按钮，保持原来的阅读体验。
 */
export function CollapsibleRichText({
  text,
  className,
  variant = 'answer',
}: CollapsibleRichTextProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setExpanded(false)
  }, [text])

  useEffect(() => {
    const node = bodyRef.current
    if (!node) return
    const measure = () => {
      if (expanded) return
      setOverflowing(node.scrollHeight > node.clientHeight + 8)
    }
    measure()
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [expanded, text])

  return (
    <div
      className={cn(
        'collapsible-rich',
        `is-${variant}`,
        expanded && 'is-expanded',
        className,
      )}
    >
      <div
        ref={bodyRef}
        className={cn('collapsible-rich-body', !expanded && 'is-collapsed')}
      >
        <RichText text={text} />
      </div>
      {overflowing && (
        <button
          type="button"
          className="collapsible-rich-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              收起
              <ChevronUp size={13} />
            </>
          ) : (
            <>
              展开全文
              <ChevronDown size={13} />
            </>
          )}
        </button>
      )}
    </div>
  )
}
