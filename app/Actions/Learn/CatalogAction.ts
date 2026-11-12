import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { catalogOf } from '../../Support/courses'

export default new Action({
  name: 'AcademyCatalog',
  description: 'The published courses of one academy',
  method: 'GET',

  async handle(request: RequestInstance) {
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    if (!academy)
      return response.notFound('Academy not found')

    return response.json({
      academy: { name: academy.name, slug: academy.slug, tagline: academy.tagline, vocabulary: academy.vocabulary },
      courses: await catalogOf(academy.id),
    })
  },
})
