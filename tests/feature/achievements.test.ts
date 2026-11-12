import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import type { LearnerFacts } from '../../app/Support/achievements'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { achievementsFor, achievementsOf, badgeRules, pointsFor, POINTS } from '../../app/Support/achievements'
import { addLesson, addSection, createCourse, deleteLesson, publishCourse } from '../../app/Support/courses'
import { completeLesson, enroll, enrollmentOf } from '../../app/Support/enrollment'
import { gradebookCsv, gradebookOf, setAccess } from '../../app/Support/gradebook'
import { saveQuestion, startAttempt, submitAttempt } from '../../app/Support/quizzes'

/** Points and badges: worked out from what a Learner did, never stored. */

const facts = (over: Partial<LearnerFacts> = {}): LearnerFacts => ({ lessons: 0, courses: 0, quizzesPassed: 0, perfectQuizzes: 0, workPassed: 0, ...over })

describe('the rules', () => {
  test('points add up from lessons, quizzes, work and courses', () => {
    expect(pointsFor(facts())).toBe(0)
    expect(pointsFor(facts({ lessons: 3, quizzesPassed: 1, workPassed: 1, courses: 1 }))).toBe(3 * POINTS.lesson + POINTS.quiz + POINTS.work + POINTS.course)
  })

  test('a newcomer has no badges and is told the first one to earn', () => {
    const start = achievementsFor(facts())
    expect(start.badges).toEqual([])
    expect(start.next?.key).toBe('first-lesson')
  })

  test('badges come as they are earned, and the next one is the nearest missing', () => {
    const some = achievementsFor(facts({ lessons: 10, quizzesPassed: 1 }))
    expect(some.badges.map(badge => badge.key)).toEqual(['first-lesson', 'ten-lessons', 'first-quiz'])
    expect(some.next?.key).toBe('perfect-quiz')

    const all = achievementsFor(facts({ lessons: 40, quizzesPassed: 4, perfectQuizzes: 1, workPassed: 2, courses: 3 }))
    expect(all.badges).toHaveLength(badgeRules.length)
    expect(all.next).toBeNull()
  })

  test('a badge carries nothing but what a learner reads', () => {
    expect(Object.keys(achievementsFor(facts({ lessons: 1 })).badges[0]!).sort()).toEqual(['earnedBy', 'icon', 'key', 'title'])
  })

  test('every badge icon is named in the catalog component, so its CSS exists', async () => {
    const component = await Bun.file(new URL('../../packages/academy/components/CursioCatalog.stx', import.meta.url)).text()
    for (const rule of badgeRules)
      expect(component).toMatch(new RegExp(`class="[^"]*${rule.icon}[ "]`))
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let owner: number
let ada: number
let ben: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let otherCourse: CourseRow
let reading: number
let quizLesson: number
let questionId: number
let right: number
let otherReading: number

async function cleanCourse(item: CourseRow, lessons: number[]): Promise<void> {
  for (const lesson of lessons)
    await deleteLesson(item, lesson).catch(() => {})
  await db.deleteFrom('certificates').where('course_id', '=', item.id).execute()
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', item.id).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('enrollments').where('course_id', '=', item.id).execute()
  await db.deleteFrom('lessons').where('course_id', '=', item.id).execute()
  await db.deleteFrom('course_sections').where('course_id', '=', item.id).execute()
  await db.deleteFrom('courses').where('id', '=', item.id).execute()
}

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Earn ${label}`, email: `earn-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  owner = await make('owner')
  ada = await make('ada')
  ben = await make('ben')
  academy = await createAcademy({ ownerId: owner, name: 'Earn School', slug: `earn-${stamp}` })
  other = await createAcademy({ ownerId: owner, name: 'Earn Elsewhere', slug: `earn-else-${stamp}` })

  course = await createCourse(academy, { title: 'Knots that count' })
  const section = await addSection(course, { title: 'One' })
  reading = (await addLesson(course, { sectionId: section.id, title: 'Read' })).id
  quizLesson = (await addLesson(course, { sectionId: section.id, title: 'Quiz', kind: 'quiz' })).id
  const question = await saveQuestion(course, quizLesson, { kind: 'single', prompt: 'Best knot?', options: [{ label: 'Bowline', correct: true }, { label: 'Granny', correct: false }] })
  questionId = question.id
  right = question.options[0]!.id
  course = await publishCourse(course)

  otherCourse = await createCourse(other, { title: 'Elsewhere' })
  const otherSection = await addSection(otherCourse, { title: 'One' })
  otherReading = (await addLesson(otherCourse, { sectionId: otherSection.id, title: 'Read there' })).id
  otherCourse = await publishCourse(otherCourse)
})

afterAll(async () => {
  await cleanCourse(course, [quizLesson])
  await cleanCourse(otherCourse, [])
  const teams = [academy.team_id, other.team_id]
  await db.deleteFrom('academies').where('team_id', 'in', teams).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teams).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teams).execute()
  await db.deleteFrom('teams').where('id', 'in', teams).execute()
  await db.deleteFrom('users').where('id', 'in', [owner, ada, ben]).execute()
})

describe('what a learner has earned', () => {
  test('nothing before they do anything', async () => {
    await enroll(ada, course)
    expect(await achievementsOf(ada, academy.id)).toMatchObject({ points: 0, badges: [] })
  })

  test('a lesson earns points and the first badge', async () => {
    await completeLesson(ada, reading)
    const earned = await achievementsOf(ada, academy.id)
    expect(earned.points).toBe(POINTS.lesson)
    expect(earned.badges.map(badge => badge.key)).toEqual(['first-lesson'])
  })

  test('a quiz passed twice counts once, and full marks are noticed', async () => {
    for (let turn = 0; turn < 2; turn++) {
      const attempt = await startAttempt(ada, quizLesson)
      await submitAttempt(ada, attempt.id, { [questionId]: right })
    }
    const earned = await achievementsOf(ada, academy.id)
    // Two lessons (the reading and the quiz lesson), one quiz, one course.
    expect(earned.points).toBe(2 * POINTS.lesson + POINTS.quiz + POINTS.course)
    expect(earned.badges.map(badge => badge.key)).toEqual(['first-lesson', 'first-quiz', 'perfect-quiz', 'first-course'])
  })

  test('another academy is another tally', async () => {
    expect((await achievementsOf(ada, other.id)).points).toBe(0)
    await enroll(ada, otherCourse)
    await completeLesson(ada, otherReading)
    expect((await achievementsOf(ada, other.id)).points).toBe(POINTS.lesson + POINTS.course)
    expect((await achievementsOf(ada, academy.id)).points).toBe(2 * POINTS.lesson + POINTS.quiz + POINTS.course)
  })

  test('the gradebook and its export carry the points', async () => {
    await enroll(ben, course)
    const book = await gradebookOf(course)
    const row = (user: number) => book.learners.find(learner => learner.userId === user)!
    expect(row(ada).points).toBe(2 * POINTS.lesson + POINTS.quiz + POINTS.course)
    expect(row(ben).points).toBe(0)
    expect(gradebookCsv(book).split('\r\n')[0]).toContain('"Points"')
  })

  test('removed access earns nothing while it is removed, and comes back with it', async () => {
    const enrollment = await enrollmentOf(ada, course.id)
    await setAccess(course, enrollment!.id, false)
    expect((await achievementsOf(ada, academy.id)).points).toBe(0)
    await setAccess(course, enrollment!.id, true)
    expect((await achievementsOf(ada, academy.id)).points).toBe(2 * POINTS.lesson + POINTS.quiz + POINTS.course)
  })
})
