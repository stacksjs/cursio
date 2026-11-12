import type { AcademyRow } from '../../app/Support/academies'
import type { CourseRow } from '../../app/Support/courses'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { createAcademy } from '../../app/Support/academies'
import { bankForStudio, banksOf, createBank, deleteBank, deleteBankQuestion, renameBank, saveBankQuestion } from '../../app/Support/banks'
import { addLesson, addSection, createCourse, deleteLesson, publishCourse } from '../../app/Support/courses'
import { enroll } from '../../app/Support/enrollment'
import { drawn, parseQuestionIds } from '../../app/Support/grading'
import { QuizError, quizForLearner, quizForStudio, saveQuestion, startAttempt, submitAttempt, updateQuiz } from '../../app/Support/quizzes'

/** Question banks: a Quiz deals each Attempt a handful of the bank's questions. */

describe('drawing from a pool', () => {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  test('the same seed draws the same handful, with no repeats', () => {
    const first = drawn(pool, 4, 77)
    expect(first).toEqual(drawn(pool, 4, 77))
    expect(new Set(first).size).toBe(4)
    expect(first.every(item => pool.includes(item))).toBe(true)
  })

  test('different seeds do not all draw alike', () => {
    const hands = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => drawn(pool, 3, seed).join(',')))
    expect(hands.size).toBeGreaterThan(1)
  })

  test('asking for more than there is gives everything, and for nothing gives nothing', () => {
    expect(drawn(pool, 50, 3).sort((a, b) => a - b)).toEqual(pool)
    expect(drawn(pool, 0, 3)).toEqual([])
    expect(drawn(pool, -2, 3)).toEqual([])
  })

  test('a stored paper is read back as ids, and anything else is no paper', () => {
    expect(parseQuestionIds('[4,"9",4]')).toEqual([4, 9])
    for (const bad of [null, '', 'nope', '{}', '[]', '["x"]'])
      expect(parseQuestionIds(bad)).toBeNull()
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
let owner: number
let rival: number
let ada: number
let ben: number
let academy: AcademyRow
let other: AcademyRow
let course: CourseRow
let quizLesson: number
let ownQuestion: number
let ownRight: number
let bankId: number
const banked: { id: number, right: number }[] = []

async function cleanCourse(item: CourseRow): Promise<void> {
  const enrollments = await db.selectFrom('enrollments').select(['id']).where('course_id', '=', item.id).execute() as { id: number }[]
  if (enrollments.length > 0)
    await db.deleteFrom('lesson_progress').where('enrollment_id', 'in', enrollments.map(row => row.id)).execute()
  await db.deleteFrom('certificates').where('course_id', '=', item.id).execute()
  await db.deleteFrom('enrollments').where('course_id', '=', item.id).execute()
  await db.deleteFrom('lessons').where('course_id', '=', item.id).execute()
  await db.deleteFrom('course_sections').where('course_id', '=', item.id).execute()
  await db.deleteFrom('courses').where('id', '=', item.id).execute()
}

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Bank ${label}`, email: `bank-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  owner = await make('owner')
  rival = await make('rival')
  ada = await make('ada')
  ben = await make('ben')
  academy = await createAcademy({ ownerId: owner, name: 'Bank School', slug: `bank-${stamp}` })
  other = await createAcademy({ ownerId: rival, name: 'Bank Rival', slug: `bank-rival-${stamp}` })

  course = await createCourse(academy, { title: 'Knots, examined' })
  const section = await addSection(course, { title: 'One' })
  quizLesson = (await addLesson(course, { sectionId: section.id, title: 'Exam', kind: 'quiz' })).id
})

afterAll(async () => {
  await deleteLesson(course, quizLesson).catch(() => {})
  await cleanCourse(course)
  for (const school of [academy, other]) {
    for (const bank of await banksOf(school))
      await deleteBank(school, bank.id)
  }
  const teams = [academy.team_id, other.team_id]
  await db.deleteFrom('academies').where('team_id', 'in', teams).execute()
  await db.deleteFrom('sites').where('team_id', 'in', teams).execute()
  await db.deleteFrom('team_members').where('team_id', 'in', teams).execute()
  await db.deleteFrom('teams').where('id', 'in', teams).execute()
  await db.deleteFrom('users').where('id', 'in', [owner, rival, ada, ben]).execute()
})

