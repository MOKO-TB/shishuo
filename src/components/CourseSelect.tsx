import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { Course } from '../types'

interface CourseSelectProps {
  courses: Course[]
  value: string
  onChange: (courseId: string) => void
  disabled?: boolean
}

const COURSE_KEYWORDS: Array<[RegExp, string]> = [
  [/高等数学|微积分/, 'gaoshu gs math wjf weijifen 高数 微积分'],
  [/线性代数/, 'xiandai xd linalg xxds 线代'],
  [/概率论|数理统计/, 'gailv gl gt gltj prob 概统 概率 统计'],
  [/数据结构/, 'shuju sj sjjg ds suanfa 数构 算法'],
  [/离散数学/, 'lisan ls discrete lssx 离数'],
  [/计算机网络/, 'wangluo jw net jsjwl 计网 网络'],
  [/操作系统/, 'caozuo cz os czxt 操统'],
  [/计算机组成/, 'jizu jz co jsjzc 计组'],
  [/数据库/, 'shujuku sjk db sql'],
  [/电路/, 'dianlu dl circuit 电分'],
  [/模电|模拟电子/, 'modian md analog mndz'],
  [/数电|数字电子|数字逻辑/, 'shudian sd digital szdz szlj'],
  [/大学物理|物理/, 'dawu dw wuli wl physics 大物'],
  [/程序设计|C语言/, 'c cyuyan cx sj 编程'],
  [/信号与系统/, 'xinhao xh signals'],
  [/自动控制/, 'zikong zk control'],
  [/通信原理/, 'tongxin tx comm'],
  [/人工智能/, 'ai rgzn rengong zhineng'],
  [/数据采集|预处理/, 'caiji cj yuchuli sjcj'],
  [/数据建模|智能分析/, 'jianmo jm fenxi sjjm'],
  [/零代码|智能体/, 'lingdaima ldm agent znt'],
  [/大学英语|英语/, 'yingyu yy english daying 大英'],
  [/大学体育|体育/, 'tiyu ty pe sport'],
  [/劳动教育/, 'laodong ld'],
  [/创业基础|创业/, 'chuangye cy'],
  [/毛泽东|毛概/, 'maogai mg mzd 思政'],
  [/习近平|习概|新时代/, 'xigai xg xsd 思政'],
  [/思想政治|思政/, 'sizheng sz sxzz'],
]

function normalize(text: string) {
  return text.toLowerCase().replace(/[\s·\-_()（）【】[\].,，。:：/]+/g, '')
}

function isSubsequence(needle: string, haystack: string) {
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) i += 1
  }
  return i === needle.length
}

export function scoreFuzzyCourseQuery(
  primary: string,
  secondary: string,
  query: string,
): number {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return 1
  const base = `${primary} ${secondary}`
  const extra = COURSE_KEYWORDS.filter(([pattern]) => pattern.test(base))
    .map(([, tokens]) => tokens)
    .join(' ')
  const raw = `${base} ${extra}`.toLowerCase()
  const compact = normalize(`${base} ${extra}`)
  const primaryCompact = normalize(primary)
  const compactQuery = normalize(trimmed)
  if (!compactQuery) return 1

  if (primaryCompact === compactQuery) return 120
  if (primaryCompact.startsWith(compactQuery)) return 100
  if (primaryCompact.includes(compactQuery)) return 88
  if (raw.includes(trimmed) || compact.includes(compactQuery)) return 72

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) {
    const tokenScores = tokens.map((token) => {
      const compactToken = normalize(token)
      if (!compactToken) return 1
      if (compact.includes(compactToken)) return 2
      if (isSubsequence(compactToken, compact)) return 1
      return 0
    })
    if (tokenScores.every((score) => score > 0)) {
      return 60 + tokenScores.reduce<number>((sum, score) => sum + score, 0) * 4
    }
  }

  if (isSubsequence(compactQuery, primaryCompact)) return 56
  if (isSubsequence(compactQuery, compact)) return 46

  if (compactQuery.length >= 2) {
    const chars = Array.from(new Set(compactQuery))
    const hits = chars.filter((ch) => compact.includes(ch)).length
    const ratio = hits / chars.length
    if (ratio >= 0.65) return Math.round(ratio * 36)
  }

  return 0
}

function courseSearchIndex(course: Course) {
  const base = `${course.name} ${course.shortName} ${course.teacher} ${course.teacher}老师 ${course.code ?? ''} ${course.id} ${course.chapter ?? ''}`
  const extra = COURSE_KEYWORDS.filter(([pattern]) => pattern.test(base))
    .map(([, tokens]) => tokens)
    .join(' ')
  return {
    raw: `${base} ${extra}`.toLowerCase(),
    compact: normalize(`${base} ${extra}`),
    nameCompact: normalize(`${course.name}${course.shortName}`),
    teacherCompact: normalize(course.teacher),
  }
}

