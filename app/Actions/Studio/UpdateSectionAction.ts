import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, renameSection } from '../../Support/courses'
import { idParam, refusal, sent, staffContext } from '../../Support/http'

export default new Action({
  name: 'UpdateSection',
  description: 'Rename a section',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      await renameSection(course, idParam(request, 'section'), sent(request, 'title') ?? '')
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
