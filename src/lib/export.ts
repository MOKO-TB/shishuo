import {
  SECTION_BELL,
  runsInWeek,
  weekMonday,
  weekdayLabel,
  type ScoreRow,
  type StudentProfile,
} from './profile'
import { saveOrShareFile } from './nativeShell'

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  // Web 走浏览器下载；原生壳走缓存文件 + 系统分享面板。
  void saveOrShareFile(blob, filename).catch(() => {})
}

function icsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function icsDate(ts: number, hour: string) {
  const date = new Date(ts)
  const [h, m] = hour.split(':').map(Number)
  date.setHours(h, m, 0, 0)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`
}

const MAX_WEEKS = 25

export function buildScheduleIcs(profile: StudentProfile) {
  const events: string[] = []
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  for (const entry of profile.schedule) {
    const start = SECTION_BELL[entry.startSection]
    const end = SECTION_BELL[entry.endSection]
    if (!start || !end) continue
    for (let week = 1; week <= MAX_WEEKS; week += 1) {
      if (!runsInWeek(entry.weeks, week)) continue
      const dayTs = weekMonday(profile.termStart, week) + (entry.day - 1) * 86_400_000
      const description = [
        entry.teacher,
        `第 ${entry.startSection}${entry.endSection !== entry.startSection ? `-${entry.endSection}` : ''} 节`,
        `第 ${week} 周 · ${weekdayLabel(entry.day)}`,
        entry.weeks ? `教务周次 ${entry.weeks}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      events.push(
        [
          'BEGIN:VEVENT',
          `UID:${entry.id}-w${week}@shishuo.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${icsDate(dayTs, start.start)}`,
          `DTEND:${icsDate(dayTs, end.end)}`,
          `SUMMARY:${icsText(entry.course)}`,
          `LOCATION:${icsText(entry.room || '')}`,
          `DESCRIPTION:${icsText(description)}`,
          'END:VEVENT',
        ].join('\r\n'),
      )
    }
  }
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shishuo//Timetable//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function scoreRowsCsv(rows: ScoreRow[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [['学期', '课程', '成绩', '学分', '性质'].map(escape).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.semester || '',
        row.course,
        row.score,
        row.credit === null ? '' : String(row.credit),
        row.kind || '',
      ]
        .map(escape)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}`
}

export function downloadScheduleIcs(profile: StudentProfile) {
  downloadText('师说-课程表.ics', buildScheduleIcs(profile), 'text/calendar;charset=utf-8')
}

export function downloadScoresCsv(rows: ScoreRow[]) {
  downloadText('师说-成绩.csv', scoreRowsCsv(rows), 'text/csv;charset=utf-8')
}

export function scheduleExportReady(profile: StudentProfile) {
  return profile.schedule.length > 0 && Boolean(profile.termStart)
}

export function scheduleEventCount(profile: StudentProfile) {
  let count = 0
  for (const entry of profile.schedule) {
    for (let week = 1; week <= MAX_WEEKS; week += 1) {
      if (runsInWeek(entry.weeks, week)) count += 1
    }
  }
  return count
}