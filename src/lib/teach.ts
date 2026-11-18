import type { AnswerResult, Faq, Thread } from '../types'
import { courseById } from '../data/seed'
import {
  findMentorTopic,
  mentorForCourse,
  type MentorMisconception,
  type MentorTransfer,
} from '../data/mentor'

export interface TeachMentor {
  name: string
  topic: string
  source: string
  attribution: string
  diagnose: string[]
  prerequisite: string
  misconception: MentorMisconception
  transfer: MentorTransfer
}

export interface TeachLesson {
  id: string
  title: string
  courseName: string
  confidence: 'high' | 'medium'
  core: string
  points: string[]
  example: string
  pitfall: string
  check: {
    question: string
    answer: string
    hint: string
  }
  mentor?: TeachMentor
  sourceFaq: Faq
}

function stripMarkdown(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/\r/g, '')
    .trim()
}

function firstSentence(text: string, max = 120) {
  const first = text.match(/^[^。！？!?]+[。！？!?]?/)?.[0]?.trim() ?? text
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}

function isExampleLine(text: string) {
  return /(例如|比如|举个例子|当 n|假设|考虑|拿.*为例|以.*为例)/.test(text)
}

function isPitfallLine(text: string) {
  return /(误区|注意|不要|不能|别|容易|切记|但是)/.test(text)
}

export function buildTeachLesson(
  thread: Thread,
  result: AnswerResult | null,
  faqs: Faq[],
): TeachLesson | null {
  const confidence = thread.confidence
  if (!confidence || confidence === 'low') return null

  const source =
    result?.top?.faq ??
    (thread.sources ?? [])
      .map((id) => faqs.find((faq) => faq.id === id))
      .find((faq): faq is Faq => Boolean(faq))
  if (!source) return null

  const raw = stripMarkdown(thread.aiAnswer || source.answer)
  if (!raw) return null

  const mentor = mentorForCourse(source.courseId)
  const mentorTopic = mentor
    ? findMentorTopic(mentor, source, thread.question)
    : undefined

  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bullet = /^[•\-*]\s*/.test(line)
      return {
        bullet,
        text: bullet ? line.replace(/^[•\-*]\s*/, '').trim() : line,
      }
    })
    .filter((entry) => Boolean(entry.text))

  const coreEntry = entries.find((entry) => !entry.bullet) ?? entries[0]
  if (!coreEntry) return null

  const exampleEntry = entries.find((entry) => isExampleLine(entry.text))
  const pitfallEntry = entries.find(
    (entry) => entry !== exampleEntry && isPitfallLine(entry.text),
  )
  const points = entries
    .filter((entry) => entry !== coreEntry && entry !== exampleEntry && entry !== pitfallEntry)
    .map((entry) => entry.text)
    .slice(0, 4)

  const core = firstSentence(coreEntry.text)
  const safePoints =
    points.length > 0
      ? points
      : ['先看它的定义，再看它解决什么问题。', '把条件、步骤和结论分开记，别混成一句话。']
  const example = exampleEntry
    ? exampleEntry.text
    : '试着拿你手头的一道题套一遍：先说清关系，再写推导，最后检查边界。'
  const pitfall = pitfallEntry
    ? pitfallEntry.text
    : '先检查适用条件：这个结论在什么前提下成立？边界情况有没有漏？'

  return {
    id: `teach-${source.id}`,
    title: source.question,
    courseName: courseById(source.courseId).name,
    confidence,
    core: mentorTopic?.core ?? core,
    points: mentorTopic?.moves ?? safePoints,
    example: mentorTopic?.example ?? example,
    pitfall: mentorTopic
      ? `${mentorTopic.misconception.wrong}\n${mentorTopic.misconception.why}\n改法：${mentorTopic.misconception.fix}`
      : pitfall,
    check: mentorTopic
      ? {
          question: mentorTopic.transfer.question,
          answer: mentorTopic.transfer.answer,
          hint: mentorTopic.transfer.hint,
        }
      : {
          question: `不看原文，用自己的话回答：${source.question}`,
          answer: `${core}${safePoints[0] ? `\n\n再补一句：${safePoints[0]}` : ''}`,
          hint: '先讲「是什么」，再讲「为什么」，最后举一个例子。',
        },
    mentor:
      mentor && mentorTopic
        ? {
            name: mentor.name,
            topic: mentorTopic.name,
            source: mentorTopic.source,
            attribution: mentor.attribution,
            diagnose: mentorTopic.diagnose,
            prerequisite: mentorTopic.prerequisite,
            misconception: mentorTopic.misconception,
            transfer: mentorTopic.transfer,
          }
        : undefined,
    sourceFaq: source,
  }
}