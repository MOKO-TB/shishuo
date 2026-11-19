/**
 * 强智教务表格解析：只处理 DOM 快照，不依赖浏览器。
 * 快照由 server/jw.mjs 在页面里用 SNAPSHOT_SCRIPT 生成；
 * 这里保留与 dev/jw-proxy.ts 相同的表格结构、周次和行合并处理。
 */

const DAY_CELL_RE = /^\s*(?:星期|礼拜)?\s*([一二三四五六日天])\s*$/
const DAY_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
const WEEK_ANCHOR_RE = /[（(]周[)）]/
const PERIOD_BRACKET_RE = /\[(\d{1,2}(?:\s*-\s*\d{1,2})+)\s*节\]/
const DASH_LINE_RE = /^-{3,}$/
const TIME_RANGE_RE = /\d{1,2}[:：]\d{2}\s*[-~－—]\s*\d{1,2}[:：]\d{2}/g
const PLACE_RE = /(楼|室|馆|中心|校区|栋|机房|实验|@)/

function linesOf(cell) {
  return cell
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** Strip clock ranges first, or "20:35-21:20" becomes sections 20-9. */
function sectionsOf(label) {
  const clean = label.replace(TIME_RANGE_RE, ' ')
  const explicit = /第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*节/.exec(clean)
  if (explicit) return { start: Number(explicit[1]), end: Number(explicit[2]) }
  const nums = [...clean.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]))
  if (nums.length >= 2) return { start: nums[0], end: nums[1] }
  if (nums.length === 1) return { start: nums[0], end: nums[0] }
  return { start: 0, end: 0 }
}

function normalizePeriods(raw) {
  const nums = [...raw.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]))
  if (nums.length === 0) return { start: 0, end: 0 }
  const ordered = [...new Set(nums)].sort((a, b) => a - b)
  return { start: ordered[0], end: ordered[ordered.length - 1] }
}

function bellOf(label) {
  const match = /(\d{1,2})[:：](\d{2})\s*[-~－—]\s*(\d{1,2})[:：](\d{2})/.exec(label)
  return match
    ? {
        start: `${match[1].padStart(2, '0')}:${match[2]}`,
        end: `${match[3].padStart(2, '0')}:${match[4]}`,
      }
    : { start: '', end: '' }
}

function weekdayHeader(rows) {
  for (let index = 0; index < Math.min(rows.length, 4); index += 1) {
    const map = new Map()
    rows[index].forEach((cell, column) => {
      const match = DAY_CELL_RE.exec((cell ?? '').trim())
      if (match && column > 0) map.set(column, DAY_NUM[match[1]])
    })
    if (map.size >= 5) return { map, headerRow: index }
  }
  return undefined
}

