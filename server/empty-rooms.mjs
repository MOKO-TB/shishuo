import { readFileSync } from 'node:fs'

const SNAPSHOT_URL = new URL('./data/empty-rooms-2026-11.json', import.meta.url)
const BUILDING_ORDER = ['J1', 'J2', 'J3', 'J4', 'S1', 'S2', 'S3', 'S4', 'S5']

function normalizeDate(raw) {
  const text = String(raw || '').trim()
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function displayDate(iso) {
  return iso.replaceAll('-', '/')
}

export function createEmptyRoomService() {
  let snapshot = null

  function load() {
    if (snapshot) return snapshot
    const raw = JSON.parse(readFileSync(SNAPSHOT_URL, 'utf8'))
    const days = new Map()
    for (const [key, buildings] of Object.entries(raw.days || {})) {
      const date = normalizeDate(key)
      if (!date) continue
      days.set(date, buildings)
    }
    snapshot = {
      fetchedAt: raw.fetchedAt || '',
      campus: raw.campus || '',
      source: raw.source || '',
      days,
    }
    return snapshot
  }

  function dates() {
    return Array.from(load().days.keys()).sort()
  }

  function get(rawDate) {
    const data = load()
    const available = dates()
    const requested = normalizeDate(rawDate)
    const date = requested || available[available.length - 1] || ''
    const day = data.days.get(date)
    if (!day) {
      return {
        date,
        dates: available,
        fetchedAt: data.fetchedAt,
        campus: data.campus,
        buildings: [],
        matched: false,
      }
    }
    const buildings = BUILDING_ORDER.filter((code) => Array.isArray(day[code])).map((code) => ({
      code,
      rooms: day[code].map((room) => ({
        name: String(room.Name || '').trim(),
        size: Number(room.Size) || 0,
        status: Array.isArray(room.status) ? room.status.slice(0, 5).map((value) => Number(value) || 0) : [0, 0, 0, 0, 0],
      })),
    }))
    return {
      date,
      dates: available,
      fetchedAt: data.fetchedAt,
      campus: data.campus,
      buildings,
      matched: true,
    }
  }

  return { dates, get, displayDate }
}
