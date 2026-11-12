/**
 * Quizzes against the database: writing one in the studio, sitting one as a
 * Learner. The rules themselves (what is right, what passes, what is late)
 * live in `grading.ts`; this file fetches, calls them and stores the outcome.
 */

import type { CourseRow } from './courses'
import type { EnrollmentRow, LearnerProgress } from './enrollment'
import type { AnswerKey, GradableQuestion, QuestionDraft, QuestionKind } from './grading'
import { db } from '@stacksjs/database'
import { completeLesson, enrollmentOf, progressOf, utc } from './enrollment'
import { attemptsLeft, countsAsUsed, deadlineOf, gradeAttempt, isLate, optionKinds, parseAccepted, questionProblem, shuffled } from './grading'
import { isPermutation } from './progress'

export class QuizError extends Error {}

export interface QuizRow {
  id: number
  lesson_id: number
  course_id: number
  team_id: number
  pass_percent: number
  max_attempts: number | null
  time_limit_seconds: number | null
  shuffle: boolean
  reveal: 'never' | 'after_submit' | 'after_pass'
}

const quizColumns = ['id', 'lesson_id', 'course_id', 'team_id', 'pass_percent', 'max_attempts', 'time_limit_seconds', 'shuffle', 'reveal'] as const
const reveals = ['never', 'after_submit', 'after_pass'] as const

export interface StudioOption {
  id: number
  label: string
  is_correct: boolean
  position: number
}

export interface StudioQuestion {
  id: number
  kind: QuestionKind
  prompt: string
  explanation: string | null
  points: number
  position: number
  options: StudioOption[]
  accepted: AnswerKey | null
}

function now(): string {
  return new Date().toISOString()
}

function quizFrom(row: Record<string, unknown>): QuizRow {
  return { ...(row as unknown as QuizRow), shuffle: Boolean(row.shuffle) }
}

async function quizOfLesson(lessonId: number): Promise<QuizRow | null> {
  const row = await db.selectFrom('quizzes').select([...quizColumns]).where('lesson_id', '=', lessonId).executeTakeFirst() as Record<string, unknown> | undefined
  return row ? quizFrom(row) : null
}

/** The Quiz behind a Lesson of this Course, or a refusal. */
async function quizInCourse(course: CourseRow, lessonId: number): Promise<QuizRow> {
  const quiz = await quizOfLesson(lessonId)
  if (!quiz || quiz.course_id !== course.id)
    throw new QuizError('That lesson is not a quiz in this course.')
  return quiz
}

async function questionsOf(quizId: number): Promise<StudioQuestion[]> {
  const rows = await db.selectFrom('questions').select(['id', 'kind', 'prompt', 'explanation', 'points', 'position', 'accepted']).where('quiz_id', '=', quizId).execute() as (Omit<StudioQuestion, 'options' | 'accepted'> & { accepted: string | null })[]
  if (rows.length === 0)
    return []

  const options = await db.selectFrom('question_options').select(['id', 'question_id', 'label', 'is_correct', 'position']).where('question_id', 'in', rows.map(row => row.id)).execute() as (Omit<StudioOption, 'is_correct'> & { question_id: number, is_correct: number | boolean })[]

  return rows
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map(row => ({
      ...row,
      accepted: parseAccepted(row.kind, row.accepted),
      options: options
        .filter(option => option.question_id === row.id)
        .sort((a, b) => a.position - b.position || a.id - b.id)
        .map(option => ({ id: option.id, label: option.label, is_correct: Boolean(option.is_correct), position: option.position })),
    }))
}

export async function quizForStudio(course: CourseRow, lessonId: number): Promise<{ quiz: QuizRow, questions: StudioQuestion[] }> {
  const quiz = await quizInCourse(course, lessonId)
  return { quiz, questions: await questionsOf(quiz.id) }
}

/** A whole number in range, or null for "no limit". Anything else is refused. */
function limit(value: unknown, min: number, max: number, message: string): number | null {
  if (value === null || value === '' || Number(value) === 0)
    return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max)
    throw new QuizError(message)
  return number
}

