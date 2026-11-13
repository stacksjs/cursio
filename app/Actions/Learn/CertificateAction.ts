import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { certificateInAcademy } from '../../Support/certificates'

export default new Action({
  name: 'LearnCertificate',
  description: 'Check a certificate an academy issued, by its serial',
  method: 'GET',

  async handle(request: RequestInstance) {
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const certificate = academy ? await certificateInAcademy(academy.id, String(request.getParam('serial') ?? '')) : null
    if (!certificate)
      return response.notFound('Certificate not found')

    return response.json({ certificate })
  },
})
