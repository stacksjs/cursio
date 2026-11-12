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
import { buildOutline, isPermutation, slugFrom } from './progress'

export interface CourseRow {
  id: number
  team_id: number
  academy_id: number
  title: string
  slug: string
  summary: string | null
  status: string
  progression: 'open' | 'linear'
  level: 'beginner' | 'intermediate' | 'advanced' | null
  topic: string | null
  published_at: string | null
}

export const courseLevels = ['beginner', 'intermediate', 'advanced'] as const

const courseColumns = ['id', 'team_id', 'academy_id', 'title', 'slug', 'summary', 'status', 'progression', 'level', 'topic', 'published_at'] as const

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

  return { id: row.id, team_id: academy.team_id, academy_id: academy.id, title, slug, summary, status: 'draft', progression: 'open', level: null, topic: null, published_at: null }
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

export const lessonKinds = ['video', 'reading', 'quiz', 'assignment'] as const

/**
 * Kinds a Learner completes by earning it (passing a Quiz, having an Assignment
 * marked as passed) rather than by pressing a button. Each has a row of its own
 * made with the Lesson, so the kind is fixed at creation.
 */
export const earnedKinds: readonly string[] = ['quiz', 'assignment']
export type LessonKind = typeof lessonKinds[number]

export async function addLesson(course: CourseRow, input: { sectionId: number, title: string, kind?: string, body?: string, videoUrl?: string, durationSeconds?: number, unlockAfterDays?: number | null, isPreview?: boolean }): Promise<OutlineLesson> {
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
    unlock_after_days: unlockDays(input.unlockAfterDays),
    is_preview: !earnedKinds.includes(kind) && Boolean(input.isPreview),
    position,
    uuid: crypto.randomUUID(),
  }).returning(['id']).executeTakeFirst() as { id: number }

  // A quiz Lesson always has its Quiz: the two are created together so there
  // is never a quiz Lesson with nothing behind it.
  if (kind === 'quiz')
    await db.insertInto('quizzes').values({ team_id: course.team_id, course_id: course.id, lesson_id: row.id, uuid: crypto.randomUUID() }).execute()
  if (kind === 'assignment')
    await db.insertInto('assignments').values({ team_id: course.team_id, course_id: course.id, lesson_id: row.id, uuid: crypto.randomUUID() }).execute()

  return { id: row.id, course_section_id: input.sectionId, title, kind, duration_seconds: durationSeconds, position, unlock_after_days: unlockDays(input.unlockAfterDays), is_preview: !earnedKinds.includes(kind) && Boolean(input.isPreview) }
}

/** The Course's Sections and Lessons in teaching order. */
export async function outlineOf(courseId: number): Promise<Outline> {
  const sections = await db.selectFrom('course_sections').select(['id', 'title', 'position']).where('course_id', '=', courseId).execute() as OutlineSection[]
  const lessons = await db.selectFrom('lessons').select(['id', 'course_section_id', 'title', 'kind', 'duration_seconds', 'position', 'unlock_after_days', 'is_preview']).where('course_id', '=', courseId).execute() as unknown as OutlineLesson[]

  return buildOutline(sections, lessons.map(lesson => ({ ...lesson, is_preview: Boolean(lesson.is_preview) })))
}

/**
 * Publish a Course. Refused while it has nothing to teach: a published Course
 * with no Lessons is one a Learner can enroll in and never complete.
 */
