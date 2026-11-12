/**
 * Grading a Quiz.
 *
 * Everything here is plain data in, plain data out: what counts as a right
 * answer, how an Attempt adds up, whether it passed, how many Attempts are
 * left, when a timed one runs out. Nothing in this file touches the database,
 * so the rules can be tested exhaustively and read in one place.
 */

export const questionKinds = ['single', 'multiple', 'true_false', 'text', 'number', 'ordering', 'matching'] as const
export type QuestionKind = typeof questionKinds[number]

export const choiceKinds: readonly QuestionKind[] = ['single', 'multiple', 'true_false']

/** Kinds whose answers are stored as option rows. For `ordering` the rows are in the right order. */
export const optionKinds: readonly QuestionKind[] = [...choiceKinds, 'ordering']

export interface MatchPair {
  left: string
  right: string
}

export type AnswerKey
  = | { answers: string[] }
    | { value: number, tolerance: number }
    | { pairs: MatchPair[] }

export interface GradableOption {
  id: number
  is_correct: boolean
}

export interface GradableQuestion {
  id: number
  kind: QuestionKind
  points: number
  options: GradableOption[]
  accepted: AnswerKey | null
}

/** Typed answers are compared without case, edge spaces or doubled spaces. */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** The stored answer key, or null when it is missing or not for this kind. */
export function parseAccepted(kind: QuestionKind, raw: string | null | undefined): AnswerKey | null {
  if (!raw || (kind !== 'text' && kind !== 'number' && kind !== 'matching'))
    return null

  let data: unknown
  try {
    data = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (typeof data !== 'object' || data === null)
    return null

  const key = data as { answers?: unknown, value?: unknown, tolerance?: unknown, pairs?: unknown }
  if (kind === 'matching') {
    const pairs = Array.isArray(key.pairs)
      ? key.pairs.filter((pair): pair is MatchPair => typeof pair?.left === 'string' && typeof pair?.right === 'string' && normalizeText(pair.left) !== '' && normalizeText(pair.right) !== '')
      : []
    return pairs.length >= 2 ? { pairs: pairs.map(pair => ({ left: pair.left, right: pair.right })) } : null
  }
  if (kind === 'text') {
    const answers = Array.isArray(key.answers) ? key.answers.filter((item): item is string => typeof item === 'string' && normalizeText(item) !== '') : []
    return answers.length > 0 ? { answers } : null
  }

  const value = Number(key.value)
  const tolerance = Math.abs(Number(key.tolerance) || 0)
  return Number.isFinite(value) && key.value !== null && key.value !== '' ? { value, tolerance } : null
}

function chosenIds(response: unknown): number[] {
  const list = Array.isArray(response) ? response : [response]
  const ids = list.map(Number).filter(id => Number.isInteger(id) && id > 0)
  return [...new Set(ids)]
}

/**
 * Is this response right? All or nothing: a `multiple` question is right only
 * when exactly the correct options are chosen, so ticking every box earns
 * nothing. A missing or malformed response is simply wrong.
 */
export function isCorrect(question: GradableQuestion, response: unknown): boolean {
  if (response === undefined || response === null || response === '')
    return false

  if (question.kind === 'text') {
    if (!question.accepted || !('answers' in question.accepted) || typeof response !== 'string')
      return false
    const given = normalizeText(response)
    return given !== '' && question.accepted.answers.some(answer => normalizeText(answer) === given)
  }

  if (question.kind === 'number') {
    if (!question.accepted || !('value' in question.accepted))
      return false
    if (typeof response !== 'number' && typeof response !== 'string')
      return false
    const given = typeof response === 'number' ? response : Number(response.trim().replace(',', '.'))
    if (!Number.isFinite(given) || (typeof response === 'string' && response.trim() === ''))
      return false
    // A hair of slack so 0.1 + 0.2 still equals 0.3 at zero tolerance.
    return Math.abs(given - question.accepted.value) <= question.accepted.tolerance + 1e-9
  }

  if (question.kind === 'matching') {
    if (!question.accepted || !('pairs' in question.accepted) || typeof response !== 'object' || Array.isArray(response))
      return false
    // Keyed by the position of the left-hand item; the value is the right-hand
    // text the Learner put against it.
    const given = response as Record<string, unknown>
    return question.accepted.pairs.every((pair, index) => typeof given[index] === 'string' && normalizeText(given[index] as string) === normalizeText(pair.right))
  }

  if (question.kind === 'ordering') {
    // The options are stored in the right order: the response must list every
    // one of them, in that order.
    if (!Array.isArray(response))
      return false
    const order = response.map(Number)
    return order.length === question.options.length && question.options.length > 1 && question.options.every((option, index) => order[index] === option.id)
  }

  const right = question.options.filter(option => option.is_correct).map(option => option.id)
  const valid = new Set(question.options.map(option => option.id))
  const chosen = chosenIds(response)
  if (chosen.length === 0 || chosen.some(id => !valid.has(id)))
    return false
  if (question.kind !== 'multiple' && chosen.length !== 1)
    return false

  return chosen.length === right.length && chosen.every(id => right.includes(id))
}

export interface GradedAnswer {
  questionId: number
  correct: boolean
  points: number
}

export interface GradedAttempt {
  answers: GradedAnswer[]
  score: number
  max: number
  /** Whole percent, 0 to 100. A Quiz worth nothing is 0, never NaN. */
  percent: number
  passed: boolean
}

export function gradeAttempt(questions: GradableQuestion[], responses: Record<number, unknown>, passPercent: number): GradedAttempt {
  const answers = questions.map((question) => {
    const correct = isCorrect(question, responses[question.id])
    return { questionId: question.id, correct, points: correct ? question.points : 0 }
  })
  const score = answers.reduce((sum, answer) => sum + answer.points, 0)
  const max = questions.reduce((sum, question) => sum + question.points, 0)
  const percent = max === 0 ? 0 : Math.round((score / max) * 100)

  // Passing is decided on the points, not the rounded percent: 69.6% shows as
  // 70 but has not reached a 70% pass mark.
  return { answers, score, max, percent, passed: max > 0 && score * 100 >= passPercent * max }
}

/** Attempts still available. Null means there is no limit. */
export function attemptsLeft(maxAttempts: number | null | undefined, used: number): number | null {
  if (!maxAttempts || maxAttempts < 1)
    return null
  return Math.max(0, maxAttempts - used)
}

/** When a timed Attempt closes. Null for an untimed Quiz. */
export function deadlineOf(startedAt: Date, timeLimitSeconds: number | null | undefined): Date | null {
  if (!timeLimitSeconds || timeLimitSeconds < 1)
    return null
  return new Date(startedAt.getTime() + timeLimitSeconds * 1000)
}

/** A submission this long after the deadline still counts: networks are slow. */
export const SUBMIT_GRACE_MS = 15_000

export function isLate(deadline: Date | null, at: Date): boolean {
  return deadline !== null && at.getTime() > deadline.getTime() + SUBMIT_GRACE_MS
}

/**
 * The same items in an order fixed by the seed: an Attempt shows its questions
 * shuffled, but the same way every time it is reopened.
 */
export function shuffled<T>(items: T[], seed: number): T[] {
  let state = (seed >>> 0) || 1
  const next = (): number => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const held = result[i] as T
    result[i] = result[j] as T
    result[j] = held
  }
  return result
}

