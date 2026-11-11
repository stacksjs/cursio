import { route } from '@stacksjs/router'

/**
 * The studio: what an Academy's staff use to build it. Mounted under
 * `/api/studio` and behind `auth` at the registry (app/Routes.ts), so a route
 * added here later cannot be published unauthenticated by omission. Each
 * action then resolves the caller's own Academy.
 */
route.get('/', 'Actions/Studio/StudioOverviewAction')
route.post('/academies', 'Actions/Studio/CreateAcademyAction')
route.post('/courses', 'Actions/Studio/CreateCourseAction')
route.get('/courses/{id}', 'Actions/Studio/CourseOutlineAction')
route.post('/courses/{id}/sections', 'Actions/Studio/AddSectionAction')
route.post('/courses/{id}/lessons', 'Actions/Studio/AddLessonAction')
route.post('/courses/{id}/publish', 'Actions/Studio/PublishCourseAction')
