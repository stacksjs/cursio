import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, userIdOf } from '../../Support/http'
import { quizForLearner } from '../../Support/quizzes'

export default new Action({
  name: 'LearnQuizShow',
  description: 'A quiz as the signed-in learner may see it: rules, past attempts, the attempt in progress',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ quiz: await quizForLearner(userId, idParam(request, 'id')) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
