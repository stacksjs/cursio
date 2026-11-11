import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { lessonForLearner } from '../../Support/enrollment'
import { idParam, refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnLessonShow',
  description: 'The content of a lesson, for a learner enrolled in its course',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      const lesson = await lessonForLearner(userId, idParam(request, 'id'))
      if (!lesson)
        return response.notFound('Lesson not found')

      return response.json({ lesson })
    }
    catch (error) {
      // Enrolled, but the Lesson is not open yet (drip or sequence).
      return refusal(error)
    }
  },
})
