import { useState } from 'react'
import { createCheckoutSession } from '../lib/subscription'

// ── Options ───────────────────────────────────────────────────────────────────
const STYLE_OPTIONS = [
  {
    value: 'visual',
    label: 'Visual',
    desc: 'You think in diagrams. Color-coding, flowcharts, and mind maps make complex ideas click. If you can see it, you can learn it.',
  },
  {
    value: 'reading',
    label: 'Reading & Writing',
    desc: 'You process through text. Rewriting notes, summarizing chapters, and annotating readings are how ideas stick for you.',
  },
  {
    value: 'practice',
    label: 'Practice-Based',
    desc: 'You learn by doing. Flashcards, past exams, and problem sets are your best tools. Repetition and reps build your mastery.',
  },
]

const TIME_ICONS = {
  Morning: (
    <svg style={{ width: '1.75rem', height: '1.75rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Afternoon: (
    <svg style={{ width: '1.75rem', height: '1.75rem' }} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
  ),
  Evening: (
    <svg style={{ width: '1.75rem', height: '1.75rem' }} viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  ),
}

const TIME_OPTIONS = [
  { value: 'Morning',   label: 'Morning',   desc: 'Sharpest before the day gets noisy. Early sessions, clear head.' },
  { value: 'Afternoon', label: 'Afternoon', desc: 'Post-lunch and fully awake. You hit your stride after noon.' },
  { value: 'Evening',   label: 'Evening',   desc: 'Night owl energy. When the world quiets down, you focus.' },
]

const SCHOOL_OPTIONS = [
  { key: 'hs',   label: 'High School',       desc: 'AP classes, finals week, and juggling it all before graduation.' },
  { key: 'uni',  label: 'University',        desc: 'Lectures, labs, deadlines, and somehow a social life too.' },
  { key: 'exam', label: 'Professional Exam', desc: 'MCAT, LSAT, CPA, Bar, GRE, GMAT — a high-stakes certification or licensing exam.' },
]

const HS_YEARS = [
  { value: 'Freshman',  desc: 'Just getting started' },
  { value: 'Sophomore', desc: 'Getting the hang of it' },
  { value: 'Junior',    desc: 'Peak grind mode' },
  { value: 'Senior',    desc: 'Finishing strong' },
]

const UNI_YEARS = [
  { value: '1st Year',  desc: 'New campus, new everything' },
  { value: '2nd Year',  desc: 'Figuring it all out' },
  { value: '3rd Year',  desc: 'Deeper work, higher stakes' },
  { value: '4th Year+', desc: 'Endgame mode' },
]

const EXAM_TIMELINES = [
  { value: '1-3 months',  desc: 'Final push, test is close' },
  { value: '3-6 months',  desc: 'Building momentum' },
  { value: '6-12 months', desc: 'Long game, structured prep' },
  { value: '1 year+',     desc: 'Starting early, building deep' },
]

const SPLASH_CARDS = [
  {
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    label: 'Session Blueprint',
    desc: 'Your session planned before you start',
  },
  {
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Focus Mode',
    desc: 'Timed blocks that keep you locked in',
  },
  {
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    label: 'Streak Tracking',
    desc: 'Build the habit, ace the semester',
  },
]

// ── Splash screen ──────────────────────────────────────────────────────────────
function SplashScreen({ onNext }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F7F6F3',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'contain' }} />
          <span style={{ color: '#1A1A1A', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.4px' }}>StudyEdge AI</span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 2.6rem)',
          fontWeight: 700,
          color: '#1A1A1A',
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          marginBottom: 16,
          fontFamily: "'Cormorant Garamond', Georgia, serif",
        }}>
          Your study plan,<br />
          <em style={{ fontStyle: 'italic', color: '#3B61C4' }}>built around your goals.</em>
        </h1>

        {/* Subtext */}
        <p style={{ color: '#6B6B6B', fontSize: '1rem', lineHeight: 1.6, marginBottom: 40 }}>
          Tell us what you're studying. We'll build your plan around your timeline and goals.
        </p>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 36 }}>
          {SPLASH_CARDS.map(card => (
            <div
              key={card.label}
              style={{
                backgroundColor: '#fff',
                border: '1px solid rgba(0,0,0,0.07)',
                borderRadius: 14,
                padding: '16px 12px',
                textAlign: 'left',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{
                color: '#3B61C4', marginBottom: 10,
                width: 32, height: 32,
                backgroundColor: 'rgba(59,97,196,0.08)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {card.icon}
              </div>
              <p style={{ color: '#1A1A1A', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4, letterSpacing: '-0.1px' }}>
                {card.label}
              </p>
              <p style={{ color: '#9B9B9B', fontSize: '0.73rem', lineHeight: 1.45 }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onNext}
          style={{
            width: '100%', padding: '15px',
            backgroundColor: '#3B61C4', border: 'none',
            borderRadius: 12, color: '#fff',
            fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700,
            cursor: 'pointer', letterSpacing: '-0.2px', marginBottom: 12,
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2D4FA8'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3B61C4'}
        >
          Let's go
        </button>

        <p style={{ color: '#9B9B9B', fontSize: '0.8rem' }}>
          Free to start · No credit card required
        </p>

      </div>
    </div>
  )
}

// ── Animation wrapper ──────────────────────────────────────────────────────────
function StepWrap({ children, animKey, dir }) {
  return (
    <div key={animKey} className={dir >= 0 ? 'slide-in' : 'slide-in-back'} style={{ willChange: 'opacity, transform' }}>
      {children}
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i + 1 <= current
        return (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 999, overflow: 'hidden',
            backgroundColor: 'rgba(0,0,0,0.07)',
          }}>
            <div style={{
              height: '100%',
              width: filled ? '100%' : '0%',
              borderRadius: 999,
              backgroundColor: '#3B61C4',
              transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>
        )
      })}
    </div>
  )
}

// ── Page shell ─────────────────────────────────────────────────────────────────
function Page({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F7F6F3',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {children}
      </div>
    </div>
  )
}

// ── Buttons ────────────────────────────────────────────────────────────────────
function ContinueBtn({ onClick, disabled, label = 'Continue' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '14px',
        backgroundColor: disabled ? 'rgba(59,97,196,0.15)' : '#3B61C4',
        border: 'none', borderRadius: 12,
        color: disabled ? 'rgba(59,97,196,0.4)' : '#fff',
        fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = '#2D4FA8' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.backgroundColor = disabled ? 'rgba(59,97,196,0.15)' : '#3B61C4' }}
    >
      {label}
    </button>
  )
}

function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 20px',
        backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.10)',
        borderRadius: 12, color: '#6B6B6B',
        fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 600,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0efed'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
    >
      Back
    </button>
  )
}