export async function updateQuiz(course: CourseRow, lessonId: number, input: { passPercent?: number, maxAttempts?: number | null, timeLimitSeconds?: number | null, shuffle?: boolean, reveal?: string }): Promise<QuizRow> {
  const quiz = await quizInCourse(course, lessonId)
  const next = { ...quiz }

  if (input.passPercent !== undefined) {
    if (!Number.isInteger(input.passPercent) || input.passPercent < 0 || input.passPercent > 100)
      throw new QuizError('The pass mark is a whole percent from 0 to 100.')
    next.pass_percent = input.passPercent
  }
  if (input.maxAttempts !== undefined)
    next.max_attempts = limit(input.maxAttempts, 1, 100, 'Attempts are a whole number from 1 to 100, or empty for no limit.')
  if (input.timeLimitSeconds !== undefined)
    next.time_limit_seconds = limit(input.timeLimitSeconds, 30, 86400, 'A time limit is between 30 seconds and 24 hours, or empty for none.')
  if (input.shuffle !== undefined)
    next.shuffle = Boolean(input.shuffle)
  if (input.reveal !== undefined) {
    if (!reveals.includes(input.reveal as QuizRow['reveal']))
      throw new QuizError('Answers are shown never, after submitting, or after passing.')
    next.reveal = input.reveal as QuizRow['reveal']
  }

  await db.updateTable('quizzes').set({
    pass_percent: next.pass_percent,
    max_attempts: next.max_attempts,
    time_limit_seconds: next.time_limit_seconds,
    shuffle: next.shuffle,
    reveal: next.reveal,
    updated_at: now(),
  }).where('id', '=', quiz.id).execute()

  return next
}

function acceptedJson(draft: QuestionDraft): string | null {
  if (draft.kind === 'text')
    return JSON.stringify({ answers: (draft.answers ?? []).map(answer => answer.trim()).filter(Boolean) })
  if (draft.kind === 'number')
    return JSON.stringify({ value: Number(draft.value), tolerance: Math.abs(Number(draft.tolerance) || 0) })
  if (draft.kind === 'matching')
    return JSON.stringify({ pairs: (draft.pairs ?? []).filter(pair => pair.left.trim() !== '').map(pair => ({ left: pair.left.trim(), right: pair.right.trim() })) })
  return null
}

/**
 * Write a question: a new one at the end, or `questionId` replaced whole. Its
 * options are rewritten each time, which is what makes "replace" simple;
 * Attempts already submitted keep their stored score either way.
 */
export async function saveQuestion(course: CourseRow, lessonId: number, draft: QuestionDraft & { explanation?: string }, questionId = 0): Promise<StudioQuestion> {
  const quiz = await quizInCourse(course, lessonId)
  const problem = questionProblem(draft)
  if (problem)
    throw new QuizError(problem)

  const fields = {
    kind: draft.kind as QuestionKind,
    prompt: draft.prompt.trim(),
    explanation: draft.explanation?.trim() || null,
    points: draft.points ?? 1,
    accepted: acceptedJson(draft),
  }

  let id = questionId
  if (id) {
    const existing = await db.selectFrom('questions').select(['id']).where('id', '=', id).where('quiz_id', '=', quiz.id).executeTakeFirst()
    if (!existing)
      throw new QuizError('That question is not part of this quiz.')
    await db.updateTable('questions').set({ ...fields, updated_at: now() }).where('id', '=', id).execute()
    await db.deleteFrom('question_options').where('question_id', '=', id).execute()
  }
  else {
    const rows = await db.selectFrom('questions').select(['position']).where('quiz_id', '=', quiz.id).execute() as { position: number }[]
    const position = rows.reduce((max, row) => Math.max(max, row.position + 1), 0)
    const row = await db.insertInto('questions').values({ ...fields, team_id: quiz.team_id, quiz_id: quiz.id, position }).returning(['id']).executeTakeFirst() as { id: number }
    id = row.id
  }

  if (optionKinds.includes(draft.kind as QuestionKind)) {
    const options = (draft.options ?? []).filter(option => option.label.trim() !== '')
    for (const [position, option] of options.entries())
      await db.insertInto('question_options').values({ team_id: quiz.team_id, question_id: id, label: option.label.trim(), is_correct: draft.kind !== 'ordering' && Boolean(option.correct), position }).execute()
  }

  const saved = (await questionsOf(quiz.id)).find(question => question.id === id)
  if (!saved)
    throw new QuizError('The question could not be saved.')
  return saved
}

