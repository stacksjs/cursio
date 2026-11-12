import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, sent, studioCourse } from '../../Support/http'
import { updateQuiz } from '../../Support/quizzes'

export default new Action({
  name: 'UpdateQuiz',
  description: 'Change how a quiz is sat: pass mark, attempts, time limit, shuffling, answer reveal',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    const number = (name: string): number | undefined => {
      const value = sent(request, name)
      return value === undefined ? undefined : Number(value)
    }

    try {
      const shuffle = request.get('shuffle')
      const quiz = await updateQuiz(context.course, idParam(request, 'lesson'), {
        passPercent: number('pass_percent'),
        maxAttempts: number('max_attempts'),
        timeLimitSeconds: number('time_limit_seconds'),
        shuffle: shuffle === undefined || shuffle === null ? undefined : (shuffle === true || shuffle === 'true' || shuffle === 1),
        reveal: sent(request, 'reveal'),
      })
      return response.json({ success: true, quiz })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
