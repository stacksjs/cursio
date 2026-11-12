import type { GradableQuestion } from '../../app/Support/grading'
import { describe, expect, test } from 'bun:test'
import { newSerial, normalizeSerial } from '../../app/Support/certificates'
import { attemptsLeft, deadlineOf, gradeAttempt, isCorrect, isLate, normalizeText, parseAccepted, questionProblem, shuffled, SUBMIT_GRACE_MS } from '../../app/Support/grading'

const single: GradableQuestion = { id: 1, kind: 'single', points: 2, accepted: null, options: [{ id: 10, is_correct: false }, { id: 11, is_correct: true }, { id: 12, is_correct: false }] }
const multiple: GradableQuestion = { id: 2, kind: 'multiple', points: 3, accepted: null, options: [{ id: 20, is_correct: true }, { id: 21, is_correct: true }, { id: 22, is_correct: false }] }
const text: GradableQuestion = { id: 3, kind: 'text', points: 1, options: [], accepted: { answers: ['Paris', 'City of  Light'] } }
const number: GradableQuestion = { id: 4, kind: 'number', points: 4, options: [], accepted: { value: 9.81, tolerance: 0.01 } }

describe('one question', () => {
  test('single choice is right only on the one correct option', () => {
    expect(isCorrect(single, 11)).toBe(true)
    expect(isCorrect(single, [11])).toBe(true)
    expect(isCorrect(single, 10)).toBe(false)
    expect(isCorrect(single, [10, 11])).toBe(false)
  })

  test('multiple choice is all or nothing', () => {
    expect(isCorrect(multiple, [21, 20])).toBe(true)
    expect(isCorrect(multiple, [20])).toBe(false)
    // Ticking every box must not be a way to get it right.
    expect(isCorrect(multiple, [20, 21, 22])).toBe(false)
    expect(isCorrect(multiple, [20, 20, 21])).toBe(true)
  })

  test('an option from another question is wrong, not ignored', () => {
    expect(isCorrect(single, 20)).toBe(false)
    expect(isCorrect(multiple, [20, 21, 999])).toBe(false)
  })

  test('typed answers ignore case and spacing', () => {
    expect(isCorrect(text, '  pARIS ')).toBe(true)
    expect(isCorrect(text, 'city of light')).toBe(true)
    expect(isCorrect(text, 'London')).toBe(false)
    expect(isCorrect(text, '   ')).toBe(false)
    expect(isCorrect(text, 42)).toBe(false)
  })

  test('numbers are right inside the margin', () => {
    expect(isCorrect(number, 9.81)).toBe(true)
    expect(isCorrect(number, '9.8')).toBe(true)
    expect(isCorrect(number, '9,82')).toBe(true)
    expect(isCorrect(number, 9.83)).toBe(false)
    expect(isCorrect(number, 'about ten')).toBe(false)
    expect(isCorrect(number, '')).toBe(false)
    expect(isCorrect({ ...number, accepted: { value: 0.3, tolerance: 0 } }, 0.1 + 0.2)).toBe(true)
  })

  test('no answer is a wrong answer', () => {
    for (const question of [single, multiple, text, number]) {
      expect(isCorrect(question, undefined)).toBe(false)
      expect(isCorrect(question, null)).toBe(false)
      expect(isCorrect(question, [])).toBe(false)
    }
  })

  test('a question with no key cannot be answered correctly', () => {
    expect(isCorrect({ ...text, accepted: null }, 'Paris')).toBe(false)
    expect(isCorrect({ ...number, accepted: null }, 9.81)).toBe(false)
  })
})

describe('a whole attempt', () => {
  const all = [single, multiple, text, number]

  test('adds up points and decides the pass', () => {
    const graded = gradeAttempt(all, { 1: 11, 2: [20, 21], 3: 'paris', 4: 1 }, 60)
    expect(graded.score).toBe(6)
    expect(graded.max).toBe(10)
    expect(graded.percent).toBe(60)
    expect(graded.passed).toBe(true)
    expect(graded.answers.map(answer => answer.correct)).toEqual([true, true, true, false])
  })

  test('a rounded percent does not carry an attempt over the pass mark', () => {
    // 2 of 3 points is 66.67%: shown as 67, still short of 67.
    const three = [{ ...single, points: 1 }, { ...text, points: 1 }, { ...number, points: 1 }]
    const graded = gradeAttempt(three, { 1: 11, 3: 'paris' }, 67)
    expect(graded.percent).toBe(67)
    expect(graded.passed).toBe(false)
  })

  test('an empty quiz is never passed', () => {
    const graded = gradeAttempt([], {}, 0)
    expect(graded.percent).toBe(0)
    expect(graded.passed).toBe(false)
  })

  test('a pass mark of zero still needs a quiz worth something', () => {
    expect(gradeAttempt(all, {}, 0).passed).toBe(true)
  })
})

