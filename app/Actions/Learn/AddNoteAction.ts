import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, userIdOf } from '../../Support/http'
import { addNote } from '../../Support/learner-notes'

export default new Action({
  name: 'LearnAddNote',
  description: 'Keep a note on a lesson',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      return response.json({ success: true, notes: await addNote(userId, idParam(request, 'id'), { body: request.get('body'), seconds: request.get('seconds') }) }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
