import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, studioCourse } from '../../Support/http'
import { deleteQuestion } from '../../Support/quizzes'

export default new Action({
  name: 'DeleteQuestion',
  description: 'Remove a question from a quiz',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      await deleteQuestion(context.course, idParam(request, 'lesson'), idParam(request, 'question'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
