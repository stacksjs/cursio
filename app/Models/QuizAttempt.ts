import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * An Attempt: one sitting of a Quiz by one Learner.
 *
 * It is opened when the Learner starts (that is when a time limit begins) and
 * closed when they submit. The score is written once, at submission, and is
 * never recomputed: editing the Quiz later does not change what a Learner got.
 */
export default defineModel({
  name: 'QuizAttempt',
  table: 'quiz_attempts',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSeeder: { count: 0 },
    observe: true,
  },

  belongsTo: [
    { model: 'User', onDelete: 'cascade' },
    { model: 'Quiz', onDelete: 'cascade' },
    { model: 'Enrollment', onDelete: 'cascade' },
  ],
  hasMany: ['AttemptAnswer'],

  attributes: {
    status: {
      required: true,
      default: 'open',
      order: 1,
      validation: { rule: schema.enum(['open', 'submitted', 'expired', 'voided']) },
      factory: () => 'open',
    },

    scorePoints: {
      required: true,
      default: 0,
      order: 2,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    maxPoints: {
      required: true,
      default: 0,
      order: 3,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    percent: {
      required: true,
      default: 0,
      order: 4,
      validation: { rule: schema.number().min(0).max(100) },
      factory: () => 0,
    },

    passed: {
      required: true,
      default: false,
      order: 5,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    startedAt: {
      order: 6,
      validation: { rule: schema.date() },
    },

    submittedAt: {
      order: 7,
      validation: { rule: schema.date() },
    },
  },
} as const)
