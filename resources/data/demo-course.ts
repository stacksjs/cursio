/**
 * The demo course shown on the marketing site: "Learn Stacks", an outline of
 * the framework Cursio is built on. It is real material, so the preview shows
 * what a course looks like rather than placeholder text. The same outline
 * seeds the demo academy.
 */
export interface DemoLesson {
  id: string
  title: string
  kind: 'video' | 'reading' | 'quiz'
  minutes: number
}

export interface DemoSection {
  title: string
  lessons: DemoLesson[]
}

export const demoCourse = {
  title: 'Learn Stacks',
  instructor: 'The Stacks team',
  sections: [
    {
      title: 'Describe your data',
      lessons: [
        { id: 'models', title: 'Define a model', kind: 'video', minutes: 9 },
        { id: 'migrations', title: 'Generate migrations from models', kind: 'video', minutes: 6 },
        { id: 'relations', title: 'Relationships and traits', kind: 'reading', minutes: 8 },
      ],
    },
    {
      title: 'Serve it',
      lessons: [
        { id: 'actions', title: 'Write an action', kind: 'video', minutes: 7 },
        { id: 'routes', title: 'Routes and middleware', kind: 'reading', minutes: 5 },
        { id: 'check', title: 'Check your understanding', kind: 'quiz', minutes: 4 },
      ],
    },
  ] as DemoSection[],
}

/** Lessons the preview starts with ticked, so the ring is not empty. */
export const demoCompleted = ['models', 'migrations']

/** A real question from the course, used by the quiz preview. */
export const demoQuestion = {
  prompt: 'Which command turns a change in your models into migration SQL?',
  options: [
    { id: 'a', label: 'buddy make:migration' },
    { id: 'b', label: 'buddy generate:migrations' },
    { id: 'c', label: 'buddy migrate:fresh' },
  ],
  correct: 'b',
  explanation: 'It compares your models with the current schema and writes the SQL for the difference.',
}