describe('keeping a bank', () => {
  test('a bank is made with a name, and listed with what it holds', async () => {
    await expect(createBank(academy, { title: ' ' })).rejects.toThrow(QuizError)
    const bank = await createBank(academy, { title: '  Knot questions ' })
    bankId = bank.id
    expect(bank.title).toBe('Knot questions')
    expect(await banksOf(academy)).toMatchObject([{ id: bankId, questions: 0, quizzes: 0 }])
    expect(await banksOf(other)).toEqual([])
  })

  test('questions are written into it under the same rules as a quiz', async () => {
    for (const knot of ['Bowline', 'Clove hitch', 'Figure eight', 'Sheet bend', 'Reef knot', 'Cleat hitch']) {
      const question = await saveBankQuestion(academy, bankId, { kind: 'single', prompt: `Is the ${knot} a knot?`, options: [{ label: 'Yes', correct: true }, { label: 'No', correct: false }] })
      banked.push({ id: question.id, right: question.options[0]!.id })
    }
    await expect(saveBankQuestion(academy, bankId, { kind: 'single', prompt: 'Nothing to choose', options: [] })).rejects.toThrow(QuizError)
    expect((await bankForStudio(academy, bankId)).questions).toHaveLength(6)
    expect((await banksOf(academy))[0]?.questions).toBe(6)
  })

  test('a question can be rewritten and removed, only inside its bank', async () => {
    const extra = await saveBankQuestion(academy, bankId, { kind: 'text', prompt: 'Name a knot', answers: ['bowline'] })
    const edited = await saveBankQuestion(academy, bankId, { kind: 'text', prompt: 'Name any knot', answers: ['bowline', 'reef'] }, extra.id)
    expect(edited).toMatchObject({ id: extra.id, prompt: 'Name any knot' })

    const elsewhere = await createBank(academy, { title: 'Second bank' })
    await expect(saveBankQuestion(academy, elsewhere.id, { kind: 'text', prompt: 'Hijack', answers: ['x'] }, extra.id)).rejects.toThrow(/not in this bank/)
    await expect(deleteBankQuestion(academy, elsewhere.id, extra.id)).rejects.toThrow(/not in this bank/)
    await deleteBankQuestion(academy, bankId, extra.id)
    await deleteBank(academy, elsewhere.id)
    expect((await bankForStudio(academy, bankId)).questions).toHaveLength(6)
  })

  test('another academy cannot read, fill, rename or delete it', async () => {
    await expect(bankForStudio(other, bankId)).rejects.toThrow(/not in this academy/)
    await expect(saveBankQuestion(other, bankId, { kind: 'text', prompt: 'x', answers: ['x'] })).rejects.toThrow(/not in this academy/)
    await expect(renameBank(other, bankId, { title: 'Mine now' })).rejects.toThrow(/not in this academy/)
    await expect(deleteBank(other, bankId)).rejects.toThrow(/not in this academy/)
    expect((await renameBank(academy, bankId, { title: 'Knots' })).title).toBe('Knots')
  })
})

