import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, outlineOf } from '../../Support/courses'
import { idParam, staffContext } from '../../Support/http'

export default new Action({
  name: 'StudioCourseOutline',
  description: 'A course and its outline, for its academy staff',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    return response.json({ course, outline: await outlineOf(course.id) })
  },
})
