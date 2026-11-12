/**
 * The gradebook: who is in a Course, how far they have got and how they did
 * on each Quiz and Assignment. Read by the studio and exported as CSV.
 */

import type { CourseRow } from './courses'
import type { QuizStanding } from './grading'
import { db } from '@stacksjs/database'
import { outlineOf } from './courses'
import { EnrollmentError } from './enrollment'
import { standings, toCsv } from './grading'
import { courseProgress } from './progress'

export interface GradebookQuiz {
  lessonId: number
  quizId: number
  title: string
  passPercent: number
}

export interface GradebookAssignment {
  lessonId: number
  assignmentId: number
  title: string
  maxPoints: number
  passPoints: number
}

/** Where a Learner stands on one Assignment. `score` is null until it is marked. */
export interface AssignmentStanding {
  status: string
  score: number | null
}

export interface GradebookLearner {
  enrollmentId: number
  userId: number
  name: string
  email: string
  status: string
  enrolledAt: string
  completedAt: string | null
  completed: number
  total: number
  percent: number
  /** Keyed by the quiz Lesson's id. A Quiz never attempted is left out. */
  quizzes: Record<number, QuizStanding>
  /** Keyed by the assignment Lesson's id. Work never handed in is left out. */
  assignments: Record<number, AssignmentStanding>
  certificate: string | null
}

export interface Gradebook {
  quizzes: GradebookQuiz[]
  assignments: GradebookAssignment[]
  learners: GradebookLearner[]
}

export async function gradebookOf(course: CourseRow): Promise<Gradebook> {
  const outline = await outlineOf(course.id)
  const lessons = outline.sections.flatMap(section => section.lessons)

  const quizRows = await db.selectFrom('quizzes').select(['id', 'lesson_id', 'pass_percent']).where('course_id', '=', course.id).execute() as { id: number, lesson_id: number, pass_percent: number }[]
  // In teaching order, like the outline, so the columns read left to right.
  const quizzes = lessons.flatMap((lesson) => {
    const quiz = quizRows.find(row => row.lesson_id === lesson.id)
    return quiz ? [{ lessonId: lesson.id, quizId: quiz.id, title: lesson.title, passPercent: quiz.pass_percent }] : []
  })

  const assignmentRows = await db.selectFrom('assignments').select(['id', 'lesson_id', 'max_points', 'pass_points']).where('course_id', '=', course.id).execute() as { id: number, lesson_id: number, max_points: number, pass_points: number }[]
  const assignments = lessons.flatMap((lesson) => {
    const assignment = assignmentRows.find(row => row.lesson_id === lesson.id)
    return assignment ? [{ lessonId: lesson.id, assignmentId: assignment.id, title: lesson.title, maxPoints: assignment.max_points, passPoints: assignment.pass_points }] : []
  })

  const enrollments = await db.selectFrom('enrollments').select(['id', 'user_id', 'status', 'created_at', 'completed_at']).where('course_id', '=', course.id).orderBy('id', 'desc').execute() as { id: number, user_id: number, status: string, created_at: string, completed_at: string | null }[]
  if (enrollments.length === 0)
    return { quizzes, assignments, learners: [] }

  const enrollmentIds = enrollments.map(row => row.id)
  const users = await db.selectFrom('users').select(['id', 'name', 'email']).where('id', 'in', enrollments.map(row => row.user_id)).execute() as { id: number, name: string | null, email: string }[]
  const done = await db.selectFrom('lesson_progress').select(['enrollment_id', 'lesson_id']).where('enrollment_id', 'in', enrollmentIds).where('completed_at', 'is not', null).execute() as { enrollment_id: number, lesson_id: number }[]
  const certificates = await db.selectFrom('certificates').select(['enrollment_id', 'serial', 'revoked_at']).where('enrollment_id', 'in', enrollmentIds).execute() as { enrollment_id: number, serial: string, revoked_at: string | null }[]
  const attempts = quizzes.length === 0
    ? []
    : await db.selectFrom('quiz_attempts').select(['quiz_id', 'enrollment_id', 'status', 'percent', 'passed']).where('quiz_id', 'in', quizzes.map(quiz => quiz.quizId)).where('enrollment_id', 'in', enrollmentIds).execute() as { quiz_id: number, enrollment_id: number, status: string, percent: number, passed: number | boolean }[]

  const submissions = assignments.length === 0
    ? []
    : await db.selectFrom('submissions').select(['assignment_id', 'enrollment_id', 'status', 'score']).where('assignment_id', 'in', assignments.map(assignment => assignment.assignmentId)).where('enrollment_id', 'in', enrollmentIds).execute() as { assignment_id: number, enrollment_id: number, status: string, score: number | null }[]

  const standing = standings(attempts.map(row => ({ quizId: row.quiz_id, enrollmentId: row.enrollment_id, status: row.status, percent: row.percent, passed: Boolean(row.passed) })))

  const learners = enrollments.map((enrollment) => {
    const user = users.find(row => row.id === enrollment.user_id)
    const progress = courseProgress(outline.lessonIds, done.filter(row => row.enrollment_id === enrollment.id).map(row => row.lesson_id))
    const certificate = certificates.find(row => row.enrollment_id === enrollment.id && !row.revoked_at)

    const byLesson: Record<number, QuizStanding> = {}
    for (const quiz of quizzes) {
      const found = standing.get(`${enrollment.id}:${quiz.quizId}`)
      if (found)
        byLesson[quiz.lessonId] = found
    }

    const work: Record<number, AssignmentStanding> = {}
    for (const assignment of assignments) {
      const found = submissions.find(row => row.enrollment_id === enrollment.id && row.assignment_id === assignment.assignmentId)
      if (found)
        work[assignment.lessonId] = { status: found.status, score: found.status === 'submitted' ? null : found.score }
    }

    return {
      enrollmentId: enrollment.id,
      userId: enrollment.user_id,
      name: user?.name?.trim() || 'Learner',
      email: user?.email ?? '',
      status: enrollment.status,
      enrolledAt: enrollment.created_at,
      completedAt: enrollment.completed_at,
      completed: progress.completed,
      total: progress.total,
      percent: progress.percent,
      quizzes: byLesson,
      assignments: work,
      certificate: certificate?.serial ?? null,
    }
  })

  return { quizzes, assignments, learners }
}

