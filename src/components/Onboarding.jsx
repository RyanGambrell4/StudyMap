import { useState, useEffect, useRef } from 'react'

// ── Options ───────────────────────────────────────────────────────────────────
const STYLE_OPTIONS = [
  {
    value: 'visual',
    label: '🎨  Visual',
    desc: 'You think in diagrams. Color-coding, flowcharts, and mind maps make complex ideas click. If you can see it, you can learn it.',
  },
  {
    value: 'reading',
    label: '📖  Reading & Writing',
    desc: 'You process through text. Rewriting notes, summarizing chapters, and annotating readings are how ideas stick for you.',
  },
  {
    value: 'practice',
    label: '🧩  Practice-Based',
    desc: 'You learn by doing. Flashcards, past exams, and problem sets are your best tools. Repetition and reps build your mastery.',
  },
]

const TIME_OPTIONS = [
  {
    value: 'Morning',
    label: 'Morning',
    emoji: '☀️',
    desc: "Sharpest before the day gets noisy. Early sessions, clear head.",
  },
  {
    value: 'Afternoon',
    label: 'Afternoon',
    emoji: '⚡',
    desc: "Post-lunch and fully awake. You hit your stride after noon.",
  },
  {
    value: 'Evening',
    label: 'Evening',
    emoji: '🌙',
    desc: "Night owl energy. When the world quiets down, you focus.",
  },
]

