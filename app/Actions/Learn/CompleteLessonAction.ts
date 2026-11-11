import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { completeLesson } from '../../Support/enrollment'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'CompleteLesson',
  description: 'Mark a lesson complete for the signed-in learner',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      const { enrollment, progress } = await completeLesson(userId, idParam(request, 'id'))
      return response.json({ success: true, progress, courseCompleted: enrollment.status === 'completed' })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
