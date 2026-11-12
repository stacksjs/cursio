import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * What a Learner answered to one question in one Attempt, and what it earned.
 * `response` is JSON: option ids for a choice question, a string or a number
 * otherwise. An essay answer waits for a person: `gradedAt` stays empty until
 * staff give it points, and `feedback` is what they wrote back.
 */
export default defineModel({
  name: 'AttemptAnswer',
  table: 'attempt_answers',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    { model: 'QuizAttempt', onDelete: 'cascade' },
    { model: 'Question', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'attempt_answers_attempt_question_unique', columns: ['quiz_attempt_id', 'question_id'], unique: true },
  ],

  attributes: {
    response: {
      order: 1,
      type: 'text',
      validation: { rule: schema.string().max(8000) },
    },

    isCorrect: {
      required: true,
      default: false,
      order: 2,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    pointsAwarded: {
      required: true,
      default: 0,
      order: 3,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    feedback: {
      order: 4,
      type: 'text',
      validation: { rule: schema.string().max(10000) },
    },

    gradedAt: {
      order: 5,
      validation: { rule: schema.date() },
    },

    gradedBy: {
      order: 6,
      validation: { rule: schema.number() },
    },
  },
} as const)