/**
 * The gradebook as a spreadsheet: one row per Learner, one column per Quiz and
 * per Assignment. Work waiting for a mark reads "Waiting", not a zero.
 */
export function gradebookCsv(book: Gradebook): string {
  const header = ['Name', 'Email', 'Status', 'Enrolled', 'Completed', 'Progress %', ...book.quizzes.map(quiz => `${quiz.title} (best %)`), ...book.assignments.map(assignment => `${assignment.title} (of ${assignment.maxPoints})`), 'Certificate']
  const rows = book.learners.map(learner => [
    learner.name,
    learner.email,
    learner.status,
    learner.enrolledAt.slice(0, 10),
    learner.completedAt?.slice(0, 10) ?? '',
    learner.percent,
    ...book.quizzes.map((quiz) => {
      const standing = learner.quizzes[quiz.lessonId]
      return standing ? (standing.best ?? 'Waiting') : ''
    }),
    ...book.assignments.map((assignment) => {
      const work = learner.assignments[assignment.lessonId]
      return work ? (work.score ?? 'Waiting') : ''
    }),
    learner.certificate ?? '',
  ])
  return toCsv([header, ...rows])
}

/**
 * Take a Learner's access away, or give it back. Their progress is kept
 * either way: restoring returns them to exactly where they were.
 */
export async function setAccess(course: CourseRow, enrollmentId: number, allowed: boolean): Promise<string> {
  const enrollment = await db.selectFrom('enrollments').select(['id', 'status', 'completed_at']).where('id', '=', enrollmentId).where('course_id', '=', course.id).executeTakeFirst() as { id: number, status: string, completed_at: string | null } | undefined
  if (!enrollment)
    throw new EnrollmentError('That learner is not enrolled in this course.')

  const status = allowed ? (enrollment.completed_at ? 'completed' : 'active') : 'revoked'
  if (status !== enrollment.status)
    await db.updateTable('enrollments').set({ status, updated_at: new Date().toISOString() }).where('id', '=', enrollment.id).execute()
  return status
}
