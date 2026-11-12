import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { deleteBankQuestion } from '../../Support/banks'
import { idParam, refusal, studioBank } from '../../Support/http'

export default new Action({
  name: 'DeleteBankQuestion',
  description: 'Remove a question from a bank',
  method: 'DELETE',

  async handle(request: RequestInstance) {
    const context = await studioBank(request)
    if (context instanceof Response)
      return context

    try {
      await deleteBankQuestion(context.academy, context.bank.id, idParam(request, 'question'))
      return response.json({ success: true })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
