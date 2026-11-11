import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A Section: an ordered group of Lessons inside a Course.
 */
export default defineModel({
  name: 'CourseSection',
  table: 'course_sections',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
    useApi: {
      uri: 'course-sections',
      routes: ['show', 'update', 'destroy'],
      middleware: ['auth'],
    },
  },

  belongsTo: ['Team', { model: 'Course', onDelete: 'cascade' }],
  hasMany: ['Lesson'],

  attributes: {
    title: {
      required: true,
      order: 1,
      fillable: true,
      validation: { rule: schema.string().min(1).max(160) },
      factory: faker => faker.lorem.words(2),
    },

    /** Where it sits in the Course. `order` is a SQL keyword; this is not. */
    position: {
      required: true,
      default: 0,
      order: 2,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },
} as const)
