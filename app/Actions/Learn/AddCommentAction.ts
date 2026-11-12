import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { addComment } from '../../Support/comments'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnAddComment',
  description: 'Post a comment under a lesson',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ success: true, comments: await addComment(userId, idParam(request, 'id'), { body: request.get('body') }) }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
