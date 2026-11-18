import { useEffect, useState } from 'react'
import { ArrowRight, GraduationCap, Inbox, Sparkles } from 'lucide-react'
import { Modal } from './ui'

interface GuideModalProps {
  open: boolean
  canReset: boolean
  onClose: () => void
  onReset: () => void
}

const steps = [
  {
    number: '01',
    icon: GraduationCap,
    title: '学生端 · 看 AI 拒答并自动转交',
    body: '用学生账号登录，点一个低置信示例，例如「SPFA 判负环的原理是什么？」。AI 不会编一个像答案的东西，而是自动交给陈砚老师，并附上问题摘要与依据。',
    tag: '约 20 秒',
  },
  {
    number: '02',
    icon: Inbox,
    title: '教师端 · 用 AI 草稿合并回复',
    body: '换教师账号登录（建议另开一个浏览器），打开「动态规划」同题组。3 位同学被合并在一起；改完后勾选“沉淀为 FAQ”，一次回复全部送达。',
    tag: '约 40 秒',
  },
  {
    number: '03',
    icon: Sparkles,
    title: '学生端 · 看共享空间同步',
    body: '回到学生账号，等几秒自动同步，再问「动态规划的状态转移方程怎么找？」。AI 会命中刚刚沉淀的答案，问答与通知在两个账号间同步。',
    tag: '约 20 秒',
  },
]

export function GuideModal({ open, canReset, onClose, onReset }: GuideModalProps) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (open) setConfirming(false)
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="90 秒走完闭环"
      title="演示指引"
      size="md"
      footer={
        <div className="modal-actions modal-actions-split">
          <div>
            {canReset &&
              (confirming ? (
                <span className="guide-reset-confirm">
                  确定清空本次演示的操作？
                  <button className="text-button danger" onClick={onReset}>
                    确定重置
                  </button>
                  <button className="text-button" onClick={() => setConfirming(false)}>
                    取消
                  </button>
                </span>
              ) : (
                <button className="text-button" onClick={() => setConfirming(true)}>
                  重置演示数据
                </button>
              ))}
          </div>
          <button className="button button-primary" onClick={onClose}>
            开始演示
            <ArrowRight size={16} />
          </button>
        </div>
      }
    >
      <p className="guide-lead">
        这是一个<strong>有账号、共享数据库、服务端 AI 网关</strong>的多用户试点，本期只保留
        高等数学、数据结构、电路、模电、数电 5 门课。按下面三步，用两个账号走完
        AI 判断、教师接管和知识沉淀的完整闭环。
      </p>

      <div className="guide-steps">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <div className="guide-step" key={step.number}>
              <div className="guide-step-art">
                <span className="guide-step-number">{step.number}</span>
                <span className="guide-step-icon">
                  <Icon size={18} />
                </span>
              </div>
              <div className="guide-step-copy">
                <div className="guide-step-head">
                  <h3>{step.title}</h3>
                  <span>{step.tag}</span>
                </div>
                <p>{step.body}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="guide-tip">
        <Sparkles size={16} />
        <p>
          左侧「AI 导师」默认有 5 位试点导师；点「管理导师」可从 32 位导师库添加线代等扩展导师，或随时移除，
          添加后会立即进入 AI 老师切换器并按账号记住。扩展导师只做导师答疑，不进入 5 门试点课程问答。
          数电抽屉里有数制/补码、3/4 变量卡诺图和时序波形，模电抽屉里有 Q 点、共射小信号和反馈组态。
          知识库没把握时，服务端 AI 网关会补充回答并明确标注；网关未配置时直接转交老师。
          学生的提问、同题组、老师回复和 FAQ 会实时同步到共享空间，换设备登录同一账号也能接着用。
        </p>
      </div>
    </Modal>
  )
}
