import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { saveBankQuestion } from '../../Support/banks'
import { idParam, questionDraft, refusal, studioBank } from '../../Support/http'

export default new Action({
  name: 'SaveBankQuestion',
  description: 'Add a question to a bank, or replace one',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioBank(request)
    if (context instanceof Response)
      return context

    try {
      const questionId = idParam(request, 'question')
      const question = await saveBankQuestion(context.academy, context.bank.id, questionDraft(request), questionId)
      return response.json({ success: true, question }, questionId ? 200 : 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
