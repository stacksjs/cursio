import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { submitWork } from '../../Support/assignments'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'SubmitWork',
  description: 'Hand in work for an assignment',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      const submission = await submitWork(userId, idParam(request, 'id'), {
        body: request.get('body') ? String(request.get('body')) : undefined,
        link: request.get('link') ? String(request.get('link')) : undefined,
      })
      return response.json({ success: true, submission }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
