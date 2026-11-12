import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, studioCourse } from '../../Support/http'
import { reviewsForStudio, setReviewHidden } from '../../Support/reviews'

export default new Action({
  name: 'HideReview',
  description: 'Take a review down, or put it back',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const hidden = request.get('hidden')
      await setReviewHidden(context.course, idParam(request, 'review'), hidden === true || hidden === 'true' || hidden === 1)
      return response.json({ success: true, reviews: await reviewsForStudio(context.course) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
