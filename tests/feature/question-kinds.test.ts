import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import type { GradableQuestion } from '../../app/Support/grading'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { addLesson, addSection, createCourse, deleteLesson, publishCourse } from '../../app/Support/courses'
import { enroll } from '../../app/Support/enrollment'
import { isCorrect, parseAccepted, questionProblem } from '../../app/Support/grading'
import { QuizError, quizForStudio, saveQuestion, startAttempt, submitAttempt } from '../../app/Support/quizzes'

/** Ordering and matching: the two kinds whose answer is an arrangement. */

const ordering: GradableQuestion = { id: 1, kind: 'ordering', points: 1, accepted: null, options: [{ id: 5, is_correct: false }, { id: 9, is_correct: false }, { id: 7, is_correct: false }] }
const matching: GradableQuestion = { id: 2, kind: 'matching', points: 1, options: [], accepted: { pairs: [{ left: 'Bow', right: 'Front' }, { left: 'Stern', right: 'Back' }] } }

describe('grading an arrangement', () => {
  test('ordering is right only in exactly the stored order', () => {
    expect(isCorrect(ordering, [5, 9, 7])).toBe(true)
    expect(isCorrect(ordering, ['5', '9', '7'])).toBe(true)
    expect(isCorrect(ordering, [9, 5, 7])).toBe(false)
    expect(isCorrect(ordering, [5, 9])).toBe(false)
    expect(isCorrect(ordering, [5, 9, 7, 7])).toBe(false)
    expect(isCorrect(ordering, 5)).toBe(false)
  })

  test('matching is right only when every item has its partner', () => {
    expect(isCorrect(matching, { 0: 'front', 1: ' BACK ' })).toBe(true)
    expect(isCorrect(matching, { 0: 'Back', 1: 'Front' })).toBe(false)
    expect(isCorrect(matching, { 0: 'Front' })).toBe(false)
    expect(isCorrect(matching, ['Front', 'Back'])).toBe(false)
    expect(isCorrect({ ...matching, accepted: null }, { 0: 'Front', 1: 'Back' })).toBe(false)
  })

  test('what can be written', () => {
    const items = [{ label: 'One', correct: false }, { label: 'Two', correct: false }]
    expect(questionProblem({ kind: 'ordering', prompt: 'Order', options: items })).toBeNull()
    expect(questionProblem({ kind: 'ordering', prompt: 'Order', options: [items[0]!] })).toBeTruthy()
    expect(questionProblem({ kind: 'ordering', prompt: 'Order', options: [items[0]!, { label: ' one', correct: false }] })).toBeTruthy()

    const pairs = [{ left: 'Bow', right: 'Front' }, { left: 'Stern', right: 'Back' }]
    expect(questionProblem({ kind: 'matching', prompt: 'Match', pairs })).toBeNull()
    // An empty trailing row is ignored, as in the answer rows of a choice.
    expect(questionProblem({ kind: 'matching', prompt: 'Match', pairs: [...pairs, { left: '', right: '' }] })).toBeNull()
    expect(questionProblem({ kind: 'matching', prompt: 'Match', pairs: [pairs[0]!] })).toBeTruthy()
    expect(questionProblem({ kind: 'matching', prompt: 'Match', pairs: [pairs[0]!, { left: 'Stern', right: '' }] })).toBeTruthy()
    expect(questionProblem({ kind: 'matching', prompt: 'Match', pairs: [pairs[0]!, { left: 'bow', right: 'Back' }] })).toBeTruthy()

    expect(parseAccepted('matching', JSON.stringify({ pairs }))).toEqual({ pairs })
    expect(parseAccepted('matching', JSON.stringify({ pairs: [pairs[0]] }))).toBeNull()
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let ownerId: number
let learnerId: number
let academy: AcademyRow
let course: CourseRow
let quizLesson: number

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Kinds ${label}`, email: `kinds-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  ownerId = await make('owner')
  learnerId = await make('learner')
  academy = await createAcademy({ ownerId, name: 'Kinds School', slug: `kinds-${stamp}` })
  course = await createCourse(academy, { title: 'Arrangements' })
  const section = await addSection(course, { title: 'One' })
  quizLesson = (await addLesson(course, { sectionId: section.id, title: 'Arrange', kind: 'quiz' })).id
})

afterAll(async () => {
  await deleteLesson(course, quizLesson).catch(() => {})
  await db.deleteFrom('certificates').where('course_id', '=', course.id).execute()
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', course.id).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('enrollments').where('course_id', '=', course.id).execute()
  await db.deleteFrom('lessons').where('course_id', '=', course.id).execute()
  await db.deleteFrom('course_sections').where('course_id', '=', course.id).execute()
  await db.deleteFrom('courses').where('id', '=', course.id).execute()
  await db.deleteFrom('academies').where('team_id', '=', academy.team_id).execute()
  await db.deleteFrom('sites').where('team_id', '=', academy.team_id).execute()
  await db.deleteFrom('team_members').where('team_id', '=', academy.team_id).execute()
  await db.deleteFrom('teams').where('id', '=', academy.team_id).execute()
  await db.deleteFrom('users').where('id', 'in', [ownerId, learnerId]).execute()
})

describe('an arrangement from writing to result', () => {
  test('is stored, asked without its answer, and graded', async () => {
    const order = await saveQuestion(course, quizLesson, { kind: 'ordering', prompt: 'Smallest first', options: ['Dinghy', 'Sloop', 'Schooner', 'Tanker'].map(label => ({ label, correct: true })) })
    const match = await saveQuestion(course, quizLesson, { kind: 'matching', prompt: 'Match the ends', pairs: [{ left: 'Bow', right: 'Front' }, { left: 'Stern', right: 'Back' }, { left: 'Port', right: 'Left' }] })
    await expect(saveQuestion(course, quizLesson, { kind: 'matching', prompt: 'Match', pairs: [{ left: 'Only', right: 'One' }] })).rejects.toThrow(QuizError)

    // Ordering rows carry no "correct" flag: the order is the answer.
    expect(order.options.map(option => option.is_correct)).toEqual([false, false, false, false])
    expect((await quizForStudio(course, quizLesson)).questions.map(question => question.kind)).toEqual(['ordering', 'matching'])

    course = await publishCourse(course)
    await enroll(learnerId, course)
    const attempt = await startAttempt(learnerId, quizLesson)
    const askedOrder = attempt.questions.find(question => question.id === order.id)!
    const askedMatch = attempt.questions.find(question => question.id === match.id)!

    // Shown scrambled: never already in the right order, and nothing lost.
    const rightOrder = order.options.map(option => option.id)
    expect(askedOrder.options.map(option => option.id)).not.toEqual(rightOrder)
    expect(askedOrder.options.map(option => option.id).sort()).toEqual([...rightOrder].sort())
    expect(askedMatch.lefts).toEqual(['Bow', 'Stern', 'Port'])
    expect(askedMatch.rights).not.toEqual(['Front', 'Back', 'Left'])
    expect([...askedMatch.rights!].sort()).toEqual(['Back', 'Front', 'Left'])
    expect(JSON.stringify(attempt)).not.toContain('pairs')

    const result = await submitAttempt(learnerId, attempt.id, { [order.id]: rightOrder, [match.id]: { 0: 'Front', 1: 'Back', 2: 'Front' } })
    expect(result.questions.find(question => question.id === order.id)?.correct).toBe(true)
    expect(result.questions.find(question => question.id === order.id)?.correctOptionIds).toEqual(rightOrder)
    expect(result.questions.find(question => question.id === match.id)?.correct).toBe(false)
    expect(result.percent).toBe(50)
  })
})
