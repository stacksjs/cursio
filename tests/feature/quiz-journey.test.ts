import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { certificateBySerial, certificateOf } from '../../app/Support/certificates'
import { addLesson, addSection, CourseError, createCourse, deleteLesson, publishCourse, updateLesson } from '../../app/Support/courses'
import { completeLesson, enroll, enrollmentOf, lessonForLearner } from '../../app/Support/enrollment'
import { deleteQuestion, QuizError, quizForLearner, quizForStudio, reorderQuestions, saveQuestion, startAttempt, submitAttempt, updateQuiz } from '../../app/Support/quizzes'

/**
 * A quiz from both sides, against the real database: staff write it, a Learner
 * sits it, fails, retries, passes, and the Course completes with a
 * Certificate. A second Academy proves a quiz cannot be reached across.
 */

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: number[] = []
const teamIds: number[] = []

async function makeUser(label: string): Promise<number> {
  const row = await db.insertInto('users').values({
    name: `Quiz ${label}`,
    email: `quiz-${label}-${stamp}@cursio.test`,
    password: 'not-a-real-hash',
    uuid: crypto.randomUUID(),
  }).returning(['id']).executeTakeFirst() as { id: number }
  userIds.push(row.id)
  return row.id
}

let owner: number
let learner: number
let stranger: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let otherCourse: CourseRow
let readingId: number
let quizLessonId: number
const q: Record<string, number> = {}
const opt: Record<string, number> = {}

beforeAll(async () => {
  owner = await makeUser('owner')
  learner = await makeUser('learner')
  stranger = await makeUser('stranger')

  academy = await createAcademy({ ownerId: owner, name: 'Quiz School', slug: `quiz-${stamp}` })
  other = await createAcademy({ ownerId: stranger, name: 'Other School', slug: `quiz-other-${stamp}` })
  teamIds.push(academy.team_id, other.team_id)

  course = await createCourse(academy, { title: 'Sailing basics' })
  const section = await addSection(course, { title: 'Start' })
  readingId = (await addLesson(course, { sectionId: section.id, title: 'Read this', body: 'Wind.' })).id
  quizLessonId = (await addLesson(course, { sectionId: section.id, title: 'Check yourself', kind: 'quiz' })).id

  otherCourse = await createCourse(other, { title: 'Elsewhere' })
})

afterAll(async () => {
  const courses = await db.selectFrom('courses').select(['id']).where('team_id', 'in', teamIds).execute() as { id: number }[]
  const courseIds = courses.map(row => row.id)
  if (courseIds.length > 0) {
    const quizzes = await db.selectFrom('quizzes').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
    const quizIds = quizzes.map(row => row.id)
    if (quizIds.length > 0) {
      const attempts = await db.selectFrom('quiz_attempts').select(['id']).where('quiz_id', 'in', quizIds).execute() as { id: number }[]
      if (attempts.length > 0)
        await db.deleteFrom('attempt_answers').where('quiz_attempt_id', 'in', attempts.map(row => row.id)).execute()
      await db.deleteFrom('quiz_attempts').where('quiz_id', 'in', quizIds).execute()
      const questions = await db.selectFrom('questions').select(['id']).where('quiz_id', 'in', quizIds).execute() as { id: number }[]
      if (questions.length > 0)
        await db.deleteFrom('question_options').where('question_id', 'in', questions.map(row => row.id)).execute()
      await db.deleteFrom('questions').where('quiz_id', 'in', quizIds).execute()
      await db.deleteFrom('quizzes').where('id', 'in', quizIds).execute()
    }
    await db.deleteFrom('certificates').where('course_id', 'in', courseIds).execute()
    const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', 'in', courseIds).execute() as { id: number }[]
    if (enrollments.length > 0)
      await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
    await db.deleteFrom('enrollments').where('course_id', 'in', courseIds).execute()
    await db.deleteFrom('lessons').where('course_id', 'in', courseIds).execute()
    await db.deleteFrom('course_sections').where('course_id', 'in', courseIds).execute()
    await db.deleteFrom('courses').where('id', 'in', courseIds).execute()
  }
  await db.deleteFrom('academies').where('team_id', 'in', teamIds).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teamIds).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teamIds).execute()
  await db.deleteFrom('teams').where('id', 'in', teamIds).execute()
  await db.deleteFrom('users').where('id', 'in', userIds).execute()
})

