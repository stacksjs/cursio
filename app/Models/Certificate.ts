import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A Certificate: proof that a Learner completed a Course.
 *
 * Issued once per Enrollment, when it completes. The names are copied onto the
 * row at that moment: a Certificate states what was true when it was earned,
 * so renaming the Course or the Academy later does not rewrite it. Anyone
 * holding the serial can verify it; nothing else about the Learner is shown.
 */
export default defineModel({
  name: 'Certificate',
  table: 'certificates',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSeeder: { count: 0 },
    observe: true,
  },

  belongsTo: [
    'Team',
    { model: 'User', onDelete: 'cascade' },
    { model: 'Course', onDelete: 'cascade' },
    { model: 'Enrollment', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'certificates_serial_unique', columns: ['serial'], unique: true },
    { name: 'certificates_enrollment_unique', columns: ['enrollment_id'], unique: true },
  ],

  attributes: {
    serial: {
      required: true,
      order: 1,
      validation: { rule: schema.string().min(8).max(40) },
      factory: () => crypto.randomUUID().slice(0, 16),
    },

    learnerName: {
      required: true,
      order: 2,
      validation: { rule: schema.string().min(1).max(200) },
      factory: faker => faker.person.fullName(),
    },

    courseTitle: {
      required: true,
      order: 3,
      validation: { rule: schema.string().min(1).max(200) },
      factory: faker => faker.lorem.words(3),
    },

    academyName: {
      required: true,
      order: 4,
      validation: { rule: schema.string().min(1).max(200) },
      factory: faker => faker.company.name(),
    },

    issuedAt: {
      required: true,
      order: 5,
      validation: { rule: schema.date() },
    },

    /** Set when the Academy withdraws it. A revoked serial verifies as revoked. */
    revokedAt: {
      order: 6,
      validation: { rule: schema.date() },
    },
  },
} as const)
