import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, questionDraft, refusal, studioCourse } from '../../Support/http'
import { saveQuestion } from '../../Support/quizzes'

export default new Action({
  name: 'SaveQuestion',
  description: 'Add a question to a quiz, or replace one',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const questionId = idParam(request, 'question')
      const question = await saveQuestion(context.course, idParam(request, 'lesson'), questionDraft(request), questionId)
      return response.json({ success: true, question }, questionId ? 200 : 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
