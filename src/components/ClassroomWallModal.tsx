import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCheck,
  Copy,
  Layers3,
  Play,
  QrCode,
  RefreshCw,
  Square,
  Users,
} from 'lucide-react'
import { useStore } from '../store'
import { clusterClassroomThreads } from '../lib/engine'
import { copyText, formatRelative, makeId, truncate } from '../lib/utils'
import type { Course, CourseNote, Thread } from '../types'
import { QrCodeSvg } from './QrCodeSvg'
import { Badge, EmptyState, Modal } from './ui'

interface ClassroomWallModalProps {
  open: boolean
  onClose: () => void
  courses: Course[]
  notes: CourseNote[]
  threads: Thread[]
  initialCourseId?: string
  onOpenGroup: (groupKey: string, courseId: string) => void
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
}

export function ClassroomWallModal({
  open,
  onClose,
  courses,
  notes,
  threads,
  initialCourseId,
  onOpenGroup,
  notify,
}: ClassroomWallModalProps) {
  const { dispatch } = useStore()
  const [courseId, setCourseId] = useState('')
  const [topicDraft, setTopicDraft] = useState('')
  const [scope, setScope] = useState<'session' | 'all'>('session')

  useEffect(() => {
    if (!open || courses.length === 0) return
    const preferred = courses.some((item) => item.id === initialCourseId)
      ? (initialCourseId as string)
      : courses[0].id
    setCourseId(preferred)
  }, [open, initialCourseId, courses])

  const course = courses.find((item) => item.id === courseId) ?? courses[0]
  const currentNote = notes.find((item) => item.courseId === course?.id)
  const session = currentNote?.wallSession

  useEffect(() => {
    if (!open || !course) return
    setTopicDraft(
      session?.topic || currentNote?.currentChapter || course.chapter || '本节随堂答疑',
    )
    const hasSessionThreads = session
      ? threads.some((t) => !t.withdrawnAt && t.courseId === course.id && t.wallSessionId === session.id)
      : false
    setScope(hasSessionThreads || session?.active ? 'session' : 'all')
  }, [open, course?.id, session?.id, session?.active])

  const courseThreads = useMemo(
    () => (course ? threads.filter((t) => !t.withdrawnAt && t.courseId === course.id) : []),
    [course, threads],
  )
  const sessionThreads = useMemo(
    () =>
      session
        ? courseThreads.filter((thread) => thread.wallSessionId === session.id)
        : [],
    [courseThreads, session],
  )
  const scopedThreads = scope === 'session' ? sessionThreads : courseThreads
  const clusters = useMemo(
    () => (course ? clusterClassroomThreads(scopedThreads, course.id) : []),
    [course, scopedThreads],
  )

  const totalQuestions = scopedThreads.length
  const totalAiSolved = clusters.reduce((sum, item) => sum + item.aiSolvedCount, 0)
  const totalPending = clusters.reduce((sum, item) => sum + item.pendingCount, 0)

  const qrUrl = useMemo(() => {
    if (!course || !session?.active) return ''
    return `${window.location.origin}/wall/?course=${encodeURIComponent(
      course.id,
    )}&session=${encodeURIComponent(session.id)}`
  }, [course, session?.active, session?.id])

  if (!course) return null

  const saveWallSession = (nextSession: NonNullable<CourseNote['wallSession']>, message: string) => {
    dispatch({
      type: 'course-note-saved',
      note: {
        courseId: course.id,
        teacher: course.teacher,
        announcement: currentNote?.announcement ?? '',
        officeHours: currentNote?.officeHours ?? '',
        updatedAt: Date.now(),
        attachments: currentNote?.attachments,
        expiresAt: currentNote?.expiresAt,
        currentChapter: currentNote?.currentChapter,
        publishedAt: currentNote?.publishedAt,
        wallSession: nextSession,
      },
    })
    notify(message, 'success')
  }

  const startWall = () => {
    const topic = topicDraft.trim() || currentNote?.currentChapter || course.chapter || '本节随堂答疑'
    saveWallSession(
      {
        id: makeId('wall'),
        topic,
        startedAt: Date.now(),
        active: true,
      },
      `已开启「${course.shortName}」本节提问墙，学生可扫码匿名提交`,
    )
    setScope('session')
  }

  const updateTopic = () => {
    if (!session) return startWall()
    const topic = topicDraft.trim() || '本节随堂答疑'
    saveWallSession(
      { ...session, topic },
      '已更新本节提问墙主题',
    )
  }

  const stopWall = () => {
    if (!session) return
    saveWallSession(
      { ...session, active: false },
      '已结束本节扫码收集，需人工介入的问题已汇入待办合集',
    )
  }

  const handleCopyUrl = async () => {
    const ok = await copyText(qrUrl)
    notify(ok ? '已复制提问墙扫码链接，可直接发到班级群' : '复制失败，请手动复制链接', ok ? 'success' : 'info')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="课前 / 下课前 3 分钟 · 重复答疑归并"
      title="本节提问墙"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            学生扫码后默认匿名提交，先由 AI 检索/模型应答；低置信或转交问题自动归并进待办合集。
          </span>
          <div className="modal-actions-right">
            <button type="button" className="button button-ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="wall-modal">
        <div className="wall-top-grid">
          <div className="wall-config-panel">
            <div className="wall-config-row">
              <label className="field">
                <span className="field-label">选择课程</span>
                <select
                  className="input"
                  value={course.id}
                  onChange={(event) => setCourseId(event.target.value)}
                >
                  {courses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.teacher}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">本节主题</span>
                <input
                  className="input"
                  value={topicDraft}
                  onChange={(event) => setTopicDraft(event.target.value)}
                  placeholder="例如：第 6 章 · 二叉树遍历与线索化"
                />
              </label>
            </div>

            <div className="wall-session-bar">
              <div className="wall-session-state">
                <Badge tone={session?.active ? 'jade' : 'neutral'} dot>
                  {session?.active ? '课堂收集中' : session ? '本节已结束收集' : '尚未开启场次'}
                </Badge>
                {session && (
                  <span>
                    场次 {session.id.slice(-6)} · {formatRelative(session.startedAt)}
                  </span>
                )}
              </div>
              <div className="wall-session-actions">
                {session?.active ? (
                  <>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={updateTopic}
                    >
                      保存主题
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={startWall}
                    >
                      <RefreshCw size={14} />
                      新开一节
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={stopWall}
                    >
                      <Square size={13} />
                      下课收口
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={startWall}
                  >
                    <Play size={14} />
                    开启本节提问墙
                  </button>
                )}
              </div>
            </div>

            <div className="wall-metrics-row">
              <div className="wall-metric">
                <strong>{totalQuestions}</strong>
                <span>提问总人次</span>
              </div>
              <div className="wall-metric">
                <strong>{clusters.length}</strong>
                <span>自动归并类数</span>
              </div>
              <div className="wall-metric is-jade">
                <strong>{totalAiSolved}</strong>
                <span>AI 先行应答</span>
              </div>
              <div className="wall-metric is-clay">
                <strong>{totalPending}</strong>
                <span>待人工介入</span>
              </div>
            </div>
          </div>

          <div className="wall-qr-card">
            {qrUrl ? (
              <>
                <div className="wall-qr-frame">
                  <QrCodeSvg value={qrUrl} size={176} label={`${course.shortName}本节提问墙二维码`} />
                </div>
                <div className="wall-qr-meta">
                  <strong>
                    <QrCode size={14} />
                    学生扫码匿名提问
                  </strong>
                  <span>匿名问卷 · 无需登录，扫码直接填写，不进入主网站。</span>
                  <div className="wall-qr-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => void handleCopyUrl()}
                    >
                      <Copy size={13} />
                      复制问卷链接
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="wall-qr-placeholder">
                <QrCode size={26} />
                <strong>开启本节提问墙后生成问卷二维码</strong>
                <span>学生扫码即可匿名填写，不用登录师说账号。</span>
              </div>
            )}
          </div>
        </div>

        <div className="wall-cluster-head">
          <div>
            <strong>同类疑问自动归并</strong>
            <span>
              {totalQuestions > 0
                ? `${totalQuestions} 条提问已自动合并为 ${clusters.length} 类主题，展示每类提问人次`
                : '学生扫码提交后，相似问题会自动合并为一类'}
            </span>
          </div>
          <div className="sort-switch" role="group" aria-label="提问墙汇总范围">
            <button
              type="button"
              className={scope === 'session' ? 'is-active' : ''}
              onClick={() => setScope('session')}
            >
              本节场次 ({sessionThreads.length})
            </button>
            <button
              type="button"
              className={scope === 'all' ? 'is-active' : ''}
              onClick={() => setScope('all')}
            >
              本课累计 ({courseThreads.length})
            </button>
          </div>
        </div>

        {clusters.length === 0 ? (
          <div className="wall-empty-box">
            <EmptyState
              icon={<Layers3 size={20} />}
              title={scope === 'session' ? '本节还没有收到提问' : '这门课还没有提问记录'}
              description={
                session?.active
                  ? '学生扫码或从学生端进入「本节提问墙」提交后，相似提问会自动合并在这里。'
                  : '先点击上方「开启本节提问墙」，再把右侧二维码投屏给学生扫码；也可以切换到「本课累计」查看历史归并效果。'
              }
              action={
                scope === 'session' && courseThreads.length > 0 ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setScope('all')}
                  >
                    查看本课累计归并（{courseThreads.length} 条）
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="wall-cluster-list">
            {clusters.map((cluster, index) => (
              <div className="wall-cluster-row" key={cluster.key}>
                <div className="wall-cluster-rank">#{index + 1}</div>
                <div className="wall-cluster-main">
                  <div className="wall-cluster-title-row">
                    <strong>{cluster.topic}</strong>
                    <Badge tone="gold">
                      <Users size={12} />
                      {cluster.totalCount} 人次
                    </Badge>
                    {cluster.pendingCount > 0 ? (
                      <Badge tone="low" dot>
                        待老师 {cluster.pendingCount} 人
                      </Badge>
                    ) : cluster.answeredCount > 0 ? (
                      <Badge tone="high">
                        <CheckCheck size={12} />
                        老师已答
                      </Badge>
                    ) : (
                      <Badge tone="jade">AI 已接住</Badge>
                    )}
                  </div>
                  <div className="wall-cluster-sub">
                    <span>AI 先行应答 {cluster.aiSolvedCount} 人</span>
                    <span>·</span>
                    <span>待人工 {cluster.pendingCount} 人</span>
                    {cluster.answeredCount > 0 && (
                      <>
                        <span>·</span>
                        <span>已回复 {cluster.answeredCount} 人</span>
                      </>
                    )}
                  </div>
                  {cluster.sampleQuestions.length > 0 && (
                    <div className="wall-cluster-samples">
                      {cluster.sampleQuestions.slice(0, 3).map((sample) => (
                        <span key={sample}>“{truncate(sample, 42)}”</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="wall-cluster-action">
                  {cluster.pendingGroupKey ? (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => onOpenGroup(cluster.pendingGroupKey!, cluster.courseId)}
                    >
                      集中处理
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <span className="wall-cluster-done">无需人工</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
