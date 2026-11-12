import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * What a Learner thought of a Course: one to five, and a few words if they
 * have them. One per Enrollment, enforced by the index, so a Learner changes
 * their review rather than adding another. `hiddenAt` is set when the
 * Academy's staff take it down; it then counts for nothing.
 */
export default defineModel({
  name: 'CourseReview',
  table: 'course_reviews',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    { model: 'Course', onDelete: 'cascade' },
    { model: 'User', onDelete: 'cascade' },
    { model: 'Enrollment', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'course_reviews_enrollment_unique', columns: ['enrollment_id'], unique: true },
  ],

  attributes: {
    rating: {
      required: true,
      order: 1,
      validation: { rule: schema.number().min(1).max(5) },
      factory: () => 5,
    },

    body: {
      order: 2,
      type: 'text',
      validation: { rule: schema.string().max(2000) },
    },

    hiddenAt: {
      order: 3,
      validation: { rule: schema.date() },
    },
  },
} as const)
