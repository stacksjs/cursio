import { route } from '@stacksjs/router'

/**
 * What Learners use, mounted under `/api/learn`. Reading a catalog or a course
 * outline is public: it is the Academy's shop window. Lesson content and every
 * write sit behind `auth`, and the actions check the Enrollment.
 */
route.get('/{academy}/courses', 'Actions/Learn/CatalogAction')
route.get('/{academy}/courses/{course}', 'Actions/Learn/CourseShowAction')
route.post('/{academy}/courses/{course}/enroll', 'Actions/Learn/EnrollAction').middleware('auth')
route.get('/lessons/{id}', 'Actions/Learn/LessonShowAction').middleware('auth')
route.post('/lessons/{id}/complete', 'Actions/Learn/CompleteLessonAction').middleware('auth')
