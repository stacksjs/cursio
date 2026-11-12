import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { setAccess } from '../../Support/gradebook'
import { idParam, refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'SetLearnerAccess',
  description: 'Remove a learner from a course, or let them back in',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const status = await setAccess(context.course, idParam(request, 'enrollment'), request.get('allowed') === true)
      return response.json({ success: true, status })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
