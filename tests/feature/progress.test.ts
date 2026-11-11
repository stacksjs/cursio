import { describe, expect, test } from 'bun:test'
import { buildOutline, courseProgress, isPermutation, lessonAccess, slugFrom } from '../../app/Support/progress'

const sections = [
  { id: 2, title: 'Second', position: 1 },
  { id: 1, title: 'First', position: 0 },
]

function lesson(id: number, sectionId: number, position: number) {
  return { id, course_section_id: sectionId, title: `Lesson ${id}`, kind: 'reading', duration_seconds: 60, position }
}

describe('teaching order', () => {
  test('sections by position, lessons by position inside their section', () => {
    const outline = buildOutline(sections, [lesson(10, 2, 0), lesson(11, 1, 1), lesson(12, 1, 0)])

    expect(outline.sections.map(section => section.title)).toEqual(['First', 'Second'])
    expect(outline.lessonIds).toEqual([12, 11, 10])
  })

  test('two lessons at the same position always come out the same way round', () => {
    const outline = buildOutline(sections, [lesson(21, 1, 0), lesson(20, 1, 0)])

    expect(outline.lessonIds).toEqual([20, 21])
  })

  test('a lesson whose section is gone is left out', () => {
    const outline = buildOutline(sections, [lesson(30, 99, 0), lesson(31, 1, 0)])

    expect(outline.lessonIds).toEqual([31])
  })
})

describe('course progress', () => {
  test('counts completed lessons and points at the next one', () => {
    const progress = courseProgress([1, 2, 3], [1])

    expect(progress).toEqual({ total: 3, completed: 1, percent: 33, nextLessonId: 2, isComplete: false })
  })

  test('the next lesson is the first gap, not the one after the last completed', () => {
    expect(courseProgress([1, 2, 3], [1, 3]).nextLessonId).toBe(2)
  })

  test('complete when every lesson is done', () => {
    const progress = courseProgress([1, 2], [2, 1])

    expect(progress.isComplete).toBe(true)
    expect(progress.percent).toBe(100)
    expect(progress.nextLessonId).toBeNull()
  })

  test('a course with no lessons is zero percent and never complete', () => {
    const progress = courseProgress([], [])

    expect(progress.percent).toBe(0)
    expect(progress.isComplete).toBe(false)
  })

  test('a completed lesson that left the course no longer counts', () => {
    const progress = courseProgress([1, 2], [1, 99])

    expect(progress.completed).toBe(1)
    expect(progress.percent).toBe(50)
  })
})

describe('slugs', () => {
  test('lowercase, hyphenated, no accents, no edges', () => {
    expect(slugFrom('  Intro to Café Économie!  ')).toBe('intro-to-cafe-economie')
  })

  test('nothing usable gives an empty slug for the caller to replace', () => {
    expect(slugFrom('!!!')).toBe('')
  })
})

describe('which lessons are open', () => {
  const enrolledAt = new Date('2026-01-01T00:00:00Z')
  const day = (n: number) => new Date(enrolledAt.getTime() + n * 24 * 60 * 60 * 1000)
  const lessons = [
    { id: 1, unlock_after_days: null },
    { id: 2, unlock_after_days: 7 },
    { id: 3, unlock_after_days: null },
  ]
  const access = (overrides: Partial<Parameters<typeof lessonAccess>[0]> = {}) =>
    lessonAccess({ lessons, completedIds: [], progression: 'open', enrolledAt, now: day(0), ...overrides })

  test('an open course opens everything that is not dripped', () => {
    const result = access()

    expect(result.get(1)?.open).toBe(true)
    expect(result.get(3)?.open).toBe(true)
  })

  test('a dripped lesson is closed until its day, and says when it opens', () => {
    expect(access({ now: day(6) }).get(2)).toEqual({ open: false, reason: 'drip', opensAt: day(7).toISOString() })
    expect(access({ now: day(7) }).get(2)?.open).toBe(true)
  })

  test('a linear course opens a lesson only after everything before it', () => {
    const result = access({ progression: 'linear', now: day(30) })

    expect(result.get(1)?.open).toBe(true)
    expect(result.get(2)).toEqual({ open: false, reason: 'sequence', opensAt: null })
    expect(access({ progression: 'linear', now: day(30), completedIds: [1] }).get(2)?.open).toBe(true)
    expect(access({ progression: 'linear', now: day(30), completedIds: [1] }).get(3)?.open).toBe(false)
  })

  test('when both rules close a lesson, drip is the reason given', () => {
    expect(access({ progression: 'linear' }).get(2)?.reason).toBe('drip')
  })

  test('a completed lesson stays open whatever the rules say now', () => {
    const result = access({ progression: 'linear', completedIds: [2, 3] })

    expect(result.get(2)?.open).toBe(true)
    expect(result.get(3)?.open).toBe(true)
  })
})

describe('reordering', () => {
  test('only the same set of ids is a valid new order', () => {
    expect(isPermutation([1, 2, 3], [3, 1, 2])).toBe(true)
    expect(isPermutation([1, 2, 3], [1, 2])).toBe(false)
    expect(isPermutation([1, 2, 3], [1, 2, 2])).toBe(false)
    expect(isPermutation([1, 2, 3], [1, 2, 4])).toBe(false)
  })
})
