import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academyBySlug } from '../../Support/academies'
import { outlineOf, publishedCourse } from '../../Support/courses'

/**
 * Public: no auth middleware runs on this route, so it never knows who is
 * asking and says nothing about enrollment. A signed-in Learner's own state
 * comes from CourseProgressAction.
 */
export default new Action({
  name: 'LearnCourseShow',
  description: 'A published course and its outline',
  method: 'GET',

  async handle(request: RequestInstance) {
    const academy = await academyBySlug(String(request.getParam('academy') ?? ''))
    const course = academy ? await publishedCourse(academy.id, String(request.getParam('course') ?? '')) : null
    if (!academy || !course)
      return response.notFound('Course not found')

    return response.json({
      academy: { name: academy.name, slug: academy.slug, tagline: academy.tagline, vocabulary: academy.vocabulary },
      course: { id: course.id, title: course.title, slug: course.slug, summary: course.summary, level: course.level, topic: course.topic },
      outline: await outlineOf(course.id),
    })
  },
})
