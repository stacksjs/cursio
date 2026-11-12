import { Action } from '@stacksjs/actions/runtime'
import { mail } from '@stacksjs/email'
import { env } from '@stacksjs/env'
import { site } from '../../resources/data/site'
import { welcomeMessage } from '../Support/welcome'

export interface WelcomeEmailParams {
  to: string
  name?: string
}

/**
 * Cursio's own welcome email, in place of the framework's. Run by the event
 * system on `user:registered` (see app/Events.ts), not by a request.
 *
 * A learner may have signed up on an academy's own site, so the email speaks
 * for the account, which is Cursio's, and does not name an academy it cannot
 * know.
 */
export default new Action<string, undefined, '', WelcomeEmailParams>({
  name: 'SendWelcomeEmail',
  description: 'Sends the Cursio welcome email to a newly registered account',

  async handle({ to, name }: WelcomeEmailParams) {
    const message = welcomeMessage({ product: site.name, name, url: env.APP_URL })
    await mail.sendOrFail({ to, subject: message.subject, text: message.text })
    return { success: true, message: `Welcome email sent to ${to}` }
  },
})
