/**
 * OnboardingFlow - the orchestrator for Acts 1 through 4.
 *
 * Owns the step index, the directional transitions and every analytics event.
 * The individual steps are dumb: they receive state and callbacks and render
 * one question. All routing lives here.
 *
 *   ACT 1  hook               step 0
 *   ACT 2  the interrogation  steps 1 to 11
 *   ACT 3  the build          10 seconds, real backend work runs underneath
 *   ACT 4  the reveal         the peak
 *
 * NO AUTH ANYWHERE IN HERE. Account creation happens after the reveal, framed
 * as "save your plan". Every gate before the reveal costs 15 to 30% of the
 * funnel, and the user has nothing to lose yet, so they simply leave.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION, SPRING, motionSafe, useReducedMotion } from '../../lib/motion'
import {
  trackStepViewed, trackStepCompleted, trackAbandoned,
} from '../../lib/analytics'
import { useOnboardingState, STEPS, STEP_COUNT, answerForStep } from './useOnboardingState'
import ProgressBar from './ProgressBar'
import ExamCountdown from './ExamCountdown'

import Step01Hook from './steps/Step01Hook'
import Step02School from './steps/Step02School'
import Step03ExamDate from './steps/Step03ExamDate'
import Step04CurrentGrade from './steps/Step04CurrentGrade'
import Step05TargetGrade from './steps/Step05TargetGrade'
import Step06SocialProof from './steps/Step06SocialProof'
import Step07Struggles from './steps/Step07Struggles'
import Step08StudyHours from './steps/Step08StudyHours'
import Step09LearningStyle from './steps/Step09LearningStyle'
import Step10LockedPreview from './steps/Step10LockedPreview'
import Step11StudyTime from './steps/Step11StudyTime'
import Step12Commitment from './steps/Step12Commitment'

import BuildScreen from './BuildScreen'
import RevealScreen from './RevealScreen'

import { T } from '../../theme/tokens'

const STEP_COMPONENTS = [
  Step01Hook, Step02School, Step03ExamDate, Step04CurrentGrade,
  Step05TargetGrade, Step06SocialProof, Step07Struggles, Step08StudyHours,
  Step09LearningStyle, Step10LockedPreview, Step11StudyTime, Step12Commitment,
]

const slideVariants = {
  enter:  (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
}

function BackButton({ onClick, visible }) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go back"
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        border: 'none',
        background: 'transparent',
        color: T.muted,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export default function OnboardingFlow({ onComplete, userId = null }) {
  const { state, setAnswer, setCourse, goTo, recordTiming } = useOnboardingState()
  const [dir, setDir] = useState(1)
  // 'questions' -> 'build' -> 'reveal' -> handed off to the caller
  const [phase, setPhase] = useState('questions')
  const [plan, setPlan] = useState(null)

  const reduced = useReducedMotion()
  const stepEnteredAt = useRef(Date.now())
  const finishedRef = useRef(false)

  const index = state.stepIndex
  const step = STEPS[index]
  const StepComponent = STEP_COMPONENTS[index]

  // ── Analytics ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'questions') return
    stepEnteredAt.current = Date.now()
    trackStepViewed({ step_index: index, step_name: step?.name })
  }, [index, phase, step?.name])

  // Abandonment is the number we actually need to move, so it has to be
  // recorded even when the user closes the tab mid-flow.
  useEffect(() => {
    const onLeave = () => {
      if (finishedRef.current) return
      trackAbandoned({
        last_step_index: state.stepIndex,
        last_step_name: STEPS[state.stepIndex]?.name,
        time_in_flow_ms: state.startedAt ? Date.now() - state.startedAt : null,
        phase,
      })
    }
    window.addEventListener('beforeunload', onLeave)
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [state.stepIndex, state.startedAt, phase])

  // ── Navigation ────────────────────────────────────────────────────────────

  const advance = useCallback(() => {
    const ms = Date.now() - stepEnteredAt.current
    recordTiming(index, ms)
    trackStepCompleted({
      step_index: index,
      step_name: step?.name,
      answer: answerForStep(state, index),
      time_on_step_ms: ms,
    })

    if (index >= STEP_COUNT - 1) {
      setPhase('build')
      return
    }
    setDir(1)
    goTo(index + 1)
  }, [index, state, step?.name, goTo, recordTiming])

  const back = useCallback(() => {
    if (index === 0) return
    setDir(-1)
    goTo(index - 1)
  }, [index, goTo])

  const handleBuilt = useCallback((builtPlan) => {
    setPlan(builtPlan)
    setPhase('reveal')
  }, [])

  const handleRevealCta = useCallback(() => {
    finishedRef.current = true
    onComplete?.({ state, plan })
  }, [onComplete, state, plan])

  const variants = useMemo(() => motionSafe(slideVariants, reduced), [reduced])

  // ── Acts 3 and 4 take the whole screen ────────────────────────────────────

  if (phase === 'build') {
    return (
      <BuildScreen
        state={state}
        userId={userId}
        onDone={handleBuilt}
      />
    )
  }

  if (phase === 'reveal') {
    return (
      <RevealScreen
        state={state}
        plan={plan}
        onContinue={handleRevealCta}
      />
    )
  }

  // ── Act 1 and 2 ───────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: T.bg,
          padding: '14px 20px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 480, margin: '0 auto 10px' }}>
          <BackButton onClick={back} visible={index > 0} />
          <div style={{ flex: 1, minWidth: 0 }} />
          {/* Appears once the exam date exists, which is step 3, and never leaves. */}
          <ExamCountdown examDate={state.examDate} />
        </div>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <ProgressBar stepIndex={index} />
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          padding: '24px 20px 40px',
          overflowX: 'hidden',
        }}
      >
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={index}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduced
              ? { duration: DURATION.micro }
              : { ...SPRING.ui, opacity: { duration: DURATION.standard } }}
            style={{ width: '100%' }}
          >
            {StepComponent ? (
              <StepComponent
                state={state}
                setAnswer={setAnswer}
                setCourse={setCourse}
                onAdvance={advance}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
