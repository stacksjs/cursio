import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { publishedCourse } from '../../Support/courses'
import { refusal, userIdOf } from '../../Support/http'
import { reviewsOf, withdrawReview } from '../../Support/reviews'

export default new Action({
  name: 'LearnWithdrawReview',
  description: 'Withdraw your own review of a course',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!academy || !course)
      return response.notFound('Course not found')

    try {
      await withdrawReview(userId, course.id)
      return response.json({ success: true, ...await reviewsOf(course.id) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
