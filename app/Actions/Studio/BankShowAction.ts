import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { bankForStudio } from '../../Support/banks'
import { refusal, studioBank } from '../../Support/http'

export default new Action({
  name: 'StudioBankShow',
  description: 'A question bank with its questions and answer keys',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioBank(request)
    if (context instanceof Response)
      return context

    try {
      return response.json(await bankForStudio(context.academy, context.bank.id))
    }
    catch (error) {
      return refusal(error)
    }
  },
})