describe('writing a quiz', () => {
  test('a quiz lesson is created with its quiz and sensible defaults', async () => {
    const { quiz, questions } = await quizForStudio(course, quizLessonId)
    expect(quiz.pass_percent).toBe(70)
    expect(quiz.max_attempts).toBeNull()
    expect(quiz.shuffle).toBe(false)
    expect(quiz.reveal).toBe('after_submit')
    expect(questions).toEqual([])
  })

  test('a reading is not a quiz, and a lesson cannot change sides', async () => {
    await expect(quizForStudio(course, readingId)).rejects.toThrow(QuizError)
    await expect(updateLesson(course, readingId, { kind: 'quiz' })).rejects.toThrow(CourseError)
    await expect(updateLesson(course, quizLessonId, { kind: 'reading' })).rejects.toThrow(CourseError)
    // Renaming a quiz lesson is still fine.
    expect((await updateLesson(course, quizLessonId, { title: 'Check yourself' })).kind).toBe('quiz')
  })

  test('a course with an empty quiz cannot be published', async () => {
    await expect(publishCourse(course)).rejects.toThrow(/no questions/)
  })

  test('questions of every kind are saved with their keys', async () => {
    const single = await saveQuestion(course, quizLessonId, {
      kind: 'single',
      prompt: 'Which side is port?',
      explanation: 'Port and left both have four letters.',
      points: 2,
      options: [{ label: 'Left', correct: true }, { label: 'Right', correct: false }, { label: '', correct: false }],
    })
    const multiple = await saveQuestion(course, quizLessonId, {
      kind: 'multiple',
      prompt: 'Which are sails?',
      options: [{ label: 'Jib', correct: true }, { label: 'Main', correct: true }, { label: 'Keel', correct: false }],
    })
    const text = await saveQuestion(course, quizLessonId, { kind: 'text', prompt: 'The front of a boat?', answers: ['Bow', 'the bow'] })
    const number = await saveQuestion(course, quizLessonId, { kind: 'number', prompt: 'Knots in 1.852 km/h?', value: 1, tolerance: 0.05 })

    q.single = single.id
    q.multiple = multiple.id
    q.text = text.id
    q.number = number.id
    opt.left = single.options[0]!.id
    opt.right = single.options[1]!.id
    opt.jib = multiple.options[0]!.id
    opt.main = multiple.options[1]!.id
    opt.keel = multiple.options[2]!.id

    // The blank option was dropped, not saved as an empty answer.
    expect(single.options.map(option => option.label)).toEqual(['Left', 'Right'])
    expect(single.options.map(option => option.is_correct)).toEqual([true, false])
    expect(text.accepted).toEqual({ answers: ['Bow', 'the bow'] })
    expect(number.accepted).toEqual({ value: 1, tolerance: 0.05 })
    expect((await quizForStudio(course, quizLessonId)).questions.map(question => question.id)).toEqual([q.single, q.multiple, q.text, q.number])
  })

  test('a question that cannot be answered is refused and nothing is written', async () => {
    await expect(saveQuestion(course, quizLessonId, { kind: 'single', prompt: 'Pick', options: [{ label: 'A', correct: false }, { label: 'B', correct: false }] })).rejects.toThrow(QuizError)
    expect((await quizForStudio(course, quizLessonId)).questions).toHaveLength(4)
  })

  test('a question is replaced whole, reordered and deleted', async () => {
    const extra = await saveQuestion(course, quizLessonId, { kind: 'true_false', prompt: 'Boats float.', options: [{ label: 'True', correct: true }, { label: 'False', correct: false }] })
    const edited = await saveQuestion(course, quizLessonId, { kind: 'text', prompt: 'Boats do what?', answers: ['float'] }, extra.id)
    expect(edited.id).toBe(extra.id)
    expect(edited.kind).toBe('text')
    expect(edited.options).toEqual([])

    await reorderQuestions(course, quizLessonId, [extra.id, q.single!, q.multiple!, q.text!, q.number!])
    expect((await quizForStudio(course, quizLessonId)).questions[0]!.id).toBe(extra.id)
    await expect(reorderQuestions(course, quizLessonId, [q.single!, q.multiple!])).rejects.toThrow(QuizError)

    await deleteQuestion(course, quizLessonId, extra.id)
    expect((await quizForStudio(course, quizLessonId)).questions.map(question => question.id)).toEqual([q.single, q.multiple, q.text, q.number])
  })

  test('settings are validated', async () => {
    const quiz = await updateQuiz(course, quizLessonId, { passPercent: 60, maxAttempts: 3, timeLimitSeconds: 600, reveal: 'after_pass' })
    expect(quiz.pass_percent).toBe(60)
    expect(quiz.max_attempts).toBe(3)
    expect(quiz.time_limit_seconds).toBe(600)
    expect(quiz.reveal).toBe('after_pass')

    await expect(updateQuiz(course, quizLessonId, { passPercent: 140 })).rejects.toThrow(QuizError)
    await expect(updateQuiz(course, quizLessonId, { timeLimitSeconds: 5 })).rejects.toThrow(QuizError)
    await expect(updateQuiz(course, quizLessonId, { reveal: 'whenever' })).rejects.toThrow(QuizError)
    // Empty clears a limit.
    expect((await updateQuiz(course, quizLessonId, { maxAttempts: null })).max_attempts).toBeNull()
    expect((await updateQuiz(course, quizLessonId, { maxAttempts: 3 })).max_attempts).toBe(3)
  })

  test('another academy cannot read or change this quiz', async () => {
    await expect(quizForStudio(otherCourse, quizLessonId)).rejects.toThrow(QuizError)
    await expect(updateQuiz(otherCourse, quizLessonId, { passPercent: 0 })).rejects.toThrow(QuizError)
    await expect(saveQuestion(otherCourse, quizLessonId, { kind: 'text', prompt: 'x', answers: ['y'] })).rejects.toThrow(QuizError)
    await expect(deleteQuestion(otherCourse, quizLessonId, q.single!)).rejects.toThrow(QuizError)
  })
})

