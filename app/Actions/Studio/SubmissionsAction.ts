import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { submissionsOf } from '../../Support/assignments'
import { refusal, studioCourse } from '../../Support/http'
import { essaysToMark } from '../../Support/quizzes'

export default new Action({
  name: 'StudioSubmissions',
  description: 'What waits for a marker in a course: handed-in work and essay answers',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ submissions: await submissionsOf(context.course), essays: await essaysToMark(context.course) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
