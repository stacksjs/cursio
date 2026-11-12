import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, userIdOf } from '../../Support/http'
import { submitAttempt } from '../../Support/quizzes'

export default new Action({
  name: 'SubmitAttempt',
  description: 'Submit the answers of an attempt and get it graded',
  method: 'POST',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    // Keyed by question id. Anything that is not an object grades as no answers.
    const sent = request.get('answers')
    const answers: Record<number, unknown> = {}
    if (sent && typeof sent === 'object' && !Array.isArray(sent)) {
      for (const [key, value] of Object.entries(sent as Record<string, unknown>)) {
        const id = Number(key)
        if (Number.isInteger(id) && id > 0)
          answers[id] = value
      }
    }

    try {
      return response.json({ success: true, result: await submitAttempt(userId, idParam(request, 'id'), answers) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