describe('sitting a quiz', () => {
  const t0 = new Date('2026-11-11T10:00:00Z')
  const minutes = (n: number): Date => new Date(t0.getTime() + n * 60_000)

  test('nobody outside the course can open it', async () => {
    course = await publishCourse(course)
    await expect(quizForLearner(learner, quizLessonId)).rejects.toThrow(QuizError)
    await expect(startAttempt(stranger, quizLessonId)).rejects.toThrow(QuizError)
  })

  test('the learner sees the rules and the questions, never the key', async () => {
    await enroll(learner, course)
    const quiz = await quizForLearner(learner, quizLessonId, t0)
    expect(quiz.questionCount).toBe(4)
    expect(quiz.totalPoints).toBe(5)
    expect(quiz.attemptsLeft).toBe(3)
    expect(quiz.passed).toBe(false)
    expect(quiz.open).toBeNull()

    const attempt = await startAttempt(learner, quizLessonId, t0)
    expect(attempt.deadline).toBe(minutes(10).toISOString())
    const wire = JSON.stringify(attempt)
    expect(wire).not.toContain('is_correct')
    expect(wire).not.toContain('accepted')
    expect(wire).not.toContain('Bow')
    expect(wire).not.toContain('four letters')
  })

  test('starting again resumes the same attempt', async () => {
    const first = await startAttempt(learner, quizLessonId, minutes(1))
    const second = await startAttempt(learner, quizLessonId, minutes(2))
    expect(second.id).toBe(first.id)
    expect((await quizForLearner(learner, quizLessonId, minutes(2))).open?.id).toBe(first.id)
  })

  test('a quiz lesson cannot be marked complete by hand', async () => {
    await expect(completeLesson(learner, quizLessonId)).rejects.toThrow(/Pass the quiz/)
  })

  test('a failed attempt is scored, hides the answers and leaves the lesson open', async () => {
    const attempt = await startAttempt(learner, quizLessonId, minutes(2))
    const result = await submitAttempt(learner, attempt.id, { [q.single!]: opt.right, [q.multiple!]: [opt.jib], [q.text!]: 'stern' }, minutes(3))

    expect(result.score).toBe(0)
    expect(result.max).toBe(5)
    expect(result.passed).toBe(false)
    // reveal is `after_pass`: a failed attempt says right or wrong and no more.
    expect(result.revealed).toBe(false)
    expect(JSON.stringify(result.questions)).not.toContain('correctOptionIds')
    expect(result.quiz.attemptsLeft).toBe(2)
    expect(result.progress.completedIds).not.toContain(quizLessonId)
  })

  test('an attempt is submitted once', async () => {
    const quiz = await quizForLearner(learner, quizLessonId, minutes(3))
    await expect(submitAttempt(learner, quiz.attempts[0]!.id, { [q.single!]: opt.left }, minutes(3))).rejects.toThrow(/already submitted/)
  })

  test('someone else cannot submit my attempt', async () => {
    const attempt = await startAttempt(learner, quizLessonId, minutes(4))
    await expect(submitAttempt(stranger, attempt.id, {}, minutes(4))).rejects.toThrow(QuizError)
  })

  test('an attempt left past its time expires and counts as used', async () => {
    // The attempt started at minute 4 has a ten minute limit.
    const quiz = await quizForLearner(learner, quizLessonId, minutes(30))
    expect(quiz.open).toBeNull()
    expect(quiz.attempts.map(attempt => attempt.status)).toEqual(['submitted', 'expired'])
    expect(quiz.attemptsLeft).toBe(1)
    await expect(submitAttempt(learner, quiz.attempts[1]!.id, { [q.single!]: opt.left }, minutes(30))).rejects.toThrow(/Time ran out/)
  })

  test('passing reveals the answers, completes the lesson and the course, and issues a certificate', async () => {
    await completeLesson(learner, readingId, minutes(31))
    const attempt = await startAttempt(learner, quizLessonId, minutes(31))
    const result = await submitAttempt(learner, attempt.id, {
      [q.single!]: opt.left,
      [q.multiple!]: [opt.main, opt.jib],
      [q.text!]: ' the BOW ',
      [q.number!]: '2',
    }, minutes(35))

    expect(result.score).toBe(4)
    expect(result.percent).toBe(80)
    expect(result.passed).toBe(true)
    expect(result.revealed).toBe(true)
    expect(result.questions.find(question => question.id === q.single)?.correctOptionIds).toEqual([opt.left!])
    expect(result.questions.find(question => question.id === q.single)?.explanation).toContain('four letters')
    expect(result.questions.find(question => question.id === q.number)?.correct).toBe(false)
    expect(result.progress.completedIds).toContain(quizLessonId)
    expect(result.courseCompleted).toBe(true)
    expect(result.quiz.passed).toBe(true)
    expect(result.quiz.attemptsLeft).toBe(0)

    const enrollment = await enrollmentOf(learner, course.id)
    expect(enrollment?.status).toBe('completed')
    const certificate = await certificateOf(enrollment!.id)
    expect(certificate?.learner_name).toBe('Quiz learner')
    expect(certificate?.course_title).toBe('Sailing basics')
    expect(certificate?.academy_name).toBe('Quiz School')
    expect((await certificateBySerial(certificate!.serial.toLowerCase()))?.id).toBe(certificate!.id)
  })

  test('no attempts are left once the limit is used', async () => {
    await expect(startAttempt(learner, quizLessonId, minutes(40))).rejects.toThrow(/every attempt/)
  })

  test('completing again does not issue a second certificate', async () => {
    const enrollment = await enrollmentOf(learner, course.id)
    const before = await certificateOf(enrollment!.id)
    await completeLesson(learner, readingId, minutes(50))
    const rows = await db.selectFrom('certificates').select(['id']).where('enrollment_id', '=', enrollment!.id).execute()
    expect(rows).toHaveLength(1)
    expect((await certificateOf(enrollment!.id))?.serial).toBe(before!.serial)
  })

  test('a serial that was never issued verifies as nothing', async () => {
    expect(await certificateBySerial('CUR-AAAA-AAAA-AAAA')).toBeNull()
    expect(await certificateBySerial('\' OR 1=1 --')).toBeNull()
  })

  test('the quiz lesson content is still read through the enrollment', async () => {
    expect((await lessonForLearner(learner, quizLessonId))?.kind).toBe('quiz')
    expect(await lessonForLearner(stranger, quizLessonId)).toBeNull()
  })

  test('deleting the quiz lesson removes everything under it', async () => {
    const { quiz } = await quizForStudio(course, quizLessonId)
    await deleteLesson(course, quizLessonId)

    expect(await db.selectFrom('quizzes').select(['id']).where('id', '=', quiz.id).execute()).toHaveLength(0)
    expect(await db.selectFrom('questions').select(['id']).where('quiz_id', '=', quiz.id).execute()).toHaveLength(0)
    expect(await db.selectFrom('quiz_attempts').select(['id']).where('quiz_id', '=', quiz.id).execute()).toHaveLength(0)
    expect(await db.selectFrom('question_options').select(['id']).where('question_id', 'in', [q.single!, q.multiple!]).execute()).toHaveLength(0)
  })
})
