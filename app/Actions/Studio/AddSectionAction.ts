import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { addSection, courseInAcademy } from '../../Support/courses'
import { idParam, refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'AddSection',
  description: 'Add a section to the end of a course',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      const section = await addSection(course, { title: String(request.get('title') ?? '') })
      return response.json({ success: true, section }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
