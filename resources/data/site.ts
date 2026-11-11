/**
 * What the marketing site says about itself, in one place: the layout, the
 * head partial, the nav and the footer all read from here.
 */
export const site = {
  name: 'Cursio',
  url: 'https://cursio.org',
  title: 'Cursio - run your online school in one place',
  description: 'Cursio hosts your courses, video, checkout, cohorts and community in one place, on your own domain.',
}

export interface NavLink {
  label: string
  href: string
}

/** One line on desktop; the same list feeds the mobile menu and the footer. */
export const navLinks: NavLink[] = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how' },
  { label: 'Roadmap', href: '/#roadmap' },
]

/** One label per intent, used by the nav, the hero and the closing section. */
export const signupCta = { label: 'Get early access', href: '/#early-access' }
