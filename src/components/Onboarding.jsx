import { useState, useRef, useEffect } from 'react'
import { track } from '../lib/analytics'
import { activateTrial, hasUsedTrial } from '../lib/subscription'
import { readUtmPrefill } from '../lib/utmPersonalize'

const STEP_NAMES = { 1: 'personalize', 2: 'app_preview', 3: 'trial_offer' }

// Color accent per school type
const SCHOOL_COLORS = {
  hs:   { accent: '#F97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.45)', glow: 'rgba(249,115,22,0.2)' },
  uni:  { accent: '#6B8FFF', bg: 'rgba(107,143,255,0.1)', border: 'rgba(107,143,255,0.45)', glow: 'rgba(107,143,255,0.2)' },
  exam: { accent: '#34D399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.45)', glow: 'rgba(52,211,153,0.2)' },
}

// Color accent per study time
const TIME_COLORS = {
  Morning:   { accent: '#FBBF24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.45)', glow: 'rgba(251,191,36,0.2)' },
  Afternoon: { accent: '#FB923C', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.45)', glow: 'rgba(251,146,60,0.2)' },
  Evening:   { accent: '#A78BFA', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.45)', glow: 'rgba(167,139,250,0.2)' },
}

const TIME_ICONS = {
  Morning: (
    <svg style={{ width: '2rem', height: '2rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Afternoon: (
    <svg style={{ width: '2rem', height: '2rem' }} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
  ),
  Evening: (
    <svg style={{ width: '2rem', height: '2rem' }} viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  ),
}

const TIME_OPTIONS = [
  { value: 'Morning',   label: 'Morning',   desc: 'Sharp before the world wakes up.' },
  { value: 'Afternoon', label: 'Afternoon', desc: 'You hit your stride after noon.' },
  { value: 'Evening',   label: 'Evening',   desc: 'Night mode. Deep work after dark.' },
]

const SCHOOL_OPTIONS = [
  { key: 'hs',   label: 'High School',       emoji: '🎒', desc: 'AP classes, finals, juggling everything.' },
  { key: 'uni',  label: 'University',        emoji: '🎓', desc: 'Lectures, labs, deadlines — somehow a social life too.' },
  { key: 'exam', label: 'Professional Exam', emoji: '💼', desc: 'MCAT, LSAT, CPA, Bar, GRE, GMAT — high stakes.' },
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
  { value: '1-3 months',  desc: 'Final push — test is close' },
  { value: '3-6 months',  desc: 'Building momentum' },
  { value: '6-12 months', desc: 'Long game, structured prep' },
  { value: '1 year+',     desc: 'Starting early, building deep' },
]

// Progress persistence
const LS_KEY = 'se_ob_progress'
const saveProgress  = (d) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)) } catch {} }
const loadProgress  = ()  => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') } catch { return null } }
const clearProgress = ()  => { try { localStorage.removeItem(LS_KEY) } catch {} }

const AVATARS = [
  { initials: 'SK', color: '#6B8FFF' },
  { initials: 'MR', color: '#A78BFA' },
  { initials: 'JL', color: '#34D399' },
  { initials: 'AT', color: '#FB923C' },
  { initials: 'CW', color: '#F472B6' },
]

// ── Animated CSS bag ─────────────────────────────────────────────────────────
const STYLES = `
  @keyframes ob-bg-drift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
  }
  @keyframes ob-glow-pulse {
    0%,100% { opacity: .35; transform: scale(1);    }
    50%      { opacity: .65; transform: scale(1.08); }
  }
  @keyframes ob-shimmer {
    0%   { background-position: -250% center; }
    100% { background-position:  250% center; }
  }
  @keyframes ob-year-in {
    from { transform: translateY(14px) scale(.97); opacity: 0; }
    to   { transform: translateY(0)    scale(1);   opacity: 1; }
  }
  @keyframes ob-ready-in {
    from { transform: translateY(8px) scale(.95); opacity: 0; }
    to   { transform: translateY(0)   scale(1);   opacity: 1; }
  }
  @keyframes ob-confetti {
    0%   { transform: translateY(-10px) rotate(0deg);    opacity: 1; }
    100% { transform: translateY(80px)  rotate(600deg);  opacity: 0; }
  }
  @keyframes ob-check-pop {
    0%  { transform: scale(0) rotate(-20deg); opacity: 0; }
    60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
    100%{ transform: scale(1)   rotate(0deg); opacity: 1; }
  }
  @keyframes ob-card-select {
    0%   { transform: scale(1);    }
    45%  { transform: scale(1.05); }
    100% { transform: scale(1.02); }
  }
  .ob-selected { animation: ob-card-select 250ms cubic-bezier(.34,1.56,.64,1) both; }
  .ob-year-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ob-school-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ob-time-grid   { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
  .ob-year-reveal { animation: ob-year-in 280ms cubic-bezier(.22,1,.36,1) both; }
  @media (max-width: 500px) {
    .ob-school-grid, .ob-time-grid, .ob-year-grid { grid-template-columns: 1fr !important; }
    .ob-school-grid [data-span] { grid-column: span 1 !important; }
  }
`