const SCHOOL_OPTIONS = [
  {
    key: 'hs',
    label: '🎒  High School',
    desc: 'AP classes, finals week, and juggling it all before graduation.',
  },
  {
    key: 'uni',
    label: '🎓  University',
    desc: 'Lectures, labs, deadlines, and somehow a social life too.',
  },
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

// ── Splash canvas particles ────────────────────────────────────────────────────
function useParticles(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const COUNT = 55
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.4,
      dx: (Math.random() - 0.5) * 0.28,
      dy: (Math.random() - 0.5) * 0.22,
      alpha: Math.random() * 0.45 + 0.08,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139,92,246,${p.alpha})`
        ctx.fill()
        p.x += p.dx
        p.y += p.dy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [canvasRef])
}

// ── Feature cards data ─────────────────────────────────────────────────────────
const SPLASH_CARDS = [
  {
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    label: 'Session Blueprint',
    desc: 'Your session planned before you start',
  },
  {
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Focus Mode',
    desc: 'Timed blocks that keep you locked in',
  },
  {
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    label: 'Streak Tracking',
    desc: 'Build the habit, ace the semester',
  },
]

// ── Staggered headline words ───────────────────────────────────────────────────
function AnimHeadline() {
  const lines = ['Your semester,', 'mapped in 60 seconds']
  let wordIdx = 0
  return (
    <h1 style={{
      fontSize: 'clamp(2rem, 5vw, 2.5rem)',
      fontWeight: 800,
      color: '#f1f5f9',
      lineHeight: 1.18,
      letterSpacing: '-1.8px',
      marginBottom: '16px',
    }}>
      {lines.map((line, li) => (
        <span key={li} style={{ display: 'block' }}>
          {line.split(' ').map(word => {
            const delay = `${0.18 + wordIdx++ * 0.07}s`
            return (
              <span key={word + delay} style={{
                display: 'inline-block',
                marginRight: '0.28em',
                opacity: 0,
                animation: `ob-word 0.5s cubic-bezier(0.22,1,0.36,1) ${delay} forwards`,
              }}>{word}</span>
            )
          })}
        </span>
      ))}
    </h1>
  )
}

// ── Splash screen ──────────────────────────────────────────────────────────────
function SplashScreen({ onNext }) {
  const canvasRef = useRef(null)
  useParticles(canvasRef)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0a0d1a 0%, #0f1221 50%, #12162e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Particle canvas */}
      <canvas ref={canvasRef} style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }} />

      {/* Central radial glow */}
      <div style={{
        position: 'absolute',
        top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '700px', height: '500px',
        background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.11) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{ width: '100%', maxWidth: '520px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div className="ob-logo" style={{ marginBottom: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <img
            src="/favicon.png"
            alt="StudyEdge"
            style={{
              width: '34px', height: '34px',
              borderRadius: '9px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.35))',
            }}
          />
          <span style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.4px' }}>StudyEdge</span>
        </div>

        {/* Animated headline */}
        <AnimHeadline />

        {/* Subtext */}
        <p className="ob-pill" style={{
          color: '#475569',
          fontSize: '1rem',
          lineHeight: 1.6,
          marginBottom: '40px',
        }}>
          Tell us your courses and goals. We'll build your entire study plan.
        </p>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '36px' }}>
          {SPLASH_CARDS.map((card, i) => (
            <div
              key={card.label}
              className={`ob-card-${i}`}
              style={{
                background: 'rgba(15,18,40,0.7)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '14px',
                padding: '16px 12px',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                textAlign: 'left',
              }}
            >
              <div style={{
                color: '#818cf8',
                marginBottom: '10px',
                width: '32px', height: '32px',
                background: 'rgba(99,102,241,0.12)',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {card.icon}
              </div>
              <p style={{ color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.1px' }}>
                {card.label}
              </p>
              <p style={{ color: '#475569', fontSize: '0.73rem', lineHeight: 1.45 }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          className="ob-btn ob-glow-btn"
          onClick={onNext}
          style={{
            width: '100%',
            padding: '15px',
            background: '#4f46e5',
            border: '1px solid rgba(99,102,241,0.5)',
            borderRadius: '12px',
            color: 'white',
            fontFamily: 'inherit',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '-0.2px',
            transition: 'background 0.15s',
            marginBottom: '14px',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#4338ca' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5' }}
        >
          Let's go
        </button>

        {/* Fine print */}
        <p className="ob-fine" style={{ color: '#1e293b', fontSize: '0.8rem', fontWeight: 500 }}>
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

// ── Segmented progress bar ─────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '36px' }}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i + 1 <= current
        const active = i + 1 === current
        return (
          <div key={i} style={{
            flex: 1, height: '4px', borderRadius: '999px', overflow: 'hidden',
            background: 'rgba(255,255,255,0.07)',
          }}>
            <div style={{
              height: '100%',
              width: filled ? '100%' : '0%',
              borderRadius: '999px',
              background: active
                ? 'linear-gradient(90deg, #6366f1, #818cf8)'
                : 'rgba(99,102,241,0.55)',
              boxShadow: active ? '0 0 8px rgba(99,102,241,0.7)' : 'none',
              transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>
        )
      })}
    </div>
  )
}

// ── Shared option card styles ──────────────────────────────────────────────────
const CARD_BASE = {
  background: 'rgba(13,20,42,0.75)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  cursor: 'pointer',
  transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s, background 0.2s',
  fontFamily: 'inherit',
  textAlign: 'left',
}
const CARD_HOVER = {
  borderColor: 'rgba(99,102,241,0.35)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
  transform: 'translateY(-2px)',
}
const CARD_SELECTED = {
  background: 'linear-gradient(135deg, rgba(55,48,163,0.6) 0%, rgba(79,70,229,0.5) 100%)',
  borderColor: 'rgba(99,102,241,0.7)',
  boxShadow: '0 0 0 1px rgba(99,102,241,0.3), 0 4px 24px rgba(79,70,229,0.25)',
  transform: 'translateY(-2px)',
}

function useHover() {
  const [hovered, setHovered] = useState(false)
  return {
    hovered,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  }
}

// ── Checkmark badge ────────────────────────────────────────────────────────────
function Check() {
  return (
    <div className="ob-check-pop" style={{
      position: 'absolute', top: '10px', right: '10px',
      width: '20px', height: '20px', borderRadius: '50%',
      background: '#6366f1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}

// ── Page shell with consistent background ─────────────────────────────────────
function Page({ children }) {
  const canvasRef = useRef(null)
  useParticles(canvasRef)
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0a0d1a 0%, #0f1221 50%, #12162e 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', position: 'relative', overflow: 'hidden',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      {/* Dot grid texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.07) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />
      {/* Central glow */}
      <div style={{
        position: 'absolute', top: '35%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '700px', height: '500px',
        background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.11) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />
      <div style={{ width: '100%', maxWidth: '480px', position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}

// ── Continue / Back buttons ────────────────────────────────────────────────────
function ContinueBtn({ onClick, disabled, label = 'Continue' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={disabled ? '' : 'ob-btn-active'}
      style={{
        flex: 1,
        padding: '15px',
        background: disabled ? 'rgba(99,102,241,0.15)' : '#4f46e5',
        border: `1px solid ${disabled ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.5)'}`,
        borderRadius: '12px',
        color: disabled ? 'rgba(255,255,255,0.25)' : 'white',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.3s, border-color 0.3s, color 0.3s',
        letterSpacing: '-0.2px',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#4338ca' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = '#4f46e5' }}
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
        padding: '15px 20px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        color: '#64748b',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#94a3b8' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#64748b' }}
    >
      Back
    </button>
  )
}