function scoreCourseMatch(course: Course, query: string): number {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return 1
  const index = courseSearchIndex(course)
  const compactQuery = normalize(trimmed)
  if (!compactQuery) return 1

  // Exact or prefix match on course name gets top priority.
  if (index.nameCompact === compactQuery) return 120
  if (index.nameCompact.startsWith(compactQuery)) return 100
  if (index.nameCompact.includes(compactQuery)) return 88
  if (index.teacherCompact.includes(compactQuery)) return 80
  if (index.raw.includes(trimmed) || index.compact.includes(compactQuery)) return 72

  // Multi-token search (e.g. "概率 曹").
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) {
    const tokenScores = tokens.map((token) => {
      const compactToken = normalize(token)
      if (!compactToken) return 1
      if (index.compact.includes(compactToken)) return 2
      if (isSubsequence(compactToken, index.compact)) return 1
      return 0
    })
    if (tokenScores.every((score) => score > 0)) {
      return 60 + tokenScores.reduce<number>((sum, score) => sum + score, 0) * 4
    }
  }

  // Ordered subsequence fuzzy match (e.g. "概统" -> "概率论与数理统计A").
  if (isSubsequence(compactQuery, index.nameCompact)) return 56
  if (isSubsequence(compactQuery, index.compact)) return 46

  // Unordered character overlap fuzzy match for mild typos / swapped words.
  if (compactQuery.length >= 2) {
    const chars = Array.from(new Set(compactQuery))
    const hits = chars.filter((ch) => index.compact.includes(ch)).length
    const ratio = hits / chars.length
    if (ratio >= 0.65) return Math.round(ratio * 36)
  }

  return 0
}

export function CourseSelect({ courses, value, onChange, disabled }: CourseSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selected = courses.find((item) => item.id === value) ?? courses[0]

  const filtered = useMemo(() => {
    if (!query.trim()) return courses
    return courses
      .map((item) => ({ item, score: scoreCourseMatch(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)
  }, [courses, query])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 20)
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectCourse = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((index) => (filtered.length > 0 ? (index + 1) % filtered.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((index) =>
        filtered.length > 0 ? (index - 1 + filtered.length) % filtered.length : 0,
      )
    } else if (event.key === 'Enter' && filtered[highlightIndex]) {
      event.preventDefault()
      selectCourse(filtered[highlightIndex].id)
    }
  }

  return (
    <div className={`course-combobox${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="course-combobox-trigger"
        onClick={() => {
          if (disabled) return
          setOpen((current) => !current)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择课程"
        disabled={disabled}
      >
        <span className={`course-dot accent-${selected?.accent ?? 'jade'}`} />
        <span className="course-combobox-value">
          <strong>{selected?.name ?? selected?.shortName ?? '选择课程'}</strong>
          {selected?.teacher && <em>{selected.teacher}老师</em>}
        </span>
        <ChevronDown size={17} className="course-combobox-chevron" />
      </button>

      {open && (
        <div className="course-combobox-panel" role="dialog" aria-label="搜索并选择课程">
          <div className="course-combobox-search">
            <Search size={15} />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索课程名、简称、老师或拼音首字母…"
              aria-label="搜索课程"
            />
            {query && (
              <button
                type="button"
                className="course-combobox-clear"
                onClick={() => {
                  setQuery('')
                  searchInputRef.current?.focus()
                }}
                aria-label="清空搜索"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="course-combobox-list" role="listbox" aria-label="课程列表">
            {filtered.length === 0 ? (
              <div className="course-combobox-empty">
                <span>没有找到“{query}”相关课程</span>
                <button type="button" className="text-button" onClick={() => setQuery('')}>
                  显示全部课程
                </button>
              </div>
            ) : (
              filtered.map((item, idx) => {
                const active = item.id === value
                const highlighted = idx === highlightIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`course-combobox-option${active ? ' is-active' : ''}${highlighted ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => selectCourse(item.id)}
                  >
                    <span className={`course-dot accent-${item.accent}`} />
                    <span className="course-combobox-option-copy">
                      <strong>{item.name}</strong>
                      <em>
                        {item.teacher}老师
                        {item.shortName && item.shortName !== item.name ? ` · ${item.shortName}` : ''}
                      </em>
                    </span>
                    {active && <Check size={15} className="course-combobox-check" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