export async function deleteQuestion(course: CourseRow, lessonId: number, questionId: number): Promise<void> {
  const quiz = await quizInCourse(course, lessonId)
  const existing = await db.selectFrom('questions').select(['id']).where('id', '=', questionId).where('quiz_id', '=', quiz.id).executeTakeFirst()
  if (!existing)
    throw new QuizError('That question is not part of this quiz.')

  await db.deleteFrom('attempt_answers').where('question_id', '=', questionId).execute()
  await db.deleteFrom('question_options').where('question_id', '=', questionId).execute()
  await db.deleteFrom('questions').where('id', '=', questionId).execute()
}

export async function reorderQuestions(course: CourseRow, lessonId: number, ids: number[]): Promise<void> {
  const quiz = await quizInCourse(course, lessonId)
  const rows = await db.selectFrom('questions').select(['id']).where('quiz_id', '=', quiz.id).execute() as { id: number }[]
  if (!isPermutation(rows.map(row => row.id), ids))
    throw new QuizError('That is not the full list of this quiz\'s questions.')

  for (const [position, id] of ids.entries())
    await db.updateTable('questions').set({ position }).where('id', '=', id).execute()
}

// ---------------------------------------------------------------------------
// Sitting a Quiz
// ---------------------------------------------------------------------------

export interface AttemptRow {
  id: number
  quiz_id: number
  user_id: number
  enrollment_id: number
  status: 'open' | 'submitted' | 'expired' | 'voided'
  score_points: number
  max_points: number
  percent: number
  passed: boolean
  started_at: string
  submitted_at: string | null
}

const attemptColumns = ['id', 'quiz_id', 'user_id', 'enrollment_id', 'status', 'score_points', 'max_points', 'percent', 'passed', 'started_at', 'submitted_at'] as const

function attemptFrom(row: Record<string, unknown>): AttemptRow {
  return { ...(row as unknown as AttemptRow), passed: Boolean(row.passed) }
}

/** A Learner's Attempts that still count. Voided ones were given back by staff. */
async function attemptsOf(quizId: number, enrollmentId: number): Promise<AttemptRow[]> {
  const rows = await db.selectFrom('quiz_attempts').select([...attemptColumns]).where('quiz_id', '=', quizId).where('enrollment_id', '=', enrollmentId).orderBy('id', 'asc').execute() as Record<string, unknown>[]
  return rows.map(attemptFrom).filter(attempt => countsAsUsed(attempt.status))
}

/**
 * Give a Learner their Attempts back: every Attempt they did not pass is
 * voided, so it stays on record but no longer counts against the limit. A
 * passed Attempt is left alone; there is nothing to reopen once it is passed.
 */
export async function reopenQuiz(course: CourseRow, lessonId: number, enrollmentId: number): Promise<number> {
  const quiz = await quizInCourse(course, lessonId)
  const enrollment = await db.selectFrom('enrollments').select(['id']).where('id', '=', enrollmentId).where('course_id', '=', course.id).executeTakeFirst()
  if (!enrollment)
    throw new QuizError('That learner is not enrolled in this course.')

  const spent = (await attemptsOf(quiz.id, enrollmentId)).filter(attempt => !attempt.passed)
  if (spent.length > 0)
    await db.updateTable('quiz_attempts').set({ status: 'voided', updated_at: now() }).where('id', 'in', spent.map(attempt => attempt.id)).execute()
  return spent.length
}

