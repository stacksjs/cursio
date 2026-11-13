/**
 * Certificates: issued when an Enrollment completes, verified by serial.
 */

import { db } from '@stacksjs/database'
import { isUniqueViolation } from '@stacksjs/orm'

export interface CertificateRow {
  id: number
  serial: string
  learner_name: string
  course_title: string
  academy_name: string
  issued_at: string
  revoked_at: string | null
  course_id: number
  enrollment_id: number
}

const certificateColumns = ['id', 'serial', 'learner_name', 'course_title', 'academy_name', 'issued_at', 'revoked_at', 'course_id', 'enrollment_id'] as const

// No 0, O, 1, I or L: a serial is read off paper and typed by hand.
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** `CUR-XXXX-XXXX-XXXX`: 60 bits, enough that a serial cannot be guessed. */
export function newSerial(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const letters = [...bytes].map(byte => alphabet[byte % alphabet.length])
  return `CUR-${letters.slice(0, 4).join('')}-${letters.slice(4, 8).join('')}-${letters.slice(8, 12).join('')}`
}

/** What a typed serial is compared as: upper case, no stray spaces. */
export function normalizeSerial(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, '')
}

export async function certificateOf(enrollmentId: number): Promise<CertificateRow | null> {
  const row = await db.selectFrom('certificates').select([...certificateColumns]).where('enrollment_id', '=', enrollmentId).executeTakeFirst() as CertificateRow | undefined
  return row ?? null
}

export async function certificateBySerial(serial: string): Promise<CertificateRow | null> {
  const wanted = normalizeSerial(serial)
  if (!/^CUR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(wanted))
    return null
  const row = await db.selectFrom('certificates').select([...certificateColumns]).where('serial', '=', wanted).executeTakeFirst() as CertificateRow | undefined
  return row ?? null
}

/**
 * Issue the Certificate for a completed Enrollment. Idempotent: the unique
 * index on the Enrollment means completing twice, or two requests racing,
 * leaves exactly one.
 */
export async function issueCertificate(enrollment: { id: number, user_id: number, course_id: number }, at: Date = new Date()): Promise<CertificateRow | null> {
  const existing = await certificateOf(enrollment.id)
  if (existing)
    return existing

  const course = await db.selectFrom('courses').select(['title', 'team_id', 'academy_id']).where('id', '=', enrollment.course_id).executeTakeFirst() as { title: string, team_id: number, academy_id: number } | undefined
  const learner = await db.selectFrom('users').select(['name']).where('id', '=', enrollment.user_id).executeTakeFirst() as { name: string | null } | undefined
  if (!course || !learner)
    return null
  const academy = await db.selectFrom('academies').select(['name']).where('id', '=', course.academy_id).executeTakeFirst() as { name: string } | undefined

  try {
    await db.insertInto('certificates').values({
      team_id: course.team_id,
      user_id: enrollment.user_id,
      course_id: enrollment.course_id,
      enrollment_id: enrollment.id,
      serial: newSerial(),
      learner_name: learner.name?.trim() || 'Learner',
      course_title: course.title,
      academy_name: academy?.name ?? 'Cursio',
      issued_at: at.toISOString(),
    }).execute()
  }
  catch (error) {
    if (!isUniqueViolation(error))
      throw error
  }

  return await certificateOf(enrollment.id)
}

/** What anyone holding a serial may read: what the Certificate says, no more. */
export interface PublicCertificate {
  serial: string
  learnerName: string
  courseTitle: string
  academyName: string
  issuedAt: string
  revoked: boolean
}

export function publicCertificate(row: CertificateRow): PublicCertificate {
  return { serial: row.serial, learnerName: row.learner_name, courseTitle: row.course_title, academyName: row.academy_name, issuedAt: row.issued_at, revoked: Boolean(row.revoked_at) }
}

/**
 * A Certificate by its serial, only if this Academy issued it. An app that is
 * the front of one Academy checks its own Certificates and nobody else's.
 */
export async function certificateInAcademy(academyId: number, serial: string): Promise<PublicCertificate | null> {
  const row = await certificateBySerial(serial)
  if (!row)
    return null
  const course = await db.selectFrom('courses').select(['academy_id']).where('id', '=', row.course_id).executeTakeFirst() as { academy_id: number } | undefined
  return course?.academy_id === academyId ? publicCertificate(row) : null
}
