import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import type { GradableQuestion } from '../../app/Support/grading'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { certificateOf } from '../../app/Support/certificates'
import { addLesson, addSection, createCourse, deleteLesson, publishCourse } from '../../app/Support/courses'
import { enroll, enrollmentOf, progressOf } from '../../app/Support/enrollment'
import { gradebookOf } from '../../app/Support/gradebook'
import { essayPoints, gradeAttempt, isCorrect, questionProblem, standings, tally } from '../../app/Support/grading'
import { essaysToMark, markEssay, QuizError, quizForLearner, reopenQuiz, saveQuestion, startAttempt, submitAttempt, updateQuiz } from '../../app/Support/quizzes'

/** Essay questions: answered in words, marked by a person. */

const choice: GradableQuestion = { id: 1, kind: 'single', points: 2, accepted: null, options: [{ id: 5, is_correct: true }, { id: 6, is_correct: false }] }
const essay: GradableQuestion = { id: 2, kind: 'essay', points: 8, accepted: null, options: [] }

describe('the rules for an essay', () => {
  test('needs only its wording, and is never right by machine', () => {
    expect(questionProblem({ kind: 'essay', prompt: 'Explain a bowline.' })).toBeNull()
    expect(questionProblem({ kind: 'essay', prompt: ' ' })).toBeTruthy()
    expect(isCorrect(essay, 'A long and thoughtful answer.')).toBe(false)
  })

  test('a written essay holds the result back, even when the points so far would pass', () => {
    const graded = gradeAttempt([choice, essay], { 1: 5, 2: 'Words.' }, 20)
    expect(graded).toMatchObject({ score: 2, max: 10, pending: true, passed: false })
    expect(graded.answers.map(answer => answer.pending)).toEqual([false, true])
  })

  test('a blank essay is simply wrong: nothing to mark', () => {
    expect(gradeAttempt([choice, essay], { 1: 5, 2: '   ' }, 20)).toMatchObject({ score: 2, pending: false, passed: true })
    expect(gradeAttempt([choice, essay], { 1: 5 }, 50)).toMatchObject({ pending: false, passed: false })
  })

  test('a marker gives whole points within what the question is worth', () => {
    expect(essayPoints(0, 8)).toBe(0)
    expect(essayPoints('8', 8)).toBe(8)
    for (const bad of [9, -1, 2.5, '', null, undefined, 'lots', true])
      expect(essayPoints(bad, 8)).toBeNull()
  })

  test('the pass is decided on points, not the rounded percent', () => {
    expect(tally(7, 10, 70)).toEqual({ percent: 70, passed: true })
    expect(tally(696, 1000, 70)).toEqual({ percent: 70, passed: false })
    expect(tally(0, 0, 0)).toEqual({ percent: 0, passed: false })
  })

  test('an attempt with a marker counts as used, and its part score is not a best', () => {
    const result = standings([
      { quizId: 1, enrollmentId: 7, status: 'submitted', percent: 40, passed: false },
      { quizId: 1, enrollmentId: 7, status: 'review', percent: 90, passed: false },
      { quizId: 2, enrollmentId: 7, status: 'review', percent: 20, passed: false },
    ])
    expect(result.get('7:1')).toEqual({ attempts: 2, best: 40, passed: false, waiting: true })
    expect(result.get('7:2')).toEqual({ attempts: 1, best: null, passed: false, waiting: true })
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let owner: number
let rival: number
let ada: number
let ben: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let otherCourse: CourseRow
let quizLesson: number
let choiceId: number
let right: number
let wrong: number
let essayId: number
let secondEssayId: number

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Essay ${label}`, email: `essay-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  owner = await make('owner')
  rival = await make('rival')
  ada = await make('ada')
  ben = await make('ben')
  academy = await createAcademy({ ownerId: owner, name: 'Essay School', slug: `essay-${stamp}` })
  other = await createAcademy({ ownerId: rival, name: 'Essay Rival', slug: `essay-rival-${stamp}` })
  otherCourse = await createCourse(other, { title: 'Elsewhere' })

  course = await createCourse(academy, { title: 'Knots in words' })
  const section = await addSection(course, { title: 'One' })
  quizLesson = (await addLesson(course, { sectionId: section.id, title: 'Explain it', kind: 'quiz' })).id
  const question = await saveQuestion(course, quizLesson, { kind: 'single', prompt: 'Best knot?', points: 2, options: [{ label: 'Bowline', correct: true }, { label: 'Granny', correct: false }] })
  choiceId = question.id
  right = question.options[0]!.id
  wrong = question.options[1]!.id
  essayId = (await saveQuestion(course, quizLesson, { kind: 'essay', prompt: 'Why does a bowline hold?', points: 5 })).id
  secondEssayId = (await saveQuestion(course, quizLesson, { kind: 'essay', prompt: 'When would you not use one?', points: 3 })).id
  await updateQuiz(course, quizLesson, { passPercent: 70, maxAttempts: 2, reveal: 'after_submit' })
  course = await publishCourse(course)
  await enroll(ada, course)
  await enroll(ben, course)
})

afterAll(async () => {
  await deleteLesson(course, quizLesson).catch(() => {})
  for (const item of [course, otherCourse]) {
    await db.deleteFrom('certificates').where('course_id', '=', item.id).execute()
    const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', item.id).execute() as { id: number }[]
    if (enrollments.length > 0)
      await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
    await db.deleteFrom('enrollments').where('course_id', '=', item.id).execute()
    await db.deleteFrom('lessons').where('course_id', '=', item.id).execute()
    await db.deleteFrom('course_sections').where('course_id', '=', item.id).execute()
    await db.deleteFrom('courses').where('id', '=', item.id).execute()
  }
  const teams = [academy.team_id, other.team_id]
  await db.deleteFrom('academies').where('team_id', 'in', teams).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teams).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teams).execute()
  await db.deleteFrom('teams').where('id', 'in', teams).execute()
  await db.deleteFrom('users').where('id', 'in', [owner, rival, ada, ben]).execute()
})

