import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { updateLesson } from '../../Support/courses'
import { idParam, refusal, sent, studioCourse } from '../../Support/http'

export default new Action({
  name: 'UpdateLesson',
  description: 'Edit a lesson',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

    try {
      const days = sent(request, 'unlock_after_days')
      const duration = sent(request, 'duration_seconds')
      const lesson = await updateLesson(course, idParam(request, 'lesson'), {
        title: sent(request, 'title'),
        kind: sent(request, 'kind'),
        body: sent(request, 'body'),
        videoUrl: sent(request, 'video_url'),
        durationSeconds: duration === undefined ? undefined : Number(duration),
        unlockAfterDays: days === undefined ? undefined : Number(days),
        isPreview: request.get('is_preview') === undefined || request.get('is_preview') === null ? undefined : request.get('is_preview') === true,
      })
      return response.json({ success: true, lesson })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
