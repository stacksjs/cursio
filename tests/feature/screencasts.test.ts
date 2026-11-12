import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { AcademyError, createAcademy, updateAcademy, wordsOf } from '../../app/Support/academies'
import { addLesson, addSection, catalogOf, CourseError, createCourse, outlineOf, publishCourse, runtime, unpublishCourse, updateCourse, updateLesson } from '../../app/Support/courses'
import { completeLesson, enroll, lessonForLearner, libraryOf, previewLesson, progressOf, savePosition } from '../../app/Support/enrollment'
import { renderNotes } from '../../app/Support/notes'

/**
 * What makes an Academy work as a screencast site: series with a level and a
 * topic, free preview episodes, resuming where you stopped, notes with code,
 * and a library of what to watch next.
 */

describe('episode notes', () => {
  test('markdown becomes html with highlighted code', async () => {
    const html = await renderNotes('## Setup\n\nRun `buddy dev`.\n\n```ts\nconst port: number = 3000\n```\n')
    expect(html).toContain('<h2')
    expect(html).toContain('<code>buddy dev</code>')
    expect(html).toContain('class="token')
    expect(html).toContain('3000')
  })

  test('an author cannot script a learner', async () => {
    const html = await renderNotes('Hi <script>alert(1)</script> <img src=x onerror="alert(2)"> [x](javascript:alert(3))\n\n<iframe src="https://evil.test"></iframe>')
    expect(html).not.toContain('<script')
    // Raw html is shown as text, so the words survive; what must not is a tag
    // carrying them.
    expect(html).not.toMatch(/<img/)
    expect(html).not.toMatch(/<[^>]*onerror/)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<iframe')
  })

  test('code is shown, never run, whatever it contains', async () => {
    const html = await renderNotes('```html\n<script>alert(1)</script>\n```\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain('alert')
  })

  test('nothing in, nothing out', async () => {
    expect(await renderNotes(null)).toBe('')
    expect(await renderNotes('   ')).toBe('')
  })
})

describe('words and running time', () => {
  test('an academy can speak of series and episodes', () => {
    expect(wordsOf({ vocabulary: 'series' }).lesson).toBe('episode')
    expect(wordsOf({ vocabulary: 'course' }).lessons).toBe('lessons')
    expect(wordsOf(null).course).toBe('course')
  })

  test('running time reads like a clock face', () => {
    expect(runtime(0)).toBe('')
    expect(runtime(12 * 60)).toBe('12m')
    expect(runtime(84 * 60 + 20)).toBe('1h 24m')
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let ownerId: number
let viewerId: number
let academy: AcademyRow
let course: CourseRow
let intro: number
let second: number
let third: number

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Cast ${label}`, email: `cast-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  ownerId = await make('owner')
  viewerId = await make('viewer')
  academy = await createAcademy({ ownerId, name: 'Cast School', slug: `cast-${stamp}` })
  course = await createCourse(academy, { title: 'Routing from scratch' })
  const section = await addSection(course, { title: 'Basics' })
  intro = (await addLesson(course, { sectionId: section.id, title: 'Your first route', kind: 'video', videoUrl: 'https://cdn.example.test/1.mp4', durationSeconds: 300, isPreview: true, body: '## Notes\n\n```ts\nroute.get(\'/\', \'Actions/Home\')\n```' })).id
  second = (await addLesson(course, { sectionId: section.id, title: 'Route parameters', kind: 'video', videoUrl: 'https://cdn.example.test/2.mp4', durationSeconds: 420 })).id
  third = (await addLesson(course, { sectionId: section.id, title: 'Middleware', kind: 'video', videoUrl: 'https://cdn.example.test/3.mp4', durationSeconds: 480 })).id
})

afterAll(async () => {
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', course.id).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('certificates').where('course_id', '=', course.id).execute()
  await db.deleteFrom('enrollments').where('course_id', '=', course.id).execute()
  await db.deleteFrom('lessons').where('course_id', '=', course.id).execute()
  await db.deleteFrom('course_sections').where('course_id', '=', course.id).execute()
  await db.deleteFrom('courses').where('id', '=', course.id).execute()
  await db.deleteFrom('academies').where('team_id', '=', academy.team_id).execute()
  await db.deleteFrom('sites').where('team_id', '=', academy.team_id).execute()
  await db.deleteFrom('team_members').where('team_id', '=', academy.team_id).execute()
  await db.deleteFrom('teams').where('id', '=', academy.team_id).execute()
  await db.deleteFrom('users').where('id', 'in', [ownerId, viewerId]).execute()
})

describe('a series', () => {
  test('carries a level and a topic, and refuses a level that is not one', async () => {
    course = await updateCourse(course, { level: 'beginner', topic: '  Routing ' })
    expect(course.level).toBe('beginner')
    expect(course.topic).toBe('Routing')
    await expect(updateCourse(course, { level: 'wizard' })).rejects.toThrow(CourseError)
    expect((await updateCourse(course, { level: '' })).level).toBeNull()
    course = await updateCourse(course, { level: 'beginner' })
  })

  test('the academy switches its words, and only to ones it has', async () => {
    academy = await updateAcademy(academy, { vocabulary: 'series', tagline: 'Screencasts' })
    expect(academy.vocabulary).toBe('series')
    await expect(updateAcademy(academy, { vocabulary: 'podcast' })).rejects.toThrow(AcademyError)
  })

  test('a preview is closed while the series is a draft', async () => {
    expect(await previewLesson(intro)).toBeNull()
  })

  test('the catalog shows episodes, running time and whether there is a free one', async () => {
    course = await publishCourse(course)
    const [entry] = await catalogOf(academy.id)
    expect(entry).toMatchObject({ title: 'Routing from scratch', level: 'beginner', topic: 'Routing', lessons: 3, seconds: 1200, hasPreview: true })
    expect((await outlineOf(course.id)).sections[0]!.lessons.map(lesson => lesson.is_preview)).toEqual([true, false, false])
  })
})

describe('free previews', () => {
  test('anyone may watch a preview, with its notes rendered', async () => {
    const lesson = await previewLesson(intro)
    expect(lesson?.video_url).toBe('https://cdn.example.test/1.mp4')
    expect(lesson?.body_html).toContain('class="token')
    expect(lesson?.completed).toBe(false)
  })

  test('an episode that is not a preview stays closed, and reads as if it did not exist', async () => {
    expect(await previewLesson(second)).toBeNull()
    expect(await previewLesson(999_999_999)).toBeNull()
    expect(await lessonForLearner(viewerId, second)).toBeNull()
  })

  test('a quiz can never be a preview', async () => {
    const section = (await outlineOf(course.id)).sections[0]!
    const quiz = await addLesson(course, { sectionId: section.id, title: 'Check', kind: 'quiz', isPreview: true })
    expect(quiz.is_preview).toBe(false)
    expect(await previewLesson(quiz.id)).toBeNull()
    await db.deleteFrom('quizzes').where('lesson_id', '=', quiz.id).execute()
    await db.deleteFrom('lessons').where('id', '=', quiz.id).execute()
  })

  test('taking a preview back closes it', async () => {
    await updateLesson(course, intro, { isPreview: false })
    expect(await previewLesson(intro)).toBeNull()
    await updateLesson(course, intro, { isPreview: true })
    expect(await previewLesson(intro)).not.toBeNull()
    // An edit that does not mention the flag leaves it as it was.
    expect((await updateLesson(course, intro, { title: 'Your first route' })).is_preview).toBe(true)
  })

  test('unpublishing closes every preview', async () => {
    await unpublishCourse(course)
    expect(await previewLesson(intro)).toBeNull()
    course = await publishCourse({ ...course, status: 'draft' })
  })
})

describe('resuming', () => {
  test('a stranger saves nothing', async () => {
    expect(await savePosition(viewerId, second, 90)).toBe(false)
  })

  test('the position is kept, updated, and handed back with the episode', async () => {
    await enroll(viewerId, course)
    expect(await savePosition(viewerId, second, 90)).toBe(true)
    expect(await savePosition(viewerId, second, 133.4)).toBe(true)
    expect((await lessonForLearner(viewerId, second))?.position_seconds).toBe(133)
    expect(await savePosition(viewerId, second, -50)).toBe(true)
    expect((await lessonForLearner(viewerId, second))?.position_seconds).toBe(0)
    await savePosition(viewerId, second, 200)
  })

  test('watching part of an episode is not completing it', async () => {
    const enrollment = (await db.selectFrom('enrollments').select(['id', 'user_id', 'course_id', 'status', 'source', 'completed_at', 'created_at']).where('user_id', '=', viewerId).where('course_id', '=', course.id).executeTakeFirst())!
    expect((await progressOf(enrollment as never)).completedIds).toEqual([])
  })

  test('an episode with a saved position can still be completed', async () => {
    const { progress } = await completeLesson(viewerId, second)
    expect(progress.completedIds).toEqual([second])
    // And the position survives being completed, for a rewatch.
    expect((await lessonForLearner(viewerId, second))?.position_seconds).toBe(200)
  })
})

describe('the library', () => {
  test('lists what the learner is in and what to watch next', async () => {
    const library = await libraryOf(viewerId, academy.id)
    expect(library).toHaveLength(1)
    expect(library[0]).toMatchObject({ slug: course.slug, percent: 33, completed: false, nextEpisode: 1, nextTitle: 'Your first route' })
  })

  test('is empty for someone enrolled in nothing', async () => {
    expect(await libraryOf(ownerId, academy.id)).toEqual([])
  })

  test('a finished series has nothing next', async () => {
    await completeLesson(viewerId, intro)
    await completeLesson(viewerId, third)
    expect((await libraryOf(viewerId, academy.id))[0]).toMatchObject({ percent: 100, completed: true, nextEpisode: null })
  })
})
