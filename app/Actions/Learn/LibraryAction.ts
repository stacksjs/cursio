import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { libraryOf } from '../../Support/enrollment'
import { userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnLibrary',
  description: 'What the signed-in learner is enrolled in at an academy, and what to watch next',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    if (!academy)
      return response.notFound('Academy not found')

    return response.json({ library: await libraryOf(userId, academy.id) })
  },
})
