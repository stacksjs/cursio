import { env } from '@stacksjs/env'
import { route } from '@stacksjs/router'
import { cleanSlug, cursioOrigin, forwarded, upstreamPath } from '../src/index'

/**
 * A Learner's calls, forwarded to Cursio. Mounted under `/api/cursio` in the
 * app that installs this package, so the browser only ever talks to the app's
 * own origin: no cross-origin requests, and the Learner's token never leaves
 * for a host the page did not come from.
 *
 * Only the routes in `forwarded` exist. The Academy in a path must be the one
 * the app is configured for (`CURSIO_ACADEMY`), so one app cannot be used to
 * read another Academy through it.
 */

const CSRF_COOKIE = 'X-CSRF-Token'
let csrf: { value: string, until: number } | null = null

/**
 * Cursio's sign-in and sign-up take the token a browser would have been
 * handed with the page. Ask for one the same way and keep it while it lasts.
 */
async function csrfToken(origin: string): Promise<string> {
  if (csrf && csrf.until > Date.now())
    return csrf.value
  const answer = await fetch(`${origin}/login`, { headers: { Accept: 'text/html' } })
  const cookies = answer.headers.getSetCookie?.() ?? []
  const found = cookies.map(cookie => cookie.split(';')[0] ?? '').find(cookie => cookie.startsWith(`${CSRF_COOKIE}=`))
  const value = found ? found.slice(CSRF_COOKIE.length + 1) : ''
  if (value)
    csrf = { value, until: Date.now() + 30 * 60 * 1000 }
  return value
}

function refuse(status: number, message: string): Response {
  return Response.json({ success: false, message }, { status })
}

async function forward(request: any, method: 'GET' | 'POST', upstream: string): Promise<Response> {
  const academy = cleanSlug(env.CURSIO_ACADEMY)
  let origin = ''
  try {
    origin = cursioOrigin(String(env.CURSIO_URL ?? ''))
  }
  catch {
    return refuse(503, 'This site is not connected to its academy yet.')
  }
  if (!academy)
    return refuse(503, 'This site is not connected to its academy yet.')

  const params: Record<string, unknown> = {}
  for (const name of ['academy', 'course', 'id'])
    params[name] = request.getParam?.(name) ?? request.params?.[name]
  const path = upstreamPath(upstream, params, academy)
  if (!path)
    return refuse(404, 'Not found')

  const headers: Record<string, string> = { Accept: 'application/json' }
  const authorization = request.headers?.get?.('authorization')
  if (authorization)
    headers.Authorization = authorization

  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json'
    try {
      body = JSON.stringify(typeof request.all === 'function' ? await request.all() : await request.json())
    }
    catch {
      body = '{}'
    }
    // Calls that carry the Learner's token are let through by Cursio on that
    // alone. Sign-in and sign-up have no token yet, so they carry the page token.
    if (!authorization) {
      const token = await csrfToken(origin)
      if (token) {
        headers['X-CSRF-Token'] = token
        headers.Cookie = `${CSRF_COOKIE}=${token}`
      }
    }
  }

  const search = new URL(request.url).search
  let answer: Response
  try {
    answer = await fetch(`${origin}${path}${search}`, { method, headers, body, redirect: 'manual' })
  }
  catch {
    return refuse(502, 'The academy could not be reached. Try again in a moment.')
  }
  // A page token that ran out early: forget it, so the next try asks again.
  if (answer.status === 403 && !authorization)
    csrf = null

  return new Response(await answer.text(), {
    status: answer.status,
    headers: { 'Content-Type': answer.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
  })
}

for (const [method, path, upstream] of forwarded) {
  if (method === 'GET')
    route.get(path, (request: any) => forward(request, 'GET', upstream))
  else
    route.post(path, (request: any) => forward(request, 'POST', upstream))
}
