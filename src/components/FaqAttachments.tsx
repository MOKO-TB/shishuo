import { Download, FileText, Paperclip } from 'lucide-react'
import type { FaqAttachment } from '../types'
import { formatFileSize } from '../lib/attachment'

interface FaqAttachmentsProps {
  attachments?: FaqAttachment[]
  caption?: string
  className?: string
}

/** 知识条目附带的图片与资料，老师和学生看到的是同一套展示。 */
export function FaqAttachments({
  attachments,
  caption = '附带的图片与资料',
  className,
}: FaqAttachmentsProps) {
  const images = (attachments ?? []).filter(
    (attachment) => attachment.kind === 'image' && attachment.url,
  )
  const files = (attachments ?? []).filter(
    (attachment) => attachment.kind === 'document' && attachment.url,
  )
  if (images.length === 0 && files.length === 0) return null

  return (
    <div className={['faq-attach-block', className].filter(Boolean).join(' ')}>
      <div className="faq-attach-caption">
        <Paperclip size={13} />
        <span>{caption}</span>
      </div>
      {images.length > 0 && (
        <div className="faq-attach-images">
          {images.map((attachment) => (
            <a
              key={`${attachment.url}-${attachment.name}`}
              className="faq-attach-image"
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              title={attachment.name}
            >
              <img src={attachment.url} alt={attachment.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="faq-attach-files">
          {files.map((attachment) => (
            <a
              key={`${attachment.url}-${attachment.name}`}
              className="faq-attach-file"
              href={attachment.url}
              download={attachment.name}
              title={`下载 ${attachment.name}`}
            >
              <span className="faq-attach-file-icon">
                <FileText size={16} />
              </span>
              <span className="faq-attach-file-copy">
                <strong>{attachment.name}</strong>
                <em>
                  {[
                    formatFileSize(attachment.size),
                    attachment.text ? '已提取正文，AI 会参考' : '资料文件',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </em>
              </span>
              <Download size={14} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
