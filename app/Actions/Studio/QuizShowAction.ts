import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, studioCourse } from '../../Support/http'
import { banksOf } from '../../Support/banks'
import { quizForStudio } from '../../Support/quizzes'

export default new Action({
  name: 'StudioQuizShow',
  description: 'A quiz with its questions and answer key, for the staff who write it',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      // The banks come along so the editor can offer them to draw from.
      return response.json({ ...await quizForStudio(context.course, idParam(request, 'lesson')), banks: await banksOf(context.academy) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