// ── Confetti burst ────────────────────────────────────────────────────────────
function Confetti() {
  const COLORS = ['#6B8FFF','#A78BFA','#FBBF24','#FB923C','#34D399','#F472B6']
  return (
    <>
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'fixed',
            top: '35%',
            left: `${8 + ((i * 4.6) % 84)}%`,
            width: i % 3 === 0 ? 7 : 5,
            height: i % 3 === 0 ? 7 : 10,
            borderRadius: i % 4 === 0 ? '50%' : 2,
            backgroundColor: COLORS[i % COLORS.length],
            animation: `ob-confetti ${0.7 + (i % 5) * 0.12}s ease-out ${(i % 7) * 0.04}s forwards`,
            zIndex: 200,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete, userEmail, userId }) {
  const saved = loadProgress()

  // Prefill inferred from UTM params (e.g. Reddit r/mcat → exam/3-6 months).
  // Localstorage progress from a prior partial onboarding wins over UTM
  // inference — if a user was actively answering questions and reloaded, we
  // don't override their in-progress selection with a campaign default.
  const utm = readUtmPrefill()
  const [step, setStep]               = useState(1)
  const [animKey, setAnimKey]         = useState(0)
  const [animDir, setAnimDir]         = useState(1)
  const [trialLoading, setTrialLoading] = useState(false)
  const [trialError, setTrialError]     = useState(null)
  const [schoolType, setSchoolType]   = useState(saved?.schoolType ?? utm.schoolType ?? null)
  const [yearLevel, setYearLevel]     = useState(saved?.yearLevel  ?? utm.yearLevel  ?? null)
  const [preferredTime, setPreferredTime] = useState(saved?.preferredTime ?? null)
  const [courseName, setCourseName]   = useState(saved?.courseName ?? '')
  const [examDate, setExamDate]       = useState(saved?.examDate ?? '')
  const [showConfetti, setShowConfetti]   = useState(false)
  const [skipVisible, setSkipVisible]     = useState(false)

  // Delay the step-2 skip button by 4s so the preview lands first
  useEffect(() => {
    if (step !== 2) return
    setSkipVisible(false)
    const t = setTimeout(() => setSkipVisible(true), 4000)
    return () => clearTimeout(t)
  }, [step])


  const stepEnteredAt   = useRef(Date.now())
  const onboardingStart = useRef(Date.now())
  const prevDone        = useRef(false)

  useEffect(() => { saveProgress({ schoolType, yearLevel, preferredTime, courseName, examDate }) }, [schoolType, yearLevel, preferredTime, courseName, examDate])

  useEffect(() => {
    track('onboarding_step_viewed', { step, step_name: STEP_NAMES[step] ?? `step_${step}` })
  }, [step])

  // Track UTM prefill once so we can slice funnels by whether a user came
  // in with the schoolType/yearLevel pre-filled (i.e. from a targeted sub
  // or campaign) vs. picked it blind. Fires exactly once on mount if a
  // prefill applied.
  const prefillTracked = useRef(false)
  useEffect(() => {
    if (prefillTracked.current) return
    if (!utm.schoolType && !utm.yearLevel) return
    prefillTracked.current = true
    track('onboarding_prefilled', {
      prefill_source:      utm.source ?? null,
      prefill_school_type: utm.schoolType ?? null,
      prefill_year_level:  utm.yearLevel ?? null,
    })
  }, [utm.schoolType, utm.yearLevel, utm.source])

  const allDone = !!(yearLevel && preferredTime)
  const answered = [schoolType, yearLevel, preferredTime].filter(Boolean).length

  useEffect(() => {
    if (allDone && !prevDone.current) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 1600)
    }
    prevDone.current = allDone
  }, [allDone])

  const goTo = (next, dir = 1) => {
    if (dir > 0) {
      const name = STEP_NAMES[step] ?? `step_${step}`
      const ms   = Date.now() - stepEnteredAt.current
      track('onboarding_step_completed', { step, step_name: name, ms_on_step: ms, next_step: next })
      track('onboarding_step', { from: step, to: next, step: next, step_name: STEP_NAMES[next] ?? `step_${next}`, from_step_name: name })
    }
    stepEnteredAt.current = Date.now()
    setAnimDir(dir)
    setAnimKey(k => k + 1)
    setStep(next)
    window.scrollTo(0, 0)
  }

  const completeWith = (profile, extra = {}) => {
    clearProgress()
    onComplete({ ...profile, durationMs: Date.now() - onboardingStart.current, ...extra })
  }

  // Auto-advance from app preview (step 2) to trial offer (step 3) after 10s
  useEffect(() => {
    if (step !== 2) return
    const timer = setTimeout(() => goTo(3), 10000)
    return () => clearTimeout(timer)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const profileData = { yearLevel, learningStyle: null, preferredTime, schoolType, emailDigest: true, courseName: courseName.trim() || null, examDate: examDate || null }

  // ── Step 1: Questions ──────────────────────────────────────────────────────
  if (step === 1) {
    const sc = schoolType ? SCHOOL_COLORS[schoolType] : null

    return (
      <div style={{ backgroundColor: '#080C18', minHeight: '100vh', padding: '0', position: 'relative', overflow: 'hidden' }}>
        <style>{STYLES}</style>
        {showConfetti && <Confetti />}

        {/* Background glow orbs */}
        <div style={{ position: 'absolute', top: '-120px', left: '-80px',  width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(107,143,255,.12) 0%, transparent 70%)', animation: 'ob-glow-pulse 5s ease-in-out infinite',      pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-80px',  right: '-60px', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,.10) 0%, transparent 70%)', animation: 'ob-glow-pulse 5s ease-in-out infinite 2.5s', pointerEvents: 'none' }} />

        <div
          key={animKey}
          className={animDir >= 0 ? 'slide-in' : 'slide-in-back'}
          style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px 80px', position: 'relative', zIndex: 1 }}
        >
          {/* ── Brand pill ── */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 999 }}>
              <img src="/favicon.png" alt="" style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'contain' }} />
              <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '0.82rem', letterSpacing: '-0.2px' }}>StudyEdge AI</span>
            </div>
          </div>

          {/* ── Headline ── */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{
              fontSize: 'clamp(2rem, 5.5vw, 2.75rem)',
              fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.08, marginBottom: 10,
              fontFamily: "'Cormorant Garamond', Georgia, serif",
            }}>
              <span style={{ background: 'linear-gradient(160deg, #fff 30%, rgba(255,255,255,.65))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Two questions.
              </span>
              <br />
              <span style={{ background: 'linear-gradient(135deg, #6B8FFF 0%, #A78BFA 55%, #6B8FFF 100%)', backgroundSize: '200% 200%', animation: 'ob-bg-drift 5s ease infinite', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Then your plan is live.
              </span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,.38)', fontSize: '0.84rem', letterSpacing: '-0.1px' }}>
              Under 60 seconds · no commitment
            </p>
          </div>

          {/* ── Progress chips ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 36, flexWrap: 'wrap' }}>
            {[
              { label: 'School type', done: !!schoolType },
              { label: 'Year',        done: !!yearLevel },
              { label: 'Study time',  done: !!preferredTime },
            ].map(({ label, done }, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 999,
                  background: done ? 'rgba(107,143,255,.14)' : 'rgba(255,255,255,.05)',
                  border:     done ? '1px solid rgba(107,143,255,.4)' : '1px solid rgba(255,255,255,.08)',
                  transition: 'all .3s ease',
                }}>
                  {done ? (
                    <svg width="11" height="11" fill="none" stroke="#6B8FFF" strokeWidth="2.5" viewBox="0 0 24 24" style={{ animation: 'ob-check-pop 300ms cubic-bezier(.34,1.56,.64,1) both' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'block' }} />
                  )}
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: done ? '#8AABFF' : 'rgba(255,255,255,.3)', transition: 'color .3s', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {i < 2 && <div style={{ width: 14, height: 1, background: 'rgba(255,255,255,.08)', flexShrink: 0 }} />}
              </div>
            ))}
          </div>

          {/* ── Q1: School type ── */}
          <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
            01 · What are you studying for?
          </p>
          <div className="ob-school-grid" style={{ marginBottom: schoolType ? 12 : 28 }}>
            {SCHOOL_OPTIONS.map(({ key, label, emoji, desc }) => {
              const sel = schoolType === key
              const c   = SCHOOL_COLORS[key]
              return (
                <button
                  key={key}
                  data-span={key === 'exam' ? 'true' : undefined}
                  onClick={() => { setSchoolType(key); setYearLevel(null) }}
                  className={sel ? 'ob-selected' : ''}
                  style={{
                    padding: '18px 16px', borderRadius: 14,
                    background: sel ? c.bg    : 'rgba(255,255,255,.04)',
                    border:     sel ? `1.5px solid ${c.border}` : '1px solid rgba(255,255,255,.08)',
                    boxShadow:  sel ? `0 0 0 1px ${c.border}, 0 8px 32px ${c.glow}` : '0 1px 4px rgba(0,0,0,.25)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background .2s, border .2s, box-shadow .2s',
                    ...(key === 'exam' ? { gridColumn: 'span 2' } : {}),
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: '1.25rem', lineHeight: 1.1, marginTop: 1 }}>{emoji}</span>
                    <div>
                      <p style={{ color: sel ? c.accent : 'rgba(255,255,255,.88)', fontSize: '0.91rem', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 3, transition: 'color .2s' }}>{label}</p>
                      <p style={{ color: 'rgba(255,255,255,.32)', fontSize: '0.74rem', lineHeight: 1.45 }}>{desc}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── Q1b: Year / timeline ── */}
          {schoolType && (
            <div className="ob-year-reveal" style={{ marginBottom: 28 }}>
              <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                {schoolType === 'exam' ? '01b · How long until your exam?' : '01b · What year are you in?'}
              </p>
              <div className="ob-year-grid">
                {(schoolType === 'hs' ? HS_YEARS : schoolType === 'exam' ? EXAM_TIMELINES : UNI_YEARS).map(({ value, desc }) => {
                  const sel = yearLevel === value
                  const c   = SCHOOL_COLORS[schoolType]
                  return (
                    <button
                      key={value}
                      onClick={() => setYearLevel(value)}
                      className={sel ? 'ob-selected' : ''}
                      style={{
                        padding: '12px 14px', borderRadius: 12,
                        background: sel ? c.bg    : 'rgba(255,255,255,.04)',
                        border:     sel ? `1.5px solid ${c.border}` : '1px solid rgba(255,255,255,.08)',
                        boxShadow:  sel ? `0 4px 20px ${c.glow}` : 'none',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        transition: 'background .2s, border .2s, box-shadow .2s',
                      }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                    >
                      <p style={{ color: sel ? c.accent : 'rgba(255,255,255,.85)', fontSize: '0.86rem', fontWeight: 700, marginBottom: 2, transition: 'color .2s' }}>{value}</p>
                      <p style={{ color: 'rgba(255,255,255,.28)', fontSize: '0.71rem' }}>{desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Divider ── */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent)', margin: '0 0 24px' }} />

          {/* ── Q2: Study time ── */}
          <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
            02 · When do you focus best?
          </p>
          <div className="ob-time-grid" style={{ marginBottom: 28 }}>
            {TIME_OPTIONS.map(({ value, label, desc }) => {
              const sel = preferredTime === value
              const c   = TIME_COLORS[value]
              return (
                <button
                  key={value}
                  onClick={() => setPreferredTime(value)}
                  className={sel ? 'ob-selected' : ''}
                  style={{
                    padding: '22px 10px 18px', borderRadius: 14, textAlign: 'center',
                    background: sel ? c.bg    : 'rgba(255,255,255,.04)',
                    border:     sel ? `1.5px solid ${c.border}` : '1px solid rgba(255,255,255,.08)',
                    boxShadow:  sel ? `0 0 0 1px ${c.border}, 0 8px 28px ${c.glow}` : '0 1px 4px rgba(0,0,0,.25)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background .2s, border .2s, box-shadow .2s',
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: sel ? c.accent : 'rgba(255,255,255,.28)', transition: 'color .2s' }}>
                    {TIME_ICONS[value]}
                  </div>
                  <p style={{ color: sel ? '#fff' : 'rgba(255,255,255,.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: 5, letterSpacing: '-0.2px', transition: 'color .2s' }}>{label}</p>
                  <p style={{ color: 'rgba(255,255,255,.28)', fontSize: '0.7rem', lineHeight: 1.4 }}>{desc}</p>
                </button>
              )
            })}
          </div>

          {/* ── Optional: Course + Exam date ── */}
          {allDone && (
            <div className="ob-year-reveal" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
                <p style={{ color: 'rgba(255,255,255,.2)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>✨ Make it personal (optional)</p>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                  📚 Main subject or exam name?
                </p>
                <input
                  type="text"
                  placeholder={schoolType === 'exam' ? 'e.g. MCAT, LSAT, CPA Exam…' : schoolType === 'hs' ? 'e.g. AP Chemistry, Pre-Calculus…' : 'e.g. Organic Chemistry, Calc II…'}
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                    color: '#fff', fontSize: '0.88rem', fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box', transition: 'border .2s, background .2s',
                  }}
                  onFocus={e => { e.target.style.border = '1px solid rgba(107,143,255,.45)'; e.target.style.background = 'rgba(107,143,255,.07)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,.1)'; e.target.style.background = 'rgba(255,255,255,.05)' }}
                />
              </div>

              <div>
                <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                  📅 When's your exam or deadline?
                </p>
                <input
                  type="date"
                  value={examDate}
                  onChange={e => setExamDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                    color: examDate ? '#fff' : 'rgba(255,255,255,.35)', fontSize: '0.88rem', fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box', transition: 'border .2s, background .2s',
                    colorScheme: 'dark',
                  }}
                  onFocus={e => { e.target.style.border = '1px solid rgba(107,143,255,.45)'; e.target.style.background = 'rgba(107,143,255,.07)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,.1)'; e.target.style.background = 'rgba(255,255,255,.05)' }}
                />
              </div>
            </div>
          )}

          {/* ── Ready banner ── */}
          {allDone && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(107,143,255,.12), rgba(167,139,250,.12))',
                border: '1px solid rgba(107,143,255,.3)',
                borderRadius: 12, padding: '11px 16px', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 10,
                animation: 'ob-ready-in 320ms cubic-bezier(.22,1,.36,1) both',
              }}
            >
              <svg width="15" height="15" fill="none" stroke="#8AABFF" strokeWidth="2.2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p style={{ fontSize: '0.8rem', color: '#8AABFF', fontWeight: 600, margin: 0 }}>
                {courseName.trim() ? `All set — your ${courseName.trim()} plan is ready to build.` : 'All set — your personalised study plan is ready to build.'}
              </p>
            </div>
          )}

          {/* ── CTA ── */}
          <button
            onClick={() => {
              if (!hasUsedTrial()) { goTo(2) } else { completeWith(profileData) }
            }}
            disabled={!allDone}
            style={{
              width: '100%', padding: '16px', border: 'none', borderRadius: 14,
              fontFamily: 'inherit', fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.2px',
              cursor: allDone ? 'pointer' : 'not-allowed',
              transition: 'opacity .2s, transform .15s',
              ...(allDone ? {
                background: 'linear-gradient(135deg, #3B61C4 0%, #6B35D9 50%, #3B61C4 100%)',
                backgroundSize: '200% 200%',
                animation: 'ob-bg-drift 4s ease infinite',
                color: '#fff',
                boxShadow: '0 4px 32px rgba(59,97,196,.5), 0 0 0 1px rgba(107,53,217,.35)',
              } : {
                background: 'rgba(255,255,255,.07)',
                color: 'rgba(255,255,255,.22)',
              }),
            }}
            onMouseEnter={e => { if (allDone) e.currentTarget.style.transform = 'scale(1.01)' }}
            onMouseLeave={e => { if (allDone) e.currentTarget.style.transform = 'scale(1)' }}
          >
            {allDone
              ? (courseName.trim() ? `Show me my ${courseName.trim()} plan →` : 'Show me my study plan →')
              : `${answered} of 3 answered — keep going`}
          </button>

          {/* ── Social proof ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20 }}>
            <div style={{ display: 'flex' }}>
              {AVATARS.map((a, i) => (
                <div key={i} style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: a.color, border: '2px solid #080C18',
                  marginLeft: i === 0 ? 0 : -9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 800, color: '#fff', letterSpacing: '0',
                  boxShadow: `0 0 0 1px ${a.color}33`,
                }}>
                  {a.initials}
                </div>
              ))}
            </div>
            <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '0.74rem' }}>
              Joined by <span style={{ color: 'rgba(255,255,255,.6)', fontWeight: 700 }}>400+</span> students
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: App preview ──────────────────────────────────────────────────────
  if (step === 2) {
    const subjectsByType = {
      hs:   ['AP Biology', 'Pre-Calculus', 'AP English Literature'],
      uni:  ['Intro Psychology', 'Calculus II', 'Organic Chemistry'],
      exam: ['Practice Sections', 'Concept Review', 'Timed Drills'],
    }
    const genericSubjects = subjectsByType[schoolType] ?? subjectsByType.uni
    const trimmedCourse = courseName.trim()
    const subjects = trimmedCourse
      ? [trimmedCourse, ...genericSubjects.slice(0, 2)]
      : genericSubjects
    const daysToExam = examDate
      ? Math.ceil((new Date(examDate) - new Date()) / (1000 * 60 * 60 * 24))
      : null
    const timeLabel = preferredTime ?? 'Evening'
    const schoolLabel = schoolType === 'hs' ? 'high school' : schoolType === 'exam' ? 'exam prep' : 'university'
    const examWord = schoolType === 'exam' ? 'exam' : 'final'

    return (
      <div style={{ backgroundColor: '#080C18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative', overflow: 'hidden' }}>
        <style>{STYLES + `
          @keyframes countdown-bar { from { width: 0% } to { width: 100% } }
          @keyframes fade-up { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        `}</style>
        <div style={{ position: 'absolute', top: '-150px', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(52,211,153,.09) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div key={animKey} className={animDir >= 0 ? 'slide-in' : 'slide-in-back'} style={{ maxWidth: 460, width: '100%', position: 'relative', zIndex: 1 }}>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 999, padding: '5px 16px', fontSize: 11, fontWeight: 700, color: '#34D399', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, background: '#34D399', borderRadius: '50%', animation: 'ob-glow-pulse 1.4s ease-in-out infinite' }} />
              AI built your plan
            </div>
          </div>

          <h2 style={{ textAlign: 'center', marginBottom: 6, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            <span style={{ background: 'linear-gradient(160deg, #fff 30%, rgba(255,255,255,.65))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Here's your personalized plan.
            </span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.83rem', textAlign: 'center', marginBottom: 24 }}>
            {daysToExam && trimmedCourse
              ? `${trimmedCourse} · ${daysToExam} days to go · ${timeLabel} sessions`
              : `Built for ${yearLevel} ${schoolLabel} · ${timeLabel} sessions`}
          </p>

          {/* Week schedule preview */}
          <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '16px 18px', marginBottom: 12, animation: 'fade-up 0.35s ease both' }}>
            <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>📅 This Week's Sessions</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {['M','T','W','T','F'].map((d, i) => {
                const active = [0,1,3,4].includes(i)
                return (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: active ? 'rgba(107,143,255,0.12)' : 'transparent', border: active ? '1px solid rgba(107,143,255,0.25)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.65rem', fontWeight: 700, marginBottom: 6 }}>{d}</p>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#6B8FFF' : 'rgba(255,255,255,0.1)', margin: '0 auto' }} />
                  </div>
                )
              })}
            </div>
            <p style={{ color: 'rgba(255,255,255,.28)', fontSize: '0.72rem' }}>4 sessions · ~2.5 hrs this week</p>
          </div>

          {/* Courses preview */}
          <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '16px 18px', marginBottom: 12, animation: 'fade-up 0.35s ease 0.08s both' }}>
            <p style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>📚 Your Courses</p>
            {subjects.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < subjects.length - 1 ? 10 : 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ['#6B8FFF','#A78BFA','#34D399'][i] }} />
                <p style={{ color: 'rgba(255,255,255,.85)', fontSize: '0.84rem', fontWeight: 600, flex: 1 }}>{s}</p>
                <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, color: '#34D399', flexShrink: 0 }}>Ready</div>
              </div>
            ))}
          </div>

          {/* AI Coach bubble */}
          <div style={{ background: 'rgba(107,143,255,.07)', border: '1px solid rgba(107,143,255,.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, animation: 'fade-up 0.35s ease 0.16s both' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #3B61C4, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>🤖</div>
              <div>
                <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>AI Study Coach</p>
                <p style={{ color: 'rgba(255,255,255,.78)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                  {daysToExam && trimmedCourse
                    ? `"Your ${trimmedCourse} ${examWord} is in ${daysToExam} days. I've built ${timeLabel.toLowerCase()} sessions around what matters most — start your Blueprint today and you'll walk in ready."`
                    : `"I've scheduled your ${timeLabel.toLowerCase()} sessions across all ${subjects.length} courses. Start with ${subjects[0]} first — it has the most material to cover."`}
                </p>
              </div>
            </div>
          </div>

          {/* Auto-advance progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #3B61C4, #7C3AED)', borderRadius: 3, animation: 'countdown-bar 10s linear forwards' }} />
            </div>
            <p style={{ color: 'rgba(255,255,255,.25)', fontSize: '0.69rem', textAlign: 'center', marginTop: 6 }}>
              Opening your full plan in a moment…
            </p>
          </div>

          <button
            onClick={() => goTo(3)}
            style={{
              width: '100%', padding: '15px', border: 'none', borderRadius: 14,
              background: 'linear-gradient(135deg, #3B61C4 0%, #6B35D9 50%, #3B61C4 100%)',
              backgroundSize: '200% 200%', animation: 'ob-bg-drift 4s ease infinite',
              color: '#fff', fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em',
              cursor: 'pointer', marginBottom: 10,
              boxShadow: '0 4px 28px rgba(59,97,196,.45)',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.01)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            Unlock my full plan →
          </button>
          {skipVisible && (
            <button
              onClick={() => { track('preview_skipped', { source: 'onboarding' }); completeWith(profileData, { trialTaken: false }) }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.2)', fontSize: '0.74rem', cursor: 'pointer', width: '100%', padding: '6px', fontFamily: 'inherit', marginBottom: 8, transition: 'color .15s opacity .4s', opacity: skipVisible ? 1 : 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.2)' }}
            >
              Continue with free plan
            </button>
          )}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => goTo(1, -1)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.2)', fontSize: '0.72rem', cursor: 'pointer', padding: 4, transition: 'color .15s', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.45)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.2)' }}
            >
              ← Edit my answers
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 3: Trial offer ──────────────────────────────────────────────────────
  const step3DaysToExam = examDate
    ? Math.ceil((new Date(examDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null
  const step3Course = courseName.trim()
  const step3ExamWord = schoolType === 'exam' ? 'exam' : 'final'
  if (step === 3) return (
    <div style={{ minHeight: '100vh', background: '#080C18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', position: 'relative', overflow: 'hidden' }}>
      <style>{STYLES}</style>
      <div style={{ position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(107,53,217,.14) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <div
        key={animKey}
        className={animDir >= 0 ? 'slide-in' : 'slide-in-back'}
        style={{ maxWidth: 460, width: '100%', position: 'relative', zIndex: 1 }}
      >
        {/* Badge */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.30)', borderRadius: 999, padding: '6px 18px', fontSize: 11, fontWeight: 700, color: '#34D399', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, background: '#34D399', borderRadius: '50%', animation: 'ob-glow-pulse 1.8s ease-in-out infinite' }} />
            7-day free trial · $0 today · cancel anytime
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ textAlign: 'center', marginBottom: 10, lineHeight: 1.08 }}>
          {step3DaysToExam && step3Course ? (
            <span style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(160deg, #fff 30%, rgba(255,255,255,.65))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Your {step3Course} {step3ExamWord} is in {step3DaysToExam} days.
            </span>
          ) : (
            <span style={{ display: 'block', fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(160deg, #fff 30%, rgba(255,255,255,.65))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Try every Pro feature.
            </span>
          )}
          <span style={{ display: 'block', fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(135deg, #6B8FFF, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {step3DaysToExam && step3Course ? "Here's your plan. Free for 7 days." : 'Free for 7 days.'}
          </span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.9rem', textAlign: 'center', marginBottom: 28, lineHeight: 1.65 }}>
          {step3DaysToExam && step3Course
            ? `Every session between now and your ${step3ExamWord} — mapped out, optimized, and ready. Unlock it all with a 7-day free trial. No charge today.`
            : schoolType === 'hs'
            ? 'Built for AP classes, finals, and everything between. See the difference in your first study session.'
            : schoolType === 'exam'
            ? 'High-stakes prep, built around your real test date. See how much sharper your studying gets — before paying a cent.'
            : schoolType === 'uni'
            ? 'Your full semester — every course, every exam — finally organized. Full access, no restrictions.'
            : 'Full access, no restrictions. See how much sharper you study — before paying a cent.'}
        </p>

        {/* What unlocks with trial */}
        <div style={{ background: 'rgba(107,143,255,.07)', border: '1px solid rgba(107,143,255,.22)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6B8FFF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Everything unlocked with your 7-day trial</p>
          {[
            { text: '5 courses — plan your full semester', icon: '📚' },
            { text: '100 AI tutor messages/month', icon: '🤖' },
            { text: 'AI Study Coach — week-by-week session plan', icon: '🗓' },
            { text: 'Unlimited Session Blueprints', icon: '⚡' },
            { text: 'Unlimited Focus sessions (no 30-min cap)', icon: '🎯' },
            { text: 'Practice exams, Brain Dumps, Exam Rescue', icon: '📝' },
          ].map(({ text, icon }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.82)', lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(107,143,255,.15)', fontSize: 11, color: 'rgba(255,255,255,.35)', lineHeight: 1.5 }}>
            After 7 days, $2.99/wk. Cancel before day 8 — your card won't be charged.
          </div>
        </div>

        {/* Stars */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} width="14" height="14" viewBox="0 0 20 20" fill="#FBBF24">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', fontWeight: 500 }}>Loved by 400+ students</span>
        </div>

        {/* Primary CTA */}
        {trialError && (
          <p style={{ color: '#F87171', fontSize: '0.78rem', textAlign: 'center', marginBottom: 8 }}>
            {trialError}
          </p>
        )}
        <button
          onClick={async () => {
            track('trial_cta_clicked', { source: 'onboarding' })
            setTrialLoading(true)
            setTrialError(null)
            const url = await activateTrial(userId, userEmail)
            if (url) {
              window.location.href = url
            } else {
              setTrialLoading(false)
              setTrialError('Something went wrong starting your trial. Please try again.')
            }
          }}
          disabled={trialLoading}
          style={{
            width: '100%', padding: '16px',
            background: 'linear-gradient(135deg, #3B61C4, #7C3AED)',
            border: 'none', borderRadius: 14,
            color: '#fff', fontSize: '1rem', fontWeight: 800,
            cursor: trialLoading ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.01em', marginBottom: 8,
            opacity: trialLoading ? 0.7 : 1,
            boxShadow: '0 4px 32px rgba(59,97,196,.45), 0 0 0 1px rgba(124,58,237,.3)',
            transition: 'transform .15s, opacity .2s',
          }}
          onMouseEnter={e => { if (!trialLoading) e.currentTarget.style.transform = 'scale(1.01)' }}
          onMouseLeave={e => { if (!trialLoading) e.currentTarget.style.transform = 'scale(1)' }}
        >
          {trialLoading ? 'Loading…' : 'Start 7-day free trial →'}
        </button>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: '0.71rem', marginBottom: 18 }}>
          Card required · $2.99/wk after 7 days · Cancel anytime in account
        </p>

        {/* Skip — low-prominence, copy reminds them what they're giving up */}
        <button
          onClick={() => {
            track('trial_skipped', {
              source: 'onboarding',
              ms_on_step: Date.now() - stepEnteredAt.current,
              has_course: !!step3Course,
              has_exam_date: !!examDate,
              days_to_exam: step3DaysToExam,
            })
            completeWith(profileData, { trialTaken: false })
          }}
          style={{
            background: 'none', border: 'none', padding: '6px',
            color: 'rgba(255,255,255,.18)', fontSize: '0.72rem',
            cursor: 'pointer', textAlign: 'center', display: 'block',
            width: '100%', fontFamily: 'inherit', marginBottom: 10,
            transition: 'color .15s', lineHeight: 1.5,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.35)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.18)' }}
        >
          No thanks, I'll skip the 7 free days
        </button>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => goTo(2, -1)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.22)', fontSize: '0.77rem', cursor: 'pointer', padding: 4, transition: 'color .15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,.5)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.22)'}
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  )

  return null
}
