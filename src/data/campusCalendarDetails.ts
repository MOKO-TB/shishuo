/**
 * 校历事件的展示增强：官网链接与面向学生的说明。
 *
 * 为什么不直接写进 campusTools.ts：那个文件由 dev/import-campus-tools.mjs 生成，
 * 手工补的字段会在下次导入时被覆盖。这里按事件 id 覆盖，导入后依然生效。
 */
import type { CampusCalendarEvent } from './campusTools'

export interface CampusCalendarDetail {
  /** 事件对应的官网/原文地址 */
  url?: string
  /** 链接按钮文案，缺省时按事件类型展示「查看原文」 */
  linkLabel?: string
  /** 面向学生的说明；优先于 note（note 里混有写给 AI 的指令） */
  summary?: string
}

const DETAILS: Record<string, CampusCalendarDetail> = {
  'mid-autumn-2026': {
    summary:
      '9 月 25 日至 27 日放假，共 3 天。这是国务院的全国安排；学校 2026 年实际按「中秋国庆假期（连放 13 天）」执行。',
  },
  'national-day-2026': {
    summary:
      '10 月 1 日至 7 日放假调休，共 7 天；9 月 20 日、10 月 10 日调休上班/上课。学校 2026 年实际按「中秋国庆假期（连放 13 天）」执行。',
  },
  'gzyzk-2026-holiday': {
    summary: '学校安排：9 月 25 日至 10 月 7 日连放 13 天（中秋 + 国庆调休）。返校与调课安排以教务处通知为准。',
  },
  'cet-set-2026h2': {
    url: 'https://cet.neea.edu.cn/',
    linkLabel: '四六级官网',
    summary: '2026 年下半年全国大学英语四、六级考试口试（CET-SET），共两天。',
  },
  'cet-written-2026h2': {
    url: 'https://cet.neea.edu.cn/',
    linkLabel: '四六级官网',
    summary:
      '四级笔试 9:00-11:20，六级笔试 15:00-17:25；准考证 12 月 1 日起可在官网下载打印。',
  },
  'mental-health-day': {
    summary: '每年 5 月 25 日是全国大学生心理健康日，学校在 5 月组织心理健康活动月（作品征集、线下活动等）。',
  },
  'sports-meet-2026': {
    summary: '2026 年校运会安排在 11 月 5 日至 6 日，共 2 天；每年具体日期以学校通知为准。',
  },
}

function extractSourceUrl(source: string) {
  const match = source.match(/https?:\/\/[^\s)）]+/)
  if (!match) return undefined
  return match[0].replace(/[),;，。；、]+$/, '')
}

/**
 * 先取人工补充的链接，再从 source 文本里提取；
 * CET 系列即使换了年份的事件 id，也能按来源域名拿到官网。
 */
export function resolveCalendarDetail(event: CampusCalendarEvent): CampusCalendarDetail {
  const detail = DETAILS[event.id] ?? {}
  let url = detail.url
  if (!url) url = extractSourceUrl(event.source)
  if (!url && /cet\.neea\.edu\.cn/i.test(event.source)) url = 'https://cet.neea.edu.cn/'
  return { ...detail, url }
}
