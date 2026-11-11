/**
 * Authoring a Course and reading it back.
 *
 * Every write takes the Academy the caller was already resolved to
 * (`academyForStaff`), and every lookup of an existing Course, Section or
 * Lesson is made inside that Academy, so an id from another Academy finds
 * nothing.
 */

import type { AcademyRow } from './academies'
import type { Outline, OutlineLesson, OutlineSection } from './progress'
import { db } from '@stacksjs/database'
import { buildOutline, slugFrom } from './progress'

export interface CourseRow {
  id: number
  team_id: number
  academy_id: number
  title: string
  slug: string
  summary: string | null
  status: string
  published_at: string | null
}

const courseColumns = ['id', 'team_id', 'academy_id', 'title', 'slug', 'summary', 'status', 'published_at'] as const

export class CourseError extends Error {}

function now(): string {
  return new Date().toISOString()
}

export async function createCourse(academy: AcademyRow, input: { title: string, summary?: string }): Promise<CourseRow> {
  const title = input.title.trim()
  if (title.length < 2)
    throw new CourseError('A course needs a title.')

  const base = slugFrom(title) || 'course'
  const slug = await freeCourseSlug(academy.id, base)
  const summary = input.summary?.trim() || null

  const row = await db.insertInto('courses').values({
    team_id: academy.team_id,
    academy_id: academy.id,
    title,
    slug,
    summary,
    status: 'draft',
    uuid: crypto.randomUUID(),
  }).returning(['id']).executeTakeFirst() as { id: number }

  return { id: row.id, team_id: academy.team_id, academy_id: academy.id, title, slug, summary, status: 'draft', published_at: null }
}

/** `intro`, then `intro-2`, `intro-3`: unique inside the Academy. */
async function freeCourseSlug(academyId: number, base: string): Promise<string> {
  const rows = await db.selectFrom('courses').select(['slug']).where('academy_id', '=', academyId).where('slug', 'like', `${base}%`).execute() as { slug: string }[]
  const taken = new Set(rows.map(row => row.slug))
  if (!taken.has(base))
    return base

  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function courseInAcademy(academy: AcademyRow, courseId: number): Promise<CourseRow | null> {
  const row = await db.selectFrom('courses').select([...courseColumns]).where('id', '=', courseId).where('academy_id', '=', academy.id).where('deleted_at', 'is', null).executeTakeFirst() as CourseRow | undefined
  return row ?? null
}

export async function coursesInAcademy(academy: AcademyRow): Promise<CourseRow[]> {
  return await db.selectFrom('courses').select([...courseColumns]).where('academy_id', '=', academy.id).where('deleted_at', 'is', null).orderBy('id', 'desc').execute() as CourseRow[]
}

async function nextPosition(table: 'course_sections' | 'lessons', column: 'course_id' | 'course_section_id', id: number): Promise<number> {
  const rows = await db.selectFrom(table).select(['position']).where(column, '=', id).execute() as { position: number }[]
  return rows.reduce((max, row) => Math.max(max, row.position + 1), 0)
}

export async function addSection(course: CourseRow, input: { title: string }): Promise<OutlineSection> {
  const title = input.title.trim()
  if (!title)
    throw new CourseError('A section needs a title.')

  const position = await nextPosition('course_sections', 'course_id', course.id)
  const row = await db.insertInto('course_sections').values({ team_id: course.team_id, course_id: course.id, title, position }).returning(['id']).executeTakeFirst() as { id: number }

  return { id: row.id, title, position }
}

export const lessonKinds = ['video', 'reading'] as const
export type LessonKind = typeof lessonKinds[number]

export async function addLesson(course: CourseRow, input: { sectionId: number, title: string, kind?: string, body?: string, videoUrl?: string, durationSeconds?: number }): Promise<OutlineLesson> {
  const title = input.title.trim()
  if (!title)
    throw new CourseError('A lesson needs a title.')

  const kind = (input.kind ?? 'reading') as LessonKind
  if (!lessonKinds.includes(kind))
    throw new CourseError('That lesson type is not supported yet.')

  // The Section must be this Course's: a Section id from elsewhere is refused.
  const section = await db.selectFrom('course_sections').select(['id']).where('id', '=', input.sectionId).where('course_id', '=', course.id).executeTakeFirst()
  if (!section)
    throw new CourseError('That section is not part of this course.')

  const videoUrl = input.videoUrl?.trim() || null
  if (kind === 'video' && !videoUrl)
    throw new CourseError('A video lesson needs a video.')
  if (videoUrl && !/^https:\/\//.test(videoUrl))
    throw new CourseError('A video link must start with https://')

  const durationSeconds = Math.max(0, Math.round(Number(input.durationSeconds) || 0))
  const position = await nextPosition('lessons', 'course_section_id', input.sectionId)

  const row = await db.insertInto('lessons').values({
    team_id: course.team_id,
    course_id: course.id,
    course_section_id: input.sectionId,
    title,
    kind,
    body: input.body?.trim() || null,
    video_url: videoUrl,
    duration_seconds: durationSeconds,
    position,
    uuid: crypto.randomUUID(),
  }).returning(['id']).executeTakeFirst() as { id: number }

  return { id: row.id, course_section_id: input.sectionId, title, kind, duration_seconds: durationSeconds, position }
}

/** The Course's Sections and Lessons in teaching order. */
export async function outlineOf(courseId: number): Promise<Outline> {
  const sections = await db.selectFrom('course_sections').select(['id', 'title', 'position']).where('course_id', '=', courseId).execute() as OutlineSection[]
  const lessons = await db.selectFrom('lessons').select(['id', 'course_section_id', 'title', 'kind', 'duration_seconds', 'position']).where('course_id', '=', courseId).execute() as OutlineLesson[]

  return buildOutline(sections, lessons)
}

/**
 * Publish a Course. Refused while it has nothing to teach: a published Course
 * with no Lessons is one a Learner can enroll in and never complete.
 */
export async function publishCourse(course: CourseRow): Promise<CourseRow> {
  const outline = await outlineOf(course.id)
  if (outline.lessonIds.length === 0)
    throw new CourseError('Add at least one lesson before publishing.')

  if (course.status === 'published')
    return course

  const publishedAt = now()
  await db.updateTable('courses').set({ status: 'published', published_at: publishedAt, updated_at: publishedAt }).where('id', '=', course.id).execute()

  return { ...course, status: 'published', published_at: publishedAt }
}

export async function unpublishCourse(course: CourseRow): Promise<CourseRow> {
  await db.updateTable('courses').set({ status: 'draft', updated_at: now() }).where('id', '=', course.id).execute()
  return { ...course, status: 'draft' }
}

/** What Learners can see: published Courses only. */
export async function publishedCourses(academyId: number): Promise<CourseRow[]> {
  return await db.selectFrom('courses').select([...courseColumns]).where('academy_id', '=', academyId).where('status', '=', 'published').where('deleted_at', 'is', null).orderBy('published_at', 'desc').execute() as CourseRow[]
}

export async function publishedCourse(academyId: number, slug: string): Promise<CourseRow | null> {
  const row = await db.selectFrom('courses').select([...courseColumns]).where('academy_id', '=', academyId).where('slug', '=', slug).where('status', '=', 'published').where('deleted_at', 'is', null).executeTakeFirst() as CourseRow | undefined
  return row ?? null
}
