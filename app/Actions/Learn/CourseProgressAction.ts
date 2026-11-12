import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { certificateOf } from '../../Support/certificates'
import { publishedCourse } from '../../Support/courses'
import { enrollmentOf, progressOf } from '../../Support/enrollment'
import { userIdOf } from '../../Support/http'

export default new Action({
  name: 'LearnCourseProgress',
  description: 'Whether the signed-in learner is enrolled in a course, and how far they have got',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!course)
      return response.notFound('Course not found')

    const enrollment = await enrollmentOf(userId, course.id)
    const active = enrollment && enrollment.status !== 'revoked' ? enrollment : null

    const certificate = active ? await certificateOf(active.id) : null

    return response.json({
      enrolled: active !== null,
      progress: active ? await progressOf(active) : null,
      certificate: certificate && !certificate.revoked_at ? certificate.serial : null,
    })
  },
})
