/**
 * Notes a Learner keeps on a Lesson, for themselves alone. Every read and
 * write is scoped to the Learner who is asking: there is no way to name
 * someone else's note, and staff have no door here.
 */

import { db } from '@stacksjs/database'
import { CommentError, readerOf } from './comments'

export const NOTE_MAX = 4000
/** How many notes one Learner may keep on one Lesson. */
export const NOTES_PER_LESSON = 100

/** The text of a note as it is kept, or a refusal. */
export function noteBody(value: unknown): string {
  const body = String(value ?? '').replace(/\r\n?/g, '\n').trim()
  if (body === '')
    throw new CommentError('Write something first.')
  if (body.length > NOTE_MAX)
    throw new CommentError(`A note can be up to ${NOTE_MAX} characters.`)
  return body
}

/** A whole second in the video, or null when the note is not about a moment. */
export function notePosition(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null
  const seconds = Math.floor(Number(value))
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : null
}

/** `4:07` or `1:02:09`, for showing where in the video a note was written. */
export function clockOf(seconds: number | null): string {
  if (seconds === null)
    return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

export interface LearnerNote {
  id: number
  body: string
  seconds: number | null
  clock: string
  createdAt: string
}

async function mine(userId: number, lessonId: number): Promise<LearnerNote[]> {
  const rows = await db.selectFrom('lesson_notes').select(['id', 'body', 'position_seconds', 'created_at']).where('user_id', '=', userId).where('lesson_id', '=', lessonId).orderBy('id', 'asc').execute() as { id: number, body: string, position_seconds: number | null, created_at: string }[]
  return rows.map(row => ({ id: row.id, body: row.body, seconds: row.position_seconds, clock: clockOf(row.position_seconds), createdAt: row.created_at }))
}

export async function notesOf(userId: number, lessonId: number, at: Date = new Date()): Promise<LearnerNote[]> {
  await readerOf(userId, lessonId, at)
  return mine(userId, lessonId)
}

export async function addNote(userId: number, lessonId: number, input: { body: unknown, seconds?: unknown }, at: Date = new Date()): Promise<LearnerNote[]> {
  await readerOf(userId, lessonId, at)
  const body = noteBody(input.body)
  const existing = await mine(userId, lessonId)
  if (existing.length >= NOTES_PER_LESSON)
    throw new CommentError(`A lesson holds up to ${NOTES_PER_LESSON} notes. Remove one to add another.`)

  const stamp = at.toISOString()
  await db.insertInto('lesson_notes').values({ user_id: userId, lesson_id: lessonId, body, position_seconds: notePosition(input.seconds), created_at: stamp, updated_at: stamp }).execute()
  return mine(userId, lessonId)
}

/** Remove one of your own notes. Someone else's id finds nothing. */
export async function removeNote(userId: number, noteId: number): Promise<LearnerNote[]> {
  const row = await db.selectFrom('lesson_notes').select(['id', 'lesson_id']).where('id', '=', noteId).where('user_id', '=', userId).executeTakeFirst() as { id: number, lesson_id: number } | undefined
  if (!row)
    throw new CommentError('That note was not found.')
  await db.deleteFrom('lesson_notes').where('id', '=', row.id).where('user_id', '=', userId).execute()
  return mine(userId, row.lesson_id)
}
