import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { updateAssignment } from '../../Support/assignments'
import { idParam, refusal, sent, studioCourse } from '../../Support/http'

export default new Action({
  name: 'UpdateAssignment',
  description: 'Set the rubric and pass score of an assignment',
  method: 'PATCH',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    try {
      const rubric = request.get('rubric')
      const max = sent(request, 'max_points')
      const pass = sent(request, 'pass_points')
      const assignment = await updateAssignment(context.course, idParam(request, 'lesson'), {
        rubric: Array.isArray(rubric) ? rubric.map(row => ({ title: String(row?.title ?? ''), points: Number(row?.points) || 0 })) : undefined,
        maxPoints: max === undefined ? undefined : Number(max),
        passPoints: pass === undefined ? undefined : Number(pass),
      })
      return response.json({ success: true, assignment })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