export interface QuestionDraft {
  kind: string
  prompt: string
  points?: number
  options?: { label: string, correct: boolean }[]
  answers?: string[]
  value?: number | null
  tolerance?: number | null
  pairs?: MatchPair[]
}

/**
 * What is wrong with a question as written, or null when it can be asked. A
 * question a Learner cannot possibly get right must never be saved.
 */
export function questionProblem(draft: QuestionDraft): string | null {
  if (!questionKinds.includes(draft.kind as QuestionKind))
    return 'That question type is not supported yet.'
  if (!draft.prompt.trim())
    return 'A question needs its wording.'

  const points = draft.points ?? 1
  if (!Number.isInteger(points) || points < 1 || points > 100)
    return 'Points are a whole number from 1 to 100.'

  const kind = draft.kind as QuestionKind
  if (kind === 'text')
    return (draft.answers ?? []).some(answer => normalizeText(answer) !== '') ? null : 'Add at least one accepted answer.'

  if (kind === 'number') {
    if (draft.value === null || draft.value === undefined || !Number.isFinite(Number(draft.value)))
      return 'Give the number that is correct.'
    return Number(draft.tolerance ?? 0) >= 0 ? null : 'The margin cannot be negative.'
  }

  if (kind === 'matching') {
    const pairs = (draft.pairs ?? []).filter(pair => pair.left.trim() !== '' || pair.right.trim() !== '')
    if (pairs.some(pair => pair.left.trim() === '' || pair.right.trim() === ''))
      return 'Every pair needs both of its sides.'
    if (pairs.length < 2)
      return 'Give at least two pairs to match.'
    if (pairs.length > 12)
      return 'A question can have at most twelve pairs.'
    // Two identical right-hand sides would make the question ambiguous only in
    // appearance (either fits), but two identical left-hand sides cannot be told apart.
    if (new Set(pairs.map(pair => normalizeText(pair.left))).size !== pairs.length)
      return 'Two items to match read the same.'
    return null
  }

  const options = (draft.options ?? []).filter(option => option.label.trim() !== '')
  if (kind === 'ordering') {
    if (options.length < 2)
      return 'Give at least two items to put in order.'
    if (options.length > 12)
      return 'A question can have at most twelve items.'
    return new Set(options.map(option => normalizeText(option.label))).size === options.length ? null : 'Two items read the same.'
  }
  const right = options.filter(option => option.correct).length
  if (kind === 'true_false')
    return options.length === 2 && right === 1 ? null : 'Pick whether the statement is true or false.'
  if (options.length < 2)
    return 'Give at least two answers to choose from.'
  if (options.length > 12)
    return 'A question can have at most twelve answers.'
  if (new Set(options.map(option => normalizeText(option.label))).size !== options.length)
    return 'Two answers read the same.'
  if (kind === 'single')
    return right === 1 ? null : 'Mark exactly one answer as correct.'
  return right >= 1 ? null : 'Mark at least one answer as correct.'
}

