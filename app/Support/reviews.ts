/**
 * Course reviews: one to five and a few words, from Learners who have actually
 * started the Course. The summary a catalog shows is worked out from the
 * reviews that stand; one taken down by staff counts for nothing.
 */

import type { CourseRow } from './courses'
import { db } from '@stacksjs/database'
import { CommentError, displayName } from './comments'
import { enrollmentOf } from './enrollment'

export const REVIEW_MAX = 2000

/** A whole number of stars from one to five, or a refusal. */
export function ratingOf(value: unknown): number {
  const rating = typeof value === 'boolean' || value === null || value === '' ? Number.NaN : Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new CommentError('Give a rating from 1 to 5.')
  return rating
}

/** The words of a review, or null when it is stars alone. */
export function reviewBody(value: unknown): string | null {
  const body = String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (body.length > REVIEW_MAX)
    throw new CommentError(`A review can be up to ${REVIEW_MAX} characters.`)
  return body === '' ? null : body
}

export interface RatingSummary {
  count: number
  /** One decimal, or null when nobody has reviewed yet: never a made-up zero. */
  average: number | null
}

export function summaryOf(ratings: number[]): RatingSummary {
  if (ratings.length === 0)
    return { count: 0, average: null }
  const total = ratings.reduce((sum, rating) => sum + rating, 0)
  return { count: ratings.length, average: Math.round((total / ratings.length) * 10) / 10 }
}

export interface PublicReview {
  id: number
  rating: number
  body: string | null
  author: string
  createdAt: string
}

interface ReviewRow {
  id: number
  course_id: number
  user_id: number
  rating: number
  body: string | null
  created_at: string
}

async function standing(courseIds: number[]): Promise<ReviewRow[]> {
  if (courseIds.length === 0)
    return []
  return await db.selectFrom('course_reviews').select(['id', 'course_id', 'user_id', 'rating', 'body', 'created_at']).where('course_id', 'in', courseIds).where('hidden_at', 'is', null).orderBy('id', 'desc').execute() as ReviewRow[]
}

/** Each Course's summary, for a catalog. A Course nobody reviewed is left out. */
export async function summariesOf(courseIds: number[]): Promise<Map<number, RatingSummary>> {
  const rows = await standing(courseIds)
  const result = new Map<number, RatingSummary>()
  for (const id of new Set(rows.map(row => row.course_id)))
    result.set(id, summaryOf(rows.filter(row => row.course_id === id).map(row => row.rating)))
  return result
}

/** What anyone may read about a Course: its summary and the reviews that stand. */
export async function reviewsOf(courseId: number, limit = 50): Promise<{ summary: RatingSummary, reviews: PublicReview[] }> {
  const rows = await standing([courseId])
  const shown = rows.slice(0, limit)
  const users = shown.length > 0
    ? await db.selectFrom('users').select(['id', 'name']).where('id', 'in', shown.map(row => row.user_id)).execute() as { id: number, name: string | null }[]
    : []
  return {
    summary: summaryOf(rows.map(row => row.rating)),
    reviews: shown.map(row => ({ id: row.id, rating: row.rating, body: row.body, author: displayName(users.find(user => user.id === row.user_id)?.name), createdAt: row.created_at })),
  }
}

export interface OwnReview {
  rating: number
  body: string | null
  /** Staff took it down: the Learner sees that, and may not put it back. */
  hidden: boolean
}

/** The signed-in Learner's own review, and whether they may write one yet. */
export async function ownReview(userId: number, courseId: number): Promise<{ canReview: boolean, review: OwnReview | null }> {
  const enrollment = await enrollmentOf(userId, courseId)
  if (!enrollment || enrollment.status === 'revoked')
    return { canReview: false, review: null }
  const row = await db.selectFrom('course_reviews').select(['rating', 'body', 'hidden_at']).where('enrollment_id', '=', enrollment.id).executeTakeFirst() as { rating: number, body: string | null, hidden_at: string | null } | undefined
  const started = await db.selectFrom('lesson_progress').select(['id']).where('enrollment_id', '=', enrollment.id).where('completed_at', 'is not', null).executeTakeFirst()
  return {
    canReview: Boolean(started) && !row?.hidden_at,
    review: row ? { rating: row.rating, body: row.body, hidden: Boolean(row.hidden_at) } : null,
  }
}

