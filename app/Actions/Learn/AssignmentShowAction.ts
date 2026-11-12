import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { assignmentForLearner } from '../../Support/assignments'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnAssignmentShow',
  description: 'An assignment as the signed-in learner sees it, with their own work and mark',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ assignment: await assignmentForLearner(userId, idParam(request, 'id')) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
