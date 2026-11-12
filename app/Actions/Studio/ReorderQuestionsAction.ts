import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idList, idParam, refusal, studioCourse } from '../../Support/http'
import { reorderQuestions } from '../../Support/quizzes'

export default new Action({
  name: 'ReorderQuestions',
  description: 'Put the questions of a quiz in a new order',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      await reorderQuestions(context.course, idParam(request, 'lesson'), idList(request, 'questions'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