/** A question as a Learner sees it before answering: no key, no flags. */
export interface AskedQuestion {
  id: number
  kind: QuestionKind
  prompt: string
  points: number
  options: { id: number, label: string }[]
  /** `matching` only: the items to match, in order, and what they can be matched to, shuffled. */
  lefts?: string[]
  rights?: string[]
}

/**
 * A shuffle that never hands the items back in the order they came in (when
 * there is more than one): an ordering question shown already in order would
 * answer itself.
 */
function scrambled<T>(items: T[], seed: number): T[] {
  for (let turn = 0; turn < 8; turn++) {
    const result = shuffled(items, seed + turn * 7919)
    if (items.length < 2 || result.some((item, index) => item !== items[index]))
      return result
  }
  return [...items].reverse()
}

function asked(questions: StudioQuestion[], quiz: QuizRow, attemptId: number): AskedQuestion[] {
  const ordered = quiz.shuffle ? shuffled(questions, attemptId) : questions
  return ordered.map((question) => {
    const seed = attemptId + question.id
    const base = { id: question.id, kind: question.kind, prompt: question.prompt, points: question.points }

    if (question.kind === 'matching') {
      const pairs = question.accepted && 'pairs' in question.accepted ? question.accepted.pairs : []
      return { ...base, options: [], lefts: pairs.map(pair => pair.left), rights: scrambled(pairs.map(pair => pair.right), seed) }
    }

    // Ordering is always scrambled: its stored order is the answer. Choices
    // are shuffled with the questions, except true/false, which reads oddly
    // as "False, True".
    const options = question.kind === 'ordering'
      ? scrambled(question.options, seed)
      : (quiz.shuffle && question.kind !== 'true_false' ? shuffled(question.options, seed) : question.options)
    return { ...base, options: options.map(option => ({ id: option.id, label: option.label })) }
  })
}

interface Sitting {
  quiz: QuizRow
  enrollment: EnrollmentRow
  progress: LearnerProgress
}

/**
 * The Quiz behind a Lesson, for a Learner allowed to open that Lesson. One
 * answer for "no such quiz" and "not yours", as with Lesson content.
 */
async function sittingOf(userId: number, lessonId: number, at: Date): Promise<Sitting> {
  const quiz = await quizOfLesson(lessonId)
  const enrollment = quiz ? await enrollmentOf(userId, quiz.course_id) : null
  if (!quiz || !enrollment || enrollment.status === 'revoked')
    throw new QuizError('You are not enrolled in this course.')

  const progress = await progressOf(enrollment, at)
  const closed = progress.locked[lessonId]
  if (closed)
    throw new QuizError(closed.reason === 'drip' ? 'This lesson is not open yet.' : 'Complete the earlier lessons first.')

  return { quiz, enrollment, progress }
}

/** Close Attempts whose time ran out without a submission: they score zero. */
async function expireStale(quiz: QuizRow, attempts: AttemptRow[], at: Date): Promise<AttemptRow[]> {
  for (const attempt of attempts) {
    if (attempt.status === 'open' && isLate(deadlineOf(utc(attempt.started_at), quiz.time_limit_seconds), at)) {
      await db.updateTable('quiz_attempts').set({ status: 'expired', submitted_at: at.toISOString(), updated_at: at.toISOString() }).where('id', '=', attempt.id).where('status', '=', 'open').execute()
      attempt.status = 'expired'
    }
  }
  return attempts
}

export interface AttemptSummary {
  id: number
  status: AttemptRow['status']
  percent: number
  passed: boolean
  submittedAt: string | null
}

export interface OpenAttempt {
  id: number
  startedAt: string
  /** ISO time the Attempt closes, or null when the Quiz is untimed. */
  deadline: string | null
  questions: AskedQuestion[]
}

