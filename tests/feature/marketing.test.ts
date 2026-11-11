import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { demoCompleted, demoCourse, demoQuestion } from '../../resources/data/demo-course'
import { featureBySlug, features, homeFeatureSlugs, horizons, statusLabel } from '../../resources/data/features'
import { navLinks, signupCta, site } from '../../resources/data/site'

const root = new URL('../../', import.meta.url).pathname

/** Every string the marketing site prints from a data module. */
const dataCopy = [
  site.title,
  site.description,
  signupCta.label,
  ...navLinks.map(link => link.label),
  ...features.flatMap(feature => [feature.title, feature.summary]),
  ...Object.values(statusLabel),
  ...horizons.map(horizon => horizon.label),
  demoCourse.title,
  demoCourse.instructor,
  ...demoCourse.sections.flatMap(section => [section.title, ...section.lessons.map(lesson => lesson.title)]),
  demoQuestion.prompt,
  demoQuestion.explanation,
  ...demoQuestion.options.map(option => option.label),
]

describe('marketing data', () => {
  test('every feature has a unique slug, an icon and a status the site can print', () => {
    const slugs = features.map(feature => feature.slug)
    expect(new Set(slugs).size).toBe(slugs.length)

    for (const feature of features) {
      expect(feature.icon.startsWith('i-hugeicons-')).toBe(true)
      expect(statusLabel[feature.status]).toBeTruthy()
      expect(horizons.some(horizon => horizon.key === feature.horizon)).toBe(true)
    }
  })

  test('the home page shows six features that all exist', () => {
    expect(homeFeatureSlugs).toHaveLength(6)
    for (const slug of homeFeatureSlugs)
      expect(featureBySlug(slug).statusText).toBeTruthy()
  })

  test('an unknown feature fails loudly instead of rendering an empty cell', () => {
    expect(() => featureBySlug('no-such-feature')).toThrow()
  })

  test('nothing is marked live before it ships', () => {
    // Flip a feature to `live` in the same change that ships it, and list it
    // here so the claim on the site is one a test had to agree with.
    const shipped: string[] = []
    const live = features.filter(feature => feature.status === 'live').map(feature => feature.slug)
    expect(live.sort()).toEqual(shipped.sort())
  })

  test('feature summaries stay short enough to scan', () => {
    for (const feature of features)
      expect(feature.summary.split(/\s+/).length).toBeLessThanOrEqual(25)
  })

  test('the demo course is consistent', () => {
    const lessonIds = demoCourse.sections.flatMap(section => section.lessons.map(lesson => lesson.id))
    expect(new Set(lessonIds).size).toBe(lessonIds.length)
    for (const id of demoCompleted)
      expect(lessonIds).toContain(id)
    expect(demoQuestion.options.some(option => option.id === demoQuestion.correct)).toBe(true)
  })
})

describe('marketing copy', () => {
  // An em-dash or a separator en-dash is banned in anything a visitor reads.
  const dash = /[—–]/

  test('no em-dashes in copy that comes from data', () => {
    for (const text of dataCopy)
      expect(dash.test(text)).toBe(false)
  })

  test('no em-dashes in any template', async () => {
    const offenders: string[] = []
    for await (const file of new Glob('resources/**/*.stx').scan({ cwd: root })) {
      const source = await Bun.file(`${root}${file}`).text()
      // Server and client scripts are code, not copy: only the markup is read.
      const markup = source.replace(/<script[\s\S]*?<\/script>/g, '')
      if (dash.test(markup))
        offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('one label per call to action', () => {
    // "Get early access" is the only signup label; the nav, hero and form all
    // read it from one place, so a second wording cannot creep in.
    expect(signupCta.label).toBe('Get early access')
  })
})
