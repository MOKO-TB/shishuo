#!/usr/bin/env node
/**
 * 把引路学长的校历 / 图书馆 / 校园地图数据转成师说前端数据。
 *
 * 用法：
 *   node dev/import-campus-tools.mjs /path/to/yinlu-xuezhang
 *
 * 生成：
 *   src/data/campusTools.ts
 *   public/campus/map.jpg
 *
 * 源数据：MOKO-TB/yinlu-xuezhang（MIT License, Copyright (c) 2026 MOKO-TB）。
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = process.argv[2]
if (!sourceRoot) {
  console.error('用法: node dev/import-campus-tools.mjs <yinlu-xuezhang 仓库根目录>')
  process.exit(1)
}

const readJson = (relative) => JSON.parse(readFileSync(resolve(sourceRoot, relative), 'utf8'))
const calendar = readJson('kb/school-calendar.json')
const library = readJson('kb/library-gzasc.json')
const mapIndex = readJson('frontend/campus-index.json')

const events = Array.isArray(calendar.events) ? calendar.events : []
const libraryItems = Array.isArray(library) ? library : []
const buildings = Array.isArray(mapIndex.buildings) ? mapIndex.buildings : []
const sourceMap = mapIndex.source_map ?? {}

const mapSource = resolve(sourceRoot, 'frontend/img/campus/map.jpg')
mkdirSync(resolve(root, 'public/campus'), { recursive: true })
copyFileSync(mapSource, resolve(root, 'public/campus/map.jpg'))

const q = (value) => JSON.stringify(value)
const eventLines = events
  .map(
    (event) => `  {
    id: ${q(event.id)},
    name: ${q(event.name)},
    start: ${q(event.start ?? '')},
    end: ${q(event.end ?? '')},
    kind: ${q(event.kind ?? 'event')},
    note: ${q(event.note ?? '')},
    source: ${q(event.source ?? '')},
    credibility: ${q(event.credibility ?? '')},
    repeat: ${q(event.repeat ?? '')},
  },`,
  )
  .join('\n')
const libraryLines = libraryItems
  .map(
    (item) => `  {
    id: ${q(item.id)},
    title: ${q(item.title ?? '')},
    content: ${q(item.content ?? '')},
    url: ${q(item.url ?? '')},
    source: ${q(item.source ?? '')},
    tags: ${JSON.stringify(Array.isArray(item.tags) ? item.tags : [])},
    credibility: ${q(item.credibility ?? '')},
    publishAt: ${q(item.publish_at ?? '')},
  },`,
  )
  .join('\n')
const buildingLines = buildings
  .map(
    (building) => `  {
    no: ${Number(building.no) || 0},
    name: ${q(building.name ?? '')},
    category: ${q(building.category ?? '')},
    aliases: ${JSON.stringify(Array.isArray(building.aliases) ? building.aliases : [])},
    bbox: ${JSON.stringify(Array.isArray(building.bbox_on_map) ? building.bbox_on_map : [])},
    center: ${JSON.stringify(Array.isArray(building.center_on_map) ? building.center_on_map : [])},
    area: ${q(building.area_on_map ?? '')},
    nearby: ${JSON.stringify(Array.isArray(building.nearby) ? building.nearby : [])},
  },`,
  )
  .join('\n')

const output = `/**
 * 校园工具数据（校历 / 图书馆 / 地图）。
 *
 * 来源：MOKO-TB/yinlu-xuezhang（MIT License, Copyright (c) 2026 MOKO-TB）
 * 生成：dev/import-campus-tools.mjs
 *
 * 注意：地图坐标基于源图 ${Number(sourceMap.width) || 2559}×${Number(sourceMap.height) || 1279}；
 * 校历/通知会过期，展示时必须保留来源与“以学校通知为准”的提示。
 */

export interface CampusCalendarEvent {
  id: string
  name: string
  start: string
  end: string
  kind: string
  note: string
  source: string
  credibility: string
  repeat: string
}

export interface CampusLibraryItem {
  id: string
  title: string
  content: string
  url: string
  source: string
  tags: string[]
  credibility: string
  publishAt: string
}

export interface CampusBuilding {
  no: number
  name: string
  category: string
  aliases: string[]
  bbox: number[]
  center: number[]
  area: string
  nearby: string[]
}

export const CAMPUS_CALENDAR_EVENTS: CampusCalendarEvent[] = [
${eventLines}
]

export const CAMPUS_LIBRARY_ITEMS: CampusLibraryItem[] = [
${libraryLines}
]

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
${buildingLines}
]

export const CAMPUS_MAP = {
  image: '/campus/map.jpg',
  width: ${Number(sourceMap.width) || 2559},
  height: ${Number(sourceMap.height) || 1279},
  source: ${q(sourceMap.note ?? '')},
  license: 'MIT · MOKO-TB/yinlu-xuezhang',
}
`

writeFileSync(resolve(root, 'src/data/campusTools.ts'), output, 'utf8')
console.log(`校历 ${events.length} 条 · 图书馆 ${libraryItems.length} 条 · 建筑 ${buildings.length} 个`)
console.log('已生成 src/data/campusTools.ts 和 public/campus/map.jpg')
