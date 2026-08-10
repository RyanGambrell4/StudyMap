/**
 * useOnboardingState - the full answer object for the dopamine onboarding flow.
 *
 * Persisted to localStorage on every change under a VERSIONED key, so a refresh
 * or an accidental back-navigation mid-flow resumes exactly where it left off,
 * answers intact. That alone recovers a meaningful slice of the funnel: the
 * flow is 150 to 210 seconds long and a reload without resume loses all of it.
 *
 * The persisted payload includes `stepIndex` because "resume where you left
 * off" is a stated acceptance criterion, not just "keep the answers".
 *
 * No auth is involved anywhere in here. Acts 1 through 4 run fully anonymous.
 */

import { useReducer, useEffect, useMemo, useCallback } from 'react'

export const ONBOARDING_VERSION = 1
const STORAGE_KEY = `studyedge_onboarding_v${ONBOARDING_VERSION}`

/**
 * Step metadata. `name` is the analytics identifier and must stay in lockstep
 * with iOS so the two funnels are comparable. Do not reorder without changing
 * both platforms; the brief is explicit that divergence makes results unreadable.
 */
export const STEPS = [
  { key: 'hook',           name: 'hook',           question: true  },
  { key: 'school',         name: 'school',         question: true  },
  { key: 'examDate',       name: 'exam_date',      question: true  },
  { key: 'currentGrade',   name: 'current_grade',  question: true  },
  { key: 'targetGrade',    name: 'target_grade',   question: true  },
  { key: 'socialProof',    name: 'social_proof',   question: false },
  { key: 'struggles',      name: 'struggles',      question: true  },
  { key: 'studyHours',     name: 'study_hours',    question: true  },
  { key: 'learningStyles', name: 'learning_style', question: true  },
  { key: 'lockedPreview',  name: 'locked_preview', question: false },
  { key: 'studyTime',      name: 'study_time',     question: true  },
  { key: 'commitment',     name: 'commitment',     question: true  },
]

export const STEP_COUNT = STEPS.length

const INITIAL = {
  version: ONBOARDING_VERSION,
  stepIndex: 0,
  course: { code: null, name: null, id: null },
  school: null,
  examDate: null,          // ISO yyyy-mm-dd
  currentGrade: null,      // 'A' | 'B' | 'C' | 'D' | 'unsure'
  targetGrade: null,       // 'A' | 'B' | 'C' | 'pass'
  struggles: [],
  studyHours: 4,
  learningStyles: [],
  studyTime: null,         // 'morning' | 'afternoon' | 'night' | 'varies'
  commitment: null,        // 'high' | 'medium' | 'low'
  startedAt: null,
  stepTimings: {},         // { [stepIndex]: ms }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // A version bump invalidates the old shape rather than trying to migrate a
    // half-finished funnel. Losing one in-flight session beats rendering a
    // step against answers it does not understand.
    if (!parsed || parsed.version !== ONBOARDING_VERSION) return null
    return { ...INITIAL, ...parsed, course: { ...INITIAL.course, ...(parsed.course ?? {}) } }
  } catch {
    return null
  }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* private mode, run in memory */ }
}

export function clearOnboardingState() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

function reducer(state, action) {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: action.value }

    case 'setCourse':
      return { ...state, course: { ...state.course, ...action.value } }

    case 'toggleMulti': {
      const list = state[action.key] ?? []
      const next = list.includes(action.value)
        ? list.filter((v) => v !== action.value)
        : [...list, action.value]
      return { ...state, [action.key]: next }
    }

    case 'goto':
      return { ...state, stepIndex: Math.max(0, Math.min(STEP_COUNT - 1, action.index)) }

    case 'recordTiming':
      return { ...state, stepTimings: { ...state.stepTimings, [action.index]: action.ms } }

    case 'start':
      return state.startedAt ? state : { ...state, startedAt: Date.now() }

    case 'reset':
      return { ...INITIAL, startedAt: Date.now() }

    default:
      return state
  }
}

/** Lazy initialiser so storage is read once, not on every render. */
function init() {
  const restored = load()
  if (restored) return restored
  return { ...INITIAL, startedAt: Date.now() }
}

export function useOnboardingState() {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  // Persist on every change. The flow is short enough that the write cost is
  // irrelevant next to the funnel value of surviving a reload.
  useEffect(() => { save(state) }, [state])

  const setAnswer  = useCallback((key, value) => dispatch({ type: 'set', key, value }), [])
  const setCourse  = useCallback((value) => dispatch({ type: 'setCourse', value }), [])
  const toggleMulti = useCallback((key, value) => dispatch({ type: 'toggleMulti', key, value }), [])
  const goTo       = useCallback((index) => dispatch({ type: 'goto', index }), [])
  const recordTiming = useCallback((index, ms) => dispatch({ type: 'recordTiming', index, ms }), [])
  const reset      = useCallback(() => { clearOnboardingState(); dispatch({ type: 'reset' }) }, [])

  return useMemo(
    () => ({ state, dispatch, setAnswer, setCourse, toggleMulti, goTo, recordTiming, reset }),
    [state, setAnswer, setCourse, toggleMulti, goTo, recordTiming, reset],
  )
}

/**
 * Whether a step has enough of an answer to advance. Interstitials are always
 * satisfied; `school` is deliberately skippable per the brief.
 */
export function isStepAnswered(state, index) {
  switch (STEPS[index]?.key) {
    case 'hook':           return !!state.course?.name
    case 'school':         return true
    case 'examDate':       return !!state.examDate
    case 'currentGrade':   return !!state.currentGrade
    case 'targetGrade':    return !!state.targetGrade
    case 'socialProof':    return true
    case 'struggles':      return (state.struggles?.length ?? 0) >= 1
    case 'studyHours':     return typeof state.studyHours === 'number'
    case 'learningStyles': return (state.learningStyles?.length ?? 0) >= 1
    case 'lockedPreview':  return true
    case 'studyTime':      return !!state.studyTime
    case 'commitment':     return !!state.commitment
    default:               return false
  }
}

/** Answer value for a step, shaped for the `onboarding_step_completed` event. */
export function answerForStep(state, index) {
  const key = STEPS[index]?.key
  if (!key) return null
  if (key === 'hook') return state.course?.name ?? null
  return state[key] ?? null
}
