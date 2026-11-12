/**
 * What every Cursio endpoint does before its own work: find out who is asking,
 * and turn a refused domain rule into an answer the client can show.
 */

import type { AcademyRow } from './academies'
import { response } from '@stacksjs/router'
import { db } from '@stacksjs/database'
import { AcademyError, academyForStaff } from './academies'
import type { CourseRow } from './courses'
import { CourseError, courseInAcademy } from './courses'
import { EnrollmentError } from './enrollment'
import { QuizError } from './quizzes'
import { AssignmentError } from './assignments'
import type { BankRow } from './banks'
import { CommentError } from './comments'
import type { QuestionDraft } from './grading'

/** The signed-in user's id, or null. Never read from the request body. */
export async function userIdOf(request: RequestInstance): Promise<number | null> {
  const user = await request.user()
  const id = Number(user?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * The staff member and the Academy a studio request is about. The Academy may
 * be named by `academy_id`; it is still only found if the caller is its staff.
 */
export async function staffContext(request: RequestInstance): Promise<{ userId: number, academy: AcademyRow } | Response> {
  const userId = await userIdOf(request)
  if (!userId)
    return response.unauthorized('Authentication required')

  const requested = Number(request.get('academy_id')) || null
  const academy = await academyForStaff(userId, requested)
  if (!academy)
    return response.notFound('Academy not found')

  return { userId, academy }
}

/** A rule the domain refused is the caller's to fix: 422 with its message. */
export function refusal(error: unknown): Response {
  if (error instanceof AcademyError || error instanceof CourseError || error instanceof EnrollmentError || error instanceof QuizError || error instanceof AssignmentError || error instanceof CommentError)
    return response.json({ success: false, message: error.message }, 422)

  throw error
}

export function idParam(request: RequestInstance, name: string): number {
  const value = Number(request.getParam(name))
  return Number.isInteger(value) && value > 0 ? value : 0
}

/** A text field the client actually sent, or undefined: absent means "leave it". */
export function sent(request: RequestInstance, name: string): string | undefined {
  const value = request.get(name)
  return value === undefined || value === null ? undefined : String(value)
}

/** A list of positive ids from the body, or an empty list. */
export function idList(request: RequestInstance, name: string): number[] {
  const value = request.get(name)
  return Array.isArray(value) ? value.map(Number).filter(id => Number.isInteger(id) && id > 0) : []
}

/** The Course a studio request names in `{id}`, found only inside the caller's Academy. */
export async function studioCourse(request: RequestInstance): Promise<{ userId: number, academy: AcademyRow, course: CourseRow } | Response> {
  const userId = await userIdOf(request)
  if (!userId)
    return response.unauthorized('Authentication required')

  // Someone who runs more than one Academy does not say which on every call:
  // the Course says it. The Academy is still only found if the caller is its
  // staff, so a Course id from elsewhere finds nothing, as before.
  const courseId = idParam(request, 'id')
  const owner = await db.selectFrom('courses').select(['academy_id']).where('id', '=', courseId).executeTakeFirst() as { academy_id: number } | undefined
  const academy = owner ? await academyForStaff(userId, owner.academy_id) : null
  const course = academy ? await courseInAcademy(academy, courseId) : null
  if (!academy || !course)
    return response.notFound('Course not found')

  return { userId, academy, course }
}

/**
 * The question bank a studio request names in `{bank}`, found only inside an
 * Academy the caller is staff of. As with a Course, the bank says which
 * Academy; the caller does not.
 */
export async function studioBank(request: RequestInstance): Promise<{ userId: number, academy: AcademyRow, bank: BankRow } | Response> {
  const userId = await userIdOf(request)
  if (!userId)
    return response.unauthorized('Authentication required')

  const bank = await db.selectFrom('question_banks').select(['id', 'academy_id', 'team_id', 'title']).where('id', '=', idParam(request, 'bank')).executeTakeFirst() as BankRow | undefined
  const academy = bank ? await academyForStaff(userId, bank.academy_id) : null
  if (!bank || !academy)
    return response.notFound('Question bank not found')

  return { userId, academy, bank }
}

/** A question as the editor sends it, whichever home it is being saved to. */
export function questionDraft(request: RequestInstance): QuestionDraft & { explanation?: string } {
  const options = request.get('options')
  const answers = request.get('answers')
  const value = request.get('value')
  const pairs = request.get('pairs')
  return {
    kind: String(request.get('kind') ?? ''),
    prompt: String(request.get('prompt') ?? ''),
    explanation: String(request.get('explanation') ?? ''),
    points: Number(request.get('points')) || 1,
    options: Array.isArray(options)
      ? options.map(option => ({ label: String(option?.label ?? ''), correct: option?.correct === true }))
      : [],
    answers: Array.isArray(answers) ? answers.map(String) : [],
    value: value === undefined || value === null || value === '' ? null : Number(value),
    tolerance: Number(request.get('tolerance')) || 0,
    pairs: Array.isArray(pairs) ? pairs.map(pair => ({ left: String(pair?.left ?? ''), right: String(pair?.right ?? '') })) : [],
  }
}
