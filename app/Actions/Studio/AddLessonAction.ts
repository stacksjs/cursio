import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { addLesson, courseInAcademy } from '../../Support/courses'
import { idParam, refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'AddLesson',
  description: 'Add a lesson to the end of a section',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      const lesson = await addLesson(course, {
        sectionId: Number(request.get('section_id')) || 0,
        title: String(request.get('title') ?? ''),
        kind: request.get('kind') ? String(request.get('kind')) : undefined,
        body: request.get('body') ? String(request.get('body')) : undefined,
        videoUrl: request.get('video_url') ? String(request.get('video_url')) : undefined,
        durationSeconds: Number(request.get('duration_seconds')) || 0,
        unlockAfterDays: Number(request.get('unlock_after_days')) || null,
        isPreview: request.get('is_preview') === true,
      })
      return response.json({ success: true, lesson }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
