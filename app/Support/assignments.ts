/**
 * Assignments: work a Learner hands in and a member of staff marks.
 *
 * The rules at the top are plain functions (what a valid rubric is, what a
 * mark adds up to). Below them, the studio side (set the rubric, read the
 * marking queue, mark) and the Learner side (read the brief, hand in).
 */

import type { CourseRow } from './courses'
import type { LearnerProgress } from './enrollment'
import { db } from '@stacksjs/database'
import { isUniqueViolation } from '@stacksjs/orm'
import { completeLesson, enrollmentOf, progressOf } from './enrollment'

export class AssignmentError extends Error {}

export interface Criterion {
  title: string
  points: number
}

/** The stored rubric, or an empty list when there is none or it cannot be read. */
export function parseRubric(raw: string | null | undefined): Criterion[] {
  if (!raw)
    return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data))
      return []
    return data
      .filter((item): item is Criterion => typeof item?.title === 'string' && item.title.trim() !== '' && Number.isInteger(item?.points) && item.points > 0)
      .map(item => ({ title: item.title.trim(), points: item.points }))
  }
  catch {
    return []
  }
}

/** What is wrong with a rubric as written, or null. Blank rows are ignored. */
export function rubricProblem(rows: { title: string, points: number }[]): string | null {
  const kept = rows.filter(row => row.title.trim() !== '' || Number(row.points) > 0)
  if (kept.length > 20)
    return 'A rubric can have at most twenty criteria.'
  for (const row of kept) {
    if (row.title.trim() === '')
      return 'Every criterion needs a name.'
    if (!Number.isInteger(row.points) || row.points < 1 || row.points > 100)
      return 'Each criterion is worth a whole number of points from 1 to 100.'
  }
  if (new Set(kept.map(row => row.title.trim().toLowerCase())).size !== kept.length)
    return 'Two criteria have the same name.'
  return null
}

export interface Mark {
  score: number
  /** One score per criterion, in the rubric's order. Empty without a rubric. */
  rubricScores: number[]
  passed: boolean
}

/**
 * Work out a mark. With a rubric the score is the sum of one whole score per
 * criterion, each within that criterion's points; without one it is a single
 * whole score within the Assignment's maximum. Anything else is refused: a
 * mark is a record, and a record that does not add up helps nobody.
 */
export function markFrom(input: { rubric: Criterion[], maxPoints: number, passPoints: number, scores?: unknown, score?: unknown }): Mark {
  if (input.rubric.length > 0) {
    const given = Array.isArray(input.scores) ? input.scores.map(Number) : []
    if (given.length !== input.rubric.length)
      throw new AssignmentError('Give a score for every criterion.')
    for (const [index, criterion] of input.rubric.entries()) {
      const value = given[index] as number
      if (!Number.isInteger(value) || value < 0 || value > criterion.points)
        throw new AssignmentError(`"${criterion.title}" is scored from 0 to ${criterion.points}.`)
    }
    const score = given.reduce((sum, value) => sum + value, 0)
    return { score, rubricScores: given, passed: score >= input.passPoints }
  }

  const score = Number(input.score)
  if (input.score === undefined || input.score === null || input.score === '' || !Number.isInteger(score) || score < 0 || score > input.maxPoints)
    throw new AssignmentError(`The score is a whole number from 0 to ${input.maxPoints}.`)
  return { score, rubricScores: [], passed: score >= input.passPoints }
}

// ---------------------------------------------------------------------------

export interface AssignmentRow {
  id: number
  lesson_id: number
  course_id: number
  team_id: number
  max_points: number
  pass_points: number
  rubric: Criterion[]
}

const assignmentColumns = ['id', 'lesson_id', 'course_id', 'team_id', 'max_points', 'pass_points', 'rubric'] as const

async function assignmentOfLesson(lessonId: number): Promise<AssignmentRow | null> {
  const row = await db.selectFrom('assignments').select([...assignmentColumns]).where('lesson_id', '=', lessonId).executeTakeFirst() as (Omit<AssignmentRow, 'rubric'> & { rubric: string | null }) | undefined
  return row ? { ...row, rubric: parseRubric(row.rubric) } : null
}

async function assignmentInCourse(course: CourseRow, lessonId: number): Promise<AssignmentRow> {
  const assignment = await assignmentOfLesson(lessonId)
  if (!assignment || assignment.course_id !== course.id)
    throw new AssignmentError('That lesson is not an assignment in this course.')
  return assignment
}

export async function assignmentForStudio(course: CourseRow, lessonId: number): Promise<AssignmentRow> {
  return await assignmentInCourse(course, lessonId)
}

/**
 * Set how an Assignment is marked. With a rubric the maximum is its total, so
 * the two can never disagree; the pass score must be reachable.
 */
