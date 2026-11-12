import { describe, expect, test } from 'bun:test'
import { cleanSlug, createCursio, CursioError, cursioOrigin, forwarded, learnBase, runtime, upstreamPath, wordsOf } from '@cursio/academy'

/** The package another Stacks app installs to run an Academy on its own pages. */

describe('what the components share', () => {
  test('the words follow the academy, and default to courses', () => {
    expect(wordsOf({ vocabulary: 'series' }).lesson).toBe('episode')
    expect(wordsOf(null).lessons).toBe('lessons')
  })

  test('running time reads as a clock a person would say', () => {
    expect([runtime(0), runtime(29), runtime(720), runtime(5040)]).toEqual(['', '', '12m', '1h 24m'])
  })

  test('the learner API base is a path on this origin, or the default', () => {
    expect(learnBase('/api/cursio/learn/')).toBe('/api/cursio/learn')
    expect(learnBase(undefined)).toBe('/api/learn')
    for (const bad of ['https://evil.test/api', '//evil.test', 'javascript:alert(1)', '/api/"onload'])
      expect(learnBase(bad)).toBe('/api/learn')
  })
})

describe('reading an academy from the server', () => {
  const calls: string[] = []
  const answers: Record<string, { status: number, body: unknown }> = {
    'https://cursio.test/api/learn/stacks/courses': { status: 200, body: { academy: { name: 'Learn Stacks', slug: 'stacks' }, courses: [{ title: 'Bootcamp', slug: 'bootcamp' }] } },
    'https://cursio.test/api/learn/stacks/courses/bootcamp': { status: 200, body: { academy: { name: 'Learn Stacks', slug: 'stacks' }, course: { id: 1, title: 'Bootcamp', slug: 'bootcamp' }, outline: { sections: [], lessonIds: [] } } },
    'https://cursio.test/api/learn/stacks/courses/gone': { status: 404, body: {} },
    'https://cursio.test/api/learn/stacks/courses/broken': { status: 500, body: {} },
  }
  const fake = (async (url: string) => {
    calls.push(url)
    const answer = answers[url] ?? { status: 404, body: {} }
    return Response.json(answer.body, { status: answer.status })
  }) as unknown as typeof fetch
  const cursio = createCursio({ url: 'https://cursio.test/some/path', academy: 'stacks', fetch: fake })

  test('the catalog and a course come from the academy it was made for', async () => {
    expect((await cursio.catalog()).courses[0]?.slug).toBe('bootcamp')
    expect((await cursio.course('bootcamp'))?.course.title).toBe('Bootcamp')
    expect(calls.every(url => url.startsWith('https://cursio.test/api/learn/stacks/'))).toBe(true)
  })

  test('a course that is not there is null, and a failure is an error', async () => {
    expect(await cursio.course('gone')).toBeNull()
    await expect(cursio.course('broken')).rejects.toThrow(CursioError)
  })

  test('a slug that could leave the path is never fetched', async () => {
    const before = calls.length
    expect(await cursio.course('../../studio')).toBeNull()
    expect(await cursio.course('a/b')).toBeNull()
    expect(calls.length).toBe(before)
  })

  test('a bad address or academy is refused when the client is made', () => {
    expect(() => createCursio({ url: 'not a url', academy: 'stacks' })).toThrow(CursioError)
    expect(() => createCursio({ url: 'file:///etc/passwd', academy: 'stacks' })).toThrow(CursioError)
    expect(() => createCursio({ url: 'https://cursio.test', academy: '../x' })).toThrow(CursioError)
    expect(cursioOrigin('https://cursio.org/anything?x=1')).toBe('https://cursio.org')
  })
})

describe('what the app forwards to Cursio', () => {
  test('a path is filled from checked segments', () => {
    expect(upstreamPath('/api/learn/{academy}/courses/{course}', { academy: 'stacks', course: 'bootcamp' }, 'stacks')).toBe('/api/learn/stacks/courses/bootcamp')
    expect(upstreamPath('/api/learn/lessons/{id}/quiz', { id: '42' }, 'stacks')).toBe('/api/learn/lessons/42/quiz')
    expect(upstreamPath('/login', {}, 'stacks')).toBe('/login')
  })

  test('another academy, a path that climbs, or an id that is not a number is refused', () => {
    expect(upstreamPath('/api/learn/{academy}/courses', { academy: 'rival' }, 'stacks')).toBeNull()
    expect(upstreamPath('/api/learn/{academy}/courses/{course}', { academy: 'stacks', course: '../../studio' }, 'stacks')).toBeNull()
    expect(upstreamPath('/api/learn/lessons/{id}', { id: '1/../../studio' }, 'stacks')).toBeNull()
    expect(upstreamPath('/api/learn/lessons/{id}', {}, 'stacks')).toBeNull()
    expect(cleanSlug('Stacks')).toBe('stacks')
    expect(cleanSlug('a b')).toBe('')
  })

  test('only the learner API and sign-in are forwarded: nothing of the studio', () => {
    expect(forwarded.every(([, , upstream]) => upstream.startsWith('/api/learn/') || ['/login', '/register', '/me', '/logout'].includes(upstream))).toBe(true)
    expect(forwarded.some(([, , upstream]) => upstream.includes('studio'))).toBe(false)
  })
})
