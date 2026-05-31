import { useState } from 'react'
import { track } from '../lib/analytics'
import { activateTrial, hasUsedTrial } from '../lib/subscription'

const STEP_NAMES = {
  1: 'splash',
  2: 'school_level',
  3: 'year_level',
  4: 'preferred_time',
  5: 'trial_offer',
}

// ── Options ───────────────────────────────────────────────────────────────────
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
          You're 60 seconds from<br />
          <em style={{ fontStyle: 'italic', color: '#3B61C4' }}>your first AI study plan.</em>
        </h1>

        {/* Subtext */}
        <p style={{ color: '#6B6B6B', fontSize: '1rem', lineHeight: 1.6, marginBottom: 40 }}>
          Two quick questions. Then we'll build the rest around you.
        </p>

        {/* Feature cards */}
        <style>{`@media (max-width: 480px) {
          .ob-splash-grid { grid-template-columns: 1fr !important; }
          .ob-time-grid   { grid-template-columns: 1fr !important; }
          .ob-plan-grid   { grid-template-columns: 1fr !important; }
          .ob-school-grid { grid-template-columns: 1fr !important; }
          .ob-school-grid [style*="span 2"] { grid-column: span 1 !important; }
        }`}</style>
        <div className="ob-splash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 36 }}>
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
  const [preferredTime, setPreferredTime]   = useState(null)

  const goTo = (next, dir = 1) => {
    if (dir > 0) {
      track('onboarding_step', {
        from: step,
        to: next,
        step: next,
        step_name: STEP_NAMES[next] ?? `step_${next}`,
        from_step_name: STEP_NAMES[step] ?? `step_${step}`,
      })
    }
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
        <ProgressBar current={1} total={2} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          What are you studying for?
        </h2>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.5 }}>
          We tune your sessions to your workload — high school finals look nothing like the bar exam.
        </p>

        <div className="ob-school-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
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

        <ContinueBtn onClick={() => goTo(4)} disabled={!yearLevel} />
      </StepWrap>
    </Page>
  )

  // ── Step 4: Study time preference ───────────────────────────────────────────
  if (step === 4) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={2} total={2} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          When do you focus best?
        </h2>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.5 }}>
          We'll stack your sessions when your brain is sharpest — not when life is loudest.
        </p>

        <div className="ob-time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
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
          <BackBtn onClick={() => goTo(2, -1)} />
          <ContinueBtn onClick={() => { if (!hasUsedTrial()) { goTo(5) } else { onComplete({ yearLevel, learningStyle: null, preferredTime, schoolType, emailDigest: true }) } }} disabled={!preferredTime} label="Build my plan" />
        </div>
      </StepWrap>
    </Page>
  )

  // ── Step 5: Trial offer ───────────────────────────────────────────────────────
  const profileData = { yearLevel, learningStyle: null, preferredTime, schoolType, emailDigest: true }
  if (step === 5) return (
    <div style={{ minHeight: '100vh', background: '#F7F6F3', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        {/* Badge */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.2)', borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: '#3B61C4', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Limited time · no card required
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111111', letterSpacing: '-0.04em', textAlign: 'center', marginBottom: 10, lineHeight: 1.15 }}>
          Try every Pro feature.<br />Free for 3 days.
        </h1>
        <p style={{ color: '#6B6B6B', fontSize: '0.95rem', textAlign: 'center', marginBottom: 32, lineHeight: 1.6 }}>
          See your full study plan, AI coach, and focus sessions in action — before you pay a cent.
        </p>

        {/* Feature list */}
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          {[
            ['5 courses', 'Your full semester, all in one place'],
            ['100 AI actions/month', 'AI tutor, coach plans, blueprints, quizzes'],
            ['Unlimited focus sessions', 'Study as long as you need'],
            ['Rebuild plans anytime', 'As exams shift and life happens'],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,97,196,0.1)', border: '1px solid rgba(59,97,196,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="10" height="10" fill="none" stroke="#3B61C4" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111111' }}>{title}</div>
                <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Primary CTA */}
        <button
          onClick={async () => {
            track('trial_cta_clicked', { source: 'onboarding' })
            await activateTrial()
            onComplete(profileData)
          }}
          style={{ width: '100%', padding: '15px', background: '#3B61C4', border: 'none', borderRadius: 12, color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '-0.01em', marginBottom: 10 }}
          onMouseEnter={e => e.currentTarget.style.background = '#2d4fa3'}
          onMouseLeave={e => e.currentTarget.style.background = '#3B61C4'}
        >
          Start My Free Trial — 7 Days Free →
        </button>

        {/* Secondary */}
        <button
          onClick={() => onComplete(profileData)}
          style={{ width: '100%', padding: '13px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, color: '#6B6B6B', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.22)'; e.currentTarget.style.color = '#111' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#6B6B6B' }}
        >
          I'll try the free plan first
        </button>

        <p style={{ textAlign: 'center', color: '#9B9B9B', fontSize: '0.72rem', marginTop: 16 }}>
          No credit card · trial ends after 3 days · downgrade to free automatically
        </p>
      </div>
    </div>
  )

  return null
}
