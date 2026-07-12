import { useEffect, useRef, useState, useCallback } from 'react'
import { track } from '../lib/analytics'

/**
 * PrePaywall — the 3-screen value stack that runs before the paywall on a
 * free user's first paywall open of the session.
 *
 *   Step 1 — What you'll get   (outcome-focused benefits, big icons)
 *   Step 2 — Social proof      (star rating + count + rotating quotes)
 *   Step 3 — How the trial works (Today / Day 2 / Day 3 timeline)
 *
 * The last step's CTA advances into the actual PaywallModal — the parent
 * (PaywallModal) mounts this first, then swaps to the plan grid once the
 * user hits Continue on step 3 (or dismisses).
 *
 * Behavior:
 *   - Shown at most once per session (parent tracks via sessionStorage flag).
 *   - Free user, trial not yet used, not on a "hard" Unlimited-only trigger.
 *   - Escape and X and backdrop click all "dismiss" (skip → paywall).
 */

const ACCENT      = '#3B61C4'
const ACCENT_ALT  = '#7C5CFA'
const TEXT        = '#111111'
const MUTED       = '#6B6B6B'
const BORDER      = 'rgba(0,0,0,0.08)'
const BG_CARD     = '#FFFFFF'

const BENEFITS = [
  { icon: '🧠', title: 'AI Study Coach',       body: 'A minute-by-minute plan for your whole semester, built around your real schedule.' },
  { icon: '⚡', title: '100 AI actions/month',  body: 'Cheat sheets, exam rescues, session blueprints, quiz bursts — on demand, all semester.' },
  { icon: '🎯', title: 'Unlimited focus time',  body: 'No 30-minute cap. Lock in for as long as you need, every single day.' },
  { icon: '📚', title: 'Every study tool',      body: 'Flashcards, quizzes, brain dumps, topic drills — auto-generated from your own courses.' },
  { icon: '📈', title: 'Grade Hub',             body: 'Track every assignment, run what-if scenarios, know what you need on your final.' },
]

const QUOTES = [
  { quote: 'finished top of my cohort last semester. I genuinely could not have done it without this', name: 'Danny K.',    detail: 'Pre-med, 3.8 GPA' },
  { quote: 'finally consistent with my studying for the first time ever',                              name: 'Andy G.',     detail: 'University, 2nd year' },
  { quote: 'went from a C to a B+ in Orgo after using Exam Rescue the week before my midterm',         name: 'Priya S.',    detail: 'Chemistry major' },
  { quote: 'the AI study coach actually understands my schedule. worth every penny',                   name: 'Marcus T.',   detail: 'Engineering, 3rd year' },
]

const TIMELINE = [
  {
    day: 'Today',
    color: '#059669',
    title: 'Full access unlocks',
    body: 'Every Pro feature — AI Coach, 100 AI actions, unlimited focus, blueprints, flashcards, quizzes, and Grade Hub. $0 today.',
  },
  {
    day: 'Day 2',
    color: '#F59E0B',
    title: "We'll remind you by email",
    body: "Heads-up that your trial ends tomorrow, so nothing catches you by surprise.",
  },
  {
    day: 'Day 3',
    color: '#3B61C4',
    title: 'Continue for $2.99/wk — or cancel',
    body: "Loving it? Stay on Pro for $2.99/wk. Not for you? One tap to cancel — no charge, no email chase.",
  },
]

