import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { addLesson, addSection, createCourse, publishCourse } from '../../app/Support/courses'
import { completeLesson, enroll, EnrollmentError, enrollmentOf, lessonForLearner } from '../../app/Support/enrollment'
import { gradebookCsv, gradebookOf, setAccess } from '../../app/Support/gradebook'
import { standings, toCsv } from '../../app/Support/grading'
import { QuizError, quizForLearner, reopenQuiz, saveQuestion, startAttempt, submitAttempt, updateQuiz } from '../../app/Support/quizzes'

/**
 * What staff see of their Learners, and what they can do about it: read the
 * gradebook, export it, remove and restore access, hand back quiz attempts.
 */

describe('standings from attempts', () => {
  test('the best attempt is the one that shows, and only finished ones count', () => {
    const result = standings([
      { quizId: 1, enrollmentId: 7, status: 'submitted', percent: 40, passed: false },
      { quizId: 1, enrollmentId: 7, status: 'submitted', percent: 90, passed: true },
      { quizId: 1, enrollmentId: 7, status: 'submitted', percent: 60, passed: false },
      { quizId: 1, enrollmentId: 7, status: 'expired', percent: 0, passed: false },
      { quizId: 1, enrollmentId: 7, status: 'open', percent: 0, passed: false },
      { quizId: 1, enrollmentId: 7, status: 'voided', percent: 100, passed: true },
      { quizId: 2, enrollmentId: 7, status: 'submitted', percent: 10, passed: false },
    ])
    expect(result.get('7:1')).toEqual({ attempts: 4, best: 90, passed: true, waiting: false })
    expect(result.get('7:2')).toEqual({ attempts: 1, best: 10, passed: false, waiting: false })
    expect(result.get('8:1')).toBeUndefined()
  })
})

