import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { idParam, refusal, studioCourse } from '../../Support/http'
import { saveQuestion } from '../../Support/quizzes'

export default new Action({
  name: 'SaveQuestion',
  description: 'Add a question to a quiz, or replace one',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    const options = request.get('options')
    const answers = request.get('answers')
    const value = request.get('value')

    try {
      const questionId = idParam(request, 'question')
      const question = await saveQuestion(context.course, idParam(request, 'lesson'), {
        kind: String(request.get('kind') ?? ''),
        prompt: String(request.get('prompt') ?? ''),
        explanation: String(request.get('explanation') ?? ''),
        points: Number(request.get('points')) || 1,
        options: Array.isArray(options)
          ? options.map(option => ({ label: String(option?.label ?? ''), correct: option?.correct === true }))
          : [],
        answers: Array.isArray(answers) ? answers.map(String) : [],
        value: value === undefined || value === null || value === '' ? null : Number(value),
        tolerance: Number(request.get('tolerance')) || 0,
      }, questionId)
      return response.json({ success: true, question }, questionId ? 200 : 201)
    }
    catch (error) {
      return refusal(error)
    }
  },
})
