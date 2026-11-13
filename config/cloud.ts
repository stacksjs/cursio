import type { CloudConfig } from '@stacksjs/types'
import type { CloudConfig as TsCloudConfig } from '@stacksjs/ts-cloud'
import { env } from '@stacksjs/env'

const APP_SLUG = 'cursio'
const APP_DOMAIN = env.APP_DOMAIN || 'cursio.org'

// Ports on the shared box. Chosen from what is actually bound there
// (`ss -lntp`), not from what other tenants declare: two services can bind the
// same port without an error and then serve each other's requests.
const PORT = 3280
const PORT_API = 3288

/**
 * Cursio runs as a tenant on the shared stacks box (`cloud.attachTo`), behind
 * its rpx gateway: a web process, a loopback-only API process, and a redirect
 * from www.
 *
 * The database is SQLite for now, at an absolute path outside the release
 * directories (`DB_DATABASE_PATH` in .env.production), because the migrations
 * in this repository are generated for SQLite. Moving to Postgres means
 * regenerating and testing them against Postgres first.
 *
 * Academies on their own subdomains (`{slug}.cursio.org`) are not routed yet:
 * a wildcard hostname needs a DNS-issued certificate. Until then an academy
 * is reached at `/a/{slug}`, or through an app that installs @cursio/academy.
 */
export const tsCloud: TsCloudConfig = {
  project: {
    name: APP_SLUG,
    slug: APP_SLUG,
    region: 'us-east-1',
  },

  stateDir: 'storage/cloud',

  // Deploy to Hetzner Cloud, or set `provider: 'ssh'` to deploy to a Linux box
  // you already own over SSH (a Raspberry Pi, a NUC, an old laptop):
  //
  //   cloud: { provider: 'ssh' },
  //   ssh: { profile: 'raspberry-pi', hosts: [{ host: 'pi-stacks.local', user: 'pi' }] },
  //
  // See `buddy server:flash`, `server:first-boot`, `server:doctor` and
  // `server:setup` for getting a fresh board to that point.
  cloud: {
    provider: 'hetzner',
    attachTo: 'stacks',
  },

  mode: 'server',

  environments: {
    production: {
      type: 'production',
      deployBranch: 'main',
      region: 'us-east-1',
      variables: {
        APP_ENV: 'production',
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
    },
  },

  infrastructure: {
    compute: {
      instances: 1,
      size: 'small',
      disk: {
        size: 20,
        type: 'ssd',
        encrypted: true,
      },
      webServer: 'rpx',
      proxy: {
        engine: 'rpx',
        onDemandTls: true,
        onDemandTlsEmail: 'chris@stacksjs.com',
      },
    },

    ssl: {
      enabled: true,
      provider: 'letsencrypt',
      domains: [APP_DOMAIN, `www.${APP_DOMAIN}`],
      redirectHttp: true,
      letsEncrypt: { email: 'chris@stacksjs.com', staging: false, autoRenew: true },
    },

    dns: { provider: 'porkbun', domain: APP_DOMAIN },
  },

  sites: {
    main: {
      root: '.',
      path: '/',
      domain: APP_DOMAIN,
      start: 'bun node_modules/@stacksjs/buddy/dist/serve-entry.js',
      port: PORT,
      preStart: [
        'bun install --frozen-lockfile',
        'bun node_modules/@stacksjs/buddy/dist/cli.js migrate',
      ],
      env: {
        APP_ENV: 'production',
        NODE_ENV: 'production',
        PORT_API: String(PORT_API),
        API_URL: `http://127.0.0.1:${PORT_API}`,
      },
    },

    api: {
      root: '.',
      start: 'bun node_modules/@stacksjs/actions/dist/serve/api.js',
      port: PORT_API,
      preStart: ['bun install --frozen-lockfile'],
      env: {
        HOST: '127.0.0.1',
        APP_ENV: 'production',
        NODE_ENV: 'production',
      },
    },

    www: { domain: `www.${APP_DOMAIN}`, redirect: `https://${APP_DOMAIN}` },
  },
}

const config: CloudConfig = {}

export default config
