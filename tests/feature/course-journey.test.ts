import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { academiesForStaff, AcademyError, academyForStaff, createAcademy } from '../../app/Support/academies'
import { addLesson, addSection, courseInAcademy, CourseError, createCourse, outlineOf, publishCourse, publishedCourse, publishedCourses } from '../../app/Support/courses'
import { completeLesson, enroll, EnrollmentError, enrollmentOf, progressOf } from '../../app/Support/enrollment'

/**
 * The first course journey, against the real database: an Owner opens an
 * Academy, builds and publishes a Course, and a Learner enrolls and finishes
 * it. A second Academy runs alongside to prove nothing crosses between them.
 *
 * Every row is created here and removed after, so the suite does not depend on
 * any seed.
 */

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: number[] = []
const teamIds: number[] = []

async function makeUser(label: string): Promise<number> {
  const row = await db.insertInto('users').values({
    name: `Test ${label}`,
    email: `${label}-${stamp}@cursio.test`,
    password: 'not-a-real-hash',
    uuid: crypto.randomUUID(),
  }).returning(['id']).executeTakeFirst() as { id: number }
  userIds.push(row.id)
  return row.id
}

let owner: number
let rival: number
let learner: number

beforeAll(async () => {
  owner = await makeUser('owner')
  rival = await makeUser('rival')
  learner = await makeUser('learner')
})

afterAll(async () => {
  // Children first where nothing cascades: academies hang off teams.
  if (teamIds.length > 0) {
    const courses = await db.selectFrom('courses').select(['id']).where('team_id', 'in', teamIds).execute() as { id: number }[]
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
    await db.deleteFrom('academies').where('team_id', 'in', teamIds).execute()
    await db.deleteFrom('team_members').where('team_id', 'in', teamIds).execute()
    await db.deleteFrom('teams').where('id', 'in', teamIds).execute()
  }
  if (userIds.length > 0)
    await db.deleteFrom('users').where('id', 'in', userIds).execute()
})

describe('opening an academy', () => {
  test('creates the academy with its owner as staff', async () => {
    const academy = await createAcademy({ ownerId: owner, name: 'Harbor School', slug: `harbor-${stamp}` })
    teamIds.push(academy.team_id)

    expect(academy.slug).toBe(`harbor-${stamp}`)
    expect((await academiesForStaff(owner)).map(row => row.id)).toEqual([academy.id])
  })

  test('refuses a reserved or malformed address', async () => {
    await expect(createAcademy({ ownerId: owner, name: 'Admin', slug: 'admin' })).rejects.toBeInstanceOf(AcademyError)
    await expect(createAcademy({ ownerId: owner, name: 'Bad', slug: 'Not A Slug' })).rejects.toBeInstanceOf(AcademyError)
  })

  test('refuses an address that is taken, and leaves no half-made team behind', async () => {
    const before = await db.selectFrom('teams').select(['id']).execute()
    await expect(createAcademy({ ownerId: rival, name: 'Copycat', slug: `harbor-${stamp}` })).rejects.toBeInstanceOf(AcademyError)
    const after = await db.selectFrom('teams').select(['id']).execute()

    expect(after.length).toBe(before.length)
  })

  test('a stranger is not staff of someone else\'s academy', async () => {
    const [academy] = await academiesForStaff(owner)

    expect(await academyForStaff(rival, academy.id)).toBeNull()
    expect(await academyForStaff(learner)).toBeNull()
  })
})

describe('building a course', () => {
  test('a new course is a draft with a slug made from its title', async () => {
    const academy = (await academyForStaff(owner))!
    const course = await createCourse(academy, { title: 'Learn Stacks' })
    const again = await createCourse(academy, { title: 'Learn Stacks' })

    expect(course.status).toBe('draft')
    expect(course.slug).toBe('learn-stacks')
    expect(again.slug).toBe('learn-stacks-2')
  })

  test('a course with no lessons cannot be published', async () => {
    const academy = (await academyForStaff(owner))!
    const course = await courseBySlug(academy.id, 'learn-stacks')

    await expect(publishCourse(course!)).rejects.toBeInstanceOf(CourseError)
  })

  test('sections and lessons land in the order they were added', async () => {
    const academy = (await academyForStaff(owner))!
    const course = (await courseBySlug(academy.id, 'learn-stacks'))!

    const data = await addSection(course, { title: 'Describe your data' })
    const serve = await addSection(course, { title: 'Serve it' })
    await addLesson(course, { sectionId: data.id, title: 'Define a model', kind: 'video', videoUrl: 'https://example.com/models.m3u8', durationSeconds: 540 })
    await addLesson(course, { sectionId: data.id, title: 'Generate migrations', kind: 'reading', body: 'Run buddy generate:migrations.' })
    await addLesson(course, { sectionId: serve.id, title: 'Write an action', kind: 'reading', body: 'Actions live in app/Actions.' })

    const outline = await outlineOf(course.id)

    expect(outline.sections.map(section => section.title)).toEqual(['Describe your data', 'Serve it'])
    expect(outline.sections[0].lessons.map(lesson => lesson.title)).toEqual(['Define a model', 'Generate migrations'])
    expect(outline.lessonIds).toHaveLength(3)
  })

  test('a video lesson needs an https video, and a lesson needs this course\'s own section', async () => {
    const academy = (await academyForStaff(owner))!
    const course = (await courseBySlug(academy.id, 'learn-stacks'))!
    const other = (await courseBySlug(academy.id, 'learn-stacks-2'))!
    const foreign = await addSection(other, { title: 'Elsewhere' })
    const [own] = (await outlineOf(course.id)).sections

    await expect(addLesson(course, { sectionId: own.id, title: 'No video', kind: 'video' })).rejects.toBeInstanceOf(CourseError)
    await expect(addLesson(course, { sectionId: own.id, title: 'Plain http', kind: 'video', videoUrl: 'http://example.com/a.mp4' })).rejects.toBeInstanceOf(CourseError)
    await expect(addLesson(course, { sectionId: foreign.id, title: 'Wrong course' })).rejects.toBeInstanceOf(CourseError)
  })

  test('publishing makes it visible to learners; drafts stay hidden', async () => {
    const academy = (await academyForStaff(owner))!
    const course = (await courseBySlug(academy.id, 'learn-stacks'))!

    expect(await publishedCourse(academy.id, 'learn-stacks')).toBeNull()
    const published = await publishCourse(course)

    expect(published.status).toBe('published')
    expect((await publishedCourses(academy.id)).map(row => row.slug)).toEqual(['learn-stacks'])
  })
})

