import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { addLesson, addSection, courseInAcademy, CourseError, createCourse, deleteLesson, deleteSection, lessonsForStudio, outlineOf, publishCourse, renameSection, reorderLessons, reorderSections, updateCourse, updateLesson } from '../../app/Support/courses'
import { completeLesson, enroll, EnrollmentError, lessonForLearner, progressOf } from '../../app/Support/enrollment'

/**
 * Editing a Course after it exists, and the two rules that decide when a
 * Lesson opens, against the real database. Self-contained: its own users,
 * Academy and Courses, removed afterwards.
 */

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: number[] = []
let teamId = 0
let academy: Awaited<ReturnType<typeof createAcademy>>
let learner = 0

const DAY = 24 * 60 * 60 * 1000

async function makeUser(label: string): Promise<number> {
  const row = await db.insertInto('users').values({ name: `Edit ${label}`, email: `edit-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }
  userIds.push(row.id)
  return row.id
}

async function build(title: string) {
  const course = await createCourse(academy, { title })
  const first = await addSection(course, { title: 'First' })
  const second = await addSection(course, { title: 'Second' })
  const a = await addLesson(course, { sectionId: first.id, title: 'A', body: 'a' })
  const b = await addLesson(course, { sectionId: first.id, title: 'B', body: 'b' })
  const c = await addLesson(course, { sectionId: second.id, title: 'C', body: 'c' })
  return { course, first, second, a, b, c }
}

beforeAll(async () => {
  const owner = await makeUser('owner')
  learner = await makeUser('learner')
  academy = await createAcademy({ ownerId: owner, name: 'Editing School', slug: `editing-${stamp}` })
  teamId = academy.team_id
})

afterAll(async () => {
  const courses = await db.selectFrom('courses').select(['id']).where('team_id', '=', teamId).execute() as { id: number }[]
  const courseIds = courses.map(course => course.id)
  if (courseIds.length > 0) {
    const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
    if (enrollments.length > 0)
      await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
    await db.deleteFrom('enrollments').where('course_id', 'in', courseIds).execute()
    await db.deleteFrom('lessons').where('course_id', 'in', courseIds).execute()
    await db.deleteFrom('course_sections').where('course_id', 'in', courseIds).execute()
    await db.deleteFrom('courses').where('id', 'in', courseIds).execute()
  }
  await db.deleteFrom('academies').where('team_id', '=', teamId).execute()
  await db.deleteFrom('sites').where('team_id', '=', teamId).execute()
  await db.deleteFrom('team_members').where('team_id', '=', teamId).execute()
  await db.deleteFrom('teams').where('id', '=', teamId).execute()
  await db.deleteFrom('users').where('id', 'in', userIds).execute()
})

describe('editing', () => {
  test('renaming a course keeps its published link', async () => {
    const { course } = await build('Original Title')
    const renamed = await updateCourse(course, { title: 'A Better Title', summary: 'What it covers.' })
    const stored = (await courseInAcademy(academy, course.id))!

    expect(renamed.title).toBe('A Better Title')
    expect(stored.slug).toBe('original-title')
    expect(stored.summary).toBe('What it covers.')
  })

  test('a lesson can be rewritten, and a video lesson still needs its video', async () => {
    const { course, a } = await build('Rewrite')
    await updateLesson(course, a.id, { title: 'A, revised', body: 'new words', unlockAfterDays: 3 })
    const [stored] = (await lessonsForStudio(course.id)).filter(lesson => lesson.id === a.id)

    expect(stored).toMatchObject({ title: 'A, revised', body: 'new words', unlock_after_days: 3 })
    await expect(updateLesson(course, a.id, { kind: 'video' })).rejects.toBeInstanceOf(CourseError)
  })

  test('sections and lessons take a new order, but only their own full set', async () => {
    const { course, first, second, a, b, c } = await build('Reorder')

    await reorderSections(course, [second.id, first.id])
    await reorderLessons(course, first.id, [b.id, a.id])
    const outline = await outlineOf(course.id)

    expect(outline.sections.map(section => section.title)).toEqual(['Second', 'First'])
    expect(outline.lessonIds).toEqual([c.id, b.id, a.id])
    await expect(reorderLessons(course, first.id, [b.id])).rejects.toBeInstanceOf(CourseError)
    await expect(reorderLessons(course, first.id, [b.id, c.id])).rejects.toBeInstanceOf(CourseError)
    await expect(reorderSections(course, [first.id, first.id])).rejects.toBeInstanceOf(CourseError)
  })

  test('nothing in one course can be edited through another', async () => {
    const one = await build('Mine')
    const two = await build('Other')

    await expect(updateLesson(one.course, two.a.id, { title: 'Hijacked' })).rejects.toBeInstanceOf(CourseError)
    await expect(deleteLesson(one.course, two.a.id)).rejects.toBeInstanceOf(CourseError)
    await expect(renameSection(one.course, two.first.id, 'Hijacked')).rejects.toBeInstanceOf(CourseError)
    await expect(deleteSection(one.course, two.first.id)).rejects.toBeInstanceOf(CourseError)
    expect((await outlineOf(two.course.id)).lessonIds).toHaveLength(3)
  })

  test('deleting a lesson re-bases a learner\'s progress on what remains', async () => {
    const { course, a, b, c } = await build('Shrink')
    const published = await publishCourse(course)
    await enroll(learner, published)
    await completeLesson(learner, a.id)

    await deleteLesson(course, b.id)
    const enrollment = (await db.selectFrom('enrollments').select(['id', 'user_id', 'course_id', 'status', 'source', 'completed_at', 'created_at']).where('user_id', '=', learner).where('course_id', '=', course.id).executeTakeFirst())!
    const progress = await progressOf(enrollment as any)

    expect(progress).toMatchObject({ total: 2, completed: 1, percent: 50, nextLessonId: c.id })
  })

  test('deleting a section takes its lessons with it', async () => {
    const { course, first, c } = await build('Drop Section')
    await deleteSection(course, first.id)

    expect((await outlineOf(course.id)).lessonIds).toEqual([c.id])
  })
})

describe('when a lesson opens', () => {
  test('a dripped lesson is refused until its day, then opens', async () => {
    const { course, a, b } = await build('Dripped')
    await updateLesson(course, b.id, { unlockAfterDays: 7 })
    const enrollment = await enroll(learner, await publishCourse(course))
    const start = new Date(`${enrollment.created_at.replace(' ', 'T')}Z`).getTime()

    expect((await lessonForLearner(learner, a.id))?.title).toBe('A')
    await expect(lessonForLearner(learner, b.id, new Date(start + 6 * DAY))).rejects.toBeInstanceOf(EnrollmentError)
    await expect(completeLesson(learner, b.id, new Date(start + 6 * DAY))).rejects.toBeInstanceOf(EnrollmentError)
    expect((await lessonForLearner(learner, b.id, new Date(start + 7 * DAY + 1000)))?.title).toBe('B')

    const progress = await progressOf(enrollment, new Date(start + DAY))
    expect(progress.locked[b.id]?.reason).toBe('drip')
    expect(progress.locked[a.id]).toBeUndefined()
  })

  test('a linear course makes the learner go in order', async () => {
    const { course, a, b, c } = await build('In Order')
    await updateCourse(course, { progression: 'linear' })
    await enroll(learner, await publishCourse((await courseInAcademy(academy, course.id))!))

    await expect(completeLesson(learner, c.id)).rejects.toBeInstanceOf(EnrollmentError)
    await expect(lessonForLearner(learner, b.id)).rejects.toBeInstanceOf(EnrollmentError)

    await completeLesson(learner, a.id)
    await completeLesson(learner, b.id)
    const done = await completeLesson(learner, c.id)

    expect(done.progress.isComplete).toBe(true)
    expect(done.progress.locked).toEqual({})
  })
})
