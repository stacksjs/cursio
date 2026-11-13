import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { addLesson, addSection, createCourse, deleteLesson, publishCourse } from '../../app/Support/courses'
import { completeLesson, enroll, enrollmentOf } from '../../app/Support/enrollment'
import { setAccess } from '../../app/Support/gradebook'
import { saveQuestion, startAttempt, submitAttempt } from '../../app/Support/quizzes'
import { courseReport, funnelOf, itemAnalysis, rate, weekly, weekOf } from '../../app/Support/reports'

/** The report on one course: counted from what happened, never estimated. */

describe('the counting', () => {
  test('a share of nothing is zero, not a failure', () => {
    expect([rate(1, 3), rate(2, 3), rate(0, 0), rate(5, 5)]).toEqual([33, 67, 0, 100])
  })

  test('the funnel says who got how far, and who was lost at each step', () => {
    const lessons = [{ id: 1, title: 'A', kind: 'video' }, { id: 2, title: 'B', kind: 'video' }, { id: 3, title: 'C', kind: 'quiz' }]
    const steps = funnelOf(lessons, 10, new Map([[1, 8], [2, 5], [3, 5]]))
    expect(steps.map(step => [step.number, step.completed, step.percent, step.dropped])).toEqual([[1, 8, 80, 2], [2, 5, 50, 3], [3, 5, 50, 0]])
  })

  test('a later lesson with more completions is not people coming back', () => {
    const lessons = [{ id: 1, title: 'A', kind: 'video' }, { id: 2, title: 'B', kind: 'video' }]
    expect(funnelOf(lessons, 4, new Map([[1, 1], [2, 3]])).map(step => step.dropped)).toEqual([3, 0])
    expect(funnelOf(lessons, 0, new Map())[0]).toMatchObject({ completed: 0, percent: 0, dropped: 0 })
  })

  test('questions come hardest first, and one nobody answered is left out', () => {
    const questions = [{ id: 1, prompt: 'Easy', kind: 'single' }, { id: 2, prompt: 'Hard', kind: 'single' }, { id: 3, prompt: 'Unasked', kind: 'single' }]
    const answers = [
      { question_id: 1, is_correct: true }, { question_id: 1, is_correct: true },
      { question_id: 2, is_correct: false }, { question_id: 2, is_correct: true }, { question_id: 2, is_correct: false },
    ]
    expect(itemAnalysis(questions, answers).map(item => [item.prompt, item.answered, item.correct, item.percentCorrect])).toEqual([['Hard', 3, 1, 33], ['Easy', 2, 2, 100]])
  })

  test('weeks start on Monday, and a quiet week is a zero, not a gap', () => {
    expect(weekOf('2026-11-12T10:00:00Z')).toBe('2026-11-09')
    expect(weekOf('2026-11-15 23:59:59')).toBe('2026-11-09')
    expect(weekOf('2026-11-16T00:00:00Z')).toBe('2026-11-16')
    const weeks = weekly(['2026-11-10T08:00:00Z', '2026-11-12T08:00:00Z', '2026-10-28T08:00:00Z', '2020-01-01T00:00:00Z'], 3, new Date('2026-11-12T12:00:00Z'))
    expect(weeks).toEqual([{ week: '2026-10-26', count: 1 }, { week: '2026-11-02', count: 0 }, { week: '2026-11-09', count: 2 }])
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const learners: number[] = []
let owner: number
let academy: AcademyRow
let course: CourseRow
let reading: number
let quizLesson: number
let questionId: number
let right: number
let wrong: number

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Report ${label}`, email: `report-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  owner = await make('owner')
  for (const label of ['a', 'b', 'c', 'd'])
    learners.push(await make(label))
  academy = await createAcademy({ ownerId: owner, name: 'Report School', slug: `report-${stamp}` })
  course = await createCourse(academy, { title: 'Knots, counted' })
  const section = await addSection(course, { title: 'One' })
  reading = (await addLesson(course, { sectionId: section.id, title: 'Read' })).id
  quizLesson = (await addLesson(course, { sectionId: section.id, title: 'Check', kind: 'quiz' })).id
  const question = await saveQuestion(course, quizLesson, { kind: 'single', prompt: 'Best knot?', options: [{ label: 'Bowline', correct: true }, { label: 'Granny', correct: false }] })
  questionId = question.id
  right = question.options[0]!.id
  wrong = question.options[1]!.id
  course = await publishCourse(course)
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
  await db.deleteFrom('users').where('id', 'in', [owner, ...learners]).execute()
})

describe('a course report', () => {
  test('an empty course reports zeros, with every lesson and week still listed', async () => {
    const report = await courseReport(course)
    expect(report).toMatchObject({ enrolled: 0, completed: 0, completionRate: 0, started: 0, quizzes: [], rating: { count: 0, average: null } })
    expect(report.funnel.map(step => step.title)).toEqual(['Read', 'Check'])
    expect(report.enrollments).toHaveLength(8)
  })

  test('counts enrollment, starts, completions and the drop between lessons', async () => {
    const [a, b, c, d] = learners as [number, number, number, number]
    for (const learner of learners)
      await enroll(learner, course)
    // a finishes; b reads and fails the quiz twice; c only reads; d does nothing.
    for (const learner of [a, b, c])
      await completeLesson(learner, reading)
    const pass = await startAttempt(a, quizLesson)
    await submitAttempt(a, pass.id, { [questionId]: right })
    for (let turn = 0; turn < 2; turn++) {
      const fail = await startAttempt(b, quizLesson)
      await submitAttempt(b, fail.id, { [questionId]: wrong })
    }
    expect(d).toBeGreaterThan(0)

    const report = await courseReport(course)
    expect(report).toMatchObject({ enrolled: 4, started: 3, completed: 1, completionRate: 25 })
    expect(report.funnel.map(step => [step.completed, step.percent, step.dropped])).toEqual([[3, 75, 1], [1, 25, 2]])
    expect(report.enrollments.at(-1)?.count).toBe(4)
  })

  test('a quiz counts learners, not attempts, and shows how each question fared', async () => {
    const [quiz] = (await courseReport(course)).quizzes
    expect(quiz).toMatchObject({ title: 'Check', sat: 2, passed: 1, passRate: 50, averagePercent: 33 })
    expect(quiz!.items).toEqual([{ questionId, prompt: 'Best knot?', kind: 'single', answered: 3, correct: 1, percentCorrect: 33 }])
  })

  test('a learner whose access was removed is not in the numbers', async () => {
    const enrollment = await enrollmentOf(learners[1]!, course.id)
    await setAccess(course, enrollment!.id, false)
    const report = await courseReport(course)
    expect(report).toMatchObject({ enrolled: 3, started: 2 })
    expect(report.quizzes[0]).toMatchObject({ sat: 1, passed: 1, passRate: 100 })
    await setAccess(course, enrollment!.id, true)
  })
})
