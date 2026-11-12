import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { publishedCourse } from '../../Support/courses'
import { refusal, userIdOf } from '../../Support/http'
import { ownReview } from '../../Support/reviews'

export default new Action({
  name: 'LearnOwnReview',
  description: 'The review the signed-in learner wrote, and whether they may write one',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!academy || !course)
      return response.notFound('Course not found')

    try {
      return response.json(await ownReview(userId, course.id))
    }
    catch (error) {
      return refusal(error)
    }
  },
})
