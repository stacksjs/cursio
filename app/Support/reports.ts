/**
 * The report on one Course: how many enrolled and finished, where Learners
 * stop, and which quiz questions they get wrong. Every number is counted from
 * what happened; nothing is stored, estimated or rounded up.
 */

import type { CourseRow } from './courses'
import { db } from '@stacksjs/database'
import { outlineOf } from './courses'

/** A whole percent of `whole`, or 0 when there is nothing to take a share of. */
export function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export interface FunnelStep {
  lessonId: number
  number: number
  title: string
  kind: string
  completed: number
  /** Share of enrolled Learners who completed it. */
  percent: number
  /** Learners lost since the step before (the first is measured from enrolled). */
  dropped: number
}

/**
 * Lesson by lesson, how many Learners got that far. `dropped` is never
 * negative: in a Course that can be taken in any order a later Lesson may
 * have more completions than an earlier one, and that is not people returning.
 */
export function funnelOf(lessons: { id: number, title: string, kind: string }[], enrolled: number, completedByLesson: Map<number, number>): FunnelStep[] {
  let before = enrolled
  return lessons.map((lesson, index) => {
    const completed = completedByLesson.get(lesson.id) ?? 0
    const step = { lessonId: lesson.id, number: index + 1, title: lesson.title, kind: lesson.kind, completed, percent: rate(completed, enrolled), dropped: Math.max(0, before - completed) }
    before = completed
    return step
  })
}

export interface ItemResult {
  questionId: number
  prompt: string
  kind: string
  answered: number
  correct: number
  /** Share of answers that were fully right. */
  percentCorrect: number
}

/** How each question fared across the answers given to it, hardest first. */
export function itemAnalysis(questions: { id: number, prompt: string, kind: string }[], answers: { question_id: number, is_correct: boolean }[]): ItemResult[] {
  return questions
    .map((question) => {
      const given = answers.filter(answer => answer.question_id === question.id)
      const correct = given.filter(answer => answer.is_correct).length
      return { questionId: question.id, prompt: question.prompt, kind: question.kind, answered: given.length, correct, percentCorrect: rate(correct, given.length) }
    })
    .filter(item => item.answered > 0)
    .sort((a, b) => a.percentCorrect - b.percentCorrect || b.answered - a.answered)
}

/** The Monday (UTC) of the week a moment falls in, as `YYYY-MM-DD`. */
export function weekOf(stamp: string): string {
  const date = new Date(/[zZ]$/.test(stamp) ? stamp : `${stamp.replace(' ', 'T')}Z`)
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day)
  return date.toISOString().slice(0, 10)
}

/** Enrollments per week for the last `weeks` weeks, oldest first, empty weeks included. */
export function weekly(stamps: string[], weeks: number, now: Date): { week: string, count: number }[] {
  const start = new Date(`${weekOf(now.toISOString())}T00:00:00Z`)
  const result: { week: string, count: number }[] = []
  for (let back = weeks - 1; back >= 0; back--) {
    const monday = new Date(start.getTime() - back * 7 * 86400000).toISOString().slice(0, 10)
    result.push({ week: monday, count: 0 })
  }
  for (const stamp of stamps) {
    const slot = result.find(entry => entry.week === weekOf(stamp))
    if (slot)
      slot.count++
  }
  return result
}

export interface QuizReport {
  lessonId: number
  title: string
  /** Learners who handed in at least one Attempt. */
  sat: number
  passed: number
  passRate: number
  averagePercent: number
  items: ItemResult[]
}

export interface CourseReport {
  enrolled: number
  completed: number
  completionRate: number
  /** Learners who completed at least one Lesson. */
  started: number
  funnel: FunnelStep[]
  quizzes: QuizReport[]
  enrollments: { week: string, count: number }[]
  rating: { count: number, average: number | null }
}

export async function courseReport(course: CourseRow, now: Date = new Date()): Promise<CourseReport> {
  const outline = await outlineOf(course.id)
  const lessons = outline.sections.flatMap(section => section.lessons)

  // Removed access is not counted: the report is about who is learning here.
  const enrollments = await db.selectFrom('enrollments').select(['id', 'status', 'created_at']).where('course_id', '=', course.id).where('status', '!=', 'revoked').execute() as { id: number, status: string, created_at: string }[]
  const enrollmentIds = enrollments.map(row => row.id)

  const done = enrollmentIds.length > 0
    ? await db.selectFrom('lesson_progress').select(['enrollment_id', 'lesson_id']).where('enrollment_id', 'in', enrollmentIds).where('completed_at', 'is not', null).execute() as { enrollment_id: number, lesson_id: number }[]
    : []
  const completedByLesson = new Map<number, number>()
  for (const row of done)
    completedByLesson.set(row.lesson_id, (completedByLesson.get(row.lesson_id) ?? 0) + 1)

  const quizRows = await db.selectFrom('quizzes').select(['id', 'lesson_id']).where('course_id', '=', course.id).execute() as { id: number, lesson_id: number }[]
  const quizzes: QuizReport[] = []
  for (const lesson of lessons) {
    const quiz = quizRows.find(row => row.lesson_id === lesson.id)
    if (!quiz || enrollmentIds.length === 0)
      continue
    const attempts = await db.selectFrom('quiz_attempts').select(['id', 'enrollment_id', 'percent', 'passed']).where('quiz_id', '=', quiz.id).where('enrollment_id', 'in', enrollmentIds).where('status', '=', 'submitted').execute() as { id: number, enrollment_id: number, percent: number, passed: number | boolean }[]
    if (attempts.length === 0)
      continue

    const sitters = new Set(attempts.map(row => row.enrollment_id))
    const passers = new Set(attempts.filter(row => Boolean(row.passed)).map(row => row.enrollment_id))
    const answers = await db.selectFrom('attempt_answers').select(['question_id', 'is_correct']).where('quiz_attempt_id', 'in', attempts.map(row => row.id)).execute() as { question_id: number, is_correct: number | boolean }[]
    const questionIds = [...new Set(answers.map(row => row.question_id))]
    // By id: a question may have been drawn from a bank rather than be the Quiz's own.
    const questions = questionIds.length > 0
      ? await db.selectFrom('questions').select(['id', 'prompt', 'kind']).where('id', 'in', questionIds).execute() as { id: number, prompt: string, kind: string }[]
      : []

    quizzes.push({
      lessonId: lesson.id,
      title: lesson.title,
      sat: sitters.size,
      passed: passers.size,
      passRate: rate(passers.size, sitters.size),
      averagePercent: Math.round(attempts.reduce((sum, row) => sum + row.percent, 0) / attempts.length),
      items: itemAnalysis(questions, answers.map(row => ({ question_id: row.question_id, is_correct: Boolean(row.is_correct) }))),
    })
  }

  const reviews = await db.selectFrom('course_reviews').select(['rating']).where('course_id', '=', course.id).where('hidden_at', 'is', null).execute() as { rating: number }[]
  const completed = enrollments.filter(row => row.status === 'completed').length

  return {
    enrolled: enrollments.length,
    completed,
    completionRate: rate(completed, enrollments.length),
    started: new Set(done.map(row => row.enrollment_id)).size,
    funnel: funnelOf(lessons, enrollments.length, completedByLesson),
    quizzes,
    enrollments: weekly(enrollments.map(row => row.created_at), 8, now),
    rating: {
      count: reviews.length,
      average: reviews.length > 0 ? Math.round((reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length) * 10) / 10 : null,
    },
  }
}
