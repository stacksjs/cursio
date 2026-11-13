import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { refusal, studioCourse } from '../../Support/http'
import { courseReport } from '../../Support/reports'

export default new Action({
  name: 'StudioCourseReport',
  description: 'How a course is doing: enrollment, completion, where learners stop and which questions they miss',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ course: { id: context.course.id, title: context.course.title }, report: await courseReport(context.course) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
