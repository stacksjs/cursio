/**
 * Search inside one Academy: its published Courses and the Lessons in them.
 *
 * Only what the public outline already shows is searched (titles, summaries,
 * topics), so a result never reveals more than browsing would. The matching
 * is plain data in, plain data out; the database part only gathers.
 */

import type { Outline } from './progress'
import { outlineOf, publishedCourses } from './courses'

export const SEARCH_MIN = 2
export const SEARCH_MAX = 80
export const SEARCH_LIMIT = 20

export interface SearchableCourse {
  title: string
  slug: string
  summary: string | null
  topic: string | null
  outline: Outline
}

export interface SearchResult {
  kind: 'course' | 'lesson'
  title: string
  /** The Course it belongs to (its own title for a Course). */
  courseTitle: string
  slug: string
  /** A Lesson's place in its Course, counted from 1. Null for a Course. */
  episode: number | null
  /** Anyone may open it without enrolling. */
  free: boolean
}

function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

/** The words to look for, or none when the query is too short to mean anything. */
export function searchTerms(query: unknown): string[] {
  const text = fold(String(query ?? '')).slice(0, SEARCH_MAX).trim()
  if (text.length < SEARCH_MIN)
    return []
  return [...new Set(text.split(/\s+/).filter(Boolean))].slice(0, 6)
}

/**
 * How well a text answers the terms: 0 when a term is missing. A title that
 * starts with the query beats one that merely contains it.
 */
function score(title: string, extra: string, terms: string[]): number {
  const head = fold(title)
  const body = `${head} ${fold(extra)}`
  if (!terms.every(term => body.includes(term)))
    return 0
  let points = 1
  for (const term of terms) {
    if (head.startsWith(term))
      points += 3
    else if (head.includes(term))
      points += 2
  }
  return points
}

export function searchCourses(courses: SearchableCourse[], query: unknown, limit = SEARCH_LIMIT): SearchResult[] {
  const terms = searchTerms(query)
  if (terms.length === 0)
    return []

  const found: (SearchResult & { rank: number })[] = []
  for (const course of courses) {
    const rank = score(course.title, `${course.summary ?? ''} ${course.topic ?? ''}`, terms)
    if (rank > 0) {
      // A Course outranks a Lesson with the same match: it is the wider answer.
      found.push({ kind: 'course', title: course.title, courseTitle: course.title, slug: course.slug, episode: null, free: false, rank: rank + 1 })
    }
    const lessons = course.outline.sections.flatMap(section => section.lessons)
    for (const lesson of lessons) {
      const lessonRank = score(lesson.title, '', terms)
      if (lessonRank > 0) {
        found.push({
          kind: 'lesson',
          title: lesson.title,
          courseTitle: course.title,
          slug: course.slug,
          episode: course.outline.lessonIds.indexOf(lesson.id) + 1,
          free: Boolean(lesson.is_preview),
          rank: lessonRank,
        })
      }
    }
  }

  return found
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
    .slice(0, Math.max(1, limit))
    .map(item => ({ kind: item.kind, title: item.title, courseTitle: item.courseTitle, slug: item.slug, episode: item.episode, free: item.free }))
}

export async function searchAcademy(academyId: number, query: unknown): Promise<SearchResult[]> {
  if (searchTerms(query).length === 0)
    return []
  const courses = await publishedCourses(academyId)
  const searchable: SearchableCourse[] = []
  for (const course of courses)
    searchable.push({ title: course.title, slug: course.slug, summary: course.summary, topic: course.topic, outline: await outlineOf(course.id) })
  return searchCourses(searchable, query)
}
