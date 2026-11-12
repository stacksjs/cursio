/**
 * @cursio/academy
 *
 * What an app needs to run a Cursio academy on its own pages: the shapes the
 * learner API answers with, a small client for reading them on the server,
 * and the few pure helpers the components share. The components themselves
 * are in `components/`, and `routes/cursio.ts` forwards the browser's calls
 * to Cursio so they stay on the app's own origin.
 */

export interface Academy {
  name: string
  slug: string
  tagline?: string | null
  /** What Learners read: `course` and lessons, or `series` and episodes. */
  vocabulary?: string
}

export interface CatalogEntry {
  title: string
  slug: string
  summary: string | null
  level: 'beginner' | 'intermediate' | 'advanced' | null
  topic: string | null
  lessons: number
  /** Total running time of its Lessons, in seconds. */
  seconds: number
  /** It has at least one Lesson anyone may open. */
  hasPreview: boolean
  /** Average review, one decimal. Null when nobody has reviewed it. */
  rating?: number | null
  reviews?: number
}

export interface Course {
  id: number
  title: string
  slug: string
  summary: string | null
  level?: CatalogEntry['level']
  topic?: string | null
}

export interface OutlineLesson {
  id: number
  title: string
  kind: string
  position: number
  duration_seconds: number
  is_preview: boolean | number
}

export interface Outline {
  sections: { id: number, title: string, position: number, lessons: OutlineLesson[] }[]
  /** Every Lesson id in teaching order. */
  lessonIds: number[]
}

export interface Words {
  course: string
  courses: string
  lesson: string
  lessons: string
}

/**
 * The words an Academy's Learners read. The domain keeps one language (Course,
 * Lesson); this only changes the labels, so a screencast site can say series
 * and episodes without anything underneath being different.
 */
export function wordsOf(academy: { vocabulary?: string } | null | undefined): Words {
  return academy?.vocabulary === 'series'
    ? { course: 'series', courses: 'series', lesson: 'episode', lessons: 'episodes' }
    : { course: 'course', courses: 'courses', lesson: 'lesson', lessons: 'lessons' }
}

/** `1h 24m`, `12m`, or nothing for a series with no running time yet. */
export function runtime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1)
    return ''
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

/** Where the learner API answers in this app, without a trailing slash. */
export function learnBase(api: string | null | undefined): string {
  const base = (api || '/api/learn').trim().replace(/\/+$/, '')
  // A component interpolates this into a path the browser fetches: it is a
  // path on this origin or it is the default, never somewhere else.
  return /^\/[\w\-/]*$/.test(base) ? base : '/api/learn'
}

export class CursioError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export interface CursioOptions {
  /** Where Cursio runs, for example `https://cursio.org`. */
  url: string
  /** The Academy's slug. */
  academy: string
  /** Swap the transport, for tests. */
  fetch?: typeof fetch
}

export interface CursioClient {
  /** The Academy and what it has published. */
  catalog: () => Promise<{ academy: Academy, courses: CatalogEntry[] }>
  /** One published Course with its outline, or null when there is none by that slug. */
  course: (slug: string) => Promise<{ academy: Academy, course: Course, outline: Outline } | null>
}

/** The origin of a Cursio URL, or a refusal: nothing is fetched from a typo. */
export function cursioOrigin(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    throw new CursioError('CURSIO_URL is not a URL.', 500)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    throw new CursioError('CURSIO_URL must be http or https.', 500)
  return parsed.origin
}

