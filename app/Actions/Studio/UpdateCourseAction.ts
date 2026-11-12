import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { updateCourse } from '../../Support/courses'
import { refusal, sent, studioCourse } from '../../Support/http'

export default new Action({
  name: 'UpdateCourse',
  description: 'Change the title, summary or progression of a course',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      const next = await updateCourse(course, { title: sent(request, 'title'), summary: sent(request, 'summary'), progression: sent(request, 'progression'), level: sent(request, 'level'), topic: sent(request, 'topic') })
      return response.json({ success: true, course: next })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
