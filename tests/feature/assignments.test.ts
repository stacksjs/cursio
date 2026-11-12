import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { AssignmentError, assignmentForLearner, assignmentForStudio, markFrom, markSubmission, parseRubric, rubricProblem, submissionsOf, submitWork, updateAssignment } from '../../app/Support/assignments'
import { certificateOf } from '../../app/Support/certificates'
import { addLesson, addSection, CourseError, createCourse, deleteLesson, publishCourse, updateLesson } from '../../app/Support/courses'
import { completeLesson, enroll, enrollmentOf, previewLesson, progressOf } from '../../app/Support/enrollment'
import { gradebookCsv, gradebookOf, setAccess } from '../../app/Support/gradebook'

/** Work handed in by a Learner and marked by staff, with and without a rubric. */

describe('rubrics and marks', () => {
  const rubric = [{ title: 'Clarity', points: 10 }, { title: 'Accuracy', points: 20 }]

  test('a rubric that can be marked against has no problem', () => {
    expect(rubricProblem(rubric)).toBeNull()
    expect(rubricProblem([])).toBeNull()
    expect(rubricProblem([...rubric, { title: '', points: 0 }])).toBeNull()
  })

  test('a rubric that cannot is refused', () => {
    expect(rubricProblem([{ title: '', points: 5 }])).toBeTruthy()
    expect(rubricProblem([{ title: 'Clarity', points: 0 }])).toBeTruthy()
    expect(rubricProblem([{ title: 'Clarity', points: 2.5 }])).toBeTruthy()
    expect(rubricProblem([{ title: 'Clarity', points: 5 }, { title: ' clarity ', points: 5 }])).toBeTruthy()
  })

  test('a stored rubric is read back, and a broken one is no rubric', () => {
    expect(parseRubric(JSON.stringify(rubric))).toEqual(rubric)
    expect(parseRubric('not json')).toEqual([])
    expect(parseRubric(JSON.stringify([{ title: 'x', points: -1 }, { title: 'ok', points: 3 }]))).toEqual([{ title: 'ok', points: 3 }])
    expect(parseRubric(null)).toEqual([])
  })

  test('a rubric mark is the sum of its criteria and decides the pass', () => {
    expect(markFrom({ rubric, maxPoints: 30, passPoints: 20, scores: [8, 12] })).toEqual({ score: 20, rubricScores: [8, 12], passed: true })
    expect(markFrom({ rubric, maxPoints: 30, passPoints: 20, scores: [8, 11] }).passed).toBe(false)
  })

  test('a mark that does not add up is refused', () => {
    expect(() => markFrom({ rubric, maxPoints: 30, passPoints: 20, scores: [8] })).toThrow(AssignmentError)
    expect(() => markFrom({ rubric, maxPoints: 30, passPoints: 20, scores: [11, 5] })).toThrow(/Clarity/)
    expect(() => markFrom({ rubric, maxPoints: 30, passPoints: 20, scores: [-1, 5] })).toThrow(AssignmentError)
    expect(() => markFrom({ rubric, maxPoints: 30, passPoints: 20, scores: [1.5, 5] })).toThrow(AssignmentError)
    expect(() => markFrom({ rubric: [], maxPoints: 100, passPoints: 50 })).toThrow(AssignmentError)
    expect(() => markFrom({ rubric: [], maxPoints: 100, passPoints: 50, score: 101 })).toThrow(AssignmentError)
    expect(() => markFrom({ rubric: [], maxPoints: 100, passPoints: 50, score: '' })).toThrow(AssignmentError)
  })

  test('without a rubric there is one overall score, and zero is a score', () => {
    expect(markFrom({ rubric: [], maxPoints: 100, passPoints: 50, score: 50 })).toEqual({ score: 50, rubricScores: [], passed: true })
    expect(markFrom({ rubric: [], maxPoints: 100, passPoints: 50, score: 0 }).passed).toBe(false)
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: number[] = []
let owner: number
let rival: number
let ada: number
let ben: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let otherCourse: CourseRow
let readingId: number
let essayId: number

beforeAll(async () => {
  const make = async (label: string): Promise<number> => {
    const row = await db.insertInto('users').values({ name: `Work ${label}`, email: `work-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }
    userIds.push(row.id)
    return row.id
  }
  owner = await make('owner')
  rival = await make('rival')
  ada = await make('ada')
  ben = await make('ben')
  academy = await createAcademy({ ownerId: owner, name: 'Work School', slug: `work-${stamp}` })
  other = await createAcademy({ ownerId: rival, name: 'Other', slug: `work-other-${stamp}` })
  otherCourse = await createCourse(other, { title: 'Elsewhere' })

  course = await createCourse(academy, { title: 'Writing' })
  const section = await addSection(course, { title: 'One' })
  readingId = (await addLesson(course, { sectionId: section.id, title: 'Read' })).id
  essayId = (await addLesson(course, { sectionId: section.id, title: 'Essay', kind: 'assignment', body: 'Write 200 words.', isPreview: true })).id
})

afterAll(async () => {
  const teams = [academy.team_id, other.team_id]
  const courses = await db.selectFrom('courses').select(['id']).where('team_id', 'in', teams).execute() as { id: number }[]
  const courseIds = courses.map(row => row.id)
  const assignments = await db.selectFrom('assignments').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
  if (assignments.length > 0) {
    await db.deleteFrom('submissions').where('assignment_id', 'in', assignments.map(row => row.id)).execute()
    await db.deleteFrom('assignments').where('course_id', 'in', courseIds).execute()
  }
  await db.deleteFrom('certificates').where('course_id', 'in', courseIds).execute()
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('enrollments').where('course_id', 'in', courseIds).execute()
  await db.deleteFrom('lessons').where('course_id', 'in', courseIds).execute()
  await db.deleteFrom('course_sections').where('course_id', 'in', courseIds).execute()
  await db.deleteFrom('courses').where('id', 'in', courseIds).execute()
  await db.deleteFrom('academies').where('team_id', 'in', teams).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teams).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teams).execute()
  await db.deleteFrom('teams').where('id', 'in', teams).execute()
  await db.deleteFrom('users').where('id', 'in', userIds).execute()
})

describe('setting an assignment', () => {
  test('is made with its lesson, with one overall score by default, and is never a preview', async () => {
    const assignment = await assignmentForStudio(course, essayId)
    expect(assignment).toMatchObject({ max_points: 100, pass_points: 50, rubric: [] })
    expect(await previewLesson(essayId)).toBeNull()
  })

  test('a reading is not an assignment, and neither can become the other', async () => {
    await expect(assignmentForStudio(course, readingId)).rejects.toThrow(AssignmentError)
    await expect(updateLesson(course, readingId, { kind: 'assignment' })).rejects.toThrow(CourseError)
    await expect(updateLesson(course, essayId, { kind: 'quiz' })).rejects.toThrow(CourseError)
  })

  test('a rubric sets the maximum, and the pass score must be reachable', async () => {
    const assignment = await updateAssignment(course, essayId, { rubric: [{ title: 'Clarity', points: 10 }, { title: 'Accuracy', points: 20 }, { title: '', points: 0 }], passPoints: 20 })
    expect(assignment.max_points).toBe(30)
    expect(assignment.rubric).toHaveLength(2)
    await expect(updateAssignment(course, essayId, { passPoints: 31 })).rejects.toThrow(/30 points/)
    await expect(updateAssignment(course, essayId, { rubric: [{ title: 'Only', points: 5 }] })).rejects.toThrow(AssignmentError)
    expect((await assignmentForStudio(course, essayId)).rubric).toHaveLength(2)
  })

  test('another academy cannot read or change it', async () => {
    await expect(assignmentForStudio(otherCourse, essayId)).rejects.toThrow(AssignmentError)
    await expect(updateAssignment(otherCourse, essayId, { passPoints: 0 })).rejects.toThrow(AssignmentError)
  })
})

describe('handing in and marking', () => {
  test('only an enrolled learner can read the brief or hand in', async () => {
    course = await publishCourse(course)
    await expect(assignmentForLearner(ada, essayId)).rejects.toThrow(AssignmentError)
    await expect(submitWork(ada, essayId, { body: 'x' })).rejects.toThrow(AssignmentError)
  })

  test('work needs words or a link, and a link must be https', async () => {
    await enroll(ada, course)
    await enroll(ben, course)
    await expect(submitWork(ada, essayId, { body: '   ' })).rejects.toThrow(/Write your answer/)
    await expect(submitWork(ada, essayId, { link: 'javascript:alert(1)' })).rejects.toThrow(/https/)
    await expect(submitWork(ada, essayId, { link: 'http://insecure.test/doc' })).rejects.toThrow(/https/)
  })

  test('handing in puts the work in the marking queue, with the rubric beside it', async () => {
    const submission = await submitWork(ada, essayId, { body: 'My first draft.' })
    expect(submission.status).toBe('submitted')
    await submitWork(ben, essayId, { link: 'https://example.test/essay' })

    const queue = await submissionsOf(course)
    expect(queue.map(entry => entry.learnerName)).toEqual(['Work ada', 'Work ben'])
    expect(queue[0]).toMatchObject({ lessonTitle: 'Essay', maxPoints: 30, passPoints: 20 })
    expect(queue[0]!.rubric).toHaveLength(2)
    expect(await submissionsOf(otherCourse)).toEqual([])
  })

  test('an assignment cannot be marked complete by hand', async () => {
    await expect(completeLesson(ada, essayId)).rejects.toThrow(/marked as passed/)
  })

  test('handing in again before it is marked replaces the work', async () => {
    const again = await submitWork(ada, essayId, { body: 'My second draft.' })
    expect(again.body).toBe('My second draft.')
    expect((await submissionsOf(course)).filter(entry => entry.user_id === ada)).toHaveLength(1)
  })

  test('a mark below the pass score returns the work with feedback', async () => {
    const mine = (await assignmentForLearner(ada, essayId)).submission!
    const { submission, progress } = await markSubmission(course, mine.id, owner, { scores: [5, 10], feedback: '  Tighten the opening.  ' })
    expect(submission).toMatchObject({ status: 'returned', score: 15, rubric_scores: [5, 10], feedback: 'Tighten the opening.' })
    expect(progress).toBeNull()

    const seen = await assignmentForLearner(ada, essayId)
    expect(seen.canSubmit).toBe(true)
    expect(seen.submission?.feedback).toBe('Tighten the opening.')
  })

  test('another academy cannot mark it, and a mark must fit the rubric', async () => {
    const mine = (await assignmentForLearner(ada, essayId)).submission!
    await expect(markSubmission(otherCourse, mine.id, rival, { scores: [10, 20] })).rejects.toThrow(AssignmentError)
    await expect(markSubmission(course, mine.id, owner, { scores: [10, 21] })).rejects.toThrow(/Accuracy/)
    await expect(markSubmission(course, mine.id, owner, { score: 30 })).rejects.toThrow(/every criterion/)
  })

  test('handing in after it was returned clears the old mark', async () => {
    const again = await submitWork(ada, essayId, { body: 'My third draft.' })
    expect(again).toMatchObject({ status: 'submitted', score: null, feedback: null, rubric_scores: [] })
  })

  test('a passing mark completes the lesson, then the course, and issues the certificate', async () => {
    await completeLesson(ada, readingId)
    const mine = (await assignmentForLearner(ada, essayId)).submission!
    const { submission, progress } = await markSubmission(course, mine.id, owner, { scores: [9, 18], feedback: 'Much better.' })

    expect(submission).toMatchObject({ status: 'passed', score: 27 })
    expect(progress?.completedIds).toContain(essayId)
    const enrollment = await enrollmentOf(ada, course.id)
    expect(enrollment?.status).toBe('completed')
    expect((await certificateOf(enrollment!.id))?.serial).toMatch(/^CUR-/)
  })

  test('passed work is closed: no new hand-in, no new mark', async () => {
    const seen = await assignmentForLearner(ada, essayId)
    expect(seen.canSubmit).toBe(false)
    await expect(submitWork(ada, essayId, { body: 'One more.' })).rejects.toThrow(/already passed/)
    await expect(markSubmission(course, seen.submission!.id, owner, { scores: [0, 0] })).rejects.toThrow(/already passed/)
  })

  test('the queue shows waiting work first', async () => {
    expect((await submissionsOf(course)).map(entry => entry.status)).toEqual(['submitted', 'passed'])
  })

  test('the gradebook shows the mark, and waiting work is not a zero', async () => {
    const book = await gradebookOf(course)
    expect(book.assignments).toMatchObject([{ lessonId: essayId, maxPoints: 30 }])
    const row = (user: number) => book.learners.find(learner => learner.userId === user)!
    expect(row(ada).assignments[essayId]).toEqual({ status: 'passed', score: 27 })
    expect(row(ben).assignments[essayId]).toEqual({ status: 'submitted', score: null })

    const lines = gradebookCsv(book).trim().split('\r\n')
    expect(lines[0]).toContain('(of 30)')
    expect(lines.find(line => line.includes('"27"'))).toBeDefined()
    expect(lines.find(line => line.includes('"Waiting"'))).toBeDefined()
  })

  test('marking a learner whose access was removed keeps the mark and completes nothing', async () => {
    const benEnrollment = await enrollmentOf(ben, course.id)
    await setAccess(course, benEnrollment!.id, false)
    const waiting = (await submissionsOf(course)).find(entry => entry.user_id === ben)!
    const { submission, progress } = await markSubmission(course, waiting.id, owner, { scores: [10, 20] })
    expect(submission.status).toBe('passed')
    expect(progress).toBeNull()
    await setAccess(course, benEnrollment!.id, true)
    expect((await progressOf((await enrollmentOf(ben, course.id))!)).completedIds).not.toContain(essayId)
  })

  test('deleting the assignment lesson removes its submissions', async () => {
    const assignment = await assignmentForStudio(course, essayId)
    await deleteLesson(course, essayId)
    expect(await db.selectFrom('submissions').select(['id']).where('assignment_id', '=', assignment.id).execute()).toHaveLength(0)
    expect(await db.selectFrom('assignments').select(['id']).where('id', '=', assignment.id).execute()).toHaveLength(0)
  })
})
