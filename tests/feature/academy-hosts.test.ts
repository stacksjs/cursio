import { describe, expect, it } from 'bun:test'
import { isAcademyHost } from '../../app/Support/academies'

const platform = ['localhost', 'cursio.org', 'www.cursio.org']

describe('an Academy host', () => {
  it('is a subdomain of the base domain', () => {
    expect(isAcademyHost('harbor.cursio.org', 'cursio.org', platform)).toBe(true)
    expect(isAcademyHost('Harbor.Cursio.org:443', 'https://cursio.org', platform)).toBe(true)
  })

  it('is never one of Cursio\'s own hosts', () => {
    expect(isAcademyHost('cursio.org', 'cursio.org', platform)).toBe(false)
    expect(isAcademyHost('www.cursio.org', 'cursio.org', platform)).toBe(false)
    expect(isAcademyHost('localhost:3270', 'cursio.org', platform)).toBe(false)
  })

  it('is not a host on another domain', () => {
    expect(isAcademyHost('127.0.0.1:3280', 'cursio.org', platform)).toBe(false)
    expect(isAcademyHost('notcursio.org', 'cursio.org', platform)).toBe(false)
    expect(isAcademyHost('', 'cursio.org', platform)).toBe(false)
  })
})
