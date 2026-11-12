import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, studioCourse } from '../../Support/http'
import { markEssay } from '../../Support/quizzes'

export default new Action({
  name: 'MarkEssay',
  description: 'Give an essay answer its points',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const result = await markEssay(context.course, idParam(request, 'answer'), context.userId, {
        points: request.get('points'),
        feedback: request.get('feedback') ? String(request.get('feedback')) : undefined,
      })
      return response.json({ success: true, ...result })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