/** A slug as Cursio writes them, or empty: it goes into a path. */
export function cleanSlug(value: unknown): string {
  const slug = String(value ?? '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) ? slug : ''
}

/**
 * Read an Academy from the server side of your app. Only what is public is
 * here; what a Learner does (enroll, watch, answer) goes from their browser
 * through the forwarding routes, with their own sign-in.
 */
export function createCursio(options: CursioOptions): CursioClient {
  const origin = cursioOrigin(options.url)
  const academy = cleanSlug(options.academy)
  const send = options.fetch ?? fetch
  if (!academy)
    throw new CursioError('CURSIO_ACADEMY is not an academy slug.', 500)

  async function read<T>(path: string): Promise<T | null> {
    const answer = await send(`${origin}/api/learn/${academy}${path}`, { headers: { Accept: 'application/json' } })
    if (answer.status === 404)
      return null
    if (!answer.ok)
      throw new CursioError(`Cursio answered ${answer.status}.`, answer.status)
    return await answer.json() as T
  }

  return {
    async catalog() {
      const data = await read<{ academy: Academy, courses: CatalogEntry[] }>('/courses')
      if (!data)
        throw new CursioError(`There is no academy called "${academy}".`, 404)
      return data
    },
    async course(slug) {
      const clean = cleanSlug(slug)
      return clean ? await read<{ academy: Academy, course: Course, outline: Outline }>(`/courses/${clean}`) : null
    },
  }
}

/**
 * What the forwarding routes let through, as `METHOD path` with `{}` for one
 * path segment. Anything else is refused: the app forwards a Learner's calls,
 * not the whole of Cursio.
 */
export const forwarded: readonly (readonly [method: 'GET' | 'POST', path: string, upstream: string])[] = [
  ['POST', '/login', '/login'],
  ['POST', '/register', '/register'],
  ['GET', '/me', '/me'],
  ['POST', '/logout', '/logout'],
  ['GET', '/learn/{academy}/courses', '/api/learn/{academy}/courses'],
  ['GET', '/learn/{academy}/courses/{course}', '/api/learn/{academy}/courses/{course}'],
  ['GET', '/learn/{academy}/courses/{course}/progress', '/api/learn/{academy}/courses/{course}/progress'],
  ['POST', '/learn/{academy}/courses/{course}/enroll', '/api/learn/{academy}/courses/{course}/enroll'],
  ['GET', '/learn/{academy}/library', '/api/learn/{academy}/library'],
  ['GET', '/learn/{academy}/search', '/api/learn/{academy}/search'],
  ['GET', '/learn/lessons/{id}/preview', '/api/learn/lessons/{id}/preview'],
  ['POST', '/learn/lessons/{id}/position', '/api/learn/lessons/{id}/position'],
  ['GET', '/learn/lessons/{id}', '/api/learn/lessons/{id}'],
  ['POST', '/learn/lessons/{id}/complete', '/api/learn/lessons/{id}/complete'],
  ['GET', '/learn/lessons/{id}/quiz', '/api/learn/lessons/{id}/quiz'],
  ['POST', '/learn/lessons/{id}/quiz/attempts', '/api/learn/lessons/{id}/quiz/attempts'],
  ['POST', '/learn/attempts/{id}/submit', '/api/learn/attempts/{id}/submit'],
  ['GET', '/learn/{academy}/courses/{course}/reviews', '/api/learn/{academy}/courses/{course}/reviews'],
  ['GET', '/learn/{academy}/courses/{course}/review', '/api/learn/{academy}/courses/{course}/review'],
  ['POST', '/learn/{academy}/courses/{course}/review', '/api/learn/{academy}/courses/{course}/review'],
  ['POST', '/learn/{academy}/courses/{course}/review/withdraw', '/api/learn/{academy}/courses/{course}/review/withdraw'],
  ['GET', '/learn/lessons/{id}/notes', '/api/learn/lessons/{id}/notes'],
  ['POST', '/learn/lessons/{id}/notes', '/api/learn/lessons/{id}/notes'],
  ['POST', '/learn/notes/{id}/remove', '/api/learn/notes/{id}/remove'],
  ['GET', '/learn/lessons/{id}/comments', '/api/learn/lessons/{id}/comments'],
  ['POST', '/learn/lessons/{id}/comments', '/api/learn/lessons/{id}/comments'],
  ['POST', '/learn/comments/{id}/remove', '/api/learn/comments/{id}/remove'],
  ['GET', '/learn/lessons/{id}/assignment', '/api/learn/lessons/{id}/assignment'],
  ['POST', '/learn/lessons/{id}/assignment/submit', '/api/learn/lessons/{id}/assignment/submit'],
]

/**
 * The Cursio path a forwarded request goes to, or null when it may not go.
 * Segments are filled from the request's own parameters after each is checked:
 * an id is digits, a slug is a slug, and the Academy is the one this app is for.
 */
export function upstreamPath(upstream: string, params: Record<string, unknown>, academy: string): string | null {
  let refused = false
  const path = upstream.replace(/\{(\w+)\}/g, (_, name: string) => {
    const raw = String(params[name] ?? '')
    if (name === 'id') {
      if (!/^\d{1,12}$/.test(raw))
        refused = true
      return raw
    }
    const slug = cleanSlug(raw)
    if (!slug || (name === 'academy' && slug !== academy))
      refused = true
    return slug
  })
  return refused ? null : path
}
