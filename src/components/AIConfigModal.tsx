import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, Cpu, Loader2, RefreshCw, Server, ShieldCheck } from 'lucide-react'
import type { AIConfig, AIStatus } from '../lib/ai'
import { errorMessage, fetchAIStatus, testAIConnection } from '../lib/ai'
import { Modal } from './ui'

interface AIConfigModalProps {
  open: boolean
  config: AIConfig
  onClose: () => void
  onSave: (config: AIConfig) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

export function AIConfigModal({ open, config, onClose, onSave, notify }: AIConfigModalProps) {
  const [form, setForm] = useState<AIConfig>(config)
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { tone: 'success' | 'error'; message: string } | null
  >(null)

  const refresh = async () => {
    setStatusLoading(true)
    try {
      setStatus(await fetchAIStatus())
    } catch (error) {
      setStatus(null)
      setTestResult({ tone: 'error', message: errorMessage(error) })
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setForm(config)
    setTesting(false)
    setTestResult(null)
    void refresh()
    // Refresh status only when the modal opens; the toggle is local until saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config])

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await testAIConnection()
      setTestResult({ tone: 'success', message: '连接成功，服务端网关已返回响应。' })
      void fetchAIStatus().then(setStatus).catch(() => undefined)
    } catch (error) {
      setTestResult({ tone: 'error', message: errorMessage(error) })
    } finally {
      setTesting(false)
    }
  }

  const save = () => {
    onSave({ enabled: form.enabled })
    notify('AI 偏好已保存')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="服务端网关 · 无需填写 Key"
      title="AI 增强"
      size="md"
      footer={
        <div className="modal-actions modal-actions-right">
          <button className="button button-ghost" onClick={onClose}>
            取消
          </button>
          <button className="button button-primary" onClick={save}>
            保存设置
          </button>
        </div>
      }
    >
      <div className="ai-config-intro">
        <Server size={17} />
        <p>
          模型 Key 只保存在服务端环境变量中，浏览器不会接触，也不会进入问答数据。
          知识库没把握时，由服务端网关补充回答；图片题目识别也走同一个网关。
        </p>
      </div>

      <div className="ai-gateway-card">
        <div className="ai-gateway-head">
          <span className={`ai-gateway-dot ${status?.configured ? 'is-ready' : ''}`} />
          <div>
            <strong>
              {statusLoading
                ? '正在检查网关…'
                : status?.configured
                  ? '服务端 AI 已就绪'
                  : '服务端 AI 尚未配置'}
            </strong>
            <span>
              {status?.configured
                ? `模型 ${status.model} · 今日已用 ${status.usedToday}/${status.dailyLimit} 次`
                : '低置信问题会直接转交老师，核心答疑流程不受影响。'}
            </span>
          </div>
          <button
            className="icon-button"
            onClick={() => void refresh()}
            aria-label="刷新网关状态"
            disabled={statusLoading}
          >
            <RefreshCw size={15} className={statusLoading ? 'spin-icon' : undefined} />
          </button>
        </div>
        <div className="ai-gateway-note">
          <Cpu size={14} />
          <span>
            {status?.configured
              ? '网关配置由管理员维护；如需更换模型或调整额度，请修改服务端 .env 后重启。'
              : '管理员在服务端 .env 中设置 AI_API_KEY 与 AI_MODEL 后，此处会自动就绪。'}
          </span>
        </div>
      </div>

      <button
        className={`anonymous-toggle ai-enable-toggle ${form.enabled ? 'is-active' : ''}`}
        onClick={() => {
          setForm((current) => ({ ...current, enabled: !current.enabled }))
          setTestResult(null)
        }}
        aria-pressed={form.enabled}
        type="button"
      >
        <span className="anonymous-icon">
          <ShieldCheck size={16} />
        </span>
        <span>
          <strong>{form.enabled ? '知识库没把握时自动补充' : '暂不启用外部模型'}</strong>
          <em>
            {form.enabled
              ? '外部回答会标注来源，不会冒充课程知识'
              : '仍按原有流程自动转交老师'}
          </em>
        </span>
        <span className="switch-track">
          <span />
        </span>
      </button>

      <div className="ai-test-row">
        <button
          className="button button-secondary"
          onClick={() => void runTest()}
          disabled={testing || !status?.configured || !form.enabled}
        >
          {testing ? <Loader2 size={15} className="spin-icon" /> : <CircleCheck size={15} />}
          {testing ? '测试中…' : '测试网关'}
        </button>
        {testResult && (
          <span className={`ai-test-result ${testResult.tone}`}>
            {testResult.tone === 'success' ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
            {testResult.message}
          </span>
        )}
      </div>

      <div className="ai-config-note">
        <CircleAlert size={14} />
        <p>
          服务端网关会记录每次调用的模型、token 用量和状态，用于额度与审计；不会记录你的密码，
          也不会把 Key 返回给浏览器。调用额度用完后，问题仍可转交老师。
        </p>
      </div>
    </Modal>
  )
}
