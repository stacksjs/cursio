/**
 * Academies and who may run them.
 *
 * An Academy is one Team. Being staff of an Academy means being an active
 * member of that Team, and every staff action resolves the Academy through
 * this file from the signed-in user, never from an id the client sent alone.
 */

import { db } from '@stacksjs/database'
import { slugFrom } from './progress'

export interface AcademyRow {
  id: number
  team_id: number
  name: string
  slug: string
  tagline: string | null
  vocabulary: 'course' | 'series'
  status: string
}

const columns = ['id', 'team_id', 'name', 'slug', 'tagline', 'vocabulary', 'status'] as const

/** Subdomains an Academy may not take: they are, or will be, Cursio's own. */
export const reservedSlugs = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'docs', 'blog', 'status', 'help', 'support',
  'academy', 'cursio', 'studio', 'learn', 'login', 'register', 'assets', 'static', 'cdn',
])

export class AcademyError extends Error {}

export function validAcademySlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(slug) && !reservedSlugs.has(slug)
}

/**
 * Open an Academy for a user: a Team, the user as its owner, and the Academy.
 * All three or none.
 */
export async function createAcademy(input: { ownerId: number, name: string, slug?: string }): Promise<AcademyRow> {
  const name = input.name.trim()
  const slug = (input.slug?.trim() || slugFrom(name)).toLowerCase()

  if (name.length < 2)
    throw new AcademyError('An academy needs a name.')
  if (!validAcademySlug(slug))
    throw new AcademyError('That address is not available.')

  const taken = await db.selectFrom('academies').select(['id']).where('slug', '=', slug).executeTakeFirst()
  const siteTaken = await db.selectFrom('sites').select(['id']).where('subdomain', '=', slug).executeTakeFirst()
  if (taken || siteTaken)
    throw new AcademyError('That address is already taken.')

  return await db.transaction(async (tx: any) => {
    // Team names are unique across the app, so the slug (also unique) rides in it.
    const team = await tx.insertInto('teams').values({ name: `${name} (${slug})`, status: 'active', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }
    await tx.insertInto('team_members').values({ team_id: team.id, user_id: input.ownerId, role: 'owner', status: 'active', uuid: crypto.randomUUID() }).execute()
    // The Site is what the host resolver finds: `{slug}.cursio.org` becomes
    // this Academy. Its subdomain and the Academy's slug are the same value.
    await tx.insertInto('sites').values({ team_id: team.id, name, subdomain: slug, status: 'active', uuid: crypto.randomUUID() }).execute()
    const academy = await tx.insertInto('academies').values({ team_id: team.id, name, slug, status: 'active', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }

    return { id: academy.id, team_id: team.id, name, slug, tagline: null, vocabulary: 'course', status: 'active' }
  })
}

/** The Academies a user is staff of. */
export async function academiesForStaff(userId: number): Promise<AcademyRow[]> {
  const memberships = await db.selectFrom('team_members').select(['team_id']).where('user_id', '=', userId).where('status', '=', 'active').execute() as { team_id: number }[]
  if (memberships.length === 0)
    return []

  return await db.selectFrom('academies').select([...columns]).where('team_id', 'in', memberships.map(row => row.team_id)).orderBy('id', 'asc').execute() as AcademyRow[]
}

/**
 * The Academy a staff action is about. With no id, the user's first Academy.
 * Null when the user is not staff of it, which callers treat as "not found":
 * whether an Academy exists is not something a stranger gets to learn.
 */
export async function academyForStaff(userId: number, academyId?: number | null): Promise<AcademyRow | null> {
  const mine = await academiesForStaff(userId)
  if (!academyId)
    return mine[0] ?? null

  return mine.find(academy => academy.id === academyId) ?? null
}

export async function academyBySlug(slug: string): Promise<AcademyRow | null> {
  const row = await db.selectFrom('academies').select([...columns]).where('slug', '=', slug).where('status', '=', 'active').executeTakeFirst() as AcademyRow | undefined
  return row ?? null
}

/**
 * The Academy a tenant host stands for. The resolver has already turned the
 * host into a Site; the Site's subdomain is the Academy's slug.
 */
export async function academyForSite(site: { subdomain?: string } | null | undefined): Promise<AcademyRow | null> {
  return site?.subdomain ? await academyBySlug(site.subdomain) : null
}

/**
 * True when a host is spelled like an Academy's own (`harbor.cursio.org`) and
 * is not one of Cursio's. With no Academy behind it, such a host is a 404 and
 * never Cursio's home page under somebody else's name.
 */
export function isAcademyHost(host: string, baseDomain: string, platformHosts: string[]): boolean {
  const name = host.trim().toLowerCase().replace(/:\d+$/, '')
  const base = baseDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[:/].*$/, '')
  if (!name || !base || platformHosts.map(h => h.toLowerCase()).includes(name))
    return false
  return name.endsWith(`.${base}`)
}

// The words an Academy's Learners read live with the components that print
// them, in the package other apps install too.
export { type Words, wordsOf } from '@cursio/academy'

export async function updateAcademy(academy: AcademyRow, input: { name?: string, tagline?: string, vocabulary?: string }): Promise<AcademyRow> {
  const next = { ...academy }
  if (input.name !== undefined) {
    if (input.name.trim().length < 2)
      throw new AcademyError('An academy needs a name.')
    next.name = input.name.trim()
  }
  if (input.tagline !== undefined)
    next.tagline = input.tagline.trim().slice(0, 160) || null
  if (input.vocabulary !== undefined) {
    if (input.vocabulary !== 'course' && input.vocabulary !== 'series')
      throw new AcademyError('An academy speaks of courses or of series.')
    next.vocabulary = input.vocabulary
  }

  await db.updateTable('academies').set({ name: next.name, tagline: next.tagline, vocabulary: next.vocabulary, updated_at: new Date().toISOString() }).where('id', '=', academy.id).execute()
  return next
}
