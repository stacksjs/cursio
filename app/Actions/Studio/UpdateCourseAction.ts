import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, updateCourse } from '../../Support/courses'
import { idParam, refusal, sent, staffContext } from '../../Support/http'

export default new Action({
  name: 'UpdateCourse',
  description: 'Change the title, summary or progression of a course',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      const next = await updateCourse(course, { title: sent(request, 'title'), summary: sent(request, 'summary'), progression: sent(request, 'progression'), level: sent(request, 'level'), topic: sent(request, 'topic') })
      return response.json({ success: true, course: next })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
