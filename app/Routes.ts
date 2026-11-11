import type { RouteRegistry } from '@stacksjs/router'

export type { RouteDefinition, RouteRegistry } from '@stacksjs/router'

/**
 * Application route registry. The key names the file in `routes/`.
 *
 * Pages are not listed: `resources/views/**` is file-routed by stx. Framework
 * bundles (auth, dashboard, commerce) are mounted by the defaults bootstrap.
 */
export default {
  // Auto-prefixed with /api by the route loader.
  'api': 'api',

  // Academy staff. `auth` here, not per route.
  'studio': { path: 'studio', prefix: '/api/studio', middleware: ['auth'] },

  // Learners. Public reads, authenticated writes, declared per route.
  'learn': { path: 'learn', prefix: '/api/learn' },
} satisfies RouteRegistry
