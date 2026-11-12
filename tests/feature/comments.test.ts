import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { forwarded } from '@cursio/academy'
import { createAcademy } from '../../app/Support/academies'
import { addComment, COMMENT_BURST, COMMENT_MAX, commentBody, CommentError, commentsOf, deleteCommentsOf, displayName, removeComment, withinBurst } from '../../app/Support/comments'
import { addLesson, addSection, createCourse, deleteLesson, publishCourse, updateCourse } from '../../app/Support/courses'
import { enroll, enrollmentOf } from '../../app/Support/enrollment'
import { setAccess } from '../../app/Support/gradebook'

/** Comments under a lesson: who may read, write and remove them. */

describe('the rules', () => {
  test('a comment is trimmed, keeps its paragraphs, and has a size', () => {
    expect(commentBody('  Hello\r\nthere\n\n\n\nfriend  ')).toBe('Hello\nthere\n\nfriend')
    expect(() => commentBody('   ')).toThrow(CommentError)
    expect(() => commentBody(null)).toThrow(CommentError)
    expect(commentBody('x'.repeat(COMMENT_MAX))).toHaveLength(COMMENT_MAX)
    expect(() => commentBody('x'.repeat(COMMENT_MAX + 1))).toThrow(/up to/)
  })

  test('a name is shown as a first name and an initial', () => {
    expect(displayName('Ada Lovelace')).toBe('Ada L.')
    expect(displayName('Ada King Lovelace')).toBe('Ada L.')
    expect(displayName('Ada')).toBe('Ada')
    expect(displayName('  ')).toBe('Learner')
    expect(displayName(null)).toBe('Learner')
  })

  test('a burst has an end', () => {
    expect(withinBurst(COMMENT_BURST - 1)).toBe(true)
    expect(withinBurst(COMMENT_BURST)).toBe(false)
  })

  test('an app that fronts an academy forwards reading, writing and removing', () => {
    const paths = forwarded.map(([method, path]) => `${method} ${path}`)
    expect(paths).toContain('GET /learn/lessons/{id}/comments')
    expect(paths).toContain('POST /learn/lessons/{id}/comments')
    expect(paths).toContain('POST /learn/comments/{id}/remove')
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let owner: number
let rival: number
let ada: number
let ben: number
let stranger: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let first: number
let second: number

beforeAll(async () => {
  const make = async (label: string, name: string): Promise<number> => (await db.insertInto('users').values({ name, email: `talk-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  owner = await make('owner', 'Olive Owner')
  rival = await make('rival', 'Ruth Rival')
  ada = await make('ada', 'Ada Lovelace')
  ben = await make('ben', 'Ben Franklin')
  stranger = await make('stranger', 'Sam Stranger')
  academy = await createAcademy({ ownerId: owner, name: 'Talk School', slug: `talk-${stamp}` })
  other = await createAcademy({ ownerId: rival, name: 'Talk Rival', slug: `talk-rival-${stamp}` })

  course = await createCourse(academy, { title: 'Knots, discussed' })
  const section = await addSection(course, { title: 'One' })
  first = (await addLesson(course, { sectionId: section.id, title: 'First' })).id
  second = (await addLesson(course, { sectionId: section.id, title: 'Second' })).id
  course = await updateCourse(course, { progression: 'linear' })
  course = await publishCourse(course)
  await enroll(ada, course)
  await enroll(ben, course)
})

afterAll(async () => {
  await deleteCommentsOf([first, second])
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', course.id).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('enrollments').where('course_id', '=', course.id).execute()
  await db.deleteFrom('lessons').where('course_id', '=', course.id).execute()
  await db.deleteFrom('course_sections').where('course_id', '=', course.id).execute()
  await db.deleteFrom('courses').where('id', '=', course.id).execute()
  const teams = [academy.team_id, other.team_id]
  await db.deleteFrom('academies').where('team_id', 'in', teams).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teams).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teams).execute()
  await db.deleteFrom('teams').where('id', 'in', teams).execute()
  await db.deleteFrom('users').where('id', 'in', [owner, rival, ada, ben, stranger]).execute()
})

describe('talking under a lesson', () => {
  test('starts empty for someone enrolled', async () => {
    expect(await commentsOf(ada, first)).toEqual([])
  })

  test('someone not enrolled, or staff of another academy, can neither read nor write', async () => {
    for (const outsider of [stranger, rival]) {
      await expect(commentsOf(outsider, first)).rejects.toThrow(/not enrolled/)
      await expect(addComment(outsider, first, { body: 'Hello' })).rejects.toThrow(/not enrolled/)
    }
    await expect(commentsOf(ada, 999999999)).rejects.toThrow(/not enrolled/)
  })

  test('a lesson that is not open yet has no discussion to join', async () => {
    await expect(commentsOf(ada, second)).rejects.toThrow(/not open/)
    await expect(addComment(ada, second, { body: 'Early' })).rejects.toThrow(/not open/)
  })

  test('a comment shows at once, under a first name and initial, as text', async () => {
    const list = await addComment(ada, first, { body: '  <b>Why</b> a bowline?  ' })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ body: '<b>Why</b> a bowline?', author: 'Ada L.', staff: false, removable: true })
    // Another learner reads it, and cannot remove it.
    expect((await commentsOf(ben, first))[0]).toMatchObject({ author: 'Ada L.', removable: false })
  })

  test('staff answer without enrolling, and are marked as such', async () => {
    const list = await addComment(owner, first, { body: 'It cannot slip.' })
    expect(list.map(comment => comment.staff)).toEqual([false, true])
    expect(list.every(comment => comment.removable)).toBe(true)
  })

  test('nobody removes another learner\'s comment, and nothing says whether it exists', async () => {
    const [adas] = await commentsOf(ada, first)
    await expect(removeComment(ben, adas!.id)).rejects.toThrow(/not found/)
    await expect(removeComment(stranger, adas!.id)).rejects.toThrow(/not enrolled/)
    await expect(removeComment(ada, 999999999)).rejects.toThrow(/not found/)
  })

  test('an author takes their own comment down, and staff can take down any', async () => {
    const mine = (await addComment(ben, first, { body: 'Oops, wrong lesson' })).at(-1)!
    expect((await removeComment(ben, mine.id)).map(comment => comment.body)).not.toContain('Oops, wrong lesson')
    // Taken down is kept on record, not shown, and cannot be taken down twice.
    await expect(removeComment(ben, mine.id)).rejects.toThrow(/not found/)
    const kept = await db.selectFrom('commentables').select(['status']).where('id', '=', mine.id).executeTakeFirst() as { status: string }
    expect(kept.status).toBe('rejected')

    const [adas] = await commentsOf(owner, first)
    expect((await removeComment(owner, adas!.id)).map(comment => comment.author)).toEqual(['Olive O.'])
  })

  test('a burst of comments is stopped, and lets up later', async () => {
    const at = new Date('2030-01-01T10:00:00Z')
    for (let turn = 0; turn < COMMENT_BURST; turn++)
      await addComment(ben, first, { body: `Point ${turn}` }, at)
    await expect(addComment(ben, first, { body: 'One more' }, at)).rejects.toThrow(/a lot of comments/)
    const later = new Date(at.getTime() + 11 * 60 * 1000)
    expect((await addComment(ben, first, { body: 'Later' }, later)).at(-1)?.body).toBe('Later')
  })

  test('removed access closes the discussion, and restoring opens it', async () => {
    const enrollment = await enrollmentOf(ben, course.id)
    await setAccess(course, enrollment!.id, false)
    await expect(commentsOf(ben, first)).rejects.toThrow(/not enrolled/)
    await setAccess(course, enrollment!.id, true)
    expect((await commentsOf(ben, first)).length).toBeGreaterThan(0)
  })

  test('deleting the lesson takes its comments with it', async () => {
    await deleteLesson(course, first)
    const left = await db.selectFrom('commentables').select(['id']).where('commentables_type', '=', 'Lesson').where('commentables_id', '=', first).execute()
    expect(left).toHaveLength(0)
  })
})