describe('an essay from answer to result', () => {
  test('is asked with nothing to choose from', async () => {
    const attempt = await startAttempt(ada, quizLesson)
    const asked = attempt.questions.find(question => question.id === essayId)!
    expect(asked).toMatchObject({ kind: 'essay', options: [] })
  })

  test('handing in sends the attempt to a marker: no pass, no reveal, no new attempt', async () => {
    const attempt = await startAttempt(ada, quizLesson)
    const result = await submitAttempt(ada, attempt.id, { [choiceId]: right, [essayId]: '  The loop cannot slip.  ', [secondEssayId]: 'On a slick line.' })

    expect(result).toMatchObject({ pending: true, passed: false, revealed: false, score: 2, max: 10 })
    expect(result.questions.every(question => question.correctOptionIds === undefined)).toBe(true)
    expect(result.quiz).toMatchObject({ waiting: true, passed: false, open: null })
    expect(result.quiz.attempts.map(item => item.status)).toEqual(['review'])
    expect(result.progress.completedIds).not.toContain(quizLesson)
    await expect(startAttempt(ada, quizLesson)).rejects.toThrow(/waiting for a mark/)
  })

  test('the marking queue shows each answer, trimmed, with what it is worth', async () => {
    const queue = await essaysToMark(course)
    expect(queue).toHaveLength(2)
    expect(queue[0]).toMatchObject({ lessonId: quizLesson, lessonTitle: 'Explain it', prompt: 'Why does a bowline hold?', response: 'The loop cannot slip.', max: 5 })
    expect(queue[0]!.learner.name).toBe('Essay ada')
    expect(await essaysToMark(otherCourse)).toEqual([])
  })

  test('the gradebook says the learner is waiting, not that they failed', async () => {
    const book = await gradebookOf(course)
    const row = book.learners.find(learner => learner.userId === ada)!
    expect(row.quizzes[quizLesson]).toEqual({ attempts: 1, best: null, passed: false, waiting: true })
  })

  test('another academy cannot mark it, and points must fit the question', async () => {
    const [first] = await essaysToMark(course)
    await expect(markEssay(otherCourse, first!.answerId, rival, { points: 5 })).rejects.toThrow(/not part of this course/)
    await expect(markEssay(course, first!.answerId, owner, { points: 6 })).rejects.toThrow(/0 to 5/)
    await expect(markEssay(course, first!.answerId, owner, {})).rejects.toThrow(QuizError)
  })

  test('the result waits until the last essay is marked', async () => {
    const [first, second] = await essaysToMark(course)
    expect(await markEssay(course, first!.answerId, owner, { points: 4, feedback: ' Clear. ' })).toMatchObject({ finished: false })
    expect((await quizForLearner(ada, quizLesson)).waiting).toBe(true)
    await expect(markEssay(course, first!.answerId, owner, { points: 5 })).rejects.toThrow(/already been marked/)

    // 2 + 4 + 2 = 8 of 10: over the 70% pass mark.
    expect(await markEssay(course, second!.answerId, owner, { points: 2 })).toEqual({ finished: true, passed: true, percent: 80 })
    expect(await essaysToMark(course)).toEqual([])
  })

  test('a pass by marking completes the lesson and the course, and the learner reads the feedback', async () => {
    const seen = await quizForLearner(ada, quizLesson)
    expect(seen).toMatchObject({ waiting: false, passed: true })
    expect(seen.attempts[0]).toMatchObject({ status: 'submitted', percent: 80, passed: true })
    expect(seen.attempts[0]!.notes).toContainEqual({ prompt: 'Why does a bowline hold?', points: 4, max: 5, feedback: 'Clear.' })

    const enrollment = await enrollmentOf(ada, course.id)
    expect((await progressOf(enrollment!)).completedIds).toContain(quizLesson)
    expect(enrollment?.status).toBe('completed')
    expect((await certificateOf(enrollment!.id))?.serial).toMatch(/^CUR-/)
  })

  test('a fail by marking leaves the lesson open and the next attempt free', async () => {
    const attempt = await startAttempt(ben, quizLesson)
    await submitAttempt(ben, attempt.id, { [choiceId]: wrong, [essayId]: 'It just does.' })
    const [only] = await essaysToMark(course)
    expect(await markEssay(course, only!.answerId, owner, { points: 1 })).toEqual({ finished: true, passed: false, percent: 10 })

    const seen = await quizForLearner(ben, quizLesson)
    expect(seen).toMatchObject({ waiting: false, passed: false, attemptsLeft: 1 })
    expect((await startAttempt(ben, quizLesson)).id).not.toBe(attempt.id)
  })

  test('an attempt given back while it waits leaves nothing to mark', async () => {
    const attempt = await startAttempt(ben, quizLesson)
    await submitAttempt(ben, attempt.id, { [essayId]: 'Second try.' })
    const [waiting] = await essaysToMark(course)
    const enrollment = await enrollmentOf(ben, course.id)
    await reopenQuiz(course, quizLesson, enrollment!.id)

    expect(await essaysToMark(course)).toEqual([])
    await expect(markEssay(course, waiting!.answerId, owner, { points: 5 })).rejects.toThrow(/given back/)
    expect((await quizForLearner(ben, quizLesson)).attemptsLeft).toBe(2)
  })
})
