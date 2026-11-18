import { useRef, useState, type ChangeEvent } from 'react'
import { CircleAlert, Database, Download, Loader2, Upload } from 'lucide-react'
import { useStore } from '../store'
import { downloadText } from '../lib/export'
import {
  MAX_BACKUP_BYTES,
  createBackup,
  parseBackup,
  type ParsedBackup,
} from '../lib/backup'
import { DEFAULT_PROFILE } from '../lib/profile'
import { Badge, Modal } from './ui'

export function WorkspaceBackupModal({
  open,
  onClose,
  notify,
}: {
  open: boolean
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}) {
  const { data, restoreData } = useStore()
  const [pendingRestore, setPendingRestore] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportAll = () => {
    const date = new Date().toISOString().slice(0, 10)
    downloadText(
      `师说-共享空间备份-${date}.json`,
      createBackup(data, DEFAULT_PROFILE),
      'application/json;charset=utf-8',
    )
    notify(`已导出 ${data.threads.length} 条问答、${data.faqs.length} 条 FAQ 的完整备份`, 'success')
  }

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setPendingRestore(null)
    if (file.size > MAX_BACKUP_BYTES) {
      setError('备份文件超过 12MB，无法导入。')
      return
    }
    try {
      setPendingRestore(parseBackup(await file.text()))
    } catch (err) {
      setError(err instanceof Error ? err.message : '备份文件读取失败。')
    }
  }

  const confirmRestore = () => {
    if (!pendingRestore) return
    setBusy(true)
    try {
      restoreData(pendingRestore.data)
      notify('备份已恢复，页面即将刷新', 'success')
      window.setTimeout(() => window.location.reload(), 600)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : '恢复备份失败。')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="教师工具 · 共享空间"
      title="备份与恢复"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            备份包含共享空间问答、FAQ、通知和课程公告；不含密码、AI Key 和教务登录态。
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              关闭
            </button>
            <button className="button button-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={15} />
              导入备份
            </button>
            <button className="button button-primary" onClick={exportAll} disabled={busy}>
              <Download size={15} />
              导出全部数据
            </button>
          </div>
        </div>
      }
    >
      <div className="workspace-backup">
        <div className="workspace-backup-summary">
          <span className="workspace-backup-icon">
            <Database size={18} />
          </span>
          <div>
            <strong>当前共享空间</strong>
            <span>
              revision {data.threads.length + data.faqs.length > 0 ? '已加载' : '空'} ·{' '}
              {data.threads.length} 条问答 · {data.faqs.length} 条 FAQ · {data.courseNotes.length} 条课程公告
            </span>
          </div>
          <Badge tone="neutral">{data.notifications.length} 条通知</Badge>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={readFile}
          hidden
        />

        <div className="workspace-backup-note">
          <CircleAlert size={14} />
          <p>
            导入会覆盖当前共享空间的问答、FAQ、通知和课程公告，并影响所有已登录账号。
            教师账号才有恢复权限；学生只能使用自己的问答档案导出。
            匿名身份会在同一共享空间按线程恢复；跨空间无法还原时会被拒绝。
          </p>
        </div>

        {error && (
          <div className="inline-note danger">
            <CircleAlert size={14} />
            <span>{error}</span>
          </div>
        )}

        {pendingRestore && (
          <div className="workspace-backup-confirm">
            <strong>确认恢复这份备份？</strong>
            <p>
              导出于{' '}
              {pendingRestore.exportedAt
                ? new Date(pendingRestore.exportedAt).toLocaleString('zh-CN')
                : '未知时间'}
              ：{pendingRestore.summary.threads} 条问答、{pendingRestore.summary.faqs} 条 FAQ。
              恢复后当前共享空间会被覆盖，页面会自动刷新。
            </p>
            <div className="workspace-backup-actions">
              <button
                className="button button-ghost"
                onClick={() => setPendingRestore(null)}
                disabled={busy}
              >
                取消
              </button>
              <button className="button button-danger" onClick={confirmRestore} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin-icon" /> : null}
                确认恢复
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