function parseCell(lines, day, rowKey, rowBell) {
  if (lines.length === 0) return undefined
  const raw = lines.join(' / ')
  // Some 强智 tables put a footnote like "劳动教育 麦晓婷 1-5周;电子技术课程设计 曾霞 15周;"
  // inside a weekday cell. It has no period bracket or room, so reject it before it becomes a class.
  if ((raw.match(/周/g)?.length ?? 0) >= 2 && /[;；]/.test(raw) && !PLACE_RE.test(raw)) {
    return undefined
  }
  const anchor = lines.findIndex((line) => WEEK_ANCHOR_RE.test(line))
  const bracket = PERIOD_BRACKET_RE.exec(lines[anchor] ?? raw)
  const periods = bracket ? normalizePeriods(bracket[1]) : rowKey
  if (periods.start === 0) return undefined

  let name = ''
  let teacher = ''
  let room = ''
  let weeks = ''
  if (anchor >= 0) {
    name = lines.slice(0, Math.max(anchor - 1, 0)).join(' ').trim()
    teacher = anchor >= 2 ? lines[anchor - 1].trim() : ''
    weeks = lines[anchor]
      .replace(WEEK_ANCHOR_RE, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, '')
      .slice(0, 80)
    room = lines.slice(anchor + 1).find((line) => !WEEK_ANCHOR_RE.test(line)) ?? ''
    // A cell may be just 课名 + 周次 (+ 教室): nothing before the anchor, so take the first line.
    if (!name) name = lines.slice(0, anchor).join(' ').trim()
  } else {
    // Real-world 强智 cells often carry only 课程名 + @教室 (+ 周次 on its own line).
    const rest = []
    for (const line of lines) {
      if (PLACE_RE.test(line) && !room) room = line
      else if (WEEK_ANCHOR_RE.test(line) || /^\d+([-,]\d+)*\s*[（(]?周/.test(line)) weeks = line
      else rest.push(line)
    }
    name = rest.shift() ?? ''
    teacher = rest.find((line) => /^[\u4e00-\u9fa5·]{2,4}$/.test(line)) ?? ''
    if (!room) room = rest.find((line) => PLACE_RE.test(line)) ?? ''
  }
  name = name.replace(/^[（(]\d{2,4}[-\d]*[)）]/, '').trim()
  if (!name) return undefined
  return {
    course: name.slice(0, 60),
    teacher: teacher.replace(/^@/, '').slice(0, 40),
    room: room.replace(/^@/, '').slice(0, 60),
    day,
    startSection: periods.start,
    endSection: periods.end,
    weeks,
    startTime: rowBell.start,
    endTime: rowBell.end,
    raw,
  }
}

export function parseTimetableFrame(frame) {
  const entries = []
  const notes = []
  for (const table of frame.tables) {
    const header = weekdayHeader(table.rows)
    if (!header) continue
    const body = table.rows.slice(header.headerRow + 1)
    body.forEach((row, rowIndex) => {
      const label = row[0] ?? ''
      const rowSections = sectionsOf(label)
      const fallback =
        rowSections.start > 0 ? rowSections : { start: rowIndex * 2 + 1, end: rowIndex * 2 + 2 }
      const rowBell = bellOf(label)
      for (const [column, day] of header.map) {
        const cell = row[column]
        if (!cell || !cell.trim()) continue
        const chunks = []
        let current = []
        for (const line of linesOf(cell)) {
          if (DASH_LINE_RE.test(line)) {
            if (current.length > 0) chunks.push(current)
            current = []
          } else current.push(line)
        }
        if (current.length > 0) chunks.push(current)
        for (const chunk of chunks) {
          const entry = parseCell(chunk, day, fallback, rowBell)
          if (entry) entries.push(entry)
          else if (chunk.length > 0) notes.push(chunk.join(' / ').slice(0, 60))
        }
      }
    })
    if (entries.length > 0) break
  }
  // Same course repeats across consecutive big sections; keep the earliest row.
  const seen = new Map()
  for (const entry of entries) {
    const key = `${entry.course}|${entry.day}|${entry.weeks}`
    const previous = seen.get(key)
    if (!previous || entry.startSection < previous.startSection) seen.set(key, entry)
  }
  return {
    entries: [...seen.values()],
    notes: notes.slice(0, 6),
    selects: frame.selects,
    sourceUrl: frame.url,
  }
}

function scoreKey(row) {
  return `${row.course}|${row.semester}|${row.score}|${row.credit ?? ''}`
}

/** 全部学期 may render one table per semester: collect every score table, not just the first. */
export function parseScoreFrame(frame) {
  const rows = []
  let header = []
  for (const table of frame.tables) {
    const head = (table.rows[0] ?? []).map((cell) => cell.replace(/\s+/g, ' ').trim())
    const sampleRows = table.rows.slice(1, 9)

    // 课程编号 / 课程名称 常常挨着出现；不要因为“课程”二字先命中编号列。
    const nameCandidates = head
      .map((title, index) => ({ title, index }))
      .filter(({ title }) => /课程|课名|名称/.test(title))
      .filter(({ title }) => !/编号|代码|课程号|性质|类别|属性|学分/.test(title))
    let courseColumn = nameCandidates.find(({ title }) => /名称|课名/.test(title))?.index ?? -1
    if (courseColumn < 0) {
      // Header is ambiguous (or split across rows): trust the data — course names contain CJK.
      const pool =
        nameCandidates.length > 0
          ? nameCandidates
          : head
              .map((title, index) => ({ title, index }))
              .filter(({ title }) => /课程/.test(title))
      let best = { index: -1, ratio: -1 }
      for (const candidate of pool) {
        const values = sampleRows
          .map((row) => (row[candidate.index] ?? '').trim())
          .filter(Boolean)
        if (values.length === 0) continue
        const ratio =
          values.filter((value) => /[\u4e00-\u9fa5]/.test(value)).length / values.length
        if (ratio > best.ratio) best = { index: candidate.index, ratio }
      }
      courseColumn = best.index
    }

    // 成绩 / 总评 / 分数，但排除“成绩标识”“成绩说明”这类不是分数的列。
    let scoreColumn = head.findIndex((title) => /^(成绩|总评|分数)$/.test(title))
    if (scoreColumn < 0) {
      scoreColumn = head.findIndex(
        (title) => /成绩|总评|分数/.test(title) && !/标识|说明|性质|备注|学分/.test(title),
      )
    }
    if (courseColumn < 0 || scoreColumn < 0 || courseColumn === scoreColumn) continue
    if (header.length === 0) header = head
    const creditColumn = head.findIndex((title) => /^学分$/.test(title))
    const semesterColumn = head.findIndex((title) => /学年学期|学期|学年/.test(title))
    const kindColumn = head.findIndex((title) => /考试性质|考核方式|考核|课程性质/.test(title))
    for (const row of table.rows.slice(1)) {
      const cells = row.map((cell) => cell.replace(/\s+/g, ' ').trim())
      const course = cells[courseColumn] ?? ''
      const score = cells[scoreColumn] ?? ''
      if (!course || !score) continue
      const credit =
        creditColumn >= 0 && cells[creditColumn] ? Number(cells[creditColumn]) : Number.NaN
      rows.push({
        course: course.slice(0, 60),
        score: score.slice(0, 20),
        credit: Number.isFinite(credit) && credit > 0 ? credit : null,
        semester: semesterColumn >= 0 ? (cells[semesterColumn] ?? '') : '',
        kind: kindColumn >= 0 ? (cells[kindColumn] ?? '') : '',
      })
    }
  }
  const seen = new Set()
  const unique = rows.filter((row) => {
    const key = scoreKey(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { rows: unique, header, sourceUrl: frame.url }
}

export function mergeScoreRows(target, rows) {
  const seen = new Set(target.map(scoreKey))
  for (const row of rows) {
    const key = scoreKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    target.push(row)
  }
  return target
}
