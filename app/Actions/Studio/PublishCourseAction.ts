import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, publishCourse, unpublishCourse } from '../../Support/courses'
import { idParam, refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'PublishCourse',
  description: 'Publish a course, or return it to draft',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      const next = request.get('unpublish') ? await unpublishCourse(course) : await publishCourse(course)
      return response.json({ success: true, course: next })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
