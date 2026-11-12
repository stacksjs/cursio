import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { AcademyError } from '../../app/Support/academies'
import { catalogOf, outlineOf, publishedCourse } from '../../app/Support/courses'
import { previewLesson } from '../../app/Support/enrollment'
import { episodeFrom, seedStacksAcademy, stacksSeries } from '../../app/Support/stacks-academy'

describe('a doc page as an episode', () => {
  test('takes its title from the frontmatter and drops the page heading', () => {
    const episode = episodeFrom('---\ntitle: Build a CLI\ndescription: "x"\n---\n# Build a CLI\n\nIntro text.\n\n## Overview\n\nMore.\n', 'cli')
    expect(episode.title).toBe('Build a CLI')
    expect(episode.body.startsWith('Intro text.')).toBe(true)
    expect(episode.body).toContain('## Overview')
    expect(episode.body).not.toContain('title:')
  })

  test('falls back to the heading, then to the file name', () => {
    expect(episodeFrom('# Routing\n\nText', 'routing').title).toBe('Routing')
    expect(episodeFrom('Just text', 'routing').title).toBe('routing')
  })

  test('container markers go, their text stays', () => {
    const episode = episodeFrom('Before\n\n::: tip Note\nKeep this.\n:::\n\nAfter', 'x')
    expect(episode.body).not.toContain(':::')
    expect(episode.body).toContain('Keep this.')
  })

  test('running time is reading time, never under a minute', () => {
    expect(episodeFrom('short', 'x').seconds).toBe(60)
    expect(episodeFrom(Array.from({ length: 1000 }, () => 'word').join(' '), 'x').seconds).toBe(300)
  })

  test('the plan names each doc once', () => {
    const docs = stacksSeries.flatMap(series => series.sections.flatMap(section => section.docs))
    expect(new Set(docs).size).toBe(docs.length)
    expect(new Set(stacksSeries.map(series => series.title)).size).toBe(stacksSeries.length)
  })
})

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const slug = `stacks-${stamp}`
let ownerId: number
let otherId: number

const docs: Record<string, string> = {
  'a/one': '---\ntitle: First steps\n---\n# First steps\n\nHello.\n\n```ts\nconst a = 1\n```\n',
  'a/two': '# Second\n\nMore.',
  'b/one': '# Elsewhere\n\nText.',
}
const plan = [
  { title: 'Series A', summary: 'About A.', level: 'beginner' as const, topic: 'Alpha', sections: [{ title: 'Start', docs: ['a/one', 'a/two', 'a/gone'] }] },
  { title: 'Series B', summary: 'About B.', level: 'advanced' as const, topic: 'Beta', sections: [{ title: 'Only', docs: ['b/one'] }, { title: 'Empty', docs: ['b/gone'] }] },
  { title: 'Series C', summary: 'Nothing to read.', level: 'beginner' as const, topic: 'Gamma', sections: [{ title: 'None', docs: ['c/gone'] }] },
]
const readDoc = async (path: string): Promise<string | null> => docs[path] ?? null

beforeAll(async () => {
  const make = async (label: string): Promise<number> => (await db.insertInto('users').values({ name: `Seed ${label}`, email: `seed-${label}-${stamp}@cursio.test`, password: 'not-a-real-hash', uuid: crypto.randomUUID() }).returning(['id']).executeTakeFirst() as { id: number }).id
  ownerId = await make('owner')
  otherId = await make('other')
})

afterAll(async () => {
  const academy = await db.selectFrom('academies').select(['id', 'team_id']).where('slug', '=', slug).executeTakeFirst() as { id: number, team_id: number } | undefined
  if (academy) {
    const courses = await db.selectFrom('courses').select(['id']).where('academy_id', '=', academy.id).execute() as { id: number }[]
    if (courses.length > 0) {
      await db.deleteFrom('lessons').where('course_id', 'in', courses.map(row => row.id)).execute()
      await db.deleteFrom('course_sections').where('course_id', 'in', courses.map(row => row.id)).execute()
      await db.deleteFrom('courses').where('academy_id', '=', academy.id).execute()
    }
    await db.deleteFrom('academies').where('id', '=', academy.id).execute()
    await db.deleteFrom('sites').where('team_id', '=', academy.team_id).execute()
    await db.deleteFrom('team_members').where('team_id', '=', academy.team_id).execute()
    await db.deleteFrom('teams').where('id', '=', academy.team_id).execute()
  }
  await db.deleteFrom('users').where('id', 'in', [ownerId, otherId]).execute()
})

describe('building the academy', () => {
  test('creates published series with a free opening episode', async () => {
    const report = await seedStacksAcademy({ ownerId, slug, readDoc, series: plan })

    expect(report.created).toEqual(['Series A', 'Series B'])
    expect(report.missing.sort()).toEqual(['a/gone', 'b/gone', 'c/gone'])
    expect(report.academy.vocabulary).toBe('series')

    const catalog = await catalogOf(report.academy.id)
    expect(catalog.map(entry => entry.title).sort()).toEqual(['Series A', 'Series B'])
    expect(catalog.find(entry => entry.title === 'Series A')).toMatchObject({ level: 'beginner', topic: 'Alpha', lessons: 2, hasPreview: true })

    const course = await publishedCourse(report.academy.id, 'series-a')
    const outline = await outlineOf(course!.id)
    const lessons = outline.sections.flatMap(section => section.lessons)
    expect(lessons.map(lesson => lesson.title)).toEqual(['First steps', 'Second'])
    expect(lessons.map(lesson => lesson.is_preview)).toEqual([true, false])
    // A section whose docs were all missing was not created.
    expect((await outlineOf((await publishedCourse(report.academy.id, 'series-b'))!.id)).sections.map(section => section.title)).toEqual(['Only'])

    // The free episode is readable by anyone, with its code highlighted.
    expect((await previewLesson(lessons[0]!.id))?.body_html).toContain('class="token')
  })

  test('running it again changes nothing', async () => {
    const report = await seedStacksAcademy({ ownerId, slug, readDoc, series: plan })
    expect(report.created).toEqual([])
    expect(report.skipped).toEqual(['Series A', 'Series B'])
    expect(await catalogOf(report.academy.id)).toHaveLength(2)
  })

  test('someone else cannot seed into it', async () => {
    await expect(seedStacksAcademy({ ownerId: otherId, slug, readDoc, series: plan })).rejects.toThrow(AcademyError)
  })
})
