/**
 * toolStages - what each generation actually says while it runs.
 *
 * These strings are the product, not decoration. "Loading..." tells a student
 * nothing; "Checking every answer against your material" tells them what they
 * are paying for. Rules for editing them:
 *
 *   1. Name the REAL work. If the endpoint does not read their notes, do not
 *      claim it does. A narration that lies is worse than a spinner, because
 *      it is a lie the student can eventually catch.
 *   2. Second person, present tense, no ellipses, no em dashes.
 *   3. Three or four stages. Two feels thin, five outruns most requests.
 *   4. The LAST stage is the one left on screen when a request runs long, so
 *      it has to stay true for an extra ten seconds. Make it the slow part.
 *
 * `estimatedMs` is how long the generation usually takes. It only paces the
 * ring: finishing early rushes to 100, finishing late holds at 92. Being wrong
 * is survivable in both directions, so estimate honestly rather than
 * defensively.
 */

const STAGES = {
  quizBurst: {
    estimatedMs: 6000,
    stages: [
      'Reading your course material',
      'Picking the topics worth testing',
      'Writing your questions',
      'Checking every answer',
    ],
  },

  topicDrill: {
    estimatedMs: 6000,
    stages: [
      'Looking up the topic',
      'Finding what usually gets asked',
      'Writing your questions',
      'Checking every answer',
    ],
  },

  cheatSheet: {
    estimatedMs: 9000,
    stages: [
      'Reading everything you uploaded',
      'Ranking topics by exam weight',
      'Cutting it down to what matters',
      'Laying out your one page',
    ],
  },

  brainDump: {
    estimatedMs: 7000,
    stages: [
      'Reading what you wrote',
      'Comparing it against your material',
      'Finding the gaps you missed',
    ],
  },

  teachItBack: {
    estimatedMs: 7000,
    stages: [
      'Reading your explanation',
      'Checking it against the source',
      'Scoring your understanding',
    ],
  },

  examRescue: {
    estimatedMs: 10000,
    stages: [
      'Checking how long you actually have',
      'Ranking every topic by exam weight',
      'Cutting what you cannot finish in time',
      'Building your hour by hour plan',
    ],
  },

  practiceExam: {
    estimatedMs: 14000,
    stages: [
      'Reading your course material',
      'Matching your real exam format',
      'Writing the paper',
      'Building the mark scheme',
    ],
  },

  podcast: {
    estimatedMs: 22000,
    stages: [
      'Reading your notes',
      'Writing the script for both hosts',
      'Recording the voices',
      'Mixing your episode',
    ],
  },

  connections: {
    estimatedMs: 7000,
    stages: [
      'Reading your topics',
      'Finding where they actually connect',
      'Writing the prompts',
    ],
  },

  timeAttack: {
    estimatedMs: 6000,
    stages: [
      'Reading your course material',
      'Picking fourteen fast questions',
      'Checking every answer',
    ],
  },

  essay: {
    estimatedMs: 10000,
    stages: [
      'Reading your prompt',
      'Working out the line of argument',
      'Structuring your sections',
    ],
  },

  diagram: {
    estimatedMs: 9000,
    stages: [
      'Reading the concept',
      'Working out how the parts relate',
      'Drawing it out',
    ],
  },

  problemSolver: {
    estimatedMs: 9000,
    stages: [
      'Reading your problem',
      'Working through it step by step',
      'Checking the result',
    ],
  },

  studyCoach: {
    estimatedMs: 14000,
    stages: [
      'Reading your courses and exam dates',
      'Working backward from your deadlines',
      'Fitting it into the hours you have',
      'Writing your week by week plan',
    ],
  },
}

const FALLBACK = {
  estimatedMs: 8000,
  stages: ['Reading your material', 'Working through it', 'Putting it together'],
}

/** Stage config for a tool. Never throws; unknown tools get honest generic copy. */
export function stagesFor(toolId) {
  return STAGES[toolId] ?? FALLBACK
}

export default stagesFor
