import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileJson,
  FileSpreadsheet,
  FileUp,
  Upload,
} from 'lucide-react'
import { useStore } from '../store'
import { courseById, teacherByName } from '../data/seed'
import type { Faq, Role } from '../types'
import { questionSimilarity } from '../lib/engine'
import { downloadText as downloadFile } from '../lib/export'
import { makeId } from '../lib/utils'
import { Badge, Modal } from './ui'

type Mode = 'import' | 'export'
type ExportScope = 'current' | 'all'
type ExportFormat = 'csv' | 'json'
type RowStatus = 'valid' | 'duplicate' | 'invalid'

interface ParsedRow {
  index: number
  question: string
  answer: string
  tags: string[]
  aliases: string[]
  chapter: string
  status: RowStatus
  message?: string
}

const MAX_ROWS = 200

function splitList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (!value) return []
  return value
    .split(/[|,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((line) => line.some((value) => value.trim()))
}

const HEADER_ALIASES: Record<string, string> = {
  question: 'question',
  '问题': 'question',
  '题目': 'question',
  answer: 'answer',
  '答案': 'answer',
  '回答': 'answer',
  tags: 'tags',
  '标签': 'tags',
  aliases: 'aliases',
  '别名': 'aliases',
  chapter: 'chapter',
  '章节': 'chapter',
}

function parseCsvRows(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV 至少需要表头和一行数据。')
  const headers = rows[0].map((header) => HEADER_ALIASES[header.trim().toLowerCase()] ?? '')
  if (!headers.includes('question') || !headers.includes('answer')) {
    throw new Error('CSV 表头必须包含“问题”和“答案”（或 question / answer）。')
  }
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (header) record[header] = row[index]?.trim() ?? ''
    })
    return record
  })
}

