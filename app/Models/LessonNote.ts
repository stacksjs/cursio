import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A note a Learner keeps on a Lesson, for themselves. Nobody else reads it,
 * staff included. `positionSeconds` is where in the video it was written, when
 * the Lesson has one, so a note can lead back to the moment it is about.
 */
export default defineModel({
  name: 'LessonNote',
  table: 'lesson_notes',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    { model: 'User', onDelete: 'cascade' },
    { model: 'Lesson', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'lesson_notes_user_lesson_index', columns: ['user_id', 'lesson_id'] },
  ],

  attributes: {
    body: {
      required: true,
      order: 1,
      type: 'text',
      validation: { rule: schema.string().min(1).max(4000) },
      factory: faker => faker.lorem.sentence(),
    },

    positionSeconds: {
      order: 2,
      validation: { rule: schema.number().min(0) },
    },
  },
} as const)