describe('two academies', () => {
  test('one academy cannot reach another\'s course', async () => {
    const mine = (await academyForStaff(owner))!
    const theirs = await createAcademy({ ownerId: rival, name: 'Rival School', slug: `rival-${stamp}` })
    teamIds.push(theirs.team_id)
    const course = (await courseBySlug(mine.id, 'learn-stacks'))!

    expect(await courseInAcademy(theirs, course.id)).toBeNull()
    expect(await publishedCourse(theirs.id, 'learn-stacks')).toBeNull()
    expect(await publishedCourses(theirs.id)).toEqual([])
  })

  test('the same course slug is free in a different academy', async () => {
    const theirs = (await academyForStaff(rival))!
    const course = await createCourse(theirs, { title: 'Learn Stacks' })

    expect(course.slug).toBe('learn-stacks')
  })
})

describe('learning', () => {
  test('a learner cannot enroll in a draft', async () => {
    const academy = (await academyForStaff(owner))!
    const draft = (await courseBySlug(academy.id, 'learn-stacks-2'))!

    await expect(enroll(learner, draft)).rejects.toBeInstanceOf(EnrollmentError)
  })

  test('enrolling twice is one enrollment', async () => {
    const academy = (await academyForStaff(owner))!
    const course = (await publishedCourse(academy.id, 'learn-stacks'))!

    const first = await enroll(learner, course)
    const second = await enroll(learner, course)
    const rows = await db.selectFrom('enrollments').select(['id']).where('user_id', '=', learner).where('course_id', '=', course.id).execute()

    expect(second.id).toBe(first.id)
    expect(rows).toHaveLength(1)
  })

  test('nobody completes a lesson in a course they are not enrolled in', async () => {
    const academy = (await academyForStaff(owner))!
    const course = (await publishedCourse(academy.id, 'learn-stacks'))!
    const [firstLesson] = (await outlineOf(course.id)).lessonIds

    await expect(completeLesson(rival, firstLesson)).rejects.toBeInstanceOf(EnrollmentError)
    await expect(completeLesson(learner, 999_999_999)).rejects.toBeInstanceOf(EnrollmentError)
  })

  test('completing lessons moves progress, and the last one completes the enrollment', async () => {
    const academy = (await academyForStaff(owner))!
    const course = (await publishedCourse(academy.id, 'learn-stacks'))!
    const [one, two, three] = (await outlineOf(course.id)).lessonIds

    const afterOne = await completeLesson(learner, one)
    expect(afterOne.progress).toMatchObject({ completed: 1, total: 3, percent: 33, nextLessonId: two, isComplete: false })

    // Completing the same lesson again changes nothing.
    const again = await completeLesson(learner, one)
    expect(again.progress.completed).toBe(1)

    await completeLesson(learner, three)
    const done = await completeLesson(learner, two)

    expect(done.progress).toMatchObject({ completed: 3, percent: 100, nextLessonId: null, isComplete: true })
    expect(done.enrollment.status).toBe('completed')

    const stored = (await enrollmentOf(learner, course.id))!
    expect(stored.status).toBe('completed')
    expect(stored.completed_at).not.toBeNull()
    expect((await progressOf(stored)).completedIds.sort()).toEqual([one, two, three].sort())
  })
})

async function courseBySlug(academyId: number, slug: string) {
  const row = await db.selectFrom('courses').select(['id', 'team_id', 'academy_id', 'title', 'slug', 'summary', 'status', 'published_at']).where('academy_id', '=', academyId).where('slug', '=', slug).executeTakeFirst()
  return (row ?? null) as Awaited<ReturnType<typeof courseInAcademy>>
}
