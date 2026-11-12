import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, studioCourse } from '../../Support/http'
import { reopenQuiz } from '../../Support/quizzes'

export default new Action({
  name: 'ReopenQuiz',
  description: 'Give a learner their attempts at a quiz back',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const voided = await reopenQuiz(context.course, idParam(request, 'lesson'), Number(request.get('enrollment_id')) || 0)
      return response.json({ success: true, voided })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
