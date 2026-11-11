import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, deleteSection } from '../../Support/courses'
import { idParam, refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'DeleteSection',
  description: 'Remove a section and its lessons',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      await deleteSection(course, idParam(request, 'section'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
