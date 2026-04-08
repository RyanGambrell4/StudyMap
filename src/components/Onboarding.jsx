import { useState } from 'react'

// ── Options ───────────────────────────────────────────────────────────────────
const STYLE_OPTIONS = [
  { value: 'visual',   label: 'Visual',        desc: 'Diagrams, charts, and color-coded notes' },
  { value: 'reading',  label: 'Reading',        desc: 'Textbooks, notes, and written summaries' },
  { value: 'practice', label: 'Practice-based', desc: 'Problems, quizzes, and flashcards' },
]

const TIME_OPTIONS = [
  { value: 'Morning',   label: 'Morning',   desc: 'Before noon' },
  { value: 'Afternoon', label: 'Afternoon', desc: '12pm – 5pm' },
  { value: 'Evening',   label: 'Evening',   desc: 'After 5pm' },
]

// ── Animation wrapper ──────────────────────────────────────────────────────────
function StepWrap({ children, animKey, dir }) {
  return (
    <div key={animKey} className={dir >= 0 ? 'slide-in' : 'slide-in-back'} style={{ willChange: 'opacity, transform' }}>
      {children}
    </div>
  )
}

// ── Progress dots ──────────────────────────────────────────────────────────────
function StepDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300 ${
          i + 1 === current ? 'w-5 h-2 bg-indigo-500' : i + 1 < current ? 'w-2 h-2 bg-indigo-500/50' : 'w-2 h-2 bg-slate-700'
        }`} />
      ))}
    </div>
  )
}

// ── Logo ───────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex flex-col items-center mb-8">
      <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </div>
      <span className="text-2xl font-bold text-white tracking-tight">StudyEdge</span>
    </div>
  )
}

// ── Page shell ─────────────────────────────────────────────────────────────────
function Page({ children }) {
  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  )
}

// ── Continue button ────────────────────────────────────────────────────────────
function ContinueBtn({ onClick, disabled, label = 'Continue' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-base"
    >
      {label}
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </button>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="px-5 bg-slate-800 border border-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl hover:bg-slate-700 transition-colors">
      Back
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const [step, setStep]           = useState(1)
  const [animKey, setAnimKey]     = useState(0)
  const [animDir, setAnimDir]     = useState(1)

  // Q1: school type + year
  const [schoolType, setSchoolType] = useState(null) // 'hs' | 'uni'
  const [yearLevel, setYearLevel]   = useState(null)

  // Q2: learning style
  const [learningStyle, setLearningStyle] = useState(null)

  // Q3: study time preference
  const [preferredTime, setPreferredTime] = useState(null)

  const goTo = (next, dir = 1) => {
    setAnimDir(dir)
    setAnimKey(k => k + 1)
    setStep(next)
    window.scrollTo(0, 0)
  }

  const hsYears  = ['Freshman', 'Sophomore', 'Junior', 'Senior']
  const uniYears = ['1st Year', '2nd Year', '3rd Year', '4th Year+']

  // ── Step 1: Welcome ──────────────────────────────────────────────────────────
  if (step === 1) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <div className="text-center">
          <Logo />
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight leading-tight">
            Your semester,<br />mapped in 60 seconds
          </h1>
          <p className="text-slate-400 text-lg mb-3 leading-relaxed">
            3 quick questions — then you're in.
          </p>
          <p className="text-slate-600 text-sm mb-10">
            Courses, syllabi, and schedule setup happen inside the app.
          </p>
          <button
            onClick={() => goTo(2)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2.5"
          >
            Let's go
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </StepWrap>
    </Page>
  )

  // ── Step 2: School level + year ──────────────────────────────────────────────
  if (step === 2) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <StepDots current={1} total={3} />
        <h2 className="text-3xl font-bold text-white text-center mb-2">Where are you studying?</h2>
        <p className="text-slate-400 text-center mb-8">This shapes how we tailor your plan</p>

        {/* School type */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[{ key: 'hs', label: 'High School' }, { key: 'uni', label: 'University' }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setSchoolType(key); setYearLevel(null) }}
              className={`py-5 rounded-2xl border-2 font-bold text-base transition-all ${
                schoolType === key
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                  : 'border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Year — appears after picking school type */}
        {schoolType && (
          <div className="mb-8">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3 text-center">What year?</p>
            <div className="grid grid-cols-2 gap-3">
              {(schoolType === 'hs' ? hsYears : uniYears).map(yr => (
                <button
                  key={yr}
                  onClick={() => setYearLevel(yr)}
                  className={`py-4 rounded-2xl border-2 font-semibold text-sm transition-all ${
                    yearLevel === yr
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>
        )}

        <ContinueBtn onClick={() => goTo(3)} disabled={!yearLevel} />
      </StepWrap>
    </Page>
  )

  // ── Step 3: Learning style ───────────────────────────────────────────────────
  if (step === 3) return (
    <Page>
      <StepWrap animKey={animKey} dir={animDir}>
        <StepDots current={2} total={3} />
        <h2 className="text-3xl font-bold text-white text-center mb-2">How do you learn best?</h2>
        <p className="text-slate-400 text-center mb-8">We'll tailor your study materials to match</p>

        <div className="space-y-3 mb-8">
          {STYLE_OPTIONS.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setLearningStyle(value)}
              className={`w-full flex items-center justify-between gap-4 px-5 py-5 rounded-2xl border-2 transition-all text-left ${
                learningStyle === value
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/60'
              }`}
            >
              <div>
                <p className={`font-bold text-base mb-0.5 ${learningStyle === value ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</p>
                <p className="text-slate-500 text-sm">{desc}</p>
              </div>
              {learningStyle === value && (
                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
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
        <StepDots current={3} total={3} />
        <h2 className="text-3xl font-bold text-white text-center mb-2">When do you prefer to study?</h2>
        <p className="text-slate-400 text-center mb-8">We'll schedule your sessions around your peak hours</p>

        <div className="grid grid-cols-3 gap-3 mb-8">
          {TIME_OPTIONS.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setPreferredTime(value)}
              className={`flex flex-col items-center gap-2 py-7 px-3 rounded-2xl border-2 transition-all ${
                preferredTime === value
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/60'
              }`}
            >
              <p className={`font-bold text-base ${preferredTime === value ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</p>
              <p className="text-slate-500 text-xs text-center leading-tight">{desc}</p>
              {preferredTime === value && (
                <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center mt-1">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
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
