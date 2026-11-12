import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { banksOf } from '../../Support/banks'
import { refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'StudioBankList',
  description: 'The question banks of an academy',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    try {
      return response.json({ banks: await banksOf(context.academy) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
