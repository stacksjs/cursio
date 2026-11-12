import type { SearchableCourse } from '../../app/Support/search'
import { describe, expect, test } from 'bun:test'
import { forwarded } from '@cursio/academy'
import { searchCourses, searchTerms } from '../../app/Support/search'

/** Search inside one academy: its published courses and their lessons. */

const lesson = (id: number, title: string, preview = false) => ({ id, title, kind: 'video', position: id, duration_seconds: 60, is_preview: preview, course_section_id: 1, unlock_after_days: null })

const courses = [
  {
    title: 'Routing from scratch',
    slug: 'routing',
    summary: 'Define routes and guard them with middleware.',
    topic: 'Routing',
    outline: { lessonIds: [1, 2, 3], sections: [{ id: 1, title: 'One', position: 0, lessons: [lesson(1, 'Your first route', true), lesson(2, 'Route parameters'), lesson(3, 'Middleware')] }] },
  },
  {
    title: 'Data models',
    slug: 'models',
    summary: 'Describe a table once.',
    topic: 'Database',
    outline: { lessonIds: [7, 8], sections: [{ id: 2, title: 'One', position: 0, lessons: [lesson(7, 'Défine a model'), lesson(8, 'Relations and routes')] }] },
  },
] as unknown as SearchableCourse[]

describe('what counts as a query', () => {
  test('a query is words of two letters or more in all, cut to a sane length', () => {
    expect(searchTerms('  Route   Params ')).toEqual(['route', 'params'])
    expect(searchTerms('a')).toEqual([])
    expect(searchTerms('')).toEqual([])
    expect(searchTerms(null)).toEqual([])
    expect(searchTerms('x'.repeat(500))[0]).toHaveLength(80)
    expect(searchTerms('one two three four five six seven eight')).toHaveLength(6)
  })
})

describe('searching courses and lessons', () => {
  test('finds a course by its title, summary or topic, and a lesson by its title', () => {
    const found = searchCourses(courses, 'middleware')
    expect(found.map(item => `${item.kind}:${item.title}`)).toEqual(['lesson:Middleware', 'course:Routing from scratch'])
    expect(searchCourses(courses, 'database').map(item => item.slug)).toEqual(['models'])
  })

  test('a lesson result says which course, which episode, and whether it is free', () => {
    expect(searchCourses(courses, 'first route')[0]).toEqual({ kind: 'lesson', title: 'Your first route', courseTitle: 'Routing from scratch', slug: 'routing', episode: 1, free: true })
    expect(searchCourses(courses, 'relations')[0]).toMatchObject({ slug: 'models', episode: 2, free: false })
  })

  test('every word must match, and a title that starts with the query comes first', () => {
    expect(searchCourses(courses, 'route nonsense')).toEqual([])
    const found = searchCourses(courses, 'rout')
    expect(found[0]).toMatchObject({ kind: 'course', slug: 'routing' })
    expect(found.map(item => item.title)).toContain('Relations and routes')
  })

  test('case and accents do not matter', () => {
    expect(searchCourses(courses, 'DEFINE')[0]?.title).toBe('Défine a model')
    expect(searchCourses(courses, 'définé a')[0]?.title).toBe('Défine a model')
  })

  test('a query that is too short finds nothing, and results are capped', () => {
    expect(searchCourses(courses, 'r')).toEqual([])
    expect(searchCourses(courses, 'ro', 2)).toHaveLength(2)
  })

  test('characters that mean something elsewhere are only text here', () => {
    for (const query of ['%', '_ _', '<script>', '\' OR 1=1 --', '.*'])
      expect(searchCourses(courses, query)).toEqual([])
  })

  test('an app that fronts an academy forwards its search', () => {
    expect(forwarded).toContainEqual(['GET', '/learn/{academy}/search', '/api/learn/{academy}/search'])
  })
})