export async function updateAssignment(course: CourseRow, lessonId: number, input: { rubric?: { title: string, points: number }[], maxPoints?: number, passPoints?: number }): Promise<AssignmentRow> {
  const assignment = await assignmentInCourse(course, lessonId)
  const next = { ...assignment }

  if (input.rubric !== undefined) {
    const problem = rubricProblem(input.rubric)
    if (problem)
      throw new AssignmentError(problem)
    next.rubric = input.rubric.filter(row => row.title.trim() !== '').map(row => ({ title: row.title.trim(), points: row.points }))
  }
  if (next.rubric.length > 0) {
    next.max_points = next.rubric.reduce((sum, criterion) => sum + criterion.points, 0)
  }
  else if (input.maxPoints !== undefined) {
    if (!Number.isInteger(input.maxPoints) || input.maxPoints < 1 || input.maxPoints > 1000)
      throw new AssignmentError('The maximum is a whole number of points from 1 to 1000.')
    next.max_points = input.maxPoints
  }
  if (input.passPoints !== undefined) {
    if (!Number.isInteger(input.passPoints) || input.passPoints < 0)
      throw new AssignmentError('The pass score is a whole number of points.')
    next.pass_points = input.passPoints
  }
  if (next.pass_points > next.max_points)
    throw new AssignmentError(`The pass score cannot be more than the ${next.max_points} points available.`)

  await db.updateTable('assignments').set({
    max_points: next.max_points,
    pass_points: next.pass_points,
    rubric: next.rubric.length > 0 ? JSON.stringify(next.rubric) : null,
    updated_at: new Date().toISOString(),
  }).where('id', '=', assignment.id).execute()

  return next
}

export interface SubmissionRow {
  id: number
  assignment_id: number
  enrollment_id: number
  user_id: number
  body: string | null
  link: string | null
  status: 'submitted' | 'passed' | 'returned'
  score: number | null
  rubric_scores: number[]
  feedback: string | null
  submitted_at: string | null
  graded_at: string | null
}

const submissionColumns = ['id', 'assignment_id', 'enrollment_id', 'user_id', 'body', 'link', 'status', 'score', 'rubric_scores', 'feedback', 'submitted_at', 'graded_at'] as const

function submissionFrom(row: Record<string, unknown>): SubmissionRow {
  let scores: number[] = []
  try {
    const parsed = row.rubric_scores ? JSON.parse(String(row.rubric_scores)) as unknown : []
    scores = Array.isArray(parsed) ? parsed.map(Number) : []
  }
  catch {
    scores = []
  }
  return { ...(row as unknown as SubmissionRow), rubric_scores: scores }
}

async function submissionOf(assignmentId: number, enrollmentId: number): Promise<SubmissionRow | null> {
  const row = await db.selectFrom('submissions').select([...submissionColumns]).where('assignment_id', '=', assignmentId).where('enrollment_id', '=', enrollmentId).executeTakeFirst() as Record<string, unknown> | undefined
  return row ? submissionFrom(row) : null
}

export interface LearnerAssignment {
  maxPoints: number
  passPoints: number
  rubric: Criterion[]
  submission: SubmissionRow | null
  /** False once the work has passed: there is nothing left to hand in. */
  canSubmit: boolean
}

async function sittingOf(userId: number, lessonId: number, at: Date) {
  const assignment = await assignmentOfLesson(lessonId)
  const enrollment = assignment ? await enrollmentOf(userId, assignment.course_id) : null
  // One answer for "no such assignment" and "not yours".
  if (!assignment || !enrollment || enrollment.status === 'revoked')
    throw new AssignmentError('You are not enrolled in this course.')

  const closed = (await progressOf(enrollment, at)).locked[lessonId]
  if (closed)
    throw new AssignmentError(closed.reason === 'drip' ? 'This lesson is not open yet.' : 'Complete the earlier lessons first.')

  return { assignment, enrollment }
}

export async function assignmentForLearner(userId: number, lessonId: number, at: Date = new Date()): Promise<LearnerAssignment> {
  const { assignment, enrollment } = await sittingOf(userId, lessonId, at)
  const submission = await submissionOf(assignment.id, enrollment.id)
  return { maxPoints: assignment.max_points, passPoints: assignment.pass_points, rubric: assignment.rubric, submission, canSubmit: submission?.status !== 'passed' }
}

/**
 * Hand in work, or replace what was handed in. Allowed while it is waiting to
 * be marked or was returned; refused once it has passed, so a mark always
 * describes the work it was given for.
 */
export async function submitWork(userId: number, lessonId: number, input: { body?: string, link?: string }, at: Date = new Date()): Promise<SubmissionRow> {
  const { assignment, enrollment } = await sittingOf(userId, lessonId, at)

  const body = (input.body ?? '').trim()
  const link = (input.link ?? '').trim()
  if (!body && !link)
    throw new AssignmentError('Write your answer or add a link to your work.')
  if (body.length > 50000)
    throw new AssignmentError('That is longer than an answer can be. Link to the work instead.')
  if (link && !/^https:\/\/\S+$/.test(link))
    throw new AssignmentError('A link must start with https://')

  const stamp = at.toISOString()
  const existing = await submissionOf(assignment.id, enrollment.id)
  if (existing?.status === 'passed')
    throw new AssignmentError('This work has already passed.')

  // Handing in again clears the old mark: it described different work.
  const fields = { body: body || null, link: link || null, status: 'submitted' as const, score: null, rubric_scores: null, feedback: null, submitted_at: stamp, graded_at: null, graded_by: null }
  if (existing) {
    await db.updateTable('submissions').set({ ...fields, updated_at: stamp }).where('id', '=', existing.id).execute()
  }
  else {
    try {
      await db.insertInto('submissions').values({ ...fields, user_id: userId, assignment_id: assignment.id, enrollment_id: enrollment.id, uuid: crypto.randomUUID() }).execute()
    }
    catch (error) {
      if (!isUniqueViolation(error))
        throw error
    }
  }

  const saved = await submissionOf(assignment.id, enrollment.id)
  if (!saved)
    throw new AssignmentError('Your work could not be saved.')
  return saved
}

