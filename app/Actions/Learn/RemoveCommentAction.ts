import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { removeComment } from '../../Support/comments'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnRemoveComment',
  description: 'Take down a comment: its author or the academy staff',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ success: true, comments: await removeComment(userId, idParam(request, 'id')) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
