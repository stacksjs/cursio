import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, userIdOf } from '../../Support/http'
import { notesOf } from '../../Support/learner-notes'

export default new Action({
  name: 'LearnNotes',
  description: 'The notes the signed-in learner keeps on a lesson',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ notes: await notesOf(userId, idParam(request, 'id')) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
