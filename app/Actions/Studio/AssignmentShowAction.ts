import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { assignmentForStudio } from '../../Support/assignments'
import { idParam, refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'StudioAssignmentShow',
  description: 'How an assignment is marked: its rubric and pass score',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ assignment: await assignmentForStudio(context.course, idParam(request, 'lesson')) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
