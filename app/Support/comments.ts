/**
 * Comments under a Lesson.
 *
 * Kept in the framework's own `commentables` table (the one behind its
 * commentable trait), with a Lesson as the thing commented on, so they show up
 * wherever the framework lists comments. Only people who can open the Lesson
 * can read or write here: an enrolled Learner for whom it is open, or the
 * Academy's staff.
 */

import { db } from '@stacksjs/database'
import { academyForStaff } from './academies'
import { enrollmentOf, progressOf } from './enrollment'

export class CommentError extends Error {}

export const COMMENT_MAX = 2000
/** How many comments one person may post on one Lesson in ten minutes. */
export const COMMENT_BURST = 5
const BURST_WINDOW_MS = 10 * 60 * 1000
const OWNER = 'Lesson'

/** The text of a comment as it is kept, or a refusal. */
export function commentBody(value: unknown): string {
  // Line endings are normalised and runs of blank lines collapsed: a comment
  // is a few paragraphs, not a way to push the page down.
  const body = String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (body === '')
    throw new CommentError('Write something first.')
  if (body.length > COMMENT_MAX)
    throw new CommentError(`A comment can be up to ${COMMENT_MAX} characters.`)
  return body
}

/**
 * The name shown beside a comment: first name and the initial of the last, so
 * a Learner is recognisable to their classmates without their full name being
 * printed for everyone enrolled.
 */
export function displayName(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first)
    return 'Learner'
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
}

/** May this many recent comments be followed by another? */
export function withinBurst(recent: number): boolean {
  return recent < COMMENT_BURST
}

export interface LessonComment {
  id: number
  body: string
  author: string
  /** Written by someone who runs the Academy. */
  staff: boolean
  /** The reader wrote it, or runs the Academy: they may remove it. */
  removable: boolean
  createdAt: string
}

export interface Reader {
  userId: number
  lessonId: number
  academyId: number
  staff: boolean
}

/**
 * Who is asking, and whether they may be here. One answer for "no such
 * lesson" and "not yours", as with Lesson content.
 */
export async function readerOf(userId: number, lessonId: number, at: Date): Promise<Reader> {
  const lesson = await db.selectFrom('lessons').select(['id', 'course_id']).where('id', '=', lessonId).executeTakeFirst() as { id: number, course_id: number } | undefined
  const course = lesson ? await db.selectFrom('courses').select(['id', 'academy_id']).where('id', '=', lesson.course_id).executeTakeFirst() as { id: number, academy_id: number } | undefined : undefined
  if (!lesson || !course)
    throw new CommentError('You are not enrolled in this course.')

  if (await academyForStaff(userId, course.academy_id))
    return { userId, lessonId, academyId: course.academy_id, staff: true }

  const enrollment = await enrollmentOf(userId, course.id)
  if (!enrollment || enrollment.status === 'revoked')
    throw new CommentError('You are not enrolled in this course.')
  if ((await progressOf(enrollment, at)).locked[lessonId])
    throw new CommentError('This lesson is not open to you yet.')
  return { userId, lessonId, academyId: course.academy_id, staff: false }
}

interface CommentRow {
  id: number
  body: string
  user_id: number | null
  created_at: string | null
}

async function listFor(reader: Reader): Promise<LessonComment[]> {
  const rows = await db.selectFrom('commentables').select(['id', 'body', 'user_id', 'created_at']).where('commentables_type', '=', OWNER).where('commentables_id', '=', reader.lessonId).where('status', '=', 'approved').orderBy('id', 'asc').execute() as CommentRow[]
  if (rows.length === 0)
    return []

  const authorIds = [...new Set(rows.map(row => row.user_id).filter((id): id is number => typeof id === 'number'))]
  const users = authorIds.length > 0
    ? await db.selectFrom('users').select(['id', 'name']).where('id', 'in', authorIds).execute() as { id: number, name: string | null }[]
    : []
  const staffIds = new Set<number>()
  for (const id of authorIds) {
    if (await academyForStaff(id, reader.academyId))
      staffIds.add(id)
  }

  return rows.map(row => ({
    id: row.id,
    body: row.body,
    author: displayName(users.find(user => user.id === row.user_id)?.name),
    staff: row.user_id !== null && staffIds.has(row.user_id),
    removable: reader.staff || row.user_id === reader.userId,
    createdAt: row.created_at ?? '',
  }))
}

export async function commentsOf(userId: number, lessonId: number, at: Date = new Date()): Promise<LessonComment[]> {
  return listFor(await readerOf(userId, lessonId, at))
}

export async function addComment(userId: number, lessonId: number, input: { body: unknown }, at: Date = new Date()): Promise<LessonComment[]> {
  const reader = await readerOf(userId, lessonId, at)
  const body = commentBody(input.body)

  const since = new Date(at.getTime() - BURST_WINDOW_MS).toISOString()
  const recent = await db.selectFrom('commentables').select(['id']).where('commentables_type', '=', OWNER).where('commentables_id', '=', lessonId).where('user_id', '=', userId).where('created_at', '>', since).execute() as { id: number }[]
  if (!withinBurst(recent.length))
    throw new CommentError('That is a lot of comments at once. Try again in a few minutes.')

  const stamp = at.toISOString()
  await db.insertInto('commentables').values({
    // The table wants a title; a comment under a Lesson has none of its own.
    title: body.slice(0, 80),
    body,
    // Only people enrolled or on staff get this far, so a comment shows at
    // once. Staff remove what should not stay.
    status: 'approved',
    approved_at: at.getTime(),
    commentables_id: lessonId,
    commentables_type: OWNER,
    user_id: userId,
    is_active: true,
    created_at: stamp,
    updated_at: stamp,
  }).execute()

  return listFor(reader)
}

/**
 * Take a comment down: its author may, and so may the Academy's staff. It is
 * marked rejected rather than deleted, so staff still have a record of what
 * was said.
 */
export async function removeComment(userId: number, commentId: number, at: Date = new Date()): Promise<LessonComment[]> {
  const row = await db.selectFrom('commentables').select(['id', 'user_id', 'commentables_id']).where('id', '=', commentId).where('commentables_type', '=', OWNER).where('status', '=', 'approved').executeTakeFirst() as { id: number, user_id: number | null, commentables_id: number } | undefined
  if (!row)
    throw new CommentError('That comment was not found.')

  const reader = await readerOf(userId, row.commentables_id, at)
  if (!reader.staff && row.user_id !== userId)
    throw new CommentError('That comment was not found.')

  await db.updateTable('commentables').set({ status: 'rejected', rejected_at: at.getTime(), is_active: false, updated_at: at.toISOString() }).where('id', '=', row.id).execute()
  return listFor(reader)
}

/** Remove every comment under these Lessons: called when the Lessons go. */
export async function deleteCommentsOf(lessonIds: number[]): Promise<void> {
  if (lessonIds.length > 0)
    await db.deleteFrom('commentables').where('commentables_type', '=', OWNER).where('commentables_id', 'in', lessonIds).execute()
}
