import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { deleteLesson } from '../../Support/courses'
import { idParam, refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'DeleteLesson',
  description: 'Remove a lesson',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      await deleteLesson(course, idParam(request, 'lesson'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
