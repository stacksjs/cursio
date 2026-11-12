/**
 * Question banks: questions an Academy keeps apart from any one Quiz. A Quiz
 * told to draw from a bank deals each Attempt a handful of them (see
 * `startAttempt`), so two sittings are rarely the same paper.
 */

import type { AcademyRow } from './academies'
import type { QuestionDraft } from './grading'
import type { StudioQuestion } from './quizzes'
import { db } from '@stacksjs/database'
import { bankQuestions, QuizError, removeQuestions, writeQuestion } from './quizzes'

export interface BankRow {
  id: number
  academy_id: number
  team_id: number
  title: string
}

export interface BankSummary extends BankRow {
  questions: number
  /** Quizzes that draw from it. */
  quizzes: number
}

const bankColumns = ['id', 'academy_id', 'team_id', 'title'] as const

function titleOf(value: unknown): string {
  const title = String(value ?? '').trim()
  if (title.length < 2 || title.length > 120)
    throw new QuizError('A question bank needs a name of 2 to 120 characters.')
  return title
}

/** The bank with this id in this Academy, or a refusal. */
export async function bankInAcademy(academy: AcademyRow, bankId: number): Promise<BankRow> {
  const bank = await db.selectFrom('question_banks').select([...bankColumns]).where('id', '=', bankId).where('academy_id', '=', academy.id).executeTakeFirst() as BankRow | undefined
  if (!bank)
    throw new QuizError('That question bank is not in this academy.')
  return bank
}

export async function createBank(academy: AcademyRow, input: { title: unknown }): Promise<BankRow> {
  const title = titleOf(input.title)
  const row = await db.insertInto('question_banks').values({ title, academy_id: academy.id, team_id: academy.team_id }).returning(['id']).executeTakeFirst() as { id: number }
  return { id: row.id, academy_id: academy.id, team_id: academy.team_id, title }
}

export async function renameBank(academy: AcademyRow, bankId: number, input: { title: unknown }): Promise<BankRow> {
  const bank = await bankInAcademy(academy, bankId)
  const title = titleOf(input.title)
  await db.updateTable('question_banks').set({ title, updated_at: new Date().toISOString() }).where('id', '=', bank.id).execute()
  return { ...bank, title }
}

export async function banksOf(academy: AcademyRow): Promise<BankSummary[]> {
  const banks = await db.selectFrom('question_banks').select([...bankColumns]).where('academy_id', '=', academy.id).orderBy('id', 'asc').execute() as BankRow[]
  if (banks.length === 0)
    return []
  const ids = banks.map(bank => bank.id)
  const questions = await db.selectFrom('questions').select(['question_bank_id']).where('question_bank_id', 'in', ids).execute() as { question_bank_id: number }[]
  const quizzes = await db.selectFrom('quizzes').select(['question_bank_id']).where('question_bank_id', 'in', ids).execute() as { question_bank_id: number }[]
  return banks.map(bank => ({
    ...bank,
    questions: questions.filter(row => row.question_bank_id === bank.id).length,
    quizzes: quizzes.filter(row => row.question_bank_id === bank.id).length,
  }))
}

export async function bankForStudio(academy: AcademyRow, bankId: number): Promise<{ bank: BankRow, questions: StudioQuestion[] }> {
  const bank = await bankInAcademy(academy, bankId)
  return { bank, questions: await bankQuestions(bank.id) }
}

export async function saveBankQuestion(academy: AcademyRow, bankId: number, draft: QuestionDraft & { explanation?: string }, questionId = 0): Promise<StudioQuestion> {
  const bank = await bankInAcademy(academy, bankId)
  return writeQuestion({ column: 'question_bank_id', id: bank.id, team_id: bank.team_id }, draft, questionId)
}

export async function deleteBankQuestion(academy: AcademyRow, bankId: number, questionId: number): Promise<void> {
  const bank = await bankInAcademy(academy, bankId)
  const existing = await db.selectFrom('questions').select(['id']).where('id', '=', questionId).where('question_bank_id', '=', bank.id).executeTakeFirst()
  if (!existing)
    throw new QuizError('That question is not in this bank.')
  await removeQuestions([questionId])
}

/**
 * Delete a bank and its questions. Quizzes that drew from it stop drawing and
 * keep their own questions; Attempts already dealt lose the deleted questions
 * from their paper.
 */
export async function deleteBank(academy: AcademyRow, bankId: number): Promise<void> {
  const bank = await bankInAcademy(academy, bankId)
  await db.updateTable('quizzes').set({ question_bank_id: null, pool_size: 0 }).where('question_bank_id', '=', bank.id).execute()
  const questions = await db.selectFrom('questions').select(['id']).where('question_bank_id', '=', bank.id).execute() as { id: number }[]
  await removeQuestions(questions.map(row => row.id))
  await db.deleteFrom('question_banks').where('id', '=', bank.id).execute()
}
