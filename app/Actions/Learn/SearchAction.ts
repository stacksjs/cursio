import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { searchAcademy } from '../../Support/search'

export default new Action({
  name: 'LearnSearch',
  description: 'Search an academy\'s published courses and their lessons by title',
  method: 'GET',

  async handle(request: RequestInstance) {
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    if (!academy)
      return response.notFound('Academy not found')

    return response.json({ results: await searchAcademy(academy.id, request.get('q')) })
  },
})
