import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { refusal, studioCourse } from '../../Support/http'
import { reviewsForStudio } from '../../Support/reviews'

export default new Action({
  name: 'StudioReviewList',
  description: 'Every review of a course, hidden ones included',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ reviews: await reviewsForStudio(context.course) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
