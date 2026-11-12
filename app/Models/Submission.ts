import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A Submission: what one Learner handed in for one Assignment, and its mark.
 *
 * One per Enrollment per Assignment. Handing in again replaces the work while
 * it is waiting or was returned; once it has passed it is closed.
 */
export default defineModel({
  name: 'Submission',
  table: 'submissions',
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
    { model: 'Assignment', onDelete: 'cascade' },
    { model: 'Enrollment', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'submissions_assignment_enrollment_unique', columns: ['assignment_id', 'enrollment_id'], unique: true },
  ],

  attributes: {
    /** The written work. */
    body: {
      order: 1,
      type: 'text',
      validation: { rule: schema.string().max(50000) },
    },

    /** A link to work that lives elsewhere: a repository, a document, a video. */
    link: {
      order: 2,
      validation: { rule: schema.string().max(1000) },
    },

    /** `submitted`: waiting to be marked. `passed`. `returned`: marked, not passed, may be handed in again. */
    status: {
      required: true,
      default: 'submitted',
      order: 3,
      validation: { rule: schema.enum(['submitted', 'passed', 'returned']) },
      factory: () => 'submitted',
    },

    score: {
      order: 4,
      validation: { rule: schema.number().min(0).max(1000) },
    },

    /** The score per Rubric criterion, as a JSON array in the Rubric's order. */
    rubricScores: {
      order: 5,
      type: 'text',
      validation: { rule: schema.string().max(4000) },
    },

    feedback: {
      order: 6,
      type: 'text',
      validation: { rule: schema.string().max(10000) },
    },

    submittedAt: {
      order: 7,
      validation: { rule: schema.date() },
    },

    gradedAt: {
      order: 8,
      validation: { rule: schema.date() },
    },

    /** The staff member who marked it. Not a relation: a marker who leaves keeps their marks. */
    gradedBy: {
      order: 9,
      validation: { rule: schema.number().min(1) },
    },
  },
} as const)
