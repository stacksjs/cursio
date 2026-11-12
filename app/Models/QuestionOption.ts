import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * One answer a Learner can pick in a choice question. `isCorrect` never leaves
 * the server before an Attempt is submitted.
 */
export default defineModel({
  name: 'QuestionOption',
  table: 'question_options',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    'Team',
    { model: 'Question', onDelete: 'cascade' },
  ],

  attributes: {
    label: {
      required: true,
      order: 1,
      fillable: true,
      validation: { rule: schema.string().min(1).max(500) },
      factory: faker => faker.lorem.words(2),
    },

    isCorrect: {
      required: true,
      default: false,
      order: 2,
      fillable: true,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    position: {
      required: true,
      default: 0,
      order: 3,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },
} as const)
