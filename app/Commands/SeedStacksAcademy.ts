import process from 'node:process'
import { defineCommand } from '@stacksjs/cli'
import { db } from '@stacksjs/database'
import { ExitCode } from '@stacksjs/types'
import { seedStacksAcademy } from '../Support/stacks-academy'

interface SeedOptions {
  owner?: string
  docs?: string
  slug?: string
}

/**
 * `buddy academy:seed-stacks --owner you@example.com`
 *
 * Builds the "Learn Stacks" academy from the framework's docs. Run it again
 * whenever: a series that already exists is left alone.
 */
export default defineCommand((cli) => {
  cli
    .command('academy:seed-stacks', 'Build the Learn Stacks academy from the framework docs')
    .option('--owner <email>', 'Email of the account that will own the academy')
    .option('--docs <path>', 'Path to the framework docs folder', { default: process.env.STACKS_DOCS_PATH || '../../stacks/docs' })
    .option('--slug <slug>', 'Address of the academy', { default: 'stacks' })
    .action(async (options: SeedOptions) => {
      if (!options.owner) {
        console.error('Say who owns it: --owner you@example.com')
        process.exit(ExitCode.FatalError)
      }

      const owner = await db.selectFrom('users').select(['id']).where('email', '=', options.owner).executeTakeFirst() as { id: number } | undefined
      if (!owner) {
        console.error(`No account has the email ${options.owner}. Register it first.`)
        process.exit(ExitCode.FatalError)
      }

      const root = String(options.docs).replace(/\/+$/, '')
      try {
        const report = await seedStacksAcademy({
          ownerId: owner.id,
          slug: options.slug,
          readDoc: async (path) => {
            const file = Bun.file(`${root}/${path}.md`)
            return await file.exists() ? await file.text() : null
          },
        })

        console.log(`Academy: ${report.academy.name} (/a/${report.academy.slug})`)
        for (const title of report.created) console.log(`  created  ${title}`)
        for (const title of report.skipped) console.log(`  kept     ${title}`)
        for (const path of report.missing) console.log(`  missing  ${path}.md`)
        if (report.created.length === 0 && report.skipped.length === 0)
          console.log(`  nothing was built: no docs were found under ${root}`)
      }
      catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exit(ExitCode.FatalError)
      }
      process.exit(ExitCode.Success)
    })
})