export interface LearnerQuiz {
  passPercent: number
  maxAttempts: number | null
  timeLimitSeconds: number | null
  questionCount: number
  totalPoints: number
  attempts: AttemptSummary[]
  /** Null: no limit. */
  attemptsLeft: number | null
  passed: boolean
  /** The Attempt in progress, if the Learner left one open. */
  open: OpenAttempt | null
}

function openAttempt(attempt: AttemptRow, quiz: QuizRow, questions: StudioQuestion[]): OpenAttempt {
  const started = utc(attempt.started_at)
  return {
    id: attempt.id,
    startedAt: started.toISOString(),
    deadline: deadlineOf(started, quiz.time_limit_seconds)?.toISOString() ?? null,
    questions: asked(questions, quiz, attempt.id),
  }
}

function describe(quiz: QuizRow, questions: StudioQuestion[], attempts: AttemptRow[]): LearnerQuiz {
  const closed = attempts.filter(attempt => attempt.status !== 'open')
  const open = attempts.find(attempt => attempt.status === 'open')

  return {
    passPercent: quiz.pass_percent,
    maxAttempts: quiz.max_attempts,
    timeLimitSeconds: quiz.time_limit_seconds,
    questionCount: questions.length,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    attempts: closed.map(attempt => ({ id: attempt.id, status: attempt.status, percent: attempt.percent, passed: attempt.passed, submittedAt: attempt.submitted_at })),
    attemptsLeft: attemptsLeft(quiz.max_attempts, attempts.length),
    passed: closed.some(attempt => attempt.passed),
    open: open ? openAttempt(open, quiz, questions) : null,
  }
}

export async function quizForLearner(userId: number, lessonId: number, at: Date = new Date()): Promise<LearnerQuiz> {
  const { quiz, enrollment } = await sittingOf(userId, lessonId, at)
  const attempts = await expireStale(quiz, await attemptsOf(quiz.id, enrollment.id), at)
  return describe(quiz, await questionsOf(quiz.id), attempts)
}

/**
 * Start an Attempt, or hand back the one already open: pressing "start" twice,
 * or reloading the page, must not burn a second Attempt.
 */
export async function startAttempt(userId: number, lessonId: number, at: Date = new Date()): Promise<OpenAttempt> {
  const { quiz, enrollment } = await sittingOf(userId, lessonId, at)
  const questions = await questionsOf(quiz.id)
  if (questions.length === 0)
    throw new QuizError('This quiz has no questions yet.')

  const attempts = await expireStale(quiz, await attemptsOf(quiz.id, enrollment.id), at)
  const open = attempts.find(attempt => attempt.status === 'open')
  if (open)
    return openAttempt(open, quiz, questions)

  if (attemptsLeft(quiz.max_attempts, attempts.length) === 0)
    throw new QuizError('You have used every attempt at this quiz.')

  const row = await db.insertInto('quiz_attempts').values({
    user_id: userId,
    quiz_id: quiz.id,
    enrollment_id: enrollment.id,
    status: 'open',
    started_at: at.toISOString(),
    uuid: crypto.randomUUID(),
  }).returning(['id']).executeTakeFirst() as { id: number }

  const created = (await attemptsOf(quiz.id, enrollment.id)).find(attempt => attempt.id === row.id)
  if (!created)
    throw new QuizError('The attempt could not be started.')
  return openAttempt(created, quiz, questions)
}

export interface ReviewedQuestion {
  id: number
  correct: boolean
  points: number
  /** Present only when the Quiz reveals answers for this result. */
  correctOptionIds?: number[]
  accepted?: AnswerKey | null
  explanation?: string | null
}

export interface AttemptResult {
  attemptId: number
  score: number
  max: number
  percent: number
  passed: boolean
  revealed: boolean
  questions: ReviewedQuestion[]
  quiz: LearnerQuiz
  progress: LearnerProgress
  courseCompleted: boolean
}

function gradable(question: StudioQuestion): GradableQuestion {
  return { id: question.id, kind: question.kind, points: question.points, options: question.options, accepted: question.accepted }
}

