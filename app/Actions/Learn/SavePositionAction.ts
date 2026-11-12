import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { savePosition } from '../../Support/enrollment'
import { idParam, userIdOf } from '../../Support/http'

export default new Action({
  name: 'SaveLessonPosition',
  description: 'Remember where the signed-in learner stopped watching a lesson',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    return response.json({ success: await savePosition(userId, idParam(request, 'id'), Number(request.get('seconds')) || 0) })
  },
})
