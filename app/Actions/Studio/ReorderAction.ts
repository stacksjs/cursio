import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { outlineOf, reorderLessons, reorderSections } from '../../Support/courses'
import { idList, refusal, studioCourse } from '../../Support/http'

export default new Action({
  name: 'ReorderOutline',
  description: 'Put the sections of a course, or the lessons of one section, in a new order',
  method: 'POST',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context
    const course = context.course

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
