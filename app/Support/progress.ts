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
