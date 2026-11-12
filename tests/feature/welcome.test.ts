import { describe, expect, test } from 'bun:test'
import { greetingName, siteAddress, welcomeMessage } from '../../app/Support/welcome'

/** The first email a new account gets. */

describe('the welcome email', () => {
  test('names the product, never the framework', () => {
    const message = welcomeMessage({ product: 'Cursio', name: 'Ada Lovelace', url: 'cursio.org' })
    expect(message.subject).toBe('Your Cursio account is ready')
    expect(message.text).toStartWith('Hello Ada,')
    expect(message.text).toContain('https://cursio.org/login')
    expect(message.text).not.toContain('Stacks')
  })

  test('has no em-dash or en-dash in it', () => {
    const message = welcomeMessage({ product: 'Cursio', name: 'Ada', url: 'https://cursio.org/' })
    expect(`${message.subject}${message.text}`).not.toMatch(/[–—]/)
  })

  test('greets without a name when there is none worth using', () => {
    expect(welcomeMessage({ product: 'Cursio' }).text).toStartWith('Hello,')
    expect(greetingName('  ')).toBe('')
    expect(greetingName('Renée-Claire de la Tour')).toBe('Renée-Claire')
    // A "name" that is really a link or markup is not echoed into an email.
    expect(greetingName('http://evil.test click')).toBe('')
    expect(greetingName('<b>Bob</b>')).toBe('')
    expect(greetingName('x'.repeat(60))).toBe('')
  })

  test('leaves the sign-in line out when the address is unknown', () => {
    expect(welcomeMessage({ product: 'Cursio', name: 'Ada' }).text).not.toContain('/login')
    expect(siteAddress('http://localhost:3270/')).toBe('http://localhost:3270')
    expect(siteAddress('')).toBe('')
  })
})
