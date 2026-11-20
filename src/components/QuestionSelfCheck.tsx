import { ArrowRight, Check, CircleAlert } from 'lucide-react'
import type { QuestionCheckResult } from '../lib/questionCheck'
import { Modal } from './ui'

export function QuestionSelfCheckBar({
  check,
  onOpen,
}: {
  check: QuestionCheckResult
  onOpen?: () => void
}) {
  return (
    <div className={`ask-self-check is-hint ${check.ok ? 'is-clear' : 'has-warning'}`}>
      <span className="ask-self-check-hint">
        {check.ok
          ? '信息够用了，直接发送也可以'
          : '想让回答更准，可以补上题目或你卡住的那一步'}
      </span>
      {!check.ok && onOpen && (
        <button type="button" className="text-button ask-self-check-link" onClick={onOpen}>
          补充
        </button>
      )}
    </div>
  )
}

export function QuestionSelfCheckModal({
  check,
  onClose,
  onContinue,
  onUseTemplate,
  onSubmit,
}: {
  check: QuestionCheckResult
  onClose: () => void
  onContinue: () => void
  onUseTemplate: () => void
  onSubmit: () => void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="提问前自检"
      title="补两句，老师更容易一次答到点子上"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <button className="text-button" onClick={onUseTemplate}>
            按模板补充
          </button>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onContinue}>
              继续补充
            </button>
            <button className="button button-primary" onClick={onSubmit}>
              仍然提交
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      }
    >
      <div className="question-check-modal">
        <p>
          这些不是硬性要求，只是让 AI 和老师少问一轮。缺的内容可以现在补，也可以直接提交。
        </p>
        <div className="question-check-list">
          {check.items.map((item) => (
            <div className={`question-check-row ${item.ok ? 'is-ok' : 'is-missing'}`} key={item.key}>
              <span className="question-check-icon">
                {item.ok ? <Check size={15} /> : <CircleAlert size={15} />}
              </span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.ok ? '已经包含在问题里。' : item.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