export interface AttemptFact {
  quizId: number
  enrollmentId: number
  status: string
  percent: number
  passed: boolean
}

export interface QuizStanding {
  /** Attempts that count: submitted or expired, not open and not voided. */
  attempts: number
  /** The best percent among them. Null when there is none yet. */
  best: number | null
  passed: boolean
}

/** Attempts that use up a Learner's allowance. A voided one was given back. */
export function countsAsUsed(status: string): boolean {
  return status !== 'voided'
}

/**
 * Each Learner's standing on each Quiz, keyed `enrollmentId:quizId`. The best
 * attempt is what a gradebook shows: a later, worse try does not lower it.
 */
export function standings(attempts: AttemptFact[]): Map<string, QuizStanding> {
  const result = new Map<string, QuizStanding>()
  for (const attempt of attempts) {
    if (attempt.status !== 'submitted' && attempt.status !== 'expired')
      continue
    const key = `${attempt.enrollmentId}:${attempt.quizId}`
    const standing = result.get(key) ?? { attempts: 0, best: null, passed: false }
    standing.attempts++
    standing.best = Math.max(standing.best ?? 0, attempt.percent)
    standing.passed = standing.passed || attempt.passed
    result.set(key, standing)
  }
  return result
}

/**
 * Rows as CSV text. Every cell is quoted, and a cell a spreadsheet would run
 * as a formula (it starts with = + - @, or a tab or return) is prefixed with
 * an apostrophe: a Learner chooses their own name, and it lands in a file the
 * Academy's staff open.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined): string => {
    let text = value === null || value === undefined ? '' : String(value)
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text))
      text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  return `${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`
}
