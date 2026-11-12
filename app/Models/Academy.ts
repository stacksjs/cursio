import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * An Academy: one customer's school on Cursio. The tenant boundary.
 *
 * It belongs to a Team, and that is what scopes it: the Team is the Academy's
 * staff (Owner, Admins, Instructors), so a signed-in member reaches their own
 * Academy's rows and nobody else's without any per-route check. Every model an
 * Academy owns carries the same `team_id` for the same reason.
 */
export default defineModel({
  name: 'Academy',
  table: 'academies',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSeeder: { count: 0 },
    useApi: {
      uri: 'academies',
      routes: ['index', 'show', 'update'],
      middleware: ['auth'],
    },
    observe: true,
  },

  belongsTo: ['Team'],
  hasMany: ['Course'],

  attributes: {
    name: {
      required: true,
      order: 1,
      fillable: true,
      validation: { rule: schema.string().min(2).max(120) },
      factory: faker => `${faker.company.name()} Academy`,
    },

    /** The Academy's address: `{slug}.cursio.org`. */
    slug: {
      required: true,
      unique: true,
      order: 2,
      fillable: true,
      validation: { rule: schema.string().min(2).max(63).matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/) },
      factory: faker => faker.helpers.slugify(faker.company.name()).toLowerCase(),
    },

    tagline: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string().max(160) },
      factory: () => '',
    },

    /**
     * What this Academy calls its Courses and Lessons where Learners read
     * them: courses and lessons, or series and episodes for a screencast site.
     */
    vocabulary: {
      required: true,
      default: 'course',
      order: 5,
      fillable: true,
      validation: { rule: schema.enum(['course', 'series']) },
      factory: () => 'course',
    },

    status: {
      required: true,
      default: 'active',
      order: 4,
      fillable: true,
      validation: { rule: schema.enum(['active', 'suspended']) },
      factory: () => 'active',
    },
  },
} as const)