describe('a quiz that draws from a bank', () => {
  test('draws only from its own academy, and must say how many', async () => {
    const foreign = await createBank(other, { title: 'Foreign' })
    await expect(updateQuiz(course, quizLesson, { questionBankId: foreign.id, poolSize: 2 })).rejects.toThrow(/not in this academy/)
    await expect(updateQuiz(course, quizLesson, { questionBankId: bankId })).rejects.toThrow(/how many/)
    await expect(updateQuiz(course, quizLesson, { questionBankId: bankId, poolSize: 0 })).rejects.toThrow(QuizError)

    const quiz = await updateQuiz(course, quizLesson, { questionBankId: bankId, poolSize: 3, passPercent: 100 })
    expect(quiz).toMatchObject({ question_bank_id: bankId, pool_size: 3 })
    expect((await banksOf(academy))[0]?.quizzes).toBe(1)
  })

  test('can be published on the bank alone, and its own questions stay its own', async () => {
    course = await publishCourse(course)
    const own = await saveQuestion(course, quizLesson, { kind: 'single', prompt: 'Asked every time?', options: [{ label: 'Yes', correct: true }, { label: 'No', correct: false }] })
    ownQuestion = own.id
    ownRight = own.options[0]!.id
    expect((await quizForStudio(course, quizLesson)).questions.map(question => question.id)).toEqual([ownQuestion])
  })

  test('each attempt is dealt the quiz\'s own questions plus a handful, and keeps them', async () => {
    await enroll(ada, course)
    expect((await quizForLearner(ada, quizLesson)).questionCount).toBe(4)

    const attempt = await startAttempt(ada, quizLesson)
    const ids = attempt.questions.map(question => question.id)
    expect(ids).toHaveLength(4)
    expect(ids).toContain(ownQuestion)
    expect(ids.filter(id => banked.some(item => item.id === id))).toHaveLength(3)
    // No key travels with a dealt question.
    expect(JSON.stringify(attempt.questions)).not.toContain('is_correct')

    // Reopening the page, or the quiz, shows the same paper.
    expect((await startAttempt(ada, quizLesson)).questions.map(question => question.id).sort()).toEqual([...ids].sort())
    expect((await quizForLearner(ada, quizLesson)).open?.questions.map(question => question.id).sort()).toEqual([...ids].sort())
  })

  test('the paper handed in is graded against the paper handed out', async () => {
    const attempt = await startAttempt(ada, quizLesson)
    const dealt = attempt.questions.map(question => question.id)
    // The bank grows and a quiz setting changes while the learner is sitting it.
    await saveBankQuestion(academy, bankId, { kind: 'single', prompt: 'Added late?', options: [{ label: 'Yes', correct: true }, { label: 'No', correct: false }] })
    await updateQuiz(course, quizLesson, { poolSize: 5 })

    const answers: Record<number, unknown> = { [ownQuestion]: ownRight }
    for (const id of dealt) {
      const found = banked.find(item => item.id === id)
      if (found)
        answers[id] = found.right
    }
    const result = await submitAttempt(ada, attempt.id, answers)
    expect(result).toMatchObject({ score: 4, max: 4, percent: 100, passed: true })
    expect(result.questions.map(question => question.id).sort()).toEqual([...dealt].sort())
  })

  test('an answer to a question that was not dealt earns nothing', async () => {
    await enroll(ben, course)
    const attempt = await startAttempt(ben, quizLesson)
    const dealt = attempt.questions.map(question => question.id)
    const undealt = banked.find(item => !dealt.includes(item.id))
    const answers: Record<number, unknown> = undealt ? { [undealt.id]: undealt.right } : {}
    const result = await submitAttempt(ben, attempt.id, answers)
    expect(result.score).toBe(0)
    expect(result.max).toBe(dealt.length)
  })

  test('two sittings are not always the same paper', async () => {
    const papers = new Set<string>()
    for (let turn = 0; turn < 6; turn++) {
      const attempt = await startAttempt(ben, quizLesson)
      papers.add(attempt.questions.map(question => question.id).sort().join(','))
      await submitAttempt(ben, attempt.id, {})
    }
    expect(papers.size).toBeGreaterThan(1)
  })

  test('deleting the bank leaves the quiz with its own questions', async () => {
    await deleteBank(academy, bankId)
    const { quiz, questions } = await quizForStudio(course, quizLesson)
    expect(quiz).toMatchObject({ question_bank_id: null, pool_size: 0 })
    expect(questions.map(question => question.id)).toEqual([ownQuestion])
    expect((await startAttempt(ben, quizLesson)).questions.map(question => question.id)).toEqual([ownQuestion])
  })
})
