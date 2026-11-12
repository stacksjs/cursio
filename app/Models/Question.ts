import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * One question in a Quiz.
 *
 * Choice questions (`single`, `multiple`, `true_false`) keep their answers in
 * QuestionOption rows, and so does `ordering`, whose rows are stored in the
 * right order. `matching` keeps its pairs in `accepted` (`{"pairs":[...]}`). `text` and `number` have no options: what counts as
 * right is in `accepted`, a JSON document the grader reads
 * (`{"answers":["paris"]}` or `{"value":9.81,"tolerance":0.01}`).
 */
export default defineModel({
  name: 'Question',
  table: 'questions',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    'Team',
    { model: 'Quiz', onDelete: 'cascade' },
  ],
  hasMany: ['QuestionOption'],

  attributes: {
    kind: {
      required: true,
      default: 'single',
      order: 1,
      fillable: true,
      validation: { rule: schema.enum(['single', 'multiple', 'true_false', 'text', 'number', 'ordering', 'matching', 'essay']) },
      factory: () => 'single',
    },

    prompt: {
      required: true,
      order: 2,
      fillable: true,
      type: 'text',
      validation: { rule: schema.string().min(1).max(4000) },
      factory: faker => faker.lorem.sentence(),
    },

    /** Shown with the result, when the Quiz reveals answers. */
    explanation: {
      order: 3,
      fillable: true,
      type: 'text',
      validation: { rule: schema.string().max(4000) },
    },

    points: {
      required: true,
      default: 1,
      order: 4,
      fillable: true,
      validation: { rule: schema.number().min(1).max(100) },
      factory: () => 1,
    },

    position: {
      required: true,
      default: 0,
      order: 5,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /** The answer key for `text` and `number` questions, as JSON. */
    accepted: {
      order: 6,
      fillable: true,
      type: 'text',
      validation: { rule: schema.string().max(4000) },
    },
  },
} as const)
