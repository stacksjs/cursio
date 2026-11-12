import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * An Assignment: the work behind a Lesson of kind `assignment`, and how it is
 * marked.
 *
 * One per Lesson, made with it. The Lesson's body is the brief the Learner
 * reads; this row holds what a marker needs: the rubric and the score that
 * counts as passing. Like a Quiz, the Lesson is completed by passing, never by
 * pressing "mark complete".
 */
export default defineModel({
  name: 'Assignment',
  table: 'assignments',
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
  ],
  hasMany: ['Submission'],

  indexes: [
    { name: 'assignments_lesson_unique', columns: ['lesson_id'], unique: true },
  ],

  attributes: {
    /** The most a Submission can score. With a rubric, the sum of its criteria. */
    maxPoints: {
      required: true,
      default: 100,
      order: 1,
      fillable: true,
      validation: { rule: schema.number().min(1).max(1000) },
      factory: () => 100,
    },

    /** The score a Submission needs to pass and complete the Lesson. */
    passPoints: {
      required: true,
      default: 50,
      order: 2,
      fillable: true,
      validation: { rule: schema.number().min(0).max(1000) },
      factory: () => 50,
    },

    /** The Rubric, as JSON: `[{"title":"Clarity","points":10}]`. Empty: one overall score. */
    rubric: {
      order: 3,
      fillable: true,
      type: 'text',
      validation: { rule: schema.string().max(8000) },
    },
  },
} as const)
