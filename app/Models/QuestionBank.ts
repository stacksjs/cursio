import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A question bank: questions an Academy keeps apart from any one Quiz, so
 * several Quizzes can draw from them. A Quiz that draws from a bank asks each
 * Attempt a fresh handful, which is what makes a retake a different paper.
 */
export default defineModel({
  name: 'QuestionBank',
  table: 'question_banks',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
  },

  belongsTo: [
    'Team',
    { model: 'Academy', onDelete: 'cascade' },
  ],
  hasMany: ['Question'],

  attributes: {
    title: {
      required: true,
      order: 1,
      fillable: true,
      validation: { rule: schema.string().min(2).max(120) },
      factory: faker => faker.lorem.words(2),
    },
  },
} as const)