export interface QueueEntry extends SubmissionRow {
  lessonId: number
  lessonTitle: string
  learnerName: string
  learnerEmail: string
  maxPoints: number
  passPoints: number
  rubric: Criterion[]
}

/** A Course's Submissions for its markers: waiting first, oldest first. */
export async function submissionsOf(course: CourseRow): Promise<QueueEntry[]> {
  const assignments = await db.selectFrom('assignments').select([...assignmentColumns]).where('course_id', '=', course.id).execute() as (Omit<AssignmentRow, 'rubric'> & { rubric: string | null })[]
  if (assignments.length === 0)
    return []

  const rows = await db.selectFrom('submissions').select([...submissionColumns]).where('assignment_id', 'in', assignments.map(row => row.id)).execute() as Record<string, unknown>[]
  if (rows.length === 0)
    return []
  const submissions = rows.map(submissionFrom)

  const lessons = await db.selectFrom('lessons').select(['id', 'title']).where('id', 'in', assignments.map(row => row.lesson_id)).execute() as { id: number, title: string }[]
  const users = await db.selectFrom('users').select(['id', 'name', 'email']).where('id', 'in', submissions.map(row => row.user_id)).execute() as { id: number, name: string | null, email: string }[]

  const order = { submitted: 0, returned: 1, passed: 2 }
  return submissions
    .map((submission) => {
      const assignment = assignments.find(row => row.id === submission.assignment_id)!
      const user = users.find(row => row.id === submission.user_id)
      return {
        ...submission,
        lessonId: assignment.lesson_id,
        lessonTitle: lessons.find(row => row.id === assignment.lesson_id)?.title ?? 'Assignment',
        learnerName: user?.name?.trim() || 'Learner',
        learnerEmail: user?.email ?? '',
        maxPoints: assignment.max_points,
        passPoints: assignment.pass_points,
        rubric: parseRubric(assignment.rubric),
      }
    })
    .sort((a, b) => order[a.status] - order[b.status] || String(a.submitted_at).localeCompare(String(b.submitted_at)))
}

/**
 * Mark a Submission. A passing mark completes the Lesson for the Learner (and
 * the Course, when it was the last). A mark below the pass score returns the
 * work, and the Learner may hand in again. Marking again is allowed until the
 * work has passed: a marker can correct a slip, but a pass is not taken back
 * here, because the Lesson, and maybe a Certificate, already followed from it.
 */
export async function markSubmission(course: CourseRow, submissionId: number, graderId: number, input: { scores?: unknown, score?: unknown, feedback?: string }, at: Date = new Date()): Promise<{ submission: SubmissionRow, progress: LearnerProgress | null }> {
  const raw = await db.selectFrom('submissions').select([...submissionColumns]).where('id', '=', submissionId).executeTakeFirst() as Record<string, unknown> | undefined
  const submission = raw ? submissionFrom(raw) : null
  const row = submission ? await db.selectFrom('assignments').select([...assignmentColumns]).where('id', '=', submission.assignment_id).where('course_id', '=', course.id).executeTakeFirst() as (Omit<AssignmentRow, 'rubric'> & { rubric: string | null }) | undefined : undefined
  if (!submission || !row)
    throw new AssignmentError('That submission is not part of this course.')
  if (submission.status === 'passed')
    throw new AssignmentError('This work has already passed.')

  const mark = markFrom({ rubric: parseRubric(row.rubric), maxPoints: row.max_points, passPoints: row.pass_points, scores: input.scores, score: input.score })
  const stamp = at.toISOString()

  await db.updateTable('submissions').set({
    status: mark.passed ? 'passed' : 'returned',
    score: mark.score,
    rubric_scores: mark.rubricScores.length > 0 ? JSON.stringify(mark.rubricScores) : null,
    feedback: input.feedback?.trim().slice(0, 10000) || null,
    graded_at: stamp,
    graded_by: graderId,
    updated_at: stamp,
  }).where('id', '=', submission.id).execute()

  let progress: LearnerProgress | null = null
  if (mark.passed) {
    try {
      progress = (await completeLesson(submission.user_id, row.lesson_id, at, { earned: true })).progress
    }
    catch {
      // The Learner's access was removed after they handed in: the mark stands,
      // and there is no Lesson to complete for them.
      progress = null
    }
  }

  const saved = await submissionOf(submission.assignment_id, submission.enrollment_id)
  return { submission: saved ?? submission, progress }
}