describe('attempt limits and time', () => {
  test('attempts left', () => {
    expect(attemptsLeft(null, 7)).toBeNull()
    expect(attemptsLeft(3, 1)).toBe(2)
    expect(attemptsLeft(3, 5)).toBe(0)
  })

  test('a deadline, and the grace after it', () => {
    const started = new Date('2026-11-11T10:00:00Z')
    const deadline = deadlineOf(started, 600)
    expect(deadline?.toISOString()).toBe('2026-11-11T10:10:00.000Z')
    expect(deadlineOf(started, null)).toBeNull()

    expect(isLate(deadline, new Date('2026-11-11T10:09:59Z'))).toBe(false)
    expect(isLate(deadline, new Date(deadline!.getTime() + SUBMIT_GRACE_MS))).toBe(false)
    expect(isLate(deadline, new Date(deadline!.getTime() + SUBMIT_GRACE_MS + 1))).toBe(true)
    expect(isLate(null, new Date('2030-01-01T00:00:00Z'))).toBe(false)
  })

  test('shuffling keeps every item and repeats for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffled(items, 42)).toEqual(shuffled(items, 42))
    expect([...shuffled(items, 42)].sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const orders = new Set([1, 2, 3, 4, 5, 6].map(seed => shuffled(items, seed).join()))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('writing a question', () => {
  const two = [{ label: 'Yes', correct: true }, { label: 'No', correct: false }]

  test('a question that can be asked has no problem', () => {
    expect(questionProblem({ kind: 'single', prompt: 'Pick', options: two })).toBeNull()
    expect(questionProblem({ kind: 'multiple', prompt: 'Pick', options: [...two, { label: 'Maybe', correct: true }] })).toBeNull()
    expect(questionProblem({ kind: 'true_false', prompt: 'True?', options: [{ label: 'True', correct: false }, { label: 'False', correct: true }] })).toBeNull()
    expect(questionProblem({ kind: 'text', prompt: 'Capital?', answers: ['Paris'] })).toBeNull()
    expect(questionProblem({ kind: 'number', prompt: 'g?', value: 9.81, tolerance: 0.01 })).toBeNull()
    expect(questionProblem({ kind: 'number', prompt: 'Zero?', value: 0 })).toBeNull()
  })

  test('a question nobody could get right is refused', () => {
    expect(questionProblem({ kind: 'single', prompt: 'Pick', options: two.map(option => ({ ...option, correct: false })) })).toBeTruthy()
    expect(questionProblem({ kind: 'single', prompt: 'Pick', options: two.map(option => ({ ...option, correct: true })) })).toBeTruthy()
    expect(questionProblem({ kind: 'multiple', prompt: 'Pick', options: two.map(option => ({ ...option, correct: false })) })).toBeTruthy()
    expect(questionProblem({ kind: 'single', prompt: 'Pick', options: [two[0]!] })).toBeTruthy()
    expect(questionProblem({ kind: 'single', prompt: 'Pick', options: [{ label: 'Same', correct: true }, { label: ' same ', correct: false }] })).toBeTruthy()
    expect(questionProblem({ kind: 'text', prompt: 'Capital?', answers: ['  '] })).toBeTruthy()
    expect(questionProblem({ kind: 'number', prompt: 'g?', value: null })).toBeTruthy()
    expect(questionProblem({ kind: 'single', prompt: '   ', options: two })).toBeTruthy()
    expect(questionProblem({ kind: 'essay', prompt: 'Discuss', options: two })).toBeTruthy()
    expect(questionProblem({ kind: 'single', prompt: 'Pick', options: two, points: 0 })).toBeTruthy()
  })

  test('a stored key is read back, and a broken one is no key', () => {
    expect(parseAccepted('text', '{"answers":["Paris",""]}')).toEqual({ answers: ['Paris'] })
    expect(parseAccepted('number', '{"value":9.81,"tolerance":-0.5}')).toEqual({ value: 9.81, tolerance: 0.5 })
    expect(parseAccepted('number', '{"value":null}')).toBeNull()
    expect(parseAccepted('text', 'not json')).toBeNull()
    expect(parseAccepted('single', '{"answers":["x"]}')).toBeNull()
    expect(normalizeText('  A   b ')).toBe('a b')
  })
})

describe('certificate serials', () => {
  test('are well formed, unambiguous and do not repeat', () => {
    const serials = Array.from({ length: 200 }, newSerial)
    for (const serial of serials)
      expect(serial).toMatch(/^CUR-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/)
    expect(new Set(serials).size).toBe(200)
  })

  test('a typed serial is tidied before it is looked up', () => {
    expect(normalizeSerial('  cur-abcd-efgh-2345 ')).toBe('CUR-ABCD-EFGH-2345')
  })
})
