import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { lessonsForStudio, outlineOf } from '../../Support/courses'
import { studioCourse } from '../../Support/http'

export default new Action({
  name: 'StudioCourseOutline',
  description: 'A course and its outline, for its academy staff',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    return response.json({ course, outline: await outlineOf(course.id), lessons: await lessonsForStudio(course.id) })
  },
})