describe('csv', () => {
  test('quotes every cell and doubles quotes inside', () => {
    expect(toCsv([['a', 'b "c"', 3, null]])).toBe('"a","b ""c""","3",""\r\n')
  })

  test('a cell that would run as a formula is defused', () => {
    const csv = toCsv([['=HYPERLINK("http://x")', '+1', '-2', '@sum', 'plain', -5]])
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")"')
    expect(csv).toContain('"\'+1"')
    expect(csv).toContain('"\'-2"')
    expect(csv).toContain('"\'@sum"')
    expect(csv).toContain('"plain"')
    // A real negative number is a number, not an attack.
    expect(csv).toContain('"-5"')
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: number[] = []
const teamIds: number[] = []

async function makeUser(label: string, name: string): Promise<number> {
  const row = await db.insertInto('users').values({ name, email: `grade-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }
  userIds.push(row.id)
  return row.id
}

let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let otherCourse: CourseRow
let ada: number
let ben: number
let readingId: number
let quizId: number
let questionId: number
let right: number
let wrong: number

beforeAll(async () => {
  const owner = await makeUser('owner', 'Owner')
  const rival = await makeUser('rival', 'Rival')
  ada = await makeUser('ada', 'Ada')
  ben = await makeUser('ben', '=cmd|calc')

  academy = await createAcademy({ ownerId: owner, name: 'Grade School', slug: `grade-${stamp}` })
  other = await createAcademy({ ownerId: rival, name: 'Other', slug: `grade-other-${stamp}` })
  teamIds.push(academy.team_id, other.team_id)
  otherCourse = await createCourse(other, { title: 'Elsewhere' })

  course = await createCourse(academy, { title: 'Knots' })
  const section = await addSection(course, { title: 'One' })
  readingId = (await addLesson(course, { sectionId: section.id, title: 'Read' })).id
  quizId = (await addLesson(course, { sectionId: section.id, title: 'Knot quiz', kind: 'quiz' })).id
  const question = await saveQuestion(course, quizId, { kind: 'single', prompt: 'Best knot?', options: [{ label: 'Bowline', correct: true }, { label: 'Granny', correct: false }] })
  questionId = question.id
  right = question.options[0]!.id
  wrong = question.options[1]!.id
  await updateQuiz(course, quizId, { maxAttempts: 1 })
  course = await publishCourse(course)
})

afterAll(async () => {
  const courses = await db.selectFrom('courses').select(['id']).where('team_id', 'in', teamIds).execute() as { id: number }[]
  const courseIds = courses.map(row => row.id)
  const quizzes = await db.selectFrom('quizzes').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
  const quizIds = quizzes.map(row => row.id)
  if (quizIds.length > 0) {
    const attempts = await db.selectFrom('quiz_attempts').select(['id']).where('quiz_id', 'in', quizIds).execute() as { id: number }[]
    if (attempts.length > 0)
      await db.deleteFrom('attempt_answers').where('quiz_attempt_id', 'in', attempts.map(row => row.id)).execute()
    await db.deleteFrom('quiz_attempts').where('quiz_id', 'in', quizIds).execute()
    const questions = await db.selectFrom('questions').select(['id']).where('quiz_id', 'in', quizIds).execute() as { id: number }[]
    if (questions.length > 0)
      await db.deleteFrom('question_options').where('question_id', 'in', questions.map(row => row.id)).execute()
    await db.deleteFrom('questions').where('quiz_id', 'in', quizIds).execute()
    await db.deleteFrom('quizzes').where('id', 'in', quizIds).execute()
  }
  await db.deleteFrom('certificates').where('course_id', 'in', courseIds).execute()
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('enrollments').where('course_id', 'in', courseIds).execute()
  await db.deleteFrom('lessons').where('course_id', 'in', courseIds).execute()
  await db.deleteFrom('course_sections').where('course_id', 'in', courseIds).execute()
  await db.deleteFrom('courses').where('id', 'in', courseIds).execute()
  await db.deleteFrom('academies').where('team_id', 'in', teamIds).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teamIds).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teamIds).execute()
  await db.deleteFrom('teams').where('id', 'in', teamIds).execute()
  await db.deleteFrom('users').where('id', 'in', userIds).execute()
})

describe('the gradebook', () => {
  test('an empty course has its quiz columns and no learners', async () => {
    const book = await gradebookOf(course)
    expect(book.quizzes.map(quiz => quiz.title)).toEqual(['Knot quiz'])
    expect(book.learners).toEqual([])
  })

  test('shows each learner with progress, best quiz result and certificate', async () => {
    await enroll(ada, course)
    await enroll(ben, course)

    await completeLesson(ada, readingId)
    const passing = await startAttempt(ada, quizId)
    await submitAttempt(ada, passing.id, { [questionId]: right })

    const failing = await startAttempt(ben, quizId)
    await submitAttempt(ben, failing.id, { [questionId]: wrong })

    const book = await gradebookOf(course)
    const adaRow = book.learners.find(learner => learner.userId === ada)!
    const benRow = book.learners.find(learner => learner.userId === ben)!

    expect(adaRow.percent).toBe(100)
    expect(adaRow.status).toBe('completed')
    expect(adaRow.quizzes[quizId]).toEqual({ attempts: 1, best: 100, passed: true, waiting: false })
    expect(adaRow.certificate).toMatch(/^CUR-/)

    expect(benRow.percent).toBe(0)
    expect(benRow.quizzes[quizId]).toEqual({ attempts: 1, best: 0, passed: false, waiting: false })
    expect(benRow.certificate).toBeNull()
  })

  test('another academy sees none of it', async () => {
    expect((await gradebookOf(otherCourse)).learners).toEqual([])
    const benEnrollment = await enrollmentOf(ben, course.id)
    await expect(setAccess(otherCourse, benEnrollment!.id, false)).rejects.toThrow(EnrollmentError)
    await expect(reopenQuiz(otherCourse, quizId, benEnrollment!.id)).rejects.toThrow(QuizError)
  })

  test('exports as csv, with a hostile name defused', async () => {
    const csv = gradebookCsv(await gradebookOf(course))
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('"Name","Email","Status","Enrolled","Completed","Progress %","Knot quiz (best %)","Certificate"')
    expect(lines).toHaveLength(3)
    expect(csv).toContain('"\'=cmd|calc"')
    expect(csv).toContain('"Ada"')
  })
})

describe('what staff can do', () => {
  test('a learner out of attempts gets them back, and the old one stays on record', async () => {
    expect((await quizForLearner(ben, quizId)).attemptsLeft).toBe(0)
    await expect(startAttempt(ben, quizId)).rejects.toThrow(/every attempt/)

    const benEnrollment = await enrollmentOf(ben, course.id)
    expect(await reopenQuiz(course, quizId, benEnrollment!.id)).toBe(1)

    const quiz = await quizForLearner(ben, quizId)
    expect(quiz.attemptsLeft).toBe(1)
    expect(quiz.attempts).toEqual([])
    const kept = await db.selectFrom('quiz_attempts').select(['status']).where('enrollment_id', '=', benEnrollment!.id).execute() as { status: string }[]
    expect(kept.map(row => row.status)).toEqual(['voided'])
    // The gradebook no longer counts it either.
    expect((await gradebookOf(course)).learners.find(learner => learner.userId === ben)!.quizzes[quizId]).toBeUndefined()
  })

  test('reopening leaves a passed attempt alone', async () => {
    const adaEnrollment = await enrollmentOf(ada, course.id)
    expect(await reopenQuiz(course, quizId, adaEnrollment!.id)).toBe(0)
    expect((await quizForLearner(ada, quizId)).passed).toBe(true)
  })

  test('an attempt voided while open cannot be handed in', async () => {
    const attempt = await startAttempt(ben, quizId)
    const benEnrollment = await enrollmentOf(ben, course.id)
    await reopenQuiz(course, quizId, benEnrollment!.id)
    await expect(submitAttempt(ben, attempt.id, { [questionId]: right })).rejects.toThrow(/closed by your instructor/)
  })

  test('removing access closes the content and restoring returns the learner where they were', async () => {
    const adaEnrollment = await enrollmentOf(ada, course.id)
    expect(await setAccess(course, adaEnrollment!.id, false)).toBe('revoked')
    expect(await lessonForLearner(ada, readingId)).toBeNull()
    await expect(enroll(ada, course)).rejects.toThrow(EnrollmentError)

    // Ada had completed the course: she comes back completed, not merely active.
    expect(await setAccess(course, adaEnrollment!.id, true)).toBe('completed')
    expect((await lessonForLearner(ada, readingId))?.completed).toBe(true)

    const benEnrollment = await enrollmentOf(ben, course.id)
    await setAccess(course, benEnrollment!.id, false)
    expect(await setAccess(course, benEnrollment!.id, true)).toBe('active')
  })
})
