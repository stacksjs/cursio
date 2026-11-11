/**
 * The one feature list. The home page bento, the roadmap and (later) the
 * feature pages all render from it, so a feature is described once and its
 * status is changed in one place.
 *
 * `status` is the truth about the product, not a sales claim:
 *   - 'live'      works in the product today
 *   - 'building'  in the phase being built now
 *   - 'planned'   designed and scheduled, not started
 */
export type FeatureStatus = 'live' | 'building' | 'planned'

export interface Feature {
  slug: string
  title: string
  summary: string
  icon: string
  status: FeatureStatus
  /** Roadmap bucket. */
  horizon: 'now' | 'next' | 'later'
}

export const features: Feature[] = [
  {
    slug: 'course-builder',
    title: 'Course builder',
    summary: 'Arrange sections and lessons by dragging. Video, readings, downloads, quizzes and assignments sit in one outline.',
    icon: 'i-hugeicons-layers-01',
    status: 'building',
    horizon: 'now',
  },
  {
    slug: 'video',
    title: 'Video hosting',
    summary: 'Upload once. Cursio transcodes, captions and streams it, and remembers where each learner stopped.',
    icon: 'i-hugeicons-video-01',
    status: 'building',
    horizon: 'now',
  },
  {
    slug: 'learner-progress',
    title: 'Learner progress',
    summary: 'Every lesson tracks completion and resume position, so learners pick up exactly where they left off.',
    icon: 'i-hugeicons-chart-ring',
    status: 'building',
    horizon: 'now',
  },
  {
    slug: 'checkout',
    title: 'Checkout and memberships',
    summary: 'One-time prices, payment plans, subscriptions, bundles and coupons, paid out to your own Stripe account.',
    icon: 'i-hugeicons-credit-card',
    status: 'planned',
    horizon: 'next',
  },
  {
    slug: 'quizzes-certificates',
    title: 'Quizzes and certificates',
    summary: 'Nine question types, question banks, graded assignments, and certificates anyone can verify by link.',
    icon: 'i-hugeicons-certificate-01',
    status: 'planned',
    horizon: 'next',
  },
  {
    slug: 'cohorts',
    title: 'Cohorts and live sessions',
    summary: 'Run a course on dates with a fixed group, live sessions on the calendar and attendance kept for you.',
    icon: 'i-hugeicons-user-group',
    status: 'planned',
    horizon: 'next',
  },
  {
    slug: 'community',
    title: 'Community spaces',
    summary: 'Discussion spaces and lesson comments in the same place as the course, with no second login.',
    icon: 'i-hugeicons-bubble-chat',
    status: 'planned',
    horizon: 'next',
  },
  {
    slug: 'automation',
    title: 'Email and automation',
    summary: 'Welcome, reminder and win-back emails that fire on what learners do, without a separate email tool.',
    icon: 'i-hugeicons-mail-send-01',
    status: 'planned',
    horizon: 'later',
  },
  {
    slug: 'reporting',
    title: 'Reporting',
    summary: 'Revenue, completion, video drop-off and quiz results per course and per cohort, exportable as CSV.',
    icon: 'i-hugeicons-analytics-01',
    status: 'planned',
    horizon: 'later',
  },
  {
    slug: 'ai-tutor',
    title: 'AI tutor',
    summary: 'An assistant that answers from your own course material and points learners back to the lesson.',
    icon: 'i-hugeicons-ai-chat-02',
    status: 'planned',
    horizon: 'later',
  },
  {
    slug: 'own-domain',
    title: 'Your domain and brand',
    summary: 'Your academy on your own domain with your colors and logo. Cursio stays out of the picture.',
    icon: 'i-hugeicons-globe-02',
    status: 'planned',
    horizon: 'later',
  },
]

export const statusLabel: Record<FeatureStatus, string> = {
  live: 'Live',
  building: 'In development',
  planned: 'Planned',
}

export const horizons: { key: Feature['horizon'], label: string }[] = [
  { key: 'now', label: 'Now' },
  { key: 'next', label: 'Next' },
  { key: 'later', label: 'Later' },
]

/** The six shown on the home page, in bento order. */
export const homeFeatureSlugs = [
  'course-builder',
  'quizzes-certificates',
  'video',
  'checkout',
  'cohorts',
  'community',
]

/** A feature plus the words for its status, ready to print. */
export type FeatureView = Feature & { statusText: string }

/**
 * Templates print `feature.statusText` rather than looking the label up
 * themselves: stx refuses a dynamic bracket lookup inside `{{ }}` and renders
 * it as an empty string.
 */
export function describe(feature: Feature): FeatureView {
  return { ...feature, statusText: statusLabel[feature.status] }
}

export function featureBySlug(slug: string): FeatureView {
  const feature = features.find(item => item.slug === slug)
  if (!feature)
    throw new Error(`Unknown feature "${slug}"`)
  return describe(feature)
}
