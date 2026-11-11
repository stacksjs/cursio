import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { outlineOf, publishedCourse } from '../../Support/courses'
import { enrollmentOf, progressOf } from '../../Support/enrollment'
import { userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnCourseShow',
  description: 'A published course, its outline, and how far the caller has got',
  method: 'GET',

  async handle(request: RequestInstance) {
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!academy || !course)
      return response.notFound('Course not found')

    const outline = await outlineOf(course.id)
    const userId = await userIdOf(request)
    const enrollment = userId ? await enrollmentOf(userId, course.id) : null
    const active = enrollment && enrollment.status !== 'revoked' ? enrollment : null

    return response.json({
      academy: { name: academy.name, slug: academy.slug },
      course: { id: course.id, title: course.title, slug: course.slug, summary: course.summary },
      outline,
      signedIn: userId !== null,
      enrolled: active !== null,
      progress: active ? await progressOf(active) : null,
    })
  },
})
