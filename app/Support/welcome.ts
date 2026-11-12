/**
 * The first email a new account gets. Plain data in, plain text out, so what
 * it says can be read and tested without sending anything.
 */

export interface WelcomeMessage {
  subject: string
  text: string
}

/** A first name to greet, or nothing: never a whole pasted paragraph. */
export function greetingName(name: string | null | undefined): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? ''
  return /^[\p{L}\p{M}'-]{1,40}$/u.test(first) ? first : ''
}

/** An absolute address for the app, whatever shape APP_URL was given in. */
export function siteAddress(url: string | null | undefined): string {
  const raw = String(url ?? '').trim().replace(/\/+$/, '')
  if (!raw)
    return ''
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`
}

export function welcomeMessage(input: { product: string, name?: string | null, url?: string | null }): WelcomeMessage {
  const name = greetingName(input.name)
  const address = siteAddress(input.url)
  const lines = [
    name ? `Hello ${name},` : 'Hello,',
    '',
    `Your ${input.product} account is ready. The same account works at every academy that runs on ${input.product}, so you sign up once.`,
    '',
    'What you can do with it:',
    '- Enroll in a course and pick up where you stopped, on any device.',
    '- Take quizzes and hand in assignments, and see your results.',
    '- Get a certificate with its own link when you finish a course.',
  ]
  if (address)
    lines.push('', `Sign in any time at ${address}/login`)
  lines.push('', 'If you did not create this account, you can ignore this email.', '', `The ${input.product} team`)
  return { subject: `Your ${input.product} account is ready`, text: lines.join('\n') }
}
