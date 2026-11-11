import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { createAcademy } from '../../Support/academies'
import { refusal, userIdOf } from '../../Support/http'

export default new Action({
  name: 'CreateAcademy',
  description: 'Open an academy for the signed-in user',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    try {
      const academy = await createAcademy({
        ownerId: userId,
        name: String(request.get('name') ?? ''),
        slug: request.get('slug') ? String(request.get('slug')) : undefined,
      })
      return response.json({ success: true, academy }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
