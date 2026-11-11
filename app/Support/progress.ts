/**
 * How far a Learner has got through a Course.
 *
 * Asked from the player, the course page, the studio and (later) reports and
 * certificates, so it is answered once, here, from plain data: the Course's
 * Lessons in teaching order and the ids the Learner has completed. Nothing in
 * this file touches the database.
 */

export interface OutlineSection {
  id: number
  title: string
  position: number
}

export interface OutlineLesson {
  id: number
  course_section_id: number
  title: string
  kind: string
  duration_seconds: number
  position: number
  /** Days after enrollment before the Lesson opens. Null: open from the start. */
  unlock_after_days?: number | null
}

export interface Outline {
  sections: (OutlineSection & { lessons: OutlineLesson[] })[]
  /** Every Lesson in the order a Learner meets it. */
  lessonIds: number[]
}

/**
 * Teaching order: Sections by position, Lessons by position inside their
 * Section, with id as the tiebreak so two rows at the same position always
 * come out the same way round. A Lesson whose Section is gone is left out
 * rather than guessed at.
 */
export function buildOutline(sections: OutlineSection[], lessons: OutlineLesson[]): Outline {
  const ordered = [...sections].sort((a, b) => a.position - b.position || a.id - b.id)
  const result = ordered.map(section => ({
    ...section,
    lessons: lessons
      .filter(lesson => lesson.course_section_id === section.id)
      .sort((a, b) => a.position - b.position || a.id - b.id),
  }))

  return {
    sections: result,
    lessonIds: result.flatMap(section => section.lessons.map(lesson => lesson.id)),
  }
}

export interface CourseProgress {
  total: number
  completed: number
  /** Whole percent, 0 to 100. A Course with no Lessons is 0, never NaN. */
  percent: number
  /** The first Lesson not yet completed, in teaching order. Null when done. */
  nextLessonId: number | null
  isComplete: boolean
}

export function courseProgress(lessonIds: number[], completedIds: Iterable<number>): CourseProgress {
  const done = new Set(completedIds)
  // A completed Lesson that has since been removed from the Course does not
  // count: progress is measured against what the Course teaches now.
  const completed = lessonIds.filter(id => done.has(id)).length
  const total = lessonIds.length
  const nextLessonId = lessonIds.find(id => !done.has(id)) ?? null

  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    nextLessonId,
    isComplete: total > 0 && completed === total,
  }
}

export interface LessonAccess {
  open: boolean
  /** Why it is closed: `drip` (not yet), `sequence` (earlier Lessons first). */
  reason: 'drip' | 'sequence' | null
  /** When a dripped Lesson opens, ISO. */
  opensAt: string | null
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Which Lessons a Learner may open right now.
 *
 * Two independent rules, both of which must allow it:
 *   - Drip: a Lesson with `unlock_after_days` opens that many days after the
 *     Learner enrolled.
 *   - Sequence: in a `linear` Course a Lesson opens once every Lesson before
 *     it, in teaching order, is completed.
 *
 * A Lesson already completed stays open whatever the rules say now: changing a
 * Course must never lock a Learner out of something they have done.
 * When both rules close a Lesson, drip is the reason given, because it is the
 * one the Learner cannot do anything about.
 */
export function lessonAccess(input: {
  lessons: Pick<OutlineLesson, 'id' | 'unlock_after_days'>[]
  completedIds: Iterable<number>
  progression: string
  enrolledAt: Date
  now: Date
}): Map<number, LessonAccess> {
  const done = new Set(input.completedIds)
  const result = new Map<number, LessonAccess>()
  let earlierAllDone = true

  for (const lesson of input.lessons) {
    const days = lesson.unlock_after_days ?? 0
    const opensAt = days > 0 ? new Date(input.enrolledAt.getTime() + days * DAY) : null
    const dripped = opensAt !== null && opensAt.getTime() > input.now.getTime()
    const outOfSequence = input.progression === 'linear' && !earlierAllDone

    if (done.has(lesson.id))
      result.set(lesson.id, { open: true, reason: null, opensAt: null })
    else if (dripped)
      result.set(lesson.id, { open: false, reason: 'drip', opensAt: opensAt.toISOString() })
    else if (outOfSequence)
      result.set(lesson.id, { open: false, reason: 'sequence', opensAt: null })
    else
      result.set(lesson.id, { open: true, reason: null, opensAt: null })

    if (!done.has(lesson.id))
      earlierAllDone = false
  }

  return result
}

/**
 * A new order for a set of ids is valid only if it is the same set: nothing
 * added, nothing dropped, nothing twice. Reordering must never be a way to
 * move or delete a row.
 */
export function isPermutation(current: number[], next: number[]): boolean {
  if (current.length !== next.length || new Set(next).size !== next.length)
    return false
  const have = new Set(current)
  return next.every(id => have.has(id))
}

/** A URL-safe slug from a title: lowercase, hyphenated, no edges. */
export function slugFrom(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '')
}
