import { describe, expect, test } from 'bun:test'
import { buildOutline, courseProgress, slugFrom } from '../../app/Support/progress'

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
