import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, updateLesson } from '../../Support/courses'
import { idParam, refusal, sent, staffContext } from '../../Support/http'

export default new Action({
  name: 'UpdateLesson',
  description: 'Edit a lesson',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

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
      })
      return response.json({ success: true, lesson })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
