/**
 * What every Cursio endpoint does before its own work: find out who is asking,
 * and turn a refused domain rule into an answer the client can show.
 */

import type { AcademyRow } from './academies'
import { response } from '@stacksjs/router'
import { AcademyError, academyForStaff } from './academies'
import { CourseError } from './courses'
import { EnrollmentError } from './enrollment'

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
  if (error instanceof AcademyError || error instanceof CourseError || error instanceof EnrollmentError)
    return response.json({ success: false, message: error.message }, 422)

  throw error
}

export function idParam(request: RequestInstance, name: string): number {
  const value = Number(request.getParam(name))
  return Number.isInteger(value) && value > 0 ? value : 0
}
