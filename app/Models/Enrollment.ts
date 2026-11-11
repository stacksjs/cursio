import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * An Enrollment: a Learner's right to take one Course.
 *
 * One row per Learner per Course, enforced by the index, so enrolling twice is
 * the same Enrollment rather than a second one. It is written only by the
 * enroll action (later: checkout), never through a generated route, because
 * what grants access is a rule and not a form.
 */
export default defineModel({
  name: 'Enrollment',
  table: 'enrollments',
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
    { model: 'Course', onDelete: 'cascade' },
  ],
  hasMany: ['LessonProgress'],

  indexes: [
    { name: 'enrollments_user_course_unique', columns: ['user_id', 'course_id'], unique: true },
  ],

  attributes: {
    status: {
      required: true,
      default: 'active',
      order: 1,
      validation: { rule: schema.enum(['active', 'completed', 'revoked']) },
      factory: () => 'active',
    },

    /** How the Learner got in. Free for now; purchase, gift and import follow. */
    source: {
      required: true,
      default: 'free',
      order: 2,
      validation: { rule: schema.enum(['free', 'manual']) },
      factory: () => 'free',
    },

    completedAt: {
      order: 3,
      validation: { rule: schema.date() },
    },
  },
} as const)
