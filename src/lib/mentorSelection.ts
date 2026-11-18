import { useEffect, useState } from 'react'
import { availableMentors, mentorForCourse, type CourseMentor } from '../data/mentor'
import { PILOT_COURSE_IDS } from '../data/pilot'
import { useAuth } from '../auth'

const SELECTED_KEY = 'shishuo.mentor.teacher.v2'
const ENABLED_KEY = 'shishuo.mentor.enabled.v1'
const LEGACY_SELECTED_KEY = 'shishuo.mentor.teacher.v1'
const CHANGE_EVENT = 'shishuo:mentor-teacher'
const OPTIONS_EVENT = 'shishuo:mentor-options'

interface MentorPrefs {
  enabled: string[]
  selected: string
}

function allMentorIds() {
  return new Set(availableMentors().map((mentor) => mentor.courseId))
}

function defaultEnabled(): string[] {
  const valid = allMentorIds()
  return PILOT_COURSE_IDS.filter((id) => valid.has(id))
}

function readEnabled(scope: string) {
  const valid = allMentorIds()
  try {
    const raw = localStorage.getItem(`${ENABLED_KEY}.${scope}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const ids = Array.from(
          new Set(parsed.filter((id) => typeof id === 'string' && valid.has(id))),
        )
        if (ids.length > 0) return ids
      }
    }
  } catch {
    // Fall back to the pilot set when storage is unavailable or malformed.
  }
  return defaultEnabled()
}

function readSelected(scope: string, enabled: string[]) {
  try {
    const scoped = localStorage.getItem(`${SELECTED_KEY}.${scope}`)
    if (scoped && enabled.includes(scoped)) return scoped
    const legacy = localStorage.getItem(LEGACY_SELECTED_KEY)
    if (legacy && enabled.includes(legacy)) return legacy
  } catch {
    // Fall back to the first enabled mentor.
  }
  return enabled[0] ?? ''
}

function initialPrefs(scope: string): MentorPrefs {
  const enabled = readEnabled(scope)
  return { enabled, selected: readSelected(scope, enabled) }
}

function writePrefs(scope: string, prefs: MentorPrefs) {
  try {
    localStorage.setItem(`${ENABLED_KEY}.${scope}`, JSON.stringify(prefs.enabled))
    localStorage.setItem(`${SELECTED_KEY}.${scope}`, prefs.selected)
    localStorage.setItem(LEGACY_SELECTED_KEY, prefs.selected)
  } catch {
    // The in-memory list still works for this tab.
  }
}

export function useMentorSelection() {
  const { user } = useAuth()
  const scope = user?.id || 'guest'
  const [prefs, setPrefs] = useState<MentorPrefs>(() => initialPrefs(scope))

  useEffect(() => {
    const next = initialPrefs(scope)
    setPrefs(next)
  }, [scope])

  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string; id?: string } | string>).detail
      const id = typeof detail === 'string' ? detail : detail?.id
      const targetScope = typeof detail === 'string' ? undefined : detail?.scope
      if (!id || (targetScope && targetScope !== scope)) return
      if (!mentorForCourse(id)) return
      setPrefs((current) =>
        current.enabled.includes(id) ? { ...current, selected: id } : current,
      )
    }
    const onOptions = (event: Event) => {
      const detail = (
        event as CustomEvent<{ scope: string; enabled: string[]; selected: string }>
      ).detail
      if (!detail || detail.scope !== scope) return
      setPrefs({ enabled: detail.enabled, selected: detail.selected })
    }
    window.addEventListener(CHANGE_EVENT, onSelect)
    window.addEventListener(OPTIONS_EVENT, onOptions)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onSelect)
      window.removeEventListener(OPTIONS_EVENT, onOptions)
    }
  }, [scope])

  const allMentors = availableMentors()
  const options = prefs.enabled
    .map((id) => mentorForCourse(id))
    .filter((mentor): mentor is CourseMentor => Boolean(mentor))
  const mentor = mentorForCourse(prefs.selected) ?? options[0] ?? allMentors[0]

  const publish = (next: MentorPrefs) => {
    writePrefs(scope, next)
    setPrefs(next)
    window.dispatchEvent(
      new CustomEvent(OPTIONS_EVENT, {
        detail: { scope, enabled: next.enabled, selected: next.selected },
      }),
    )
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { scope, id: next.selected } }),
    )
  }

  const selectMentor = (id: string) => {
    if (!mentorForCourse(id) || !prefs.enabled.includes(id)) return
    writePrefs(scope, { ...prefs, selected: id })
    setPrefs({ ...prefs, selected: id })
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { scope, id } }))
  }

  const addMentor = (id: string) => {
    if (!mentorForCourse(id)) return
    if (prefs.enabled.includes(id)) {
      selectMentor(id)
      return
    }
    publish({ enabled: [...prefs.enabled, id], selected: id })
  }

  const removeMentor = (id: string) => {
    if (!prefs.enabled.includes(id) || prefs.enabled.length <= 1) return false
    const enabled = prefs.enabled.filter((item) => item !== id)
    const selected = prefs.selected === id ? enabled[0] : prefs.selected
    publish({ enabled, selected })
    return true
  }

  const resetMentors = () => {
    const enabled = defaultEnabled()
    const selected = enabled.includes(prefs.selected) ? prefs.selected : enabled[0]
    publish({ enabled, selected })
  }

  return {
    mentor,
    selectMentor,
    options,
    allMentors,
    enabledIds: prefs.enabled,
    addMentor,
    removeMentor,
    resetMentors,
  }
}
