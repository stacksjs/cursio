import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * Progress on one Lesson by one Learner.
 *
 * A row exists once the Learner has completed the Lesson (later: opened it,
 * with a resume position). One per Enrollment per Lesson, enforced by the
 * index, so completing twice changes nothing.
 */
export default defineModel({
  name: 'LessonProgress',
  table: 'lesson_progress',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    { model: 'User', onDelete: 'cascade' },
    { model: 'Enrollment', onDelete: 'cascade' },
    { model: 'Lesson', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'lesson_progress_enrollment_lesson_unique', columns: ['enrollment_id', 'lesson_id'], unique: true },
  ],

  attributes: {
    completedAt: {
      order: 1,
      validation: { rule: schema.date() },
    },
  },
} as const)
