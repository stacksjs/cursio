import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { publishedCourse } from '../../Support/courses'
import { enroll, progressOf } from '../../Support/enrollment'
import { refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'Enroll',
  description: 'Enroll the signed-in learner in a published course',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!course)
      return response.notFound('Course not found')

    try {
      const enrollment = await enroll(userId, course)
      return response.json({ success: true, enrolled: true, progress: await progressOf(enrollment) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
