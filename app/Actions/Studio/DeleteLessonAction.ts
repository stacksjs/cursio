import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, deleteLesson } from '../../Support/courses'
import { idParam, refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'DeleteLesson',
  description: 'Remove a lesson',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      await deleteLesson(course, idParam(request, 'lesson'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
