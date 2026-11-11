/**
 * Enrolling in a Course and completing its Lessons.
 *
 * Both writes are idempotent by construction: each has a unique index behind
 * it (one Enrollment per Learner per Course, one progress row per Enrollment
 * per Lesson), and a second attempt that loses that race is treated as the
 * first one having succeeded.
 */

import type { CourseRow } from './courses'
import type { CourseProgress, LessonAccess } from './progress'
import { db } from '@stacksjs/database'
import { isUniqueViolation } from '@stacksjs/orm'
import { outlineOf } from './courses'
import { courseProgress, lessonAccess } from './progress'

export interface EnrollmentRow {
  id: number
  user_id: number
  course_id: number
  status: string
  source: string
  completed_at: string | null
  created_at: string
}

const enrollmentColumns = ['id', 'user_id', 'course_id', 'status', 'source', 'completed_at', 'created_at'] as const

export class EnrollmentError extends Error {}

export async function enrollmentOf(userId: number, courseId: number): Promise<EnrollmentRow | null> {
  const row = await db.selectFrom('enrollments').select([...enrollmentColumns]).where('user_id', '=', userId).where('course_id', '=', courseId).executeTakeFirst() as EnrollmentRow | undefined
  return row ?? null
}

/**
 * Enroll a Learner in a published Course. Free for now: when Offers arrive,
 * a paid Course will be refused here and enrolled by checkout instead.
 */
export async function enroll(userId: number, course: CourseRow, source: 'free' | 'manual' = 'free'): Promise<EnrollmentRow> {
  if (course.status !== 'published')
    throw new EnrollmentError('This course is not open for enrollment.')

  const existing = await enrollmentOf(userId, course.id)
  if (existing) {
    if (existing.status === 'revoked')
      throw new EnrollmentError('Your access to this course was removed.')
    return existing
  }

  try {
    await db.insertInto('enrollments').values({ user_id: userId, course_id: course.id, status: 'active', source, uuid: crypto.randomUUID() }).execute()
  }
  catch (error) {
    if (!isUniqueViolation(error))
      throw error
  }

  const row = await enrollmentOf(userId, course.id)
  if (!row)
    throw new EnrollmentError('Enrollment could not be saved.')
  return row
}

async function completedLessonIds(enrollmentId: number): Promise<number[]> {
  const rows = await db.selectFrom('lesson_progress').select(['lesson_id']).where('enrollment_id', '=', enrollmentId).where('completed_at', 'is not', null).execute() as { lesson_id: number }[]
  return rows.map(row => row.lesson_id)
}

/** SQLite stores `2026-11-11 21:00:00` in UTC with no zone; read it as UTC. */
function utc(stamp: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : `${stamp.replace(' ', 'T')}Z`)
}

export type LearnerProgress = CourseProgress & {
  completedIds: number[]
  /** Lessons the Learner cannot open yet, by id. Open Lessons are left out. */
  locked: Record<number, LessonAccess>
}

export async function progressOf(enrollment: EnrollmentRow, at: Date = new Date()): Promise<LearnerProgress> {
  const outline = await outlineOf(enrollment.course_id)
  const completedIds = await completedLessonIds(enrollment.id)
  const course = await db.selectFrom('courses').select(['progression']).where('id', '=', enrollment.course_id).executeTakeFirst() as { progression: string } | undefined

  const access = lessonAccess({
    lessons: outline.sections.flatMap(section => section.lessons),
    completedIds,
    progression: course?.progression ?? 'open',
    enrolledAt: utc(enrollment.created_at),
    now: at,
  })
  const locked: Record<number, LessonAccess> = {}
  for (const [id, state] of access) {
    if (!state.open)
      locked[id] = state
  }

  return { ...courseProgress(outline.lessonIds, completedIds), completedIds, locked }
}

function closedMessage(access: LessonAccess): string {
  return access.reason === 'drip'
    ? 'This lesson is not open yet.'
    : 'Complete the earlier lessons first.'
}

/**
 * Mark a Lesson complete for a Learner. The Lesson must belong to a Course the
 * Learner holds an active Enrollment in. When it was the last one, the
 * Enrollment is completed in the same call.
 */
export async function completeLesson(userId: number, lessonId: number, at: Date = new Date()): Promise<{ enrollment: EnrollmentRow, progress: LearnerProgress }> {
  const lesson = await db.selectFrom('lessons').select(['id', 'course_id']).where('id', '=', lessonId).executeTakeFirst() as { id: number, course_id: number } | undefined
  const enrollment = lesson ? await enrollmentOf(userId, lesson.course_id) : null

  // One answer for "no such lesson" and "not yours": which Lessons exist is not
  // something a stranger gets to probe.
  if (!lesson || !enrollment || enrollment.status === 'revoked')
    throw new EnrollmentError('You are not enrolled in this course.')

  const closed = (await progressOf(enrollment, at)).locked[lesson.id]
  if (closed)
    throw new EnrollmentError(closedMessage(closed))

  const stamp = at.toISOString()
  // Looked up first so that completing a Lesson twice, which is ordinary, does
  // not go through a failed insert and an error in the logs. The catch stays
  // for two requests racing past this check.
  const already = await db.selectFrom('lesson_progress').select(['id']).where('enrollment_id', '=', enrollment.id).where('lesson_id', '=', lesson.id).executeTakeFirst()
  if (!already) {
    try {
      await db.insertInto('lesson_progress').values({ user_id: userId, enrollment_id: enrollment.id, lesson_id: lesson.id, completed_at: stamp }).execute()
    }
    catch (error) {
      if (!isUniqueViolation(error))
        throw error
    }
  }

  const progress = await progressOf(enrollment, at)
  if (progress.isComplete && enrollment.status !== 'completed') {
    await db.updateTable('enrollments').set({ status: 'completed', completed_at: stamp, updated_at: stamp }).where('id', '=', enrollment.id).execute()
    enrollment.status = 'completed'
    enrollment.completed_at = stamp
  }

  return { enrollment, progress }
}

export interface LessonContent {
  id: number
  course_id: number
  title: string
  kind: string
  body: string | null
  video_url: string | null
  duration_seconds: number
  completed: boolean
}

/**
 * A Lesson's content, for a Learner who may open it. Content is the product:
 * it is read only through an Enrollment, never by Lesson id alone.
 */
export async function lessonForLearner(userId: number, lessonId: number, at: Date = new Date()): Promise<LessonContent | null> {
  const lesson = await db.selectFrom('lessons').select(['id', 'course_id', 'title', 'kind', 'body', 'video_url', 'duration_seconds']).where('id', '=', lessonId).executeTakeFirst() as Omit<LessonContent, 'completed'> | undefined
  if (!lesson)
    return null

  const enrollment = await enrollmentOf(userId, lesson.course_id)
  if (!enrollment || enrollment.status === 'revoked')
    return null

  // A Lesson that is not open yet is refused here, not just greyed out in the
  // player: the content is what the rule protects.
  const progress = await progressOf(enrollment, at)
  const closed = progress.locked[lesson.id]
  if (closed)
    throw new EnrollmentError(closedMessage(closed))

  return { ...lesson, completed: progress.completedIds.includes(lesson.id) }
}