export async function publishCourse(course: CourseRow): Promise<CourseRow> {
  const outline = await outlineOf(course.id)
  if (outline.lessonIds.length === 0)
    throw new CourseError('Add at least one lesson before publishing.')

  // A Quiz with no questions is a Lesson nobody can complete.
  const quizzes = await db.selectFrom('quizzes').select(['id', 'lesson_id', 'question_bank_id', 'pool_size']).where('course_id', '=', course.id).execute() as { id: number, lesson_id: number, question_bank_id: number | null, pool_size: number }[]
  for (const quiz of quizzes) {
    const question = await db.selectFrom('questions').select(['id']).where('quiz_id', '=', quiz.id).executeTakeFirst()
      // Questions drawn from a bank count: the Quiz need not have its own.
      ?? (quiz.question_bank_id && quiz.pool_size > 0 ? await db.selectFrom('questions').select(['id']).where('question_bank_id', '=', quiz.question_bank_id).executeTakeFirst() : undefined)
    if (!question) {
      const title = outline.sections.flatMap(section => section.lessons).find(lesson => lesson.id === quiz.lesson_id)?.title ?? 'A quiz'
      throw new CourseError(`"${title}" has no questions yet. Add one before publishing.`)
    }
  }

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

/** Whole days, 0 to ten years; anything else means "no drip". */
function unlockDays(value: unknown): number | null {
  const days = Math.round(Number(value))
  return Number.isFinite(days) && days > 0 && days <= 3650 ? days : null
}

export async function updateCourse(course: CourseRow, input: { title?: string, summary?: string, progression?: string, level?: string, topic?: string }): Promise<CourseRow> {
  const next = { ...course }

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (title.length < 2)
      throw new CourseError('A course needs a title.')
    next.title = title
  }
  if (input.summary !== undefined)
    next.summary = input.summary.trim() || null
  if (input.progression !== undefined) {
    if (input.progression !== 'open' && input.progression !== 'linear')
      throw new CourseError('Progression is either open or linear.')
    next.progression = input.progression
  }

  if (input.level !== undefined) {
    if (input.level !== '' && !courseLevels.includes(input.level as typeof courseLevels[number]))
      throw new CourseError('The level is beginner, intermediate or advanced.')
    next.level = (input.level || null) as CourseRow['level']
  }
  if (input.topic !== undefined)
    // A topic is a label and a filter key: plain words only.
    next.topic = input.topic.replace(/[^\p{L}\p{N} .+#&-]/gu, '').trim().slice(0, 40) || null

  // The slug does not follow the title: a published link must keep working.
  await db.updateTable('courses').set({ title: next.title, summary: next.summary, progression: next.progression, level: next.level, topic: next.topic, updated_at: now() }).where('id', '=', course.id).execute()
  return next
}

export interface StudioLesson extends OutlineLesson {
  body: string | null
  video_url: string | null
}

/** Everything about a Course's Lessons, for the people who edit them. */
export async function lessonsForStudio(courseId: number): Promise<StudioLesson[]> {
  const rows = await db.selectFrom('lessons').select(['id', 'course_section_id', 'title', 'kind', 'body', 'video_url', 'duration_seconds', 'position', 'unlock_after_days', 'is_preview']).where('course_id', '=', courseId).execute() as unknown as StudioLesson[]
  return rows.map(row => ({ ...row, is_preview: Boolean(row.is_preview) }))
}

async function sectionOf(course: CourseRow, sectionId: number): Promise<{ id: number }> {
  const section = await db.selectFrom('course_sections').select(['id']).where('id', '=', sectionId).where('course_id', '=', course.id).executeTakeFirst() as { id: number } | undefined
  if (!section)
    throw new CourseError('That section is not part of this course.')
  return section
}

async function lessonOf(course: CourseRow, lessonId: number): Promise<StudioLesson> {
  const lesson = await db.selectFrom('lessons').select(['id', 'course_section_id', 'title', 'kind', 'body', 'video_url', 'duration_seconds', 'position', 'unlock_after_days', 'is_preview']).where('id', '=', lessonId).where('course_id', '=', course.id).executeTakeFirst() as unknown as StudioLesson | undefined
  if (!lesson)
    throw new CourseError('That lesson is not part of this course.')
  return { ...lesson, is_preview: Boolean(lesson.is_preview) }
}

export async function renameSection(course: CourseRow, sectionId: number, title: string): Promise<void> {
  await sectionOf(course, sectionId)
  if (!title.trim())
    throw new CourseError('A section needs a title.')
  await db.updateTable('course_sections').set({ title: title.trim(), updated_at: now() }).where('id', '=', sectionId).execute()
}

export async function updateLesson(course: CourseRow, lessonId: number, input: { title?: string, kind?: string, body?: string, videoUrl?: string, durationSeconds?: number, unlockAfterDays?: number | null, isPreview?: boolean }): Promise<StudioLesson> {
  const lesson = await lessonOf(course, lessonId)
  const title = input.title !== undefined ? input.title.trim() : lesson.title
  const kind = (input.kind ?? lesson.kind) as LessonKind
  const body = input.body !== undefined ? (input.body.trim() || null) : lesson.body
  const videoUrl = input.videoUrl !== undefined ? (input.videoUrl.trim() || null) : lesson.video_url

  if (!title)
    throw new CourseError('A lesson needs a title.')
  if (!lessonKinds.includes(kind))
    throw new CourseError('That lesson type is not supported yet.')
  // The Quiz row is made with the Lesson, so the type is fixed at creation.
  if (kind !== lesson.kind && (earnedKinds.includes(kind) || earnedKinds.includes(lesson.kind)))
    throw new CourseError('A quiz or an assignment cannot become another lesson type, or the other way round. Add a new lesson instead.')
  if (kind === 'video' && !videoUrl)
    throw new CourseError('A video lesson needs a video.')
  if (videoUrl && !/^https:\/\//.test(videoUrl))
    throw new CourseError('A video link must start with https://')

  const next: StudioLesson = {
    ...lesson,
    title,
    kind,
    body,
    video_url: videoUrl,
    duration_seconds: input.durationSeconds !== undefined ? Math.max(0, Math.round(Number(input.durationSeconds) || 0)) : lesson.duration_seconds,
    unlock_after_days: input.unlockAfterDays !== undefined ? unlockDays(input.unlockAfterDays) : (lesson.unlock_after_days ?? null),
    is_preview: !earnedKinds.includes(kind) && Boolean(input.isPreview !== undefined ? input.isPreview : lesson.is_preview),
  }

  await db.updateTable('lessons').set({
    title: next.title,
    kind,
    body: next.body,
    video_url: next.video_url,
    duration_seconds: next.duration_seconds,
    unlock_after_days: next.unlock_after_days,
    is_preview: next.is_preview,
    updated_at: now(),
  }).where('id', '=', lessonId).execute()

  return next
}

/**
 * Remove a Lesson. Learners' progress on it goes with it, and their percent is
 * then measured against the Lessons that remain.
 */
export async function deleteLesson(course: CourseRow, lessonId: number): Promise<void> {
  await lessonOf(course, lessonId)
  await deleteQuizzesOf([lessonId])
  await deleteAssignmentsOf([lessonId])
  await db.deleteFrom('lesson_progress').where('lesson_id', '=', lessonId).execute()
  await db.deleteFrom('lessons').where('id', '=', lessonId).execute()
}

/**
 * Remove the Quizzes behind these Lessons with everything under them. Done by
 * hand, leaf first, rather than left to the foreign keys: not every driver
 * this runs on enforces a cascade.
 */
async function deleteQuizzesOf(lessonIds: number[]): Promise<void> {
  const quizzes = await db.selectFrom('quizzes').select(['id']).where('lesson_id', 'in', lessonIds).execute() as { id: number }[]
  if (quizzes.length === 0)
    return
  const quizIds = quizzes.map(row => row.id)

  const attempts = await db.selectFrom('quiz_attempts').select(['id']).where('quiz_id', 'in', quizIds).execute() as { id: number }[]
  if (attempts.length > 0) {
    await db.deleteFrom('attempt_answers').where('quiz_attempt_id', 'in', attempts.map(row => row.id)).execute()
    await db.deleteFrom('quiz_attempts').where('quiz_id', 'in', quizIds).execute()
  }
  const questions = await db.selectFrom('questions').select(['id']).where('quiz_id', 'in', quizIds).execute() as { id: number }[]
  if (questions.length > 0) {
    await db.deleteFrom('question_options').where('question_id', 'in', questions.map(row => row.id)).execute()
    await db.deleteFrom('questions').where('quiz_id', 'in', quizIds).execute()
  }
  await db.deleteFrom('quizzes').where('id', 'in', quizIds).execute()
}

/** The same for Assignments: their Submissions go first. */
async function deleteAssignmentsOf(lessonIds: number[]): Promise<void> {
  const assignments = await db.selectFrom('assignments').select(['id']).where('lesson_id', 'in', lessonIds).execute() as { id: number }[]
  if (assignments.length === 0)
    return
  const ids = assignments.map(row => row.id)
  await db.deleteFrom('submissions').where('assignment_id', 'in', ids).execute()
  await db.deleteFrom('assignments').where('id', 'in', ids).execute()
}

/** Remove a Section and every Lesson in it. */
export async function deleteSection(course: CourseRow, sectionId: number): Promise<void> {
  await sectionOf(course, sectionId)
  const lessons = await db.selectFrom('lessons').select(['id']).where('course_section_id', '=', sectionId).execute() as { id: number }[]
  if (lessons.length > 0) {
    await deleteQuizzesOf(lessons.map(row => row.id))
    await deleteAssignmentsOf(lessons.map(row => row.id))
    await db.deleteFrom('lesson_progress').where('lesson_id', 'in', lessons.map(row => row.id)).execute()
    await db.deleteFrom('lessons').where('course_section_id', '=', sectionId).execute()
  }
  await db.deleteFrom('course_sections').where('id', '=', sectionId).execute()
}

/** Put a Course's Sections in a new order. The ids must be exactly its Sections. */
export async function reorderSections(course: CourseRow, ids: number[]): Promise<void> {
  const rows = await db.selectFrom('course_sections').select(['id']).where('course_id', '=', course.id).execute() as { id: number }[]
  if (!isPermutation(rows.map(row => row.id), ids))
    throw new CourseError('That is not the full list of this course\'s sections.')

  for (const [position, id] of ids.entries())
    await db.updateTable('course_sections').set({ position }).where('id', '=', id).execute()
}

/** Put one Section's Lessons in a new order. The ids must be exactly its Lessons. */
export async function reorderLessons(course: CourseRow, sectionId: number, ids: number[]): Promise<void> {
  await sectionOf(course, sectionId)
  const rows = await db.selectFrom('lessons').select(['id']).where('course_section_id', '=', sectionId).execute() as { id: number }[]
  if (!isPermutation(rows.map(row => row.id), ids))
    throw new CourseError('That is not the full list of this section\'s lessons.')

  for (const [position, id] of ids.entries())
    await db.updateTable('lessons').set({ position }).where('id', '=', id).execute()
}

export interface CatalogEntry {
  title: string
  slug: string
  summary: string | null
  level: CourseRow['level']
  topic: string | null
  lessons: number
  /** Total running time of its Lessons, in seconds. */
  seconds: number
  /** It has at least one Lesson anyone may open. */
  hasPreview: boolean
}

/** The published Courses of an Academy with what a catalog card shows. */
export async function catalogOf(academyId: number): Promise<CatalogEntry[]> {
  const courses = await publishedCourses(academyId)
  if (courses.length === 0)
    return []

  const lessons = await db.selectFrom('lessons').select(['course_id', 'duration_seconds', 'is_preview']).where('course_id', 'in', courses.map(course => course.id)).execute() as { course_id: number, duration_seconds: number, is_preview: number | boolean }[]

  return courses.map((course) => {
    const own = lessons.filter(lesson => lesson.course_id === course.id)
    return {
      title: course.title,
      slug: course.slug,
      summary: course.summary,
      level: course.level,
      topic: course.topic,
      lessons: own.length,
      seconds: own.reduce((sum, lesson) => sum + lesson.duration_seconds, 0),
      hasPreview: own.some(lesson => Boolean(lesson.is_preview)),
    }
  })
}

export { runtime } from '@cursio/academy'
