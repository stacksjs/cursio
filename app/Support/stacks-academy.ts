/**
 * The "Learn Stacks" academy: series built from the framework's own docs.
 *
 * This is what makes an Academy a screencast site for Stacks with something
 * real in it from the first day. Each doc page becomes one episode, as a
 * reading for now; when its screencast is recorded the episode gets a video
 * and keeps its notes. The plan (which page goes where) is plain data, the
 * conversion is a pure function, and only `seedStacksAcademy` writes.
 */

import type { AcademyRow } from './academies'
import { db } from '@stacksjs/database'
import { academyBySlug, AcademyError, createAcademy, updateAcademy } from './academies'
import { addLesson, addSection, coursesInAcademy, createCourse, publishCourse, updateCourse } from './courses'

export interface SeriesPlan {
  title: string
  summary: string
  level: 'beginner' | 'intermediate' | 'advanced'
  topic: string
  sections: { title: string, docs: string[] }[]
}

/** Doc paths are relative to the framework's `docs/` folder, without `.md`. */
export const stacksSeries: SeriesPlan[] = [
  {
    title: 'Stacks Bootcamp',
    summary: 'From an empty folder to a deployed app: set up, build a frontend and an API, test it and ship it.',
    level: 'beginner',
    topic: 'Getting started',
    sections: [
      { title: 'Before you build', docs: ['bootcamp/intro', 'bootcamp/local-setup', 'bootcamp/ide'] },
      { title: 'Build it', docs: ['bootcamp/frontend', 'bootcamp/api', 'bootcamp/dashboard'] },
      { title: 'Ship it', docs: ['bootcamp/testing', 'bootcamp/deploy'] },
    ],
  },
  {
    title: 'The Basics',
    summary: 'The pieces every Stacks app is made of, one at a time: routes, actions, models, views and what runs behind them.',
    level: 'beginner',
    topic: 'Fundamentals',
    sections: [
      { title: 'A request comes in', docs: ['basics/routing', 'basics/requests', 'basics/actions', 'basics/middleware'] },
      { title: 'Data and views', docs: ['basics/models', 'basics/views', 'basics/components', 'basics/functions'] },
      { title: 'Behind the scenes', docs: ['basics/jobs', 'basics/commands', 'basics/error-handling', 'basics/logging'] },
    ],
  },
  {
    title: 'Beyond the Web',
    summary: 'The same framework builds command-line tools, desktop apps, libraries and docs sites. Here is how.',
    level: 'intermediate',
    topic: 'Tooling',
    sections: [
      { title: 'Other things to build', docs: ['bootcamp/cli', 'bootcamp/desktop', 'bootcamp/docs'] },
      { title: 'Working in the open', docs: ['bootcamp/linting', 'bootcamp/semantic-commits', 'bootcamp/publish', 'bootcamp/cloud'] },
    ],
  },
]

export interface Episode {
  title: string
  body: string
  /** How long it takes to read, in seconds: the running time until there is a video. */
  seconds: number
}

/**
 * One doc page as an episode. The frontmatter gives the title; the page's own
 * top heading is dropped (the player prints the title), and docs-site
 * container markers (`::: tip`) are removed so their text reads as prose.
 */
export function episodeFrom(markdown: string, fallbackTitle: string): Episode {
  let text = markdown.replace(/\r\n/g, '\n')
  let title = fallbackTitle

  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (front) {
    const named = /^title:\s*["']?(.+?)["']?\s*$/m.exec(front[1] ?? '')
    if (named?.[1])
      title = named[1]
    text = text.slice(front[0].length)
  }

  const heading = /^\s*# (.+)\n/.exec(text)
  if (heading) {
    if (!front)
      title = heading[1]?.trim() || title
    text = text.slice(heading[0].length)
  }

  const body = text.split('\n').filter(line => !/^:::/.test(line.trim())).join('\n').trim()
  const words = body.split(/\s+/).filter(Boolean).length

  return { title: title.slice(0, 160), body, seconds: Math.max(60, Math.round(words / 200) * 60) }
}

export interface SeedReport {
  academy: AcademyRow
  created: string[]
  skipped: string[]
  missing: string[]
}

/**
 * Build the academy from the docs. Safe to run again: a series that is
 * already there (by title) is left exactly as it is, so edits made in the
 * studio, and videos added to episodes, are never overwritten.
 */
export async function seedStacksAcademy(input: { ownerId: number, slug?: string, readDoc: (path: string) => Promise<string | null>, series?: SeriesPlan[] }): Promise<SeedReport> {
  const slug = input.slug ?? 'stacks'
  let academy = await academyBySlug(slug)

  if (academy) {
    const staff = await db.selectFrom('team_members').select(['id']).where('team_id', '=', academy.team_id).where('user_id', '=', input.ownerId).executeTakeFirst()
    if (!staff)
      throw new AcademyError(`The academy "${slug}" belongs to someone else.`)
  }
  else {
    academy = await createAcademy({ ownerId: input.ownerId, name: 'Learn Stacks', slug })
    academy = await updateAcademy(academy, { vocabulary: 'series', tagline: 'The Stacks framework, one episode at a time.' })
  }

  const existing = new Set((await coursesInAcademy(academy)).map(course => course.title))
  const report: SeedReport = { academy, created: [], skipped: [], missing: [] }

  for (const plan of input.series ?? stacksSeries) {
    if (existing.has(plan.title)) {
      report.skipped.push(plan.title)
      continue
    }

    // Read everything first: a series is written whole or not at all.
    const sections: { title: string, episodes: Episode[] }[] = []
    for (const section of plan.sections) {
      const episodes: Episode[] = []
      for (const path of section.docs) {
        const markdown = await input.readDoc(path)
        if (markdown === null)
          report.missing.push(path)
        else
          episodes.push(episodeFrom(markdown, path.split('/').pop() ?? path))
      }
      if (episodes.length > 0)
        sections.push({ title: section.title, episodes })
    }
    if (sections.length === 0)
      continue

    let course = await createCourse(academy, { title: plan.title, summary: plan.summary })
    course = await updateCourse(course, { level: plan.level, topic: plan.topic })
    let first = true
    for (const section of sections) {
      const made = await addSection(course, { title: section.title })
      for (const episode of section.episodes) {
        // The opening episode of every series is free: it is the sample.
        await addLesson(course, { sectionId: made.id, title: episode.title, kind: 'reading', body: episode.body, durationSeconds: episode.seconds, isPreview: first })
        first = false
      }
    }
    await publishCourse(course)
    report.created.push(plan.title)
  }

  return report
}
