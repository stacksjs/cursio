import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { gradebookCsv, gradebookOf } from '../../Support/gradebook'
import { studioCourse } from '../../Support/http'

export default new Action({
  name: 'Gradebook',
  description: 'Every learner in a course with their progress and quiz results, as JSON or CSV',
  method: 'GET',

  async handle(request: RequestInstance) {
    const context = await studioCourse(request)
    if (context instanceof Response)
      return context

    const book = await gradebookOf(context.course)
    if (request.get('format') !== 'csv')
      return response.json(book)

    return new Response(gradebookCsv(book), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${context.course.slug}-gradebook.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  },
})
