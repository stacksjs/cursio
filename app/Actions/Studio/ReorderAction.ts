import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { courseInAcademy, outlineOf, reorderLessons, reorderSections } from '../../Support/courses'
import { idList, idParam, refusal, staffContext } from '../../Support/http'

export default new Action({
  name: 'ReorderOutline',
  description: 'Put the sections of a course, or the lessons of one section, in a new order',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await staffContext(request)
    if (context instanceof Response)
      return context

    const course = await courseInAcademy(context.academy, idParam(request, 'id'))
    if (!course)
      return response.notFound('Course not found')

    try {
      const sectionId = Number(request.get('section_id')) || 0
      if (sectionId)
        await reorderLessons(course, sectionId, idList(request, 'lessons'))
      else
        await reorderSections(course, idList(request, 'sections'))

      return response.json({ success: true, outline: await outlineOf(course.id) })
    }
    catch (error) {
      return refusal(error)
    }
  },
})
