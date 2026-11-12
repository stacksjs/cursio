import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A Lesson: the smallest thing a Learner opens and completes.
 *
 * It carries its Course as well as its Section. The Course is what progress is
 * counted against, and reading it off the Lesson keeps "how many Lessons does
 * this Course have" a single indexed count instead of a join through Sections.
 */
export default defineModel({
  name: 'Lesson',
  table: 'lessons',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSeeder: { count: 0 },
    useApi: {
      uri: 'lessons',
      routes: ['show', 'update', 'destroy'],
      middleware: ['auth'],
    },
  },

  belongsTo: [
    'Team',
    { model: 'Course', onDelete: 'cascade' },
    { model: 'CourseSection', onDelete: 'cascade' },
  ],

  attributes: {
    title: {
      required: true,
      order: 1,
      fillable: true,
      validation: { rule: schema.string().min(1).max(160) },
      factory: faker => faker.lorem.words(3),
    },

    kind: {
      required: true,
      default: 'reading',
      order: 2,
      fillable: true,
      validation: { rule: schema.enum(['video', 'reading', 'quiz', 'assignment']) },
      factory: () => 'reading',
    },

    /** The reading itself, or the notes under a video. Markdown. */
    body: {
      order: 3,
      fillable: true,
      type: 'text',
      validation: { rule: schema.string().max(100000) },
      factory: faker => faker.lorem.paragraphs(2),
    },

    videoUrl: {
      order: 4,
      fillable: true,
      validation: { rule: schema.string().max(1000) },
      factory: () => '',
    },

    durationSeconds: {
      required: true,
      default: 0,
      order: 5,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 300,
    },

    /**
     * The Drip Rule, in its first form: the Lesson opens this many days after
     * the Learner enrolled. Unset means it is open from the start.
     */
    unlockAfterDays: {
      order: 7,
      fillable: true,
      validation: { rule: schema.number().min(0).max(3650) },
    },

    /**
     * A free preview: anyone may open it, enrolled or not. It is how a series
     * is sampled before signing up. A quiz is never a preview.
     */
    isPreview: {
      required: true,
      default: false,
      order: 8,
      fillable: true,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** Where it sits in its Section. */
    position: {
      required: true,
      default: 0,
      order: 6,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },
} as const)