/**
 * Submit an Attempt. Graded here, on the server, against the key the Learner
 * never saw. Passing completes the Lesson (and, when it was the last one, the
 * Course). An Attempt is submitted once: a second submission is refused, so a
 * Learner cannot see the answers and then send better ones.
 */
export async function submitAttempt(userId: number, attemptId: number, responses: Record<number, unknown>, at: Date = new Date()): Promise<AttemptResult> {
  const raw = await db.selectFrom('quiz_attempts').select([...attemptColumns]).where('id', '=', attemptId).where('user_id', '=', userId).executeTakeFirst() as Record<string, unknown> | undefined
  if (!raw)
    throw new QuizError('That attempt was not found.')
  const attempt = attemptFrom(raw)

  const quizRow = await db.selectFrom('quizzes').select([...quizColumns]).where('id', '=', attempt.quiz_id).executeTakeFirst() as Record<string, unknown> | undefined
  if (!quizRow)
    throw new QuizError('That attempt was not found.')
  const quiz = quizFrom(quizRow)
  const { enrollment } = await sittingOf(userId, quiz.lesson_id, at)

  if (attempt.status !== 'open')
    throw new QuizError(attempt.status === 'expired' ? 'Time ran out on this attempt.' : (attempt.status === 'voided' ? 'This attempt was closed by your instructor. Start a new one.' : 'This attempt was already submitted.'))

  const stamp = at.toISOString()
  if (isLate(deadlineOf(utc(attempt.started_at), quiz.time_limit_seconds), at)) {
    await db.updateTable('quiz_attempts').set({ status: 'expired', submitted_at: stamp, updated_at: stamp }).where('id', '=', attempt.id).execute()
    throw new QuizError('Time ran out on this attempt.')
  }

  const questions = await questionsOf(quiz.id)
  const graded = gradeAttempt(questions.map(gradable), responses, quiz.pass_percent)

  // Claim the Attempt first: of two submissions racing, only the one that
  // flips `open` to `submitted` goes on to write answers.
  const claimed = await db.updateTable('quiz_attempts').set({
    status: 'submitted',
    score_points: graded.score,
    max_points: graded.max,
    percent: graded.percent,
    passed: graded.passed,
    submitted_at: stamp,
    updated_at: stamp,
  }).where('id', '=', attempt.id).where('status', '=', 'open').returning(['id']).execute() as { id: number }[]
  if (claimed.length === 0)
    throw new QuizError('This attempt was already submitted.')

  for (const answer of graded.answers) {
    const response = responses[answer.questionId]
    await db.insertInto('attempt_answers').values({
      quiz_attempt_id: attempt.id,
      question_id: answer.questionId,
      response: response === undefined ? null : JSON.stringify(response).slice(0, 8000),
      is_correct: answer.correct,
      points_awarded: answer.points,
    }).execute()
  }

  let courseCompleted = enrollment.status === 'completed'
  if (graded.passed) {
    const done = await completeLesson(userId, quiz.lesson_id, at, { viaQuiz: true })
    courseCompleted = done.enrollment.status === 'completed'
  }

  const revealed = quiz.reveal === 'after_submit' || (quiz.reveal === 'after_pass' && graded.passed)
  const attempts = await attemptsOf(quiz.id, enrollment.id)

  return {
    attemptId: attempt.id,
    score: graded.score,
    max: graded.max,
    percent: graded.percent,
    passed: graded.passed,
    revealed,
    questions: graded.answers.map((answer) => {
      const question = questions.find(item => item.id === answer.questionId) as StudioQuestion
      return revealed
        ? { id: answer.questionId, correct: answer.correct, points: answer.points, correctOptionIds: (question.kind === 'ordering' ? question.options : question.options.filter(option => option.is_correct)).map(option => option.id), accepted: question.accepted, explanation: question.explanation }
        : { id: answer.questionId, correct: answer.correct, points: answer.points }
    }),
    quiz: describe(quiz, questions, attempts),
    progress: await progressOf(enrollment, at),
    courseCompleted,
  }
}
