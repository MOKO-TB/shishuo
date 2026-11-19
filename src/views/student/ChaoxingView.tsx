import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  FolderOpen,
  Loader2,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCw,
} from 'lucide-react'
import { Badge, Modal } from '../../components/ui'
import {
  chaoxingOverview,
  logoutChaoxing,
  markChaoxingRead,
  syncChaoxing,
  type ChaoxingChapter,
  type ChaoxingCourseChapters,
  type ChaoxingItem,
  type ChaoxingKind,
  type ChaoxingOverview,
} from '../../lib/chaoxing'
import { ChaoxingModal } from './ChaoxingPanel'

const KIND_META: Record<
  ChaoxingKind,
  { label: string; icon: typeof MessageCircle; hint: string }
> = {
  message: { label: '课程消息', icon: MessageCircle, hint: '老师发布的课程通知、作业和签到消息' },
  assignment: { label: '作业', icon: ClipboardList, hint: '未完成优先，再按发布时间排序' },
  material: { label: '资料', icon: FolderOpen, hint: '按课程查看老师上传的课件和资料' },
}

type ChaoxingTab = ChaoxingKind | 'chapter'

function fmt(ts: number | null | undefined) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dayLabel(ts: number | null | undefined) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function assignmentPriority(item: ChaoxingItem) {
  const body = item.body || ''
  if (/未提交|未交|待交/.test(body)) return 0
  if (/待批阅|批阅中/.test(body)) return 1
  if (/已完成|已交/.test(body)) return 2
  return 0
}

interface CourseGroup {
  course_id: string
  course_name: string
  items: ChaoxingItem[]
  unread: number
  latestAt: number
}

