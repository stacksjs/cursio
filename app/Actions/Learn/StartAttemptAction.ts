import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, userIdOf } from '../../Support/http'
import { startAttempt } from '../../Support/quizzes'

export default new Action({
  name: 'StartAttempt',
  description: 'Start an attempt at a quiz, or resume the one in progress',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ success: true, attempt: await startAttempt(userId, idParam(request, 'id')) }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