// ── Selectable card ────────────────────────────────────────────────────────────
function OptionCard({ selected, onClick, children, style = {} }) {
  const [hovered, setHovered] = useState(false)
  const merged = {
    ...CARD_BASE,
    ...(hovered && !selected ? CARD_HOVER : {}),
    ...(selected ? CARD_SELECTED : {}),
    position: 'relative',
    ...style,
  }
  return (
    <button
      onClick={onClick}
      style={merged}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {selected && <Check />}
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const [step, setStep]       = useState(1)
  const [animKey, setAnimKey] = useState(0)
  const [animDir, setAnimDir] = useState(1)

  const [schoolType, setSchoolType]     = useState(null)
  const [yearLevel, setYearLevel]       = useState(null)
  const [learningStyle, setLearningStyle] = useState(null)
  const [preferredTime, setPreferredTime] = useState(null)

  const goTo = (next, dir = 1) => {
    setAnimDir(dir)
    setAnimKey(k => k + 1)
    setStep(next)
    window.scrollTo(0, 0)
  }

  // ── Step 1 ───────────────────────────────────────────────────────────────────
  if (step === 1) return <SplashScreen onNext={() => goTo(2)} />

  // ── Step 2: School level + year ──────────────────────────────────────────────
  if (step === 2) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={1} total={3} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-1.2px', marginBottom: '6px' }}>
          Where are you studying?
        </h2>
        <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '24px' }}>
          We'll personalize your study plan for your level and workload.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {SCHOOL_OPTIONS.map(({ key, label, desc }) => (
            <OptionCard
              key={key}
              selected={schoolType === key}
              onClick={() => { setSchoolType(key); setYearLevel(null) }}
              style={{ padding: '20px 16px', width: '100%', textAlign: 'left' }}
            >
              <p style={{
                color: schoolType === key ? '#c7d2fe' : '#cbd5e1',
                fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '5px',
              }}>{label}</p>
              <p style={{ color: schoolType === key ? 'rgba(199,210,254,0.55)' : '#334155', fontSize: '0.78rem', lineHeight: 1.45 }}>{desc}</p>
            </OptionCard>
          ))}
        </div>

        {schoolType && (
          <div className="ob-year-in" style={{ marginBottom: '24px' }}>
            <p style={{ color: '#334155', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
              What year are you in?
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {(schoolType === 'hs' ? HS_YEARS : UNI_YEARS).map(({ value, desc }) => (
                <OptionCard
                  key={value}
                  selected={yearLevel === value}
                  onClick={() => setYearLevel(value)}
                  style={{ padding: '14px 16px', width: '100%', textAlign: 'left' }}
                >
                  <p style={{ color: yearLevel === value ? '#c7d2fe' : '#cbd5e1', fontSize: '0.88rem', fontWeight: 700, marginBottom: '3px' }}>{value}</p>
                  <p style={{ color: yearLevel === value ? 'rgba(199,210,254,0.5)' : '#334155', fontSize: '0.75rem' }}>{desc}</p>
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
  const STYLE_ACCENTS = { visual: '#6366f1', reading: '#8b5cf6', practice: '#10b981' }

  if (step === 3) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <ProgressBar current={2} total={3} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-1.2px', marginBottom: '6px' }}>
          How do you learn best?
        </h2>
        <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '24px' }}>
          Pick the style that sounds most like you, and we'll build sessions around it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {STYLE_OPTIONS.map(({ value, label, desc }) => (
            <OptionCard
              key={value}
              selected={learningStyle === value}
              onClick={() => setLearningStyle(value)}
              style={{ padding: '0', width: '100%', display: 'flex', overflow: 'hidden' }}
            >
              <div style={{
                width: '4px', flexShrink: 0,
                background: learningStyle === value ? STYLE_ACCENTS[value] : 'rgba(255,255,255,0.06)',
                transition: 'background 0.2s',
              }} />
              <div style={{ padding: '16px 18px 16px 16px', flex: 1 }}>
                <p style={{
                  color: learningStyle === value ? '#e0e7ff' : '#cbd5e1',
                  fontSize: '0.95rem', fontWeight: 700, marginBottom: '5px', letterSpacing: '-0.2px',
                }}>{label}</p>
                <p style={{
                  color: learningStyle === value ? 'rgba(224,231,255,0.55)' : '#475569',
                  fontSize: '0.82rem', lineHeight: 1.55,
                }}>{desc}</p>
              </div>
            </OptionCard>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
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
        <ProgressBar current={3} total={3} />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-1.2px', marginBottom: '6px' }}>
          When do you do your best work?
        </h2>
        <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '24px' }}>
          We'll schedule your sessions when your focus is at its peak.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
          {TIME_OPTIONS.map(({ value, label, emoji, desc }) => (
            <OptionCard
              key={value}
              selected={preferredTime === value}
              onClick={() => setPreferredTime(value)}
              style={{ padding: '22px 12px 18px', width: '100%', textAlign: 'center' }}
            >
              <p style={{ fontSize: '1.5rem', marginBottom: '8px', lineHeight: 1 }}>{emoji}</p>
              <p style={{
                color: preferredTime === value ? '#c7d2fe' : '#cbd5e1',
                fontSize: '0.92rem', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.2px',
              }}>{label}</p>
              <p style={{
                color: preferredTime === value ? 'rgba(199,210,254,0.55)' : '#334155',
                fontSize: '0.75rem', lineHeight: 1.45,
              }}>{desc}</p>
            </OptionCard>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <BackBtn onClick={() => goTo(3, -1)} />
          <ContinueBtn
            onClick={() => onComplete({ yearLevel, learningStyle, preferredTime })}
            disabled={!preferredTime}
            label="Enter StudyEdge"
          />
        </div>
      </StepWrap>
    </Page>
  )

  return null
}
