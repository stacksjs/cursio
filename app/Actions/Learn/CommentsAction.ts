import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { commentsOf } from '../../Support/comments'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnComments',
  description: 'The comments under a lesson, for someone who can open it',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ comments: await commentsOf(userId, idParam(request, 'id')) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
