import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { submissionsOf } from '../../Support/assignments'
import { refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'StudioSubmissions',
  description: 'The work handed in for a course, waiting first',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ submissions: await submissionsOf(context.course) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
