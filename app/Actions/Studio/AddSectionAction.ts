import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { addSection } from '../../Support/courses'
import { refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'AddSection',
  description: 'Add a section to the end of a course',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      const section = await addSection(course, { title: String(request.get('title') ?? '') })
      return response.json({ success: true, section }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
