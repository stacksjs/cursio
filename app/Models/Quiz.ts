import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A Quiz: the questions behind a Lesson of kind `quiz`, and the rules for
 * sitting it.
 *
 * One per Lesson, enforced by the index. The Lesson is what sits in the
 * outline and what progress counts; the Quiz is how that Lesson is completed:
 * by passing an Attempt, never by pressing "mark complete".
 */
export default defineModel({
  name: 'Quiz',
  table: 'quizzes',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    'Team',
    { model: 'Course', onDelete: 'cascade' },
    { model: 'Lesson', onDelete: 'cascade' },
    // The bank this Quiz draws extra questions from, if any.
    'QuestionBank',
  ],
  hasMany: ['Question', 'QuizAttempt'],

  indexes: [
    { name: 'quizzes_lesson_unique', columns: ['lesson_id'], unique: true },
  ],

  attributes: {
    /** How many questions each Attempt draws from the bank. */
    poolSize: {
      required: true,
      default: 0,
      order: 9,
      fillable: true,
      validation: { rule: schema.number().min(0).max(100) },
      factory: () => 0,
    },

    /** Whole percent of the points a Learner needs to pass. */
    passPercent: {
      required: true,
      default: 70,
      order: 1,
      fillable: true,
      validation: { rule: schema.number().min(0).max(100) },
      factory: () => 70,
    },

    /** How many Attempts a Learner gets. Unset: as many as they like. */
    maxAttempts: {
      order: 2,
      fillable: true,
      validation: { rule: schema.number().min(1).max(100) },
    },

    /** Seconds from starting an Attempt to its deadline. Unset: untimed. */
    timeLimitSeconds: {
      order: 3,
      fillable: true,
      validation: { rule: schema.number().min(30).max(86400) },
    },

    /** Present the questions in a different order each Attempt. */
    shuffle: {
      required: true,
      default: false,
      order: 4,
      fillable: true,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** When a Learner is shown the right answers and the explanations. */
    reveal: {
      required: true,
      default: 'after_submit',
      order: 5,
      fillable: true,
      validation: { rule: schema.enum(['never', 'after_submit', 'after_pass']) },
      factory: () => 'after_submit',
    },
  },
} as const)
