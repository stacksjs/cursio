/**
 * A Lesson's notes, from the Markdown its author wrote to HTML a page can show.
 *
 * Order matters. The Markdown is rendered, then sanitized (an author is
 * trusted to teach, not to script their Learners' browsers), and only then
 * are the code blocks swapped for highlighted ones. The highlighter's output
 * is built from escaped tokens by our own code, so it goes in after the
 * sanitizer rather than being weakened to pass through it.
 */

import { parseSync } from '@stacksjs/ts-md'
import { sanitize } from '@stacksjs/sanitizer'
import { highlight } from 'ts-syntax-highlighter'

const entities: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': '\'' }

function unescape(text: string): string {
  return text.replace(/&(?:lt|gt|amp|quot|#39);/g, entity => entities[entity] ?? entity)
}

const codeBlock = /<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g

export async function renderNotes(markdown: string | null | undefined): Promise<string> {
  if (!markdown?.trim())
    return ''

  const safe = sanitize(parseSync(markdown), 'markdown')

  const blocks = [...safe.matchAll(codeBlock)]
  let html = safe
  for (const block of blocks) {
    const [whole, language, code] = block
    if (!language || code === undefined)
      continue
    try {
      const lit = await highlight(unescape(code).replace(/\n$/, ''), language)
      if (lit?.html)
        html = html.replace(whole, () => lit.html)
    }
    catch {
      // A language the highlighter does not know keeps its plain block.
    }
  }
  return html
}
