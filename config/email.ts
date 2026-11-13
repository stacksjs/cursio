import type { EmailConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

export default {
  from: {
    name: env.MAIL_FROM_NAME || 'Cursio',
    address: env.MAIL_FROM_ADDRESS || `noreply@${env.MAIL_DOMAIN || 'cursio.org'}`,
  },

  domain: env.MAIL_DOMAIN || 'cursio.org',
  /*
   * The mailbox Cursio sends from. `buddy mail:provision` creates it on the
   * shared mail server, with its password taken from MAIL_PASSWORD_NOREPLY,
   * and publishes the domain's MX, SPF, DKIM and DMARC records.
   */
  mailboxes: ['noreply'],
  forwards: {},
  url: env.APP_URL || 'cursio.localhost',
  charset: 'UTF-8',

  server: {
    enabled: true,
    /*
     * The mail server belongs to the `stacks` app on the shared box. Without
     * this line a deploy takes this app's own address for the mail host and
     * rewrites the mail DNS records to point at it.
     */
    attachTo: 'stacks',
    scan: true,
    subdomain: 'mail',
  },
} satisfies EmailConfig