export default function PrePaywall({ open, trigger, onContinue, onDismiss }) {
  const [step, setStep]                 = useState(0)
  const [quoteIdx, setQuoteIdx]         = useState(0)
  const openedAtRef                     = useRef(null)
  const trackedStepsRef                 = useRef(new Set())

  // Reset when opened
  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now()
      setStep(0)
      setQuoteIdx(0)
      trackedStepsRef.current = new Set()
      track('prepaywall_opened', { trigger: trigger ?? null })
    }
  }, [open, trigger])

  // Track each step view exactly once per open
  useEffect(() => {
    if (!open) return
    if (trackedStepsRef.current.has(step)) return
    trackedStepsRef.current.add(step)
    track('prepaywall_step_viewed', { step: step + 1, trigger: trigger ?? null })
  }, [open, step, trigger])

  // Rotate quotes on step 2
  useEffect(() => {
    if (!open || step !== 1) return
    const t = setInterval(() => setQuoteIdx(i => (i + 1) % QUOTES.length), 3500)
    return () => clearInterval(t)
  }, [open, step])

  // Escape closes → skips to paywall
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') skip('escape') }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const advance = useCallback(() => {
    if (step < 2) {
      setStep(step + 1)
      return
    }
    // Last step → continue into the real paywall
    const ms = openedAtRef.current ? Date.now() - openedAtRef.current : null
    track('prepaywall_continued', { trigger: trigger ?? null, ms_open: ms })
    onContinue?.()
  }, [step, trigger, onContinue])

  const skip = useCallback((reason) => {
    const ms = openedAtRef.current ? Date.now() - openedAtRef.current : null
    track('prepaywall_dismissed', { trigger: trigger ?? null, ms_open: ms, step_at_skip: step + 1, reason })
    onDismiss?.()
  }, [step, trigger, onDismiss])

  if (!open) return null

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) skip('backdrop') }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
        zIndex: 1050,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '16px', overflowY: 'auto',
      }}
    >
      <style>{`
        @media (max-width: 600px) {
          .pp-modal { padding: 24px 20px !important; border-radius: 16px !important; }
        }
      `}</style>
      <div
        className="pp-modal"
        role="dialog"
        aria-modal="true"
        style={{
          background: BG_CARD, border: `1px solid ${BORDER}`,
          borderRadius: '22px', padding: '32px',
          maxWidth: '540px', width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.14)',
          margin: 'auto', position: 'relative',
        }}
      >
        {/* Close X */}
        <button
          onClick={() => skip('close_button')}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0,0,0,0.05)', border: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9B9B9B', cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Step progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: i === step ? 24 : 6, height: 6, borderRadius: 3,
                background: i <= step ? ACCENT : 'rgba(0,0,0,0.12)',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        {step === 0 && <StepBenefits />}
        {step === 1 && <StepSocial quoteIdx={quoteIdx} setQuoteIdx={setQuoteIdx} />}
        {step === 2 && <StepTrialTimeline />}

        {/* Primary CTA */}
        <button
          onClick={advance}
          style={{
            marginTop: 22,
            width: '100%', padding: '14px',
            background: step === 2
              ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT_ALT})`
              : ACCENT,
            border: 'none', borderRadius: '12px',
            color: '#fff', fontSize: '0.95rem', fontWeight: 800,
            letterSpacing: '-0.2px', cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: step === 2 ? '0 6px 20px rgba(59,97,196,0.28)' : 'none',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {step === 0 && 'Continue →'}
          {step === 1 && 'Continue →'}
          {step === 2 && 'Continue — free for 3 days'}
        </button>

        {step === 2 && (
          <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: '0.72rem', color: '#9B9B9B' }}>
            $0 today · Cancel with one tap · No hidden fees
          </p>
        )}

        {step < 2 && (
          <button
            onClick={() => skip('skip_link')}
            style={{
              display: 'block', margin: '10px auto 0',
              background: 'none', border: 'none',
              color: '#9B9B9B', fontSize: '0.75rem',
              cursor: 'pointer', padding: '4px 10px',
            }}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

function StepBenefits() {
  return (
    <>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#3B61C4', textTransform: 'uppercase', textAlign: 'center' }}>
        What you'll get with Pro
      </p>
      <h2 style={{ margin: '8px 0 6px', fontSize: '1.4rem', fontWeight: 800, color: '#111', letterSpacing: '-0.5px', textAlign: 'center', lineHeight: 1.25 }}>
        Everything you need to actually finish the semester.
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: '#6B6B6B', textAlign: 'center', lineHeight: 1.55 }}>
        One app. Every course. Every exam. Every study tool.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {BENEFITS.map(b => (
          <div key={b.title} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            padding: '12px 14px',
            background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }} aria-hidden>
              {b.icon}
            </div>
            <div>
              <p style={{ margin: '2px 0 3px', fontSize: '0.9rem', fontWeight: 700, color: '#111', letterSpacing: '-0.2px' }}>
                {b.title}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B6B6B', lineHeight: 1.5 }}>
                {b.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function StepSocial({ quoteIdx, setQuoteIdx }) {
  const q = QUOTES[quoteIdx]
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', gap: 3, marginBottom: 8 }}>
          {[1,2,3,4,5].map(s => (
            <svg key={s} width="22" height="22" viewBox="0 0 24 24" fill="#FBBF24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#111', letterSpacing: '-0.8px' }}>
          Trusted by 500+ students
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#6B6B6B' }}>
          Building better study habits every day.
        </p>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #F7F6F3, #FAFAF9)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 14,
        padding: '20px 22px',
        minHeight: 150,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <svg style={{ width: 22, height: 22, color: '#3B61C4', flexShrink: 0, marginTop: 2 }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
          <p style={{ margin: 0, fontSize: '1rem', color: '#111', lineHeight: 1.55, fontStyle: 'italic', fontWeight: 500 }}>
            "{q.quote}"
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#111' }}>{q.name}</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#9B9B9B' }}>{q.detail}</p>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {QUOTES.map((_, i) => (
              <button
                key={i}
                onClick={() => setQuoteIdx(i)}
                aria-label={`Show testimonial ${i + 1}`}
                style={{
                  width: i === quoteIdx ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === quoteIdx ? '#3B61C4' : 'rgba(0,0,0,0.12)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'width 0.2s, background 0.2s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function StepTrialTimeline() {
  return (
    <>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#059669', textTransform: 'uppercase', textAlign: 'center' }}>
        How your 3-day trial works
      </p>
      <h2 style={{ margin: '8px 0 6px', fontSize: '1.4rem', fontWeight: 800, color: '#111', letterSpacing: '-0.5px', textAlign: 'center', lineHeight: 1.25 }}>
        Full access. Zero pressure.
      </h2>
      <p style={{ margin: '0 0 22px', fontSize: '0.9rem', color: '#6B6B6B', textAlign: 'center', lineHeight: 1.55 }}>
        Here's exactly what to expect over the next 3 days.
      </p>

      <div style={{ position: 'relative', paddingLeft: 30 }}>
        {/* Vertical rail */}
        <div style={{
          position: 'absolute', left: 11, top: 8, bottom: 8,
          width: 2, background: 'linear-gradient(180deg, #10B981, #F59E0B, #3B61C4)',
          borderRadius: 2, opacity: 0.35,
        }} />
        {TIMELINE.map(step => (
          <div key={step.day} style={{ position: 'relative', marginBottom: 18 }}>
            <div style={{
              position: 'absolute', left: -30, top: 3,
              width: 22, height: 22, borderRadius: '50%',
              background: '#fff', border: `2.5px solid ${step.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: step.color }} />
            </div>
            <p style={{
              margin: '0 0 4px', fontSize: '0.68rem', fontWeight: 800,
              color: step.color, textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              {step.day}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#111', letterSpacing: '-0.2px' }}>
              {step.title}
            </p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6B6B6B', lineHeight: 1.55 }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
