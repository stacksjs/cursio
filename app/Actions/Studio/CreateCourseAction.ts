import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { createCourse } from '../../Support/courses'
import { refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'CreateCourse',
  description: 'Start a draft course in the academy',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    try {
      const course = await createCourse(context.academy, {
        title: String(request.get('title') ?? ''),
        summary: request.get('summary') ? String(request.get('summary')) : undefined,
      })
      return response.json({ success: true, course }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
