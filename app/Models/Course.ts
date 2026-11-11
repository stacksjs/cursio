import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A Course: a structured body of teaching a Learner can enroll in and complete.
 *
 * `status` is the only thing that makes a Course visible to Learners. A draft
 * is reachable by the Academy's staff alone; publishing is an explicit action
 * (it refuses a Course with no Lessons) rather than a field anyone can flip.
 */
export default defineModel({
  name: 'Course',
  table: 'courses',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSoftDeletes: true,
    useSeeder: { count: 0 },
    useSearch: {
      displayable: ['id', 'title', 'slug', 'status'],
      searchable: ['title', 'summary'],
      sortable: ['title', 'createdAt'],
      filterable: ['status'],
    },
    useApi: {
      uri: 'courses',
      routes: ['index', 'show', 'update', 'destroy'],
      middleware: ['auth'],
    },
    observe: true,
  },

  belongsTo: ['Team', { model: 'Academy', onDelete: 'cascade' }],
  hasMany: ['CourseSection', 'Lesson', 'Enrollment'],

  indexes: [
    { name: 'courses_academy_slug_unique', columns: ['academy_id', 'slug'], unique: true },
  ],

  attributes: {
    title: {
      required: true,
      order: 1,
      fillable: true,
      validation: { rule: schema.string().min(2).max(160) },
      factory: faker => faker.lorem.words(3),
    },

    /** Unique inside its Academy, not across Cursio. */
    slug: {
      required: true,
      order: 2,
      fillable: true,
      validation: { rule: schema.string().min(2).max(120).matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/) },
      factory: faker => faker.helpers.slugify(faker.lorem.words(3)).toLowerCase(),
    },

    summary: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string().max(500) },
      factory: faker => faker.lorem.sentence(),
    },

    status: {
      required: true,
      default: 'draft',
      order: 4,
      // Not fillable: a Course is published by the publish action, which
      // checks it has something to teach.
      validation: { rule: schema.enum(['draft', 'published', 'archived']) },
      factory: () => 'draft',
    },

    /**
     * `open`: any Lesson, any order. `linear`: a Lesson opens once every Lesson
     * before it is completed.
     */
    progression: {
      required: true,
      default: 'open',
      order: 5,
      fillable: true,
      validation: { rule: schema.enum(['open', 'linear']) },
      factory: () => 'open',
    },

    publishedAt: {
      order: 6,
      validation: { rule: schema.date() },
    },
  },
} as const)
