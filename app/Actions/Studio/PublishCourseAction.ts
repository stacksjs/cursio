import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { publishCourse, unpublishCourse } from '../../Support/courses'
import { refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'PublishCourse',
  description: 'Publish a course, or return it to draft',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      const next = request.get('unpublish') ? await unpublishCourse(course) : await publishCourse(course)
      return response.json({ success: true, course: next })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
