import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { CommentError } from '../../app/Support/comments'
import { addLesson, addSection, catalogOf, createCourse, publishCourse } from '../../app/Support/courses'
import { completeLesson, enroll, enrollmentOf } from '../../app/Support/enrollment'
import { setAccess } from '../../app/Support/gradebook'
import { addNote, clockOf, noteBody, notePosition, notesOf, removeNote } from '../../app/Support/learner-notes'
import { ownReview, ratingOf, reviewBody, reviewsForStudio, reviewsOf, saveReview, setReviewHidden, summaryOf, withdrawReview } from '../../app/Support/reviews'

/** A learner's private notes, and what learners say about a course in public. */

describe('note rules', () => {
  test('a note has words and a size', () => {
    expect(noteBody('  Remember this\r\n ')).toBe('Remember this')
    expect(() => noteBody(' ')).toThrow(CommentError)
    expect(() => noteBody('x'.repeat(4001))).toThrow(/up to/)
  })

  test('a moment in the video is a whole second, or nothing', () => {
    expect(notePosition(247.9)).toBe(247)
    expect(notePosition('12')).toBe(12)
    for (const none of [null, undefined, '', -1, 'soon', 999999])
      expect(notePosition(none)).toBeNull()
    expect([clockOf(247), clockOf(3729), clockOf(5), clockOf(null)]).toEqual(['4:07', '1:02:09', '0:05', ''])
  })
})

