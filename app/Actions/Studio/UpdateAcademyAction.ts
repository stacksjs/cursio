import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { updateAcademy } from '../../Support/academies'
import { refusal, sent, staffContext } from '../../Support/http'

export default new Action({
  name: 'UpdateAcademy',
  description: 'Change an academy name, tagline or the words its learners read',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    try {
      const academy = await updateAcademy(context.academy, { name: sent(request, 'name'), tagline: sent(request, 'tagline'), vocabulary: sent(request, 'vocabulary') })
      return response.json({ success: true, academy })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
