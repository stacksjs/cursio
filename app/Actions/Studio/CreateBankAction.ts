import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { createBank } from '../../Support/banks'
import { refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'CreateBank',
  description: 'Open a question bank',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ success: true, bank: await createBank(context.academy, { title: request.get('title') }) }, 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
