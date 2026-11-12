import { route } from '@stacksjs/router'

/**
 * The studio: what an Academy's staff use to build it. Mounted under
 * `/api/studio` and behind `auth` at the registry (app/Routes.ts), so a route
 * added here later cannot be published unauthenticated by omission. Each
 * action then resolves the caller's own Academy.
 */
route.get('/', 'Actions/Studio/StudioOverviewAction')
route.post('/academies', 'Actions/Studio/CreateAcademyAction')
route.patch('/academy', 'Actions/Studio/UpdateAcademyAction')
route.post('/courses', 'Actions/Studio/CreateCourseAction')
route.get('/courses/{id}', 'Actions/Studio/CourseOutlineAction')
route.post('/courses/{id}/sections', 'Actions/Studio/AddSectionAction')
route.post('/courses/{id}/lessons', 'Actions/Studio/AddLessonAction')
route.post('/courses/{id}/publish', 'Actions/Studio/PublishCourseAction')
route.patch('/courses/{id}', 'Actions/Studio/UpdateCourseAction')
route.post('/courses/{id}/reorder', 'Actions/Studio/ReorderAction')
route.patch('/courses/{id}/sections/{section}', 'Actions/Studio/UpdateSectionAction')
route.delete('/courses/{id}/sections/{section}', 'Actions/Studio/DeleteSectionAction')
route.patch('/courses/{id}/lessons/{lesson}', 'Actions/Studio/UpdateLessonAction')
route.delete('/courses/{id}/lessons/{lesson}', 'Actions/Studio/DeleteLessonAction')
route.get('/courses/{id}/lessons/{lesson}/quiz', 'Actions/Studio/QuizShowAction')
route.patch('/courses/{id}/lessons/{lesson}/quiz', 'Actions/Studio/UpdateQuizAction')
route.post('/courses/{id}/lessons/{lesson}/quiz/questions', 'Actions/Studio/SaveQuestionAction')
route.post('/courses/{id}/lessons/{lesson}/quiz/reorder', 'Actions/Studio/ReorderQuestionsAction')
route.patch('/courses/{id}/lessons/{lesson}/quiz/questions/{question}', 'Actions/Studio/SaveQuestionAction')
route.delete('/courses/{id}/lessons/{lesson}/quiz/questions/{question}', 'Actions/Studio/DeleteQuestionAction')
route.post('/courses/{id}/lessons/{lesson}/quiz/reopen', 'Actions/Studio/ReopenQuizAction')
route.get('/courses/{id}/gradebook', 'Actions/Studio/GradebookAction')
route.post('/courses/{id}/enrollments/{enrollment}/access', 'Actions/Studio/SetAccessAction')
route.get('/courses/{id}/lessons/{lesson}/assignment', 'Actions/Studio/AssignmentShowAction')
route.patch('/courses/{id}/lessons/{lesson}/assignment', 'Actions/Studio/UpdateAssignmentAction')
route.get('/courses/{id}/submissions', 'Actions/Studio/SubmissionsAction')
route.post('/courses/{id}/submissions/{submission}/mark', 'Actions/Studio/MarkSubmissionAction')
