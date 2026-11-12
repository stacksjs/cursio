import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { renameSection } from '../../Support/courses'
import { idParam, refusal, sent, studioCourse } from '../../Support/http'

export default new Action({
  name: 'UpdateSection',
  description: 'Rename a section',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      await renameSection(course, idParam(request, 'section'), sent(request, 'title') ?? '')
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