function parseJsonRows(text: string): Array<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('JSON 解析失败，请检查文件格式。')
  }
  const list =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { faqs?: unknown }).faqs)
        ? (parsed as { faqs: unknown[] }).faqs
        : null
  if (!list) throw new Error('JSON 需要是 FAQ 数组，或包含 faqs 数组的对象。')
  if (list.length === 0) throw new Error('文件里没有 FAQ 数据。')
  if (list.length > MAX_ROWS) throw new Error(`单次最多导入 ${MAX_ROWS} 条 FAQ。`)
  return list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function recordToRow(record: Record<string, unknown>, index: number): ParsedRow {
  const question = String(
    record.question ?? record['问题'] ?? record['题目'] ?? '',
  ).trim()
  const answer = String(record.answer ?? record['答案'] ?? record['回答'] ?? '').trim()
  const tags = splitList((record.tags ?? record['标签']) as string | string[] | undefined).slice(0, 8)
  const aliases = splitList(
    (record.aliases ?? record['别名']) as string | string[] | undefined,
  ).slice(0, 12)
  const chapter = String(record.chapter ?? record['章节'] ?? '').trim()

  let status: RowStatus = 'valid'
  let message = ''
  if (question.length < 3) {
    status = 'invalid'
    message = '问题过短'
  } else if (question.length > 220) {
    status = 'invalid'
    message = '问题超过 220 字'
  } else if (answer.length < 5) {
    status = 'invalid'
    message = '答案过短或为空'
  } else if (answer.length > 8_000) {
    status = 'invalid'
    message = '答案超过 8000 字'
  }
  return { index, question, answer, tags, aliases, chapter, status, message }
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

const SAMPLE_CSV = `\uFEFF问题,答案,标签,别名,章节
"什么是时间复杂度？","时间复杂度描述算法执行时间随输入规模增长的趋势，通常只保留增长最快的一项。","复杂度|大O","复杂度怎么算","第 1 章"
"为什么哈希表扩容通常是 2 倍？","按 2 倍扩容可以把重新散列的成本摊薄到每次插入，均摊复杂度保持 O(1)。","哈希表|扩容","哈希表扩容","第 6 章"
`

export function ImportExportModal({
  open,
  onClose,
  role,
  teacherName,
  currentCourseId,
  notify,
  onImported,
}: {
  open: boolean
  onClose: () => void
  role: Role
  teacherName: string
  currentCourseId: string
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  onImported: (courseId: string) => void
}) {
  const { data, dispatch } = useStore()
  const teacherCourses = useMemo(
    () => teacherByName(teacherName).courses,
    [teacherName],
  )
  const courses = useMemo(
    () => teacherCourses.map((id) => courseById(id)),
    [teacherCourses],
  )
  const currentAllowed = courses.some((course) => course.id === currentCourseId)

  const [mode, setMode] = useState<Mode>('import')
  const [targetCourse, setTargetCourse] = useState(
    currentAllowed ? currentCourseId : courses[0]?.id ?? 'ds',
  )
  const [exportScope, setExportScope] = useState<ExportScope>(
    currentAllowed ? 'current' : 'all',
  )
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('import')
    setTargetCourse(currentAllowed ? currentCourseId : courses[0]?.id ?? 'ds')
    setExportScope(currentAllowed ? 'current' : 'all')
    setExportFormat('csv')
    setParsedRows([])
    setFileName('')
    setError(null)
  }, [open, currentCourseId, currentAllowed, courses])

  const existingFaqs = useMemo(
    () => data.faqs.filter((faq) => faq.courseId === targetCourse),
    [data.faqs, targetCourse],
  )

  const evaluatedRows = useMemo(() => {
    const existingExact = new Set(existingFaqs.map((faq) => normalizeQuestion(faq.question)))
    const accepted: ParsedRow[] = []
    return parsedRows.map((row) => {
      if (row.status === 'invalid') return row
      const normalized = normalizeQuestion(row.question)
      const exact = existingExact.has(normalized)
      const near = existingFaqs.some(
        (faq) => questionSimilarity(faq.question, row.question) >= 0.86,
      )
      if (exact || near) {
        return { ...row, status: 'duplicate' as const, message: '与现有 FAQ 重复' }
      }
      const within = accepted.some(
        (item) =>
          normalizeQuestion(item.question) === normalized ||
          questionSimilarity(item.question, row.question) >= 0.86,
      )
      if (within) {
        return { ...row, status: 'duplicate' as const, message: '本次导入内重复' }
      }
      accepted.push(row)
      return row
    })
  }, [parsedRows, existingFaqs])

  const validRows = evaluatedRows.filter((row) => row.status === 'valid')
  const duplicateCount = evaluatedRows.filter((row) => row.status === 'duplicate').length
  const invalidCount = evaluatedRows.filter((row) => row.status === 'invalid').length

  const currentCourse = courses.find((course) => course.id === currentCourseId)
  const exportFaqs = useMemo(() => {
    const allowed = new Set(courses.map((course) => course.id))
    return data.faqs.filter(
      (faq) =>
        allowed.has(faq.courseId) &&
        (exportScope === 'all' || !currentCourse || faq.courseId === currentCourse.id),
    )
  }, [data.faqs, exportScope, currentCourse, courses])

  const exportLabel = exportScope === 'all' || !currentCourse
    ? '全部我的课程'
    : currentCourse.shortName

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setParsedRows([])
    setFileName(file.name)
    if (file.size > 2 * 1024 * 1024) {
      setError('文件超过 2MB，请拆分后再导入。')
      return
    }
    try {
      const text = await file.text()
      const records = file.name.toLowerCase().endsWith('.json')
        ? parseJsonRows(text)
        : parseCsvRows(text)
      if (records.length > MAX_ROWS) throw new Error(`单次最多导入 ${MAX_ROWS} 条 FAQ。`)
      const rows = records.map((record, index) => recordToRow(record, index + 1))
      if (rows.length === 0) throw new Error('文件里没有有效数据行。')
      setParsedRows(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件解析失败。')
    }
  }

  const importRows = () => {
    if (validRows.length === 0) return
    const now = Date.now()
    const course = courseById(targetCourse)
    const faqs: Faq[] = validRows.map((row) => ({
      id: makeId('faq'),
      courseId: targetCourse,
      question: row.question,
      aliases: row.aliases,
      answer: row.answer,
      tags: row.tags,
      author: course.teacher,
      source: 'teacher',
      createdAt: now,
      updatedAt: now,
      citations: 0,
      helpful: 0,
      unhelpful: 0,
      chapter: row.chapter || undefined,
    }))
    dispatch({ type: 'faqs-imported', faqs })
    const skipped = duplicateCount + invalidCount
    notify(
      `已导入 ${faqs.length} 条 FAQ${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`,
    )
    onImported(targetCourse)
    onClose()
  }

  const downloadExport = () => {
    if (exportFaqs.length === 0) return
    const date = new Date().toISOString().slice(0, 10)
    const base = `师说-${exportLabel}-FAQ-${date}`
    if (exportFormat === 'csv') {
      const header = ['问题', '答案', '标签', '别名', '章节']
      const lines = [
        header.map(csvCell).join(','),
        ...exportFaqs.map((faq) =>
          [
            faq.question,
            faq.answer,
            faq.tags.join('|'),
            faq.aliases.join('|'),
            faq.chapter ?? '',
          ]
            .map(csvCell)
            .join(','),
        ),
      ]
      downloadFile(`${base}.csv`, `\uFEFF${lines.join('\r\n')}\r\n`, 'text/csv;charset=utf-8')
    } else {
      downloadFile(
        `${base}.json`,
        JSON.stringify(
          exportFaqs.map((faq) => ({
            courseId: faq.courseId,
            courseName: courseById(faq.courseId).name,
            question: faq.question,
            answer: faq.answer,
            tags: faq.tags,
            aliases: faq.aliases,
            chapter: faq.chapter ?? '',
          })),
          null,
          2,
        ),
        'application/json;charset=utf-8',
      )
    }
    notify(`已开始下载 ${exportFaqs.length} 条 FAQ`)
  }

  if (role !== 'teacher') return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`教师工具 · ${teacherName}`}
      title="FAQ 导入 / 导出"
      size="lg"
      footer={
        <div className="modal-actions modal-actions-split">
          <span className="modal-foot-note">
            {mode === 'import'
              ? '导入的条目会标记为“老师编写”，重复问题会自动跳过。'
              : '导出文件可再次导入，也可作为课程知识备份。'}
          </span>
          <div className="modal-actions-right">
            <button className="button button-ghost" onClick={onClose}>
              取消
            </button>
            {mode === 'import' ? (
              <button
                className="button button-primary"
                onClick={importRows}
                disabled={validRows.length === 0}
              >
                <Upload size={15} />
                导入 {validRows.length} 条
              </button>
            ) : (
              <button
                className="button button-primary"
                onClick={downloadExport}
                disabled={exportFaqs.length === 0}
              >
                <Download size={15} />
                下载 {exportFormat.toUpperCase()}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="transfer-tabs" role="tablist" aria-label="导入或导出">
        <button
          className={mode === 'import' ? 'is-active' : ''}
          onClick={() => setMode('import')}
          role="tab"
          aria-selected={mode === 'import'}
        >
          <FileUp size={15} />
          导入 FAQ
        </button>
        <button
          className={mode === 'export' ? 'is-active' : ''}
          onClick={() => setMode('export')}
          role="tab"
          aria-selected={mode === 'export'}
        >
          <Download size={15} />
          导出 FAQ
        </button>
      </div>

      {mode === 'import' ? (
        <div className="transfer-import">
          <div className="transfer-field-row">
            <label className="field">
              <span className="field-label">导入到课程</span>
              <select
                className="input"
                value={targetCourse}
                onChange={(event) => setTargetCourse(event.target.value)}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} · {course.teacher}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="text-button transfer-template"
              onClick={() =>
                downloadFile('师说-FAQ导入模板.csv', SAMPLE_CSV, 'text/csv;charset=utf-8')
              }
            >
              <FileSpreadsheet size={14} />
              下载 CSV 模板
            </button>
          </div>

          <label className="import-drop">
            <FileUp size={20} />
            <span>
              <strong>选择 CSV 或 JSON 文件</strong>
              <em>单次最多 {MAX_ROWS} 条；支持问题、答案、标签、别名、章节</em>
            </span>
            <span className="import-file">{fileName || '选择文件'}</span>
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleFile}
              hidden
            />
          </label>

          {error && <div className="inline-note danger">{error}</div>}

          {parsedRows.length > 0 && (
            <>
              <div className="transfer-summary">
                <span className="transfer-count valid">
                  <CheckCircle size={14} />
                  可导入 {validRows.length}
                </span>
                <span className="transfer-count duplicate">
                  <AlertCircle size={14} />
                  重复 {duplicateCount}
                </span>
                <span className="transfer-count invalid">
                  <AlertCircle size={14} />
                  无效 {invalidCount}
                </span>
                <span className="transfer-file-name">{fileName}</span>
              </div>

              <div className="import-preview">
                <div className="import-preview-head">
                  <span>#</span>
                  <span>问题</span>
                  <span>标签</span>
                  <span>状态</span>
                </div>
                {evaluatedRows.map((row) => (
                  <div className={`import-preview-row is-${row.status}`} key={row.index}>
                    <span className="import-index">{String(row.index).padStart(2, '0')}</span>
                    <span className="import-question">{row.question || '（空）'}</span>
                    <span className="import-tags">{row.tags.slice(0, 3).join('、') || '—'}</span>
                    <span className="import-status">
                      {row.status === 'valid' ? (
                        <Badge tone="high" dot>
                          可导入
                        </Badge>
                      ) : row.status === 'duplicate' ? (
                        <Badge tone="medium" dot>
                          {row.message}
                        </Badge>
                      ) : (
                        <Badge tone="danger" dot>
                          {row.message}
                        </Badge>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="transfer-export">
          <div className="transfer-export-options">
            <label className="field">
              <span className="field-label">导出范围</span>
              <select
                className="input"
                value={exportScope}
                onChange={(event) => setExportScope(event.target.value as ExportScope)}
              >
                <option value="current">
                  当前筛选 · {currentAllowed ? currentCourse?.shortName : '全部我的课程'}
                </option>
                <option value="all">我的全部课程</option>
              </select>
            </label>
            <div className="field">
              <span className="field-label">文件格式</span>
              <div className="format-switch">
                <button
                  className={exportFormat === 'csv' ? 'is-active' : ''}
                  onClick={() => setExportFormat('csv')}
                >
                  <FileSpreadsheet size={14} />
                  CSV
                </button>
                <button
                  className={exportFormat === 'json' ? 'is-active' : ''}
                  onClick={() => setExportFormat('json')}
                >
                  <FileJson size={14} />
                  JSON
                </button>
              </div>
            </div>
          </div>

          <div className="export-summary">
            <Download size={20} />
            <div>
              <strong>{exportFaqs.length} 条 FAQ 可导出</strong>
              <span>
                {exportLabel} · {exportFormat === 'csv' ? 'Excel 可直接打开' : '完整字段 JSON'}
              </span>
            </div>
          </div>

          <div className="export-hint">
            CSV 使用 UTF-8 BOM，Excel 打开不会乱码；标签和别名用「|」分隔。导出文件可以直接再次导入。
          </div>
        </div>
      )}
    </Modal>
  )
}