describe('review rules', () => {
  test('a rating is a whole number from one to five', () => {
    expect([ratingOf(1), ratingOf('5')]).toEqual([1, 5])
    for (const bad of [0, 6, 4.5, '', null, undefined, true, 'great'])
      expect(() => ratingOf(bad)).toThrow(CommentError)
  })

  test('the words are optional and have a size', () => {
    expect(reviewBody('  ')).toBeNull()
    expect(reviewBody(' Clear and short. ')).toBe('Clear and short.')
    expect(() => reviewBody('x'.repeat(2001))).toThrow(/up to/)
  })

  test('the average has one decimal, and no reviews is not a zero', () => {
    expect(summaryOf([])).toEqual({ count: 0, average: null })
    expect(summaryOf([5, 4, 4])).toEqual({ count: 3, average: 4.3 })
    expect(summaryOf([5])).toEqual({ count: 1, average: 5 })
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let owner: number
let rival: number
let ada: number
let ben: number
let cy: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let otherCourse: CourseRow
let lesson: number

beforeAll(async () => {
  const make = async (label: string, name: string): Promise<number> => (await db.insertInto('users').values({ name, email: `rev-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  owner = await make('owner', 'Olive Owner')
  rival = await make('rival', 'Ruth Rival')
  ada = await make('ada', 'Ada Lovelace')
  ben = await make('ben', 'Ben Franklin')
  cy = await make('cy', 'Cy Young')
  academy = await createAcademy({ ownerId: owner, name: 'Review School', slug: `rev-${stamp}` })
  other = await createAcademy({ ownerId: rival, name: 'Review Rival', slug: `rev-rival-${stamp}` })
  otherCourse = await createCourse(other, { title: 'Elsewhere' })

  course = await createCourse(academy, { title: 'Knots, reviewed' })
  const section = await addSection(course, { title: 'One' })
  lesson = (await addLesson(course, { sectionId: section.id, title: 'Only lesson' })).id
  course = await publishCourse(course)
  for (const learner of [ada, ben, cy])
    await enroll(learner, course)
})

afterAll(async () => {
  for (const item of [course, otherCourse]) {
    const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', item.id).execute() as { id: number }[]
    if (enrollments.length > 0)
      await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
    await db.deleteFrom('course_reviews').where('course_id', '=', item.id).execute()
    await db.deleteFrom('certificates').where('course_id', '=', item.id).execute()
    await db.deleteFrom('enrollments').where('course_id', '=', item.id).execute()
    await db.deleteFrom('lesson_notes').where('lesson_id', '=', lesson).execute()
    await db.deleteFrom('lessons').where('course_id', '=', item.id).execute()
    await db.deleteFrom('course_sections').where('course_id', '=', item.id).execute()
    await db.deleteFrom('courses').where('id', '=', item.id).execute()
  }
  const teams = [academy.team_id, other.team_id]
  await db.deleteFrom('academies').where('team_id', 'in', teams).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teams).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teams).execute()
  await db.deleteFrom('teams').where('id', 'in', teams).execute()
  await db.deleteFrom('users').where('id', 'in', [owner, rival, ada, ben, cy]).execute()
})

describe('a learner\'s own notes', () => {
  test('are kept per learner, with the moment they are about', async () => {
    const mine = await addNote(ada, lesson, { body: 'Loop, then around the tree.', seconds: 247.6 })
    expect(mine).toMatchObject([{ body: 'Loop, then around the tree.', seconds: 247, clock: '4:07' }])
    await addNote(ada, lesson, { body: 'No moment for this one.' })
    expect((await notesOf(ada, lesson)).map(note => note.clock)).toEqual(['4:07', ''])
  })

  test('nobody else sees them: not a classmate, not the staff', async () => {
    expect(await notesOf(ben, lesson)).toEqual([])
    expect(await notesOf(owner, lesson)).toEqual([])
  })

  test('nobody else can remove them, and nothing says they exist', async () => {
    const [first] = await notesOf(ada, lesson)
    await expect(removeNote(ben, first!.id)).rejects.toThrow(/not found/)
    await expect(removeNote(owner, first!.id)).rejects.toThrow(/not found/)
    expect((await removeNote(ada, first!.id)).map(note => note.body)).toEqual(['No moment for this one.'])
  })

  test('someone who cannot open the lesson keeps no notes on it', async () => {
    await expect(addNote(rival, lesson, { body: 'Sneaky' })).rejects.toThrow(/not enrolled/)
    await expect(notesOf(rival, lesson)).rejects.toThrow(/not enrolled/)
  })
})

describe('reviewing a course', () => {
  test('nobody reviews a course they have not started', async () => {
    expect(await ownReview(ada, course.id)).toEqual({ canReview: false, review: null })
    await expect(saveReview(ada, course.id, { rating: 5 })).rejects.toThrow(/Complete a lesson first/)
    await expect(saveReview(rival, course.id, { rating: 1 })).rejects.toThrow(/not enrolled/)
  })

  test('a learner who has started may, and their review shows under a short name', async () => {
    await completeLesson(ada, lesson)
    expect((await ownReview(ada, course.id)).canReview).toBe(true)
    await saveReview(ada, course.id, { rating: 5, body: '  Clear from the first minute.  ' })

    const seen = await reviewsOf(course.id)
    expect(seen.summary).toEqual({ count: 1, average: 5 })
    expect(seen.reviews[0]).toMatchObject({ rating: 5, body: 'Clear from the first minute.', author: 'Ada L.' })
    expect(Object.keys(seen.reviews[0]!).sort()).toEqual(['author', 'body', 'createdAt', 'id', 'rating'])
  })

  test('reviewing again changes the review: one learner, one vote', async () => {
    await saveReview(ada, course.id, { rating: 4 })
    const seen = await reviewsOf(course.id)
    expect(seen.summary).toEqual({ count: 1, average: 4 })
    expect(seen.reviews[0]?.body).toBeNull()
    expect((await ownReview(ada, course.id)).review).toEqual({ rating: 4, body: null, hidden: false })
  })

  test('the catalog carries the average, and another course is untouched', async () => {
    await completeLesson(ben, lesson)
    await saveReview(ben, course.id, { rating: 3, body: 'Fine.' })
    const card = (await catalogOf(academy.id)).find(entry => entry.slug === course.slug)!
    expect(card).toMatchObject({ rating: 3.5, reviews: 2 })
    expect((await reviewsOf(otherCourse.id)).summary).toEqual({ count: 0, average: null })
  })

  test('staff of another academy cannot take a review down', async () => {
    const [latest] = (await reviewsOf(course.id)).reviews
    await expect(setReviewHidden(otherCourse, latest!.id, true)).rejects.toThrow(/not part of this course/)
  })

  test('a review taken down counts for nothing, stays on record, and cannot be rewritten', async () => {
    const bens = (await reviewsForStudio(course)).find(review => review.author === 'Ben Franklin')!
    await setReviewHidden(course, bens.id, true)

    expect((await reviewsOf(course.id)).summary).toEqual({ count: 1, average: 4 })
    expect((await reviewsForStudio(course)).find(review => review.id === bens.id)?.hidden).toBe(true)
    expect(await ownReview(ben, course.id)).toMatchObject({ canReview: false, review: { hidden: true } })
    await expect(saveReview(ben, course.id, { rating: 5 })).rejects.toThrow(/taken down/)
    // Withdrawing does not erase what staff took down either.
    await withdrawReview(ben, course.id)
    expect((await reviewsForStudio(course)).some(review => review.id === bens.id)).toBe(true)

    await setReviewHidden(course, bens.id, false)
    expect((await reviewsOf(course.id)).summary.count).toBe(2)
  })

  test('a learner withdraws their own review', async () => {
    await withdrawReview(ada, course.id)
    expect((await reviewsOf(course.id)).reviews.map(review => review.author)).toEqual(['Ben F.'])
    expect((await ownReview(ada, course.id)).review).toBeNull()
  })

  test('removed access means no new review', async () => {
    await completeLesson(cy, lesson)
    const enrollment = await enrollmentOf(cy, course.id)
    await setAccess(course, enrollment!.id, false)
    await expect(saveReview(cy, course.id, { rating: 1 })).rejects.toThrow(/not enrolled/)
    expect(await ownReview(cy, course.id)).toEqual({ canReview: false, review: null })
  })
})
