import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { markSubmission } from '../../Support/assignments'
import { idParam, refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'MarkSubmission',
  description: 'Mark a piece of handed-in work',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const { submission } = await markSubmission(context.course, idParam(request, 'submission'), context.userId, {
        scores: request.get('scores'),
        score: request.get('score'),
        feedback: request.get('feedback') ? String(request.get('feedback')) : undefined,
      })
      return response.json({ success: true, submission })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
