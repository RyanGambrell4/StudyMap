import { useState, useMemo, useEffect } from 'react'
import BrainDumpModal from './BrainDumpModal'
import QuickQuizBurst from './QuickQuizBurst'
import { hydrateCourseContext } from '../lib/courseContext'
import { pickSmartCourse, pickSmartTopic } from '../lib/smartDefault'
import { getMastery } from '../lib/masteryStore'
import { track } from '../lib/analytics'

// SessionBundle — one decision, complete flow. Sequences Brain Dump →
// Quiz Burst → Wrap on a smart-picked weak topic so the student doesn't have
// to piece a study session together themselves. This is the highest-signal
// "the app knows me" moment: one tap, 15-20 min later they've closed a real gap.
//
// Steps:
//   1. Intro — confirms course + topic, one big "Start" button
//   2. Brain Dump — 60s dump on the topic
//   3. Quiz Burst — 5-Q quiz on the same topic, auto-started
//   4. Wrap — mastery delta, cards added, "do it again tomorrow?"

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  green: '#16A34A', accent: '#E8531A', blue: '#3B61C4',
}

export default function SessionBundle({
  courses, userId, onClose, onShowPaywall,
  learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [],
}) {
  const smartCourse = useMemo(() => pickSmartCourse(courses), [courses])
  const courseIdx = smartCourse.index
  const course = courses[courseIdx] ?? null

  const smart = useMemo(() => {
    if (!course) return null
    const ctx = hydrateCourseContext(course, { firstName, yearLevel, learningStyle, schoolType, assignments })
    return pickSmartTopic(course, ctx)
  }, [courseIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const topic = smart?.topic ?? course?.name ?? null

  // Snapshot mastery on this topic BEFORE the bundle so the wrap screen can
  // show a real delta.
  const [preMasteryScore, setPreMasteryScore] = useState(null)
  useEffect(() => {
    if (!topic) return
    const m = getMastery(topic, course?.id ?? null)
    setPreMasteryScore(m?.score ?? null)
    track('session_bundle_started', { courseName: course?.name, topic, reason: smart?.reason })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic])

  const [step, setStep] = useState('intro') // 'intro' | 'dump' | 'quiz' | 'wrap'
  const [cardsAddedTotal, setCardsAddedTotal] = useState(0)

  // Listen for deck additions from either sub-tool so wrap can tally them.
  useEffect(() => {
    const handler = (e) => setCardsAddedTotal(prev => prev + (e.detail?.added ?? 0))
    window.addEventListener('studyedge:deck-updated', handler)
    return () => window.removeEventListener('studyedge:deck-updated', handler)
  }, [])

  if (!course || !topic) {
    return (
      <ShellModal onClose={onClose}>
        <div style={{ padding: 32, textAlign: 'center', color: D.textMuted }}>
          Add a course first to start a study session.
        </div>
      </ShellModal>
    )
  }

  // ── Step 1: Intro ──────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <ShellModal onClose={onClose} title="Study Session · 15 min">
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: D.textDim, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
            Picked just for you
          </div>
          <div style={{ padding: '20px', background: `linear-gradient(135deg, ${D.accent}0F 0%, ${D.accent}05 100%)`, border: `1px solid ${D.accent}33`, borderRadius: 14, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: course.color?.dot ?? D.accent }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: D.textMuted }}>{course.name}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: D.text, marginBottom: 4, letterSpacing: -0.3 }}>
              Close the gap on {topic}
            </div>
            <div style={{ fontSize: 12.5, color: D.textMuted, marginBottom: 4 }}>
              {smart?.reason}
              {preMasteryScore != null ? ` · current mastery ${preMasteryScore}/100` : ''}
            </div>
          </div>

          <ol style={{ margin: '0 0 20px', padding: '0 0 0 20px', color: D.text, fontSize: 13.5, lineHeight: 1.65 }}>
            <li><strong>60s brain dump</strong> — spill everything you know about {topic}</li>
            <li><strong>5 questions</strong> — targeted quiz, harder if you crushed the dump</li>
            <li><strong>Wrap</strong> — what you moved, what to hit next</li>
          </ol>

          <button
            onClick={() => setStep('dump')}
            style={{ width: '100%', padding: '14px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 3px 12px rgba(232,83,26,0.35)` }}
          >
            Start your 15-min session →
          </button>
          <button
            onClick={onClose}
            style={{ marginTop: 8, width: '100%', padding: '8px', fontSize: 12.5, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
          >
            Not now
          </button>
        </div>
      </ShellModal>
    )
  }

  // ── Step 2: Brain Dump ─────────────────────────────────────────────────────
  // onClose truly closes the whole bundle so the X-button matches the
  // student's expectation. Advancing to the next step happens when the
  // Brain Dump completes (via onDrillGaps or its own done state) — the
  // "Next up" button on the result screen forwards them into the quiz.
  if (step === 'dump') {
    return (
      <BundleStepFrame currentStep={2} onSkip={() => setStep('quiz')}>
        <BrainDumpModal
          courses={courses}
          userId={userId}
          initialTopic={topic}
          initialCourseIdx={courseIdx}
          onClose={onClose}
          onShowPaywall={onShowPaywall}
          onDrillGaps={() => setStep('quiz')}
          learningStyle={learningStyle}
          yearLevel={yearLevel}
          firstName={firstName}
          schoolType={schoolType}
          assignments={assignments}
        />
      </BundleStepFrame>
    )
  }

  // ── Step 3: Quiz Burst ─────────────────────────────────────────────────────
  if (step === 'quiz') {
    return (
      <BundleStepFrame currentStep={3} onSkip={() => setStep('wrap')}>
        <QuickQuizBurst
          courses={courses}
          onClose={onClose}
          onShowPaywall={onShowPaywall}
          initialCourseIdx={courseIdx}
          initialTopic={topic}
          autoStart={true}
          learningStyle={learningStyle}
          yearLevel={yearLevel}
          firstName={firstName}
          schoolType={schoolType}
          assignments={assignments}
        />
      </BundleStepFrame>
    )
  }

  // ── Step 4: Wrap ───────────────────────────────────────────────────────────
  const postMastery = getMastery(topic, course?.id ?? null)?.score ?? preMasteryScore
  const delta = (postMastery ?? 0) - (preMasteryScore ?? 0)
  return (
    <ShellModal onClose={onClose} title="Session complete">
      <div style={{ padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 8 }}>{delta >= 10 ? '🚀' : delta > 0 ? '📈' : '🎯'}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: -0.3, marginBottom: 6 }}>
          You worked {topic} for 15 min.
        </div>
        <div style={{ fontSize: 13.5, color: D.textMuted, marginBottom: 22, lineHeight: 1.55 }}>
          {preMasteryScore != null && postMastery != null
            ? <>Mastery on {topic}: <strong style={{ color: D.text }}>{preMasteryScore} → {postMastery}</strong> ({delta >= 0 ? '+' : ''}{delta})</>
            : <>Mastery on {topic} now at <strong style={{ color: D.text }}>{postMastery ?? '?'}/100</strong></>
          }
          {cardsAddedTotal > 0 && <> · {cardsAddedTotal} card{cardsAddedTotal === 1 ? '' : 's'} added to your review deck</>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { setStep('intro'); setCardsAddedTotal(0) }}
            style={{ width: '100%', padding: '13px', background: D.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 3px 12px rgba(232,83,26,0.35)` }}
          >
            Do another 15-min session →
          </button>
          <button
            onClick={onClose}
            style={{ padding: '11px', background: 'none', border: `1.5px solid ${D.border}`, borderRadius: 10, color: D.textMuted, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            I'm done for now
          </button>
        </div>
      </div>
    </ShellModal>
  )
}

// ── Shells ────────────────────────────────────────────────────────────────────

function ShellModal({ title, onClose, children }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Study Session" style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden', animation: 'sb-in 260ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <style>{`@keyframes sb-in{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
        {title && (
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: D.text }}>{title}</div>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// A visual progress rail rendered on top of the child modal so the student
// knows they're inside a bundle. Includes a "Skip step" affordance because
// the sub-modal's X-button truly closes the whole bundle now (fixes the
// prior UX trap where X = advance).
function BundleStepFrame({ currentStep, onSkip, children }) {
  return (
    <>
      {children}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 600, padding: '8px 12px 8px 16px',
        background: '#111111EE', color: '#fff', borderRadius: 999,
        fontSize: 12, fontWeight: 700, letterSpacing: '0.03em',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
      }}>
        <span style={{ opacity: 0.7, textTransform: 'uppercase' }}>Session</span>
        <span>Step {currentStep} of 3</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[1, 2, 3].map(n => (
            <span key={n} style={{
              width: 12, height: 3, borderRadius: 2,
              background: n <= currentStep ? '#E8531A' : 'rgba(255,255,255,0.25)',
            }} />
          ))}
        </div>
        {onSkip && (
          <button
            onClick={onSkip}
            style={{ marginLeft: 4, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em' }}
          >
            SKIP →
          </button>
        )}
      </div>
    </>
  )
}
