import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { previewLesson } from '../../Support/enrollment'
import { idParam } from '../../Support/http'

export default new Action({
  name: 'LearnLessonPreview',
  description: 'A free preview lesson, for anyone',
  method: 'GET',

  async handle(request: RequestInstance) {
    const lesson = await previewLesson(idParam(request, 'id'))
    if (!lesson)
      return response.notFound('Lesson not found')

    return response.json({ lesson })
  },
})