/**
 * Write or change your review. Only someone enrolled who has completed at
 * least one Lesson may: a rating from a Learner who never opened the Course
 * says nothing about it.
 */
export async function saveReview(userId: number, courseId: number, input: { rating: unknown, body?: unknown }, at: Date = new Date()): Promise<OwnReview> {
  const enrollment = await enrollmentOf(userId, courseId)
  if (!enrollment || enrollment.status === 'revoked')
    throw new CommentError('You are not enrolled in this course.')
  const started = await db.selectFrom('lesson_progress').select(['id']).where('enrollment_id', '=', enrollment.id).where('completed_at', 'is not', null).executeTakeFirst()
  if (!started)
    throw new CommentError('Complete a lesson first, then tell us what you think.')

  const rating = ratingOf(input.rating)
  const body = reviewBody(input.body)
  const stamp = at.toISOString()
  const existing = await db.selectFrom('course_reviews').select(['id', 'hidden_at']).where('enrollment_id', '=', enrollment.id).executeTakeFirst() as { id: number, hidden_at: string | null } | undefined
  if (existing?.hidden_at)
    throw new CommentError('Your review was taken down by the academy and cannot be changed.')

  if (existing)
    await db.updateTable('course_reviews').set({ rating, body, updated_at: stamp }).where('id', '=', existing.id).execute()
  else
    await db.insertInto('course_reviews').values({ course_id: courseId, user_id: userId, enrollment_id: enrollment.id, rating, body, created_at: stamp, updated_at: stamp }).execute()
  return { rating, body, hidden: false }
}

/** Withdraw your own review. */
export async function withdrawReview(userId: number, courseId: number): Promise<void> {
  const enrollment = await enrollmentOf(userId, courseId)
  if (!enrollment)
    throw new CommentError('You are not enrolled in this course.')
  await db.deleteFrom('course_reviews').where('enrollment_id', '=', enrollment.id).where('user_id', '=', userId).where('hidden_at', 'is', null).execute()
}

/** Staff take a review down, or put it back. It is kept either way. */
export async function setReviewHidden(course: CourseRow, reviewId: number, hidden: boolean, at: Date = new Date()): Promise<void> {
  const row = await db.selectFrom('course_reviews').select(['id']).where('id', '=', reviewId).where('course_id', '=', course.id).executeTakeFirst()
  if (!row)
    throw new CommentError('That review is not part of this course.')
  await db.updateTable('course_reviews').set({ hidden_at: hidden ? at.toISOString() : null, updated_at: at.toISOString() }).where('id', '=', reviewId).execute()
}

/** Every review of a Course, hidden ones included, for the staff who moderate. */
export async function reviewsForStudio(course: CourseRow): Promise<(PublicReview & { hidden: boolean })[]> {
  const rows = await db.selectFrom('course_reviews').select(['id', 'user_id', 'rating', 'body', 'created_at', 'hidden_at']).where('course_id', '=', course.id).orderBy('id', 'desc').execute() as (ReviewRow & { hidden_at: string | null })[]
  const users = rows.length > 0
    ? await db.selectFrom('users').select(['id', 'name']).where('id', 'in', rows.map(row => row.user_id)).execute() as { id: number, name: string | null }[]
    : []
  return rows.map(row => ({ id: row.id, rating: row.rating, body: row.body, author: users.find(user => user.id === row.user_id)?.name?.trim() || 'Learner', createdAt: row.created_at, hidden: Boolean(row.hidden_at) }))
}
