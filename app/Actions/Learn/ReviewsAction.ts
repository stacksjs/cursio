import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { publishedCourse } from '../../Support/courses'
import { refusal } from '../../Support/http'
import { reviewsOf } from '../../Support/reviews'

export default new Action({
  name: 'LearnReviews',
  description: 'What learners thought of a published course',
  method: 'GET',

  async handle(request: RequestInstance) {
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!academy || !course)
      return response.notFound('Course not found')

    try {
      return response.json(await reviewsOf(course.id))
    }
    catch (error) {
      return refusal(error)
    }
  },
})
