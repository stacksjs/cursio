import { route } from '@stacksjs/router'

/**
 * What Learners use, mounted under `/api/learn`. Reading a catalog or a course
 * outline is public: it is the Academy's shop window. Lesson content and every
 * write sit behind `auth`, and the actions check the Enrollment.
 */
route.get('/{academy}/courses', 'Actions/Learn/CatalogAction')
route.get('/{academy}/courses/{course}', 'Actions/Learn/CourseShowAction')
route.get('/{academy}/courses/{course}/progress', 'Actions/Learn/CourseProgressAction').middleware('auth')
route.post('/{academy}/courses/{course}/enroll', 'Actions/Learn/EnrollAction').middleware('auth')
route.get('/{academy}/courses/{course}/reviews', 'Actions/Learn/ReviewsAction')
route.get('/{academy}/courses/{course}/review', 'Actions/Learn/OwnReviewAction').middleware('auth')
route.post('/{academy}/courses/{course}/review', 'Actions/Learn/SaveReviewAction').middleware('auth')
route.post('/{academy}/courses/{course}/review/withdraw', 'Actions/Learn/WithdrawReviewAction').middleware('auth')
route.get('/lessons/{id}/notes', 'Actions/Learn/NotesAction').middleware('auth')
route.post('/lessons/{id}/notes', 'Actions/Learn/AddNoteAction').middleware('auth')
route.post('/notes/{id}/remove', 'Actions/Learn/RemoveNoteAction').middleware('auth')
route.get('/{academy}/library', 'Actions/Learn/LibraryAction').middleware('auth')
route.get('/{academy}/search', 'Actions/Learn/SearchAction')
route.get('/lessons/{id}/preview', 'Actions/Learn/LessonPreviewAction')
route.post('/lessons/{id}/position', 'Actions/Learn/SavePositionAction').middleware('auth')
route.get('/lessons/{id}', 'Actions/Learn/LessonShowAction').middleware('auth')
route.post('/lessons/{id}/complete', 'Actions/Learn/CompleteLessonAction').middleware('auth')
route.get('/lessons/{id}/quiz', 'Actions/Learn/QuizShowAction').middleware('auth')
route.post('/lessons/{id}/quiz/attempts', 'Actions/Learn/StartAttemptAction').middleware('auth')
route.post('/attempts/{id}/submit', 'Actions/Learn/SubmitAttemptAction').middleware('auth')
route.get('/lessons/{id}/comments', 'Actions/Learn/CommentsAction').middleware('auth')
route.post('/lessons/{id}/comments', 'Actions/Learn/AddCommentAction').middleware('auth')
route.post('/comments/{id}/remove', 'Actions/Learn/RemoveCommentAction').middleware('auth')
route.get('/lessons/{id}/assignment', 'Actions/Learn/AssignmentShowAction').middleware('auth')
route.post('/lessons/{id}/assignment/submit', 'Actions/Learn/SubmitWorkAction').middleware('auth')
