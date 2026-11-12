import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { deleteBank } from '../../Support/banks'
import { refusal, studioBank } from '../../Support/http'

export default new Action({
  name: 'DeleteBank',
  description: 'Delete a question bank and its questions',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await studioBank(request)
    if (context instanceof Response)
      return context

    try {
      await deleteBank(context.academy, context.bank.id)
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