function groupByCourse(items: ChaoxingItem[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>()
  for (const item of items) {
    const key = item.course_id || item.course_name
    let group = map.get(key)
    if (!group) {
      group = {
        course_id: item.course_id,
        course_name: item.course_name || '未命名课程',
        items: [],
        unread: 0,
        latestAt: 0,
      }
      map.set(key, group)
    }
    group.items.push(item)
    if (!item.read_at) group.unread += 1
    group.latestAt = Math.max(
      group.latestAt,
      Number(item.published_at || item.created_at || 0),
    )
  }
  return [...map.values()].sort((a, b) => b.latestAt - a.latestAt || a.course_name.localeCompare(b.course_name))
}

export function ChaoxingView() {
  const [overview, setOverview] = useState<ChaoxingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<ChaoxingTab>('message')
  const [courseFilter, setCourseFilter] = useState('')
  const [bindOpen, setBindOpen] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState('')
  const [chapterCourse, setChapterCourse] = useState<ChaoxingCourseChapters | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOverview(await chaoxingOverview())
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习通数据加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const syncNow = async () => {
    setSyncing(true)
    setError('')
    setNotice('')
    try {
      const result = await syncChaoxing()
      const failed = result.errors?.length ?? 0
      setNotice(
        `同步完成：消息 ${result.messages}、作业 ${result.assignments}、资料 ${result.materials}、未完成章节 ${result.chapters ?? 0}${
          failed ? `；${failed} 项未读到` : ''
        }`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习通同步失败。')
    } finally {
      setSyncing(false)
    }
  }

  const logout = async () => {
    try {
      await logoutChaoxing()
      setOverview((current) => (current ? { ...current, connected: false } : current))
      setSelectedCourse('')
      setChapterCourse(null)
      setNotice('已退出学习通。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出学习通失败。')
    }
  }

  const openItem = async (item: ChaoxingItem) => {
    try {
      if (!item.read_at) {
        setOverview(await markChaoxingRead(item.id))
      }
    } catch {
      // 标记已读失败不挡打开原文
    }
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  const assignments = useMemo(() => {
    return (overview?.items ?? [])
      .filter(
        (item) =>
          item.kind === 'assignment' &&
          (!courseFilter || item.course_id === courseFilter),
      )
      .sort(
        (a, b) =>
          assignmentPriority(a) - assignmentPriority(b) ||
          Number(b.published_at || b.created_at || 0) -
            Number(a.published_at || a.created_at || 0),
      )
  }, [overview?.items, courseFilter])

  const messageGroups = useMemo(
    () => groupByCourse((overview?.items ?? []).filter((item) => item.kind === 'message')),
    [overview?.items],
  )
  const materialGroups = useMemo(
    () => groupByCourse((overview?.items ?? []).filter((item) => item.kind === 'material')),
    [overview?.items],
  )
  const activeGroup = useMemo(() => {
    if (!selectedCourse) return null
    const source = tab === 'message' ? messageGroups : materialGroups
    return source.find((group) => group.course_id === selectedCourse) ?? null
  }, [materialGroups, messageGroups, selectedCourse, tab])

  const chapterGroups = useMemo(() => {
    return [...(overview?.chapters ?? [])].sort(
      (a, b) => b.unfinished - a.unfinished || a.course_name.localeCompare(b.course_name),
    )
  }, [overview?.chapters])

  const connected = Boolean(overview?.connected)
  const currentHint =
    tab === 'chapter'
      ? '按课程查看未完成章节，点击课程查看明细'
      : tab === 'message' && selectedCourse
        ? '返回全部课程'
        : tab === 'material' && selectedCourse
          ? '返回全部课程'
          : KIND_META[tab].hint

  return (
    <div className="page cx-page">
      <header className="cx-page-head">
        <div>
          <div className="eyebrow">学生端 / 学习通</div>
          <h1 className="display-title">
            课程消息、作业与资料，
            <br />
            <span>从一个地方看。</span>
          </h1>
          <p className="page-lede">
            绑定学习通后，师说只读同步老师发布的课程消息、作业、资料和章节进度。不保存学习通密码，不代交作业。
          </p>
        </div>
        <div className="cx-page-head-side">
          {connected ? (
            <>
              <Badge tone="jade">已绑定</Badge>
              <span>{overview?.lastSyncAt ? `上次同步 ${fmt(overview.lastSyncAt)}` : '还没有同步'}</span>
              <button className="button button-primary" onClick={() => void syncNow()} disabled={syncing}>
                {syncing ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
                {syncing ? '同步中…' : '同步全部'}
              </button>
              <button className="button button-ghost" onClick={() => setBindOpen(true)}>
                课程与绑定
              </button>
              <button className="button button-ghost" onClick={() => void logout()}>
                <LogOut size={14} />
                退出学习通
              </button>
            </>
          ) : (
            <button className="button button-primary" onClick={() => setBindOpen(true)}>
              <QrCode size={14} />
              扫码绑定学习通
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="inline-note danger cx-note">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="inline-note cx-note">
          <BookOpen size={14} />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="cx-page-loading">
          <Loader2 size={20} className="spin-icon" />
          正在加载学习通…
        </div>
      ) : !connected ? (
        <section className="cx-page-bind">
          <span className="cx-big-icon">
            <QrCode size={30} />
          </span>
          <h2>绑定你的学习通</h2>
          <p>
            用学习通 App 扫码确认后，师说会同步你的课程消息、作业、资料和章节进度。密码不经过师说，登录态按学生账号隔离。
          </p>
          <div className="cx-page-bind-actions">
            <button className="button button-primary" onClick={() => setBindOpen(true)}>
              <QrCode size={14} />
              生成登录二维码
            </button>
            <button className="button button-ghost" onClick={() => setBindOpen(true)}>
              用账号密码登录
            </button>
          </div>
          <p className="cx-hint">
            当前站点是 HTTP 演示环境；正式使用前建议启用 HTTPS。学习通接口可能随平台改版失效。
          </p>
        </section>
      ) : (
        <>
          <div className="cx-page-stats">
            {(Object.keys(KIND_META) as ChaoxingKind[]).map((kind) => {
              const Icon = KIND_META[kind].icon
              return (
                <button
                  key={kind}
                  className={`cx-page-stat ${tab === kind ? 'is-active' : ''}`}
                  onClick={() => {
                    setTab(kind)
                    setSelectedCourse('')
                  }}
                >
                  <span className="cx-page-stat-icon">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{overview?.counts[kind] ?? 0}</strong>
                    <em>{KIND_META[kind].label}</em>
                  </span>
                </button>
              )
            })}
            <button
              className={`cx-page-stat ${tab === 'chapter' ? 'is-active' : ''}`}
              onClick={() => {
                setTab('chapter')
                setSelectedCourse('')
              }}
            >
              <span className="cx-page-stat-icon">
                <BookOpen size={16} />
              </span>
              <span>
                <strong>{overview?.chapterUnfinished ?? 0}</strong>
                <em>未完成章节</em>
              </span>
            </button>
          </div>

          <div className="cx-page-toolbar">
            <div className="cx-page-tabs" role="tablist" aria-label="学习通内容">
              {(Object.keys(KIND_META) as ChaoxingKind[]).map((kind) => (
                <button
                  key={kind}
                  role="tab"
                  aria-selected={tab === kind}
                  className={tab === kind ? 'is-active' : ''}
                  onClick={() => {
                    setTab(kind)
                    setSelectedCourse('')
                  }}
                >
                  {KIND_META[kind].label}
                  <span>{overview?.counts[kind] ?? 0}</span>
                </button>
              ))}
              <button
                role="tab"
                aria-selected={tab === 'chapter'}
                className={tab === 'chapter' ? 'is-active' : ''}
                onClick={() => {
                  setTab('chapter')
                  setSelectedCourse('')
                }}
              >
                章节进度
                <span>{overview?.chapterUnfinished ?? 0}</span>
              </button>
            </div>
            {tab === 'assignment' && (
              <select
                className="cx-course-filter"
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                aria-label="按课程筛选"
              >
                <option value="">全部课程</option>
                {(overview?.courses ?? []).map((course) => (
                  <option key={course.id} value={course.course_id}>
                    {course.name}
                  </option>
                ))}
              </select>
            )}
            {tab !== 'assignment' && selectedCourse && (
              <button className="text-button cx-back-inline" onClick={() => setSelectedCourse('')}>
                <ArrowLeft size={13} />
                全部课程
              </button>
            )}
          </div>

          <p className="cx-page-hint">{currentHint}</p>

          {tab === 'chapter' ? (
            <section className="cx-chapter-section is-tab">
              <div className="cx-chapter-head">
                <div>
                  <strong>课程章节进度</strong>
                  <span>
                    共 {overview?.chapterTotal ?? 0} 个章节任务，未完成{' '}
                    {overview?.chapterUnfinished ?? 0} 个
                  </span>
                </div>
              </div>
              {chapterGroups.length === 0 ? (
                <p className="cx-page-empty-line">
                  还没有章节进度；点「同步全部」拉取学习通章节任务。
                </p>
              ) : (
                <div className="cx-chapter-grid">
                  {chapterGroups.map((course) => (
                    <button
                      key={course.course_id}
                      className="cx-chapter-card"
                      onClick={() => setChapterCourse(course)}
                    >
                      <span className="cx-chapter-card-top">
                        <strong>{course.course_name}</strong>
                        <Badge tone={course.unfinished > 0 ? 'gold' : 'jade'}>
                          {course.unfinished > 0 ? `未完成 ${course.unfinished}` : '已完成'}
                        </Badge>
                      </span>
                      <span className="cx-chapter-progress">
                        <i
                          style={{
                            width: `${course.total ? Math.max(4, ((course.total - course.unfinished) / course.total) * 100) : 0}%`,
                          }}
                        />
                      </span>
                      <span className="cx-chapter-card-foot">
                        {course.unfinished > 0
                          ? `还有 ${course.unfinished} 个任务点没完成`
                          : `共 ${course.total} 个任务点`}
                        <ChevronRight size={13} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : tab === 'assignment' ? (
            <div className="cx-page-list">
              {assignments.length === 0 ? (
                <EmptyBlock
                  kind="assignment"
                  syncing={syncing}
                  onSync={() => void syncNow()}
                />
              ) : (
                assignments.map((item) => (
                  <ItemCard key={item.id} item={item} onOpen={() => void openItem(item)} />
                ))
              )}
            </div>
          ) : activeGroup ? (
            <div className="cx-page-list">
              <div className="cx-group-head">
                <div>
                  <strong>{activeGroup.course_name}</strong>
                  <span>{activeGroup.items.length} 条{KIND_META[tab].label}</span>
                </div>
                <button className="text-button" onClick={() => setSelectedCourse('')}>
                  <ArrowLeft size={13} />
                  全部课程
                </button>
              </div>
              {activeGroup.items.map((item) => (
                <ItemCard key={item.id} item={item} onOpen={() => void openItem(item)} />
              ))}
            </div>
          ) : (
            <CourseGroupGrid
              groups={tab === 'message' ? messageGroups : materialGroups}
              kind={tab}
              onOpen={(courseId) => setSelectedCourse(courseId)}
              onSync={() => void syncNow()}
              syncing={syncing}
            />
          )}
        </>
      )}

      <ChaoxingModal open={bindOpen} onClose={() => setBindOpen(false)} onChanged={load} />
      <ChapterModal course={chapterCourse} onClose={() => setChapterCourse(null)} />
    </div>
  )
}

function ItemCard({ item, onOpen }: { item: ChaoxingItem; onOpen: () => void }) {
  const Icon = KIND_META[item.kind].icon
  return (
    <button className={`cx-page-item ${item.read_at ? '' : 'is-unread'}`} onClick={onOpen}>
      <span className="cx-page-item-icon">
        <Icon size={17} />
      </span>
      <span className="cx-page-item-body">
        <span className="cx-page-item-top">
          <strong>{item.title}</strong>
          {!item.read_at && <i className="cx-unread-dot" />}
        </span>
        <span className="cx-page-item-meta">
          <em>{item.course_name}</em>
          {item.due_at ? <span>截止 {fmt(item.due_at)}</span> : null}
          {item.kind !== 'assignment' && item.published_at ? (
            <span>{dayLabel(item.published_at)}</span>
          ) : null}
        </span>
        {item.body && <span className="cx-page-item-text">{item.body}</span>}
      </span>
      {item.url && <ExternalLink size={15} className="cx-page-item-link" />}
    </button>
  )
}

function CourseGroupGrid({
  groups,
  kind,
  onOpen,
  onSync,
  syncing,
}: {
  groups: CourseGroup[]
  kind: ChaoxingKind
  onOpen: (courseId: string) => void
  onSync: () => void
  syncing: boolean
}) {
  if (groups.length === 0) {
    return (
      <div className="cx-page-list">
        <EmptyBlock kind={kind} syncing={syncing} onSync={onSync} />
      </div>
    )
  }
  return (
    <div className="cx-course-groups">
      {groups.map((group) => {
        const latest = group.items[0]
        return (
          <button
            key={group.course_id || group.course_name}
            className="cx-course-group"
            onClick={() => onOpen(group.course_id)}
          >
            <span className={`cx-course-avatar is-${kind}`}>
              {group.course_name.slice(0, 2)}
            </span>
            <span className="cx-course-group-body">
              <span className="cx-course-group-top">
                <strong>{group.course_name}</strong>
                {group.unread > 0 && <Badge tone="gold">{group.unread}</Badge>}
              </span>
              <span className="cx-course-group-latest">
                {latest?.title || KIND_META[kind].hint}
              </span>
              <span className="cx-course-group-meta">
                {group.items.length} 条{KIND_META[kind].label}
                {group.latestAt ? ` · ${dayLabel(group.latestAt)}` : ''}
              </span>
            </span>
            <ChevronRight size={15} className="cx-course-group-arrow" />
          </button>
        )
      })}
    </div>
  )
}

function EmptyBlock({
  kind,
  syncing,
  onSync,
}: {
  kind: ChaoxingKind
  syncing: boolean
  onSync: () => void
}) {
  const Icon = KIND_META[kind].icon
  return (
    <div className="cx-page-empty">
      <span className="cx-big-icon">
        <Icon size={24} />
      </span>
      <strong>还没有{KIND_META[kind].label}</strong>
      <p>{KIND_META[kind].hint}。点「同步全部」拉取最新内容。</p>
      <button className="button button-primary" onClick={onSync} disabled={syncing}>
        {syncing ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
        同步全部
      </button>
    </div>
  )
}

function ChapterModal({
  course,
  onClose,
}: {
  course: ChaoxingCourseChapters | null
  onClose: () => void
}) {
  const unfinished = useMemo(
    () => (course?.items ?? []).filter((item) => !item.done),
    [course],
  )
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; no: string; items: ChaoxingChapter[] }>()
    for (const item of unfinished) {
      const key = item.chapterNo || item.chapterTitle
      let group = map.get(key)
      if (!group) {
        group = { title: item.chapterTitle, no: item.chapterNo, items: [] }
        map.set(key, group)
      }
      group.items.push(item)
    }
    return [...map.values()]
  }, [unfinished])

  return (
    <Modal
      open={Boolean(course)}
      onClose={onClose}
      eyebrow="学习通 · 章节任务"
      title={course ? `${course.course_name} · 未完成章节` : '未完成章节'}
      size="md"
      className="cx-chapter-modal"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="cx-modal-foot-note">
            只显示未完成任务点；点击章节可跳回学习通原页面。
          </span>
          <button className="button button-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      {groups.length === 0 ? (
        <div className="cx-page-empty">
          <BookOpen size={24} />
          <strong>这门课没有未完成章节</strong>
          <p>已完成的任务点不会出现在这里。</p>
        </div>
      ) : (
        <div className="cx-chapter-detail">
          {groups.map((group) => (
            <section key={`${group.no}-${group.title}`}>
              <h3>
                {group.no && <span>{group.no}</span>}
                {group.title}
              </h3>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className="cx-chapter-row"
                  onClick={() => item.url && window.open(item.url, '_blank', 'noopener,noreferrer')}
                >
                  <span>
                    <strong>{item.sectionTitle}</strong>
                    <em>
                      {item.sectionNo}
                      {item.taskCount > 0 ? ` · ${item.taskCount} 个任务点未完成` : ''}
                    </em>
                  </span>
                  <ExternalLink size={14} />
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
