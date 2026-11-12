import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { renameBank } from '../../Support/banks'
import { refusal, studioBank } from '../../Support/http'

export default new Action({
  name: 'UpdateBank',
  description: 'Rename a question bank',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await studioBank(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ success: true, bank: await renameBank(context.academy, context.bank.id, { title: request.get('title') }) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
