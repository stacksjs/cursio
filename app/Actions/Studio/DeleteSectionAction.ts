import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { deleteSection } from '../../Support/courses'
import { idParam, refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'DeleteSection',
  description: 'Remove a section and its lessons',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      await deleteSection(course, idParam(request, 'section'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