// ── Option card ────────────────────────────────────────────────────────────────
function OptionCard({ selected, onClick, children, style = {} }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        backgroundColor: selected ? 'rgba(59,97,196,0.06)' : hovered ? '#fafaf8' : '#fff',
        border: selected ? '1.5px solid rgba(59,97,196,0.4)' : '1px solid rgba(0,0,0,0.08)',
        borderRadius: 14,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        fontFamily: 'inherit',
        textAlign: 'left',
        WebkitAppearance: 'none',
        appearance: 'none',
        boxShadow: selected ? '0 0 0 3px rgba(59,97,196,0.08)' : hovered ? '0 2px 8px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
        ...style,
      }}
    >
      {children}
      {selected && (
        <div className="ob-check-pop" style={{
          position: 'absolute', top: 10, right: 10,
          width: 20, height: 20, borderRadius: '50%',
          backgroundColor: '#3B61C4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete, userEmail, userId }) {
  const [step, setStep]       = useState(1)
  const [animKey, setAnimKey] = useState(0)
  const [animDir, setAnimDir] = useState(1)

  const [schoolType, setSchoolType]         = useState(null)
  const [yearLevel, setYearLevel]           = useState(null)
  const [learningStyle, setLearningStyle]   = useState(null)
  const [preferredTime, setPreferredTime]   = useState(null)

  const goTo = (next, dir = 1) => {
    setAnimDir(dir)
    setAnimKey(k => k + 1)
    setStep(next)
    window.scrollTo(0, 0)
  }

  // ── Step 1: Splash ───────────────────────────────────────────────────────────
  if (step === 1) return <SplashScreen onNext={() => goTo(2)} />

  // ── Step 2: School level ─────────────────────────────────────────────────────
  if (step === 2) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={1} total={3} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          Where are you studying?
        </h2>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.5 }}>
          We'll personalize your study plan for your level and workload.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {SCHOOL_OPTIONS.map(({ key, label, desc }) => (
            <OptionCard
              key={key}
              selected={schoolType === key}
              onClick={() => { setSchoolType(key); setYearLevel(null) }}
              style={{ padding: '20px 16px', width: '100%', ...(key === 'exam' ? { gridColumn: 'span 2' } : {}) }}
            >
              <p style={{ color: '#1A1A1A', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 5 }}>{label}</p>
              <p style={{ color: '#9B9B9B', fontSize: '0.78rem', lineHeight: 1.45 }}>{desc}</p>
            </OptionCard>
          ))}
        </div>

        {schoolType && (
          <div className="ob-year-in" style={{ marginBottom: 24 }}>
            <p style={{ color: '#9B9B9B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              {schoolType === 'exam' ? 'How long until your exam?' : 'What year are you in?'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(schoolType === 'hs' ? HS_YEARS : schoolType === 'exam' ? EXAM_TIMELINES : UNI_YEARS).map(({ value, desc }) => (
                <OptionCard
                  key={value}
                  selected={yearLevel === value}
                  onClick={() => setYearLevel(value)}
                  style={{ padding: '14px 16px', width: '100%' }}
                >
                  <p style={{ color: '#1A1A1A', fontSize: '0.88rem', fontWeight: 700, marginBottom: 3 }}>{value}</p>
                  <p style={{ color: '#9B9B9B', fontSize: '0.75rem' }}>{desc}</p>
                </OptionCard>
              ))}
            </div>
          </div>
        )}

        <ContinueBtn onClick={() => goTo(3)} disabled={!yearLevel} />
      </StepWrap>
    </Page>
  )

  // ── Step 3: Learning style ───────────────────────────────────────────────────
  const STYLE_ACCENTS = { visual: '#3B61C4', reading: '#8b5cf6', practice: '#059669' }

  if (step === 3) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={2} total={3} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          How do you learn best?
        </h2>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.5 }}>
          Pick the style that sounds most like you, and we'll build sessions around it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {STYLE_OPTIONS.map(({ value, label, desc }) => (
            <OptionCard
              key={value}
              selected={learningStyle === value}
              onClick={() => setLearningStyle(value)}
              style={{ padding: 0, width: '100%', display: 'flex', overflow: 'hidden' }}
            >
              <div style={{
                width: 4, flexShrink: 0,
                backgroundColor: learningStyle === value ? STYLE_ACCENTS[value] : 'rgba(0,0,0,0.06)',
                transition: 'background 0.2s',
              }} />
              <div style={{ padding: '16px 18px 16px 16px', flex: 1 }}>
                <p style={{ color: '#1A1A1A', fontSize: '0.95rem', fontWeight: 700, marginBottom: 5, letterSpacing: '-0.2px' }}>{label}</p>
                <p style={{ color: '#6B6B6B', fontSize: '0.82rem', lineHeight: 1.55 }}>{desc}</p>
              </div>
            </OptionCard>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <BackBtn onClick={() => goTo(2, -1)} />
          <ContinueBtn onClick={() => goTo(4)} disabled={!learningStyle} />
        </div>
      </StepWrap>
    </Page>
  )

  // ── Step 4: Study time preference ───────────────────────────────────────────
  if (step === 4) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={3} total={4} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          When do you do your best work?
        </h2>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.5 }}>
          We'll schedule your sessions when your focus is at its peak.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
          {TIME_OPTIONS.map(({ value, label, desc }) => (
            <OptionCard
              key={value}
              selected={preferredTime === value}
              onClick={() => setPreferredTime(value)}
              style={{ padding: '22px 12px 18px', width: '100%', textAlign: 'center' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: preferredTime === value ? '#3B61C4' : '#9B9B9B' }}>
                {TIME_ICONS[value]}
              </div>
              <p style={{ color: '#1A1A1A', fontSize: '0.92rem', fontWeight: 700, marginBottom: 6, letterSpacing: '-0.2px' }}>{label}</p>
              <p style={{ color: '#9B9B9B', fontSize: '0.75rem', lineHeight: 1.45 }}>{desc}</p>
            </OptionCard>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <BackBtn onClick={() => goTo(3, -1)} />
          <ContinueBtn onClick={() => goTo(5)} disabled={!preferredTime} label="Continue" />
        </div>
      </StepWrap>
    </Page>
  )

  // ── Step 5: Plan upsell ──────────────────────────────────────────────────────
  if (step === 5) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={4} total={4} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          Your plan is ready.
        </h2>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.5 }}>
          Try Pro free for 7 days. Your card is charged after the trial — cancel before day 7 and you won't pay a thing.
        </p>

        {/* Free vs Pro */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {/* Free */}
          <div style={{
            backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 14, padding: '18px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Free
            </div>
            {['1 course', '10 AI actions/month', 'Session Blueprint', 'Focus Mode'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C0C0C0" strokeWidth="2.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
                <span style={{ fontSize: '0.82rem', color: '#9B9B9B' }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Pro */}
          <div style={{
            backgroundColor: 'rgba(59,97,196,0.05)', border: '1.5px solid rgba(59,97,196,0.25)',
            borderRadius: 14, padding: '18px 16px',
            boxShadow: '0 0 0 3px rgba(59,97,196,0.05)',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3B61C4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Pro ✦
            </div>
            {[
              'AI Study Coach for every course',
              'Session Blueprints before every session',
              'AI Flashcards, Quizzes & Grade tracking',
              'Your full semester, fully planned',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="5 12 10 17 20 7"/></svg>
                <span style={{ fontSize: '0.82rem', color: '#1A1A1A', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={async () => {
            const result = await createCheckoutSession('pro', 'monthly', userEmail, userId, { trial: true })
            if (!result) return
            if (result.alreadySubscribed) {
              onComplete({ yearLevel, learningStyle, preferredTime, schoolType })
              return
            }
            window.location.href = result
          }}
          style={{
            width: '100%', padding: '14px', marginBottom: 10,
            backgroundColor: '#3B61C4', border: 'none',
            borderRadius: 12, color: '#fff',
            fontSize: '0.97rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2D4FA8'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3B61C4'}
        >
          Start 7-day free trial →
        </button>

        <button
          onClick={() => onComplete({ yearLevel, learningStyle, preferredTime, schoolType })}
          style={{
            width: '100%', padding: '10px', backgroundColor: 'transparent', border: 'none',
            color: '#9B9B9B', fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#6B6B6B'}
          onMouseLeave={e => e.currentTarget.style.color = '#9B9B9B'}
        >
          Continue with free plan
        </button>
      </StepWrap>
    </Page>
  )

  return null
}
