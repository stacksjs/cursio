/**
 * Points and badges.
 *
 * Both are worked out from what a Learner has actually done (Lessons
 * completed, Quizzes passed, Courses finished), never stored. There is no
 * ledger to drift from the truth: take a Learner's access away and give it
 * back, reopen a Quiz, delete a Lesson, and the numbers are still right the
 * next time they are read.
 */

import { db } from '@stacksjs/database'

/** What a Learner has done at one Academy. */
export interface LearnerFacts {
  lessons: number
  courses: number
  quizzesPassed: number
  /** Quizzes passed with every point. */
  perfectQuizzes: number
  workPassed: number
}

export const POINTS = { lesson: 10, quiz: 20, work: 30, course: 100 } as const

export function pointsFor(facts: LearnerFacts): number {
  return facts.lessons * POINTS.lesson
    + facts.quizzesPassed * POINTS.quiz
    + facts.workPassed * POINTS.work
    + facts.courses * POINTS.course
}

export interface Badge {
  key: string
  title: string
  /** What earns it, in words a Learner reads. */
  earnedBy: string
  icon: string
}

interface BadgeRule extends Badge {
  earned: (facts: LearnerFacts) => boolean
}

/** Every badge there is, easiest first. The order is the order they are shown in. */
export const badgeRules: readonly BadgeRule[] = [
  { key: 'first-lesson', title: 'First step', earnedBy: 'Complete a lesson', icon: 'i-hugeicons-footprints', earned: facts => facts.lessons >= 1 },
  { key: 'ten-lessons', title: 'Ten down', earnedBy: 'Complete ten lessons', icon: 'i-hugeicons-fire', earned: facts => facts.lessons >= 10 },
  { key: 'first-quiz', title: 'Passed', earnedBy: 'Pass a quiz', icon: 'i-hugeicons-quiz-01', earned: facts => facts.quizzesPassed >= 1 },
  { key: 'perfect-quiz', title: 'Full marks', earnedBy: 'Pass a quiz with every point', icon: 'i-hugeicons-target-02', earned: facts => facts.perfectQuizzes >= 1 },
  { key: 'first-work', title: 'Handed in', earnedBy: 'Pass an assignment', icon: 'i-hugeicons-task-done-01', earned: facts => facts.workPassed >= 1 },
  { key: 'first-course', title: 'Finisher', earnedBy: 'Complete a course', icon: 'i-hugeicons-award-01', earned: facts => facts.courses >= 1 },
  { key: 'three-courses', title: 'Hat trick', earnedBy: 'Complete three courses', icon: 'i-hugeicons-champion', earned: facts => facts.courses >= 3 },
]

export interface Achievements {
  points: number
  badges: Badge[]
  /** The nearest badge not earned yet, or null when they have them all. */
  next: Badge | null
}

function plain(rule: BadgeRule): Badge {
  return { key: rule.key, title: rule.title, earnedBy: rule.earnedBy, icon: rule.icon }
}

export function achievementsFor(facts: LearnerFacts): Achievements {
  const next = badgeRules.find(rule => !rule.earned(facts))
  return {
    points: pointsFor(facts),
    badges: badgeRules.filter(rule => rule.earned(facts)).map(plain),
    next: next ? plain(next) : null,
  }
}

const nothing: LearnerFacts = { lessons: 0, courses: 0, quizzesPassed: 0, perfectQuizzes: 0, workPassed: 0 }

/**
 * What these Learners have done at an Academy. Only Courses that are still
 * published and Enrollments that still stand count: removed access earns
 * nothing while it is removed.
 */
export async function factsOf(academyId: number, userIds: number[]): Promise<Map<number, LearnerFacts>> {
  const result = new Map<number, LearnerFacts>(userIds.map(id => [id, { ...nothing }]))
  if (userIds.length === 0)
    return result

  const courses = await db.selectFrom('courses').select(['id']).where('academy_id', '=', academyId).where('deleted_at', 'is', null).execute() as { id: number }[]
  if (courses.length === 0)
    return result
  const courseIds = courses.map(course => course.id)

  const enrollments = await db.selectFrom('enrollments').select(['id', 'user_id', 'status']).where('course_id', 'in', courseIds).where('user_id', 'in', userIds).execute() as { id: number, user_id: number, status: string }[]
  const standing = enrollments.filter(row => row.status !== 'revoked')
  if (standing.length === 0)
    return result
  const owner = new Map(standing.map(row => [row.id, row.user_id]))
  const enrollmentIds = standing.map(row => row.id)
  const bump = (enrollmentId: number, field: keyof LearnerFacts): void => {
    const facts = result.get(owner.get(enrollmentId) ?? 0)
    if (facts)
      facts[field]++
  }

  for (const row of standing) {
    if (row.status === 'completed')
      bump(row.id, 'courses')
  }

  const done = await db.selectFrom('lesson_progress').select(['enrollment_id']).where('enrollment_id', 'in', enrollmentIds).where('completed_at', 'is not', null).execute() as { enrollment_id: number }[]
  for (const row of done)
    bump(row.enrollment_id, 'lessons')

  // A Quiz counts once however often it was passed; it is perfect if any
  // passing Attempt had every point.
  const attempts = await db.selectFrom('quiz_attempts').select(['quiz_id', 'enrollment_id', 'score_points', 'max_points']).where('enrollment_id', 'in', enrollmentIds).where('status', '=', 'submitted').where('passed', '=', true).execute() as { quiz_id: number, enrollment_id: number, score_points: number, max_points: number }[]
  const passed = new Map<string, { enrollmentId: number, perfect: boolean }>()
  for (const row of attempts) {
    const key = `${row.enrollment_id}:${row.quiz_id}`
    const perfect = row.max_points > 0 && row.score_points >= row.max_points
    passed.set(key, { enrollmentId: row.enrollment_id, perfect: (passed.get(key)?.perfect ?? false) || perfect })
  }
  for (const quiz of passed.values()) {
    bump(quiz.enrollmentId, 'quizzesPassed')
    if (quiz.perfect)
      bump(quiz.enrollmentId, 'perfectQuizzes')
  }

  const work = await db.selectFrom('submissions').select(['enrollment_id']).where('enrollment_id', 'in', enrollmentIds).where('status', '=', 'passed').execute() as { enrollment_id: number }[]
  for (const row of work)
    bump(row.enrollment_id, 'workPassed')

  return result
}

export async function achievementsOf(userId: number, academyId: number): Promise<Achievements> {
  return achievementsFor((await factsOf(academyId, [userId])).get(userId) ?? nothing)
}
