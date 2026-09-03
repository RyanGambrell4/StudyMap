import { useEffect, useState } from 'react'
import { T, RADIUS, SANS, SERIF } from '../theme/tokens'

/**
 * FirstPlanGenerating
 *
 * The screen between "I named my course" and the student's first real output.
 *
 * It exists because 63 people added a course in the three weeks after the
 * course gate shipped and 21 of them ever generated anything. The other 42 were
 * handed a working dashboard and asked to decide what to do with it, which is a
 * decision a new user has no basis to make. This removes the decision: the plan
 * for the course they just named is already being built.
 *
 * The stages are labelled after work the request actually does - the plan is
 * built backwards from the exam date, week by week, against their stated study
 * time. They advance on a timer because one HTTP call has no intermediate
 * progress to report, but the last stage does not complete until the response
 * lands, so the screen never claims to have finished ahead of the work. If the
 * call is slow the final label holds rather than the bar filling and waiting.
 */

const STAGES = [
  'Reading your course',
  'Counting the weeks to your exam',
  'Laying out your study sessions',
  'Ordering the topics',
  'Finishing your plan',
]

// Comfortably shorter than a typical response, so the bar is still moving when
// the plan lands rather than parked at the end.
const STAGE_MS = 1400

export default function FirstPlanGenerating({ courseName, examDate, done = false }) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    // Hold on the last stage. Reaching it means the work is taking longer than
    // usual, and inventing a sixth label would be describing work nobody is doing.
    if (stage >= STAGES.length - 1) return
    const t = setTimeout(() => setStage(s => s + 1), STAGE_MS)
    return () => clearTimeout(t)
  }, [stage])

  // Derived, not stored. Writing the finished stage into state from an effect
  // is a second render and an extra source of truth for the same fact.
  const shown = done ? STAGES.length - 1 : stage
  const pct = done ? 100 : Math.round(((stage + 0.5) / STAGES.length) * 100)

  const daysOut = examDate
    ? Math.ceil((new Date(examDate) - new Date()) / 86400000)
    : null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: T.bg,
        fontFamily: SANS, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '32px 20px',
      }}
    >
      <style>{`
        @keyframes fpg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes fpg-sheen {
          from { transform: translateX(-100%); }
          to   { transform: translateX(100%); }
        }
        .fpg-card  { animation: fpg-in 320ms cubic-bezier(.32,.72,0,1) both; }
        .fpg-stage { animation: fpg-in 260ms cubic-bezier(.32,.72,0,1) both; }
        .fpg-sheen { animation: fpg-sheen 1150ms cubic-bezier(.4,0,.6,1) infinite; }
        /* Reduced motion keeps the state changes and drops the travel. The bar
           still advances, because its width is information, not decoration. */
        @media (prefers-reduced-motion: reduce) {
          .fpg-card, .fpg-stage { animation: none; }
          .fpg-sheen { animation: none; opacity: 0; }
        }
      `}</style>

      <div className="fpg-card" style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>

        <h1 style={{
          fontFamily: SERIF, fontSize: 'clamp(21px,2.4vw,25px)', fontWeight: 600,
          letterSpacing: '-0.021em', color: T.text, margin: '0 0 10px', lineHeight: 1.2,
          // Course names run long. Without this, "Organic Chemistry II plan"
          // drops "plan" onto a line of its own.
          textWrap: 'balance',
        }}>
          {courseName ? `Building your ${courseName} plan` : 'Building your study plan'}
        </h1>

        <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: '0 0 28px' }}>
          {daysOut && daysOut > 0
            ? `Working backwards from your exam in ${daysOut} ${daysOut === 1 ? 'day' : 'days'}.`
            : 'Laying out your first few weeks of study sessions.'}
        </p>

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
          padding: '22px 20px',
        }}>
          <div
            key={shown}
            className="fpg-stage"
            style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 16, minHeight: 21 }}
          >
            {STAGES[shown]}
          </div>

          <div style={{
            height: 5, borderRadius: RADIUS.pill, background: '#EFF1F4',
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`, background: T.blue,
              borderRadius: RADIUS.pill,
              transition: 'width 620ms cubic-bezier(.32,.72,0,1)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div className="fpg-sheen" style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)',
              }} />
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: T.dim, margin: '14px 0 0' }}>
          This takes a few seconds. Do not close this tab.
        </p>
      </div>
    </div>
  )
}
