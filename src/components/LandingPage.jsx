import { useState, useEffect } from 'react'

function FeatureCard({ color, icon, title, desc, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, overflow: 'hidden', transition: 'all 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.border = `1px solid ${color}44`}
      onMouseLeave={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)'}
    >
      <div style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.05)', minHeight: 200 }}>
        {children}
      </div>
      <div style={{ padding: '20px 24px 28px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `${color}18`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, marginBottom: 12,
        }}>
          {icon}
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'rgba(226,232,240,0.45)', lineHeight: 1.6 }}>{desc}</p>
      </div>
    </div>
  )
}

export default function LandingPage({ onGetStarted }) {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div style={{ backgroundColor: '#060614', color: '#e2e8f0', minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrollY > 40 ? 'rgba(6,6,20,0.92)' : 'transparent',
        backdropFilter: scrollY > 40 ? 'blur(16px)' : 'none',
        borderBottom: scrollY > 40 ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/favicon.png"
            alt="StudyEdge"
            style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'contain' }}
          />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>StudyEdge</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onGetStarted('login')}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              color: '#e2e8f0', borderRadius: 10, padding: '9px 20px',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.target.style.borderColor = 'rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
          >
            Sign in
          </button>
          <button
            onClick={() => onGetStarted('signup')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none', color: '#fff', borderRadius: 10, padding: '9px 22px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 20px rgba(99,102,241,0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.target.style.boxShadow = '0 0 30px rgba(99,102,241,0.5)'}
            onMouseLeave={e => e.target.style.boxShadow = '0 0 20px rgba(99,102,241,0.3)'}
          >
            Get Started Free
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section style={{
        paddingTop: '140px', paddingBottom: '80px',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 900, height: 600, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(91,110,245,0.12) 0%, transparent 65%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)',
          borderRadius: 999, padding: '6px 16px', marginBottom: 28, fontSize: 13, fontWeight: 600,
          color: '#a5b4fc',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
          AI-powered study planner for students
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 900, lineHeight: 1.08,
          letterSpacing: '-1.5px', color: '#fff', maxWidth: 720,
          margin: '0 auto 20px', position: 'relative',
        }}>
          Study smarter.{' '}
          <span style={{
            background: 'linear-gradient(135deg, #6366f1, #818cf8, #a5b4fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Score higher.
          </span>
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: 'clamp(16px, 2vw, 19px)', color: 'rgba(226,232,240,0.55)',
          maxWidth: 540, margin: '0 auto 40px', lineHeight: 1.6, fontWeight: 400,
        }}>
          AI builds your perfect study plan for every session. Flashcards, focus timer, study coach, everything you need in one app.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <button
            onClick={() => onGetStarted('signup')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none', color: '#fff', borderRadius: 12, padding: '14px 32px',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 30px rgba(99,102,241,0.35), 0 4px 20px rgba(0,0,0,0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.target.style.boxShadow = '0 0 45px rgba(99,102,241,0.55), 0 4px 20px rgba(0,0,0,0.3)'}
            onMouseLeave={e => e.target.style.boxShadow = '0 0 30px rgba(99,102,241,0.35), 0 4px 20px rgba(0,0,0,0.3)'}
          >
            Start Studying Free →
          </button>
          <span style={{ fontSize: 13, color: 'rgba(226,232,240,0.35)' }}>No credit card required</span>
        </div>

        {/* Hero Image */}
        <div style={{
          maxWidth: 1400, margin: '60px auto 0', padding: '0 24px', position: 'relative',
        }}>
          {/* Glow behind image */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '110%', height: '110%',
            background: 'radial-gradient(ellipse, rgba(91,110,245,0.18) 0%, transparent 60%)',
            filter: 'blur(60px)', pointerEvents: 'none',
          }} />
          <img
            src="/ss-main-screen.png"
            alt="StudyEdge app: dashboard, AI study planner, flashcards, focus mode, and study coach"
            style={{
              display: 'block', width: '100%', borderRadius: 16, position: 'relative',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 0 100px rgba(91,110,245,0.3), 0 60px 120px rgba(0,0,0,0.6)',
              transform: 'perspective(1200px) rotateX(5deg)',
              transformOrigin: 'top center',
            }}
          />
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section style={{
        maxWidth: 1000, margin: '0 auto', padding: '80px 24px 100px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{
            fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 800,
            color: '#fff', letterSpacing: '-0.8px', marginBottom: 12,
          }}>
            Everything you need to ace your classes
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(226,232,240,0.45)', maxWidth: 480, margin: '0 auto' }}>
            Built by students, for students. Every feature is designed to help you study less and learn more.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>

          {/* ── 1. AI Session Planner ── */}
          <FeatureCard color="#6366f1" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="#6366f1"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg>} title="AI Session Planner" desc="AI breaks every study session into timed steps: warm-up, deep review, active recall, and more. No guessing what to do next.">
            <div style={{ padding: '16px 16px 8px', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: 1, marginBottom: 8 }}>SESSION PLAN READY</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, lineHeight: 1.3 }}>Memory & Encoding: Active Recall</div>
              <div style={{ display: 'flex', gap: 3, marginBottom: 10, borderRadius: 4, overflow: 'hidden', height: 8 }}>
                <div style={{ flex: 1, background: '#a78bfa' }} />
                <div style={{ flex: 2, background: '#6366f1' }} />
                <div style={{ flex: 1.5, background: '#818cf8' }} />
                <div style={{ flex: 0.8, background: '#22c55e' }} />
                <div style={{ flex: 1.2, background: '#a78bfa' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {['Active Recall','Review','Break','Summary'].map((t,i) => (
                  <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: ['#a78bfa22','#6366f122','#22c55e22','#2dd4bf22'][i], color: ['#a78bfa','#818cf8','#22c55e','#2dd4bf'][i], border: `1px solid ${['#a78bfa44','#6366f144','#22c55e44','#2dd4bf44'][i]}` }}>{t}</span>
                ))}
              </div>
              {[['5 min','Warm-Up Recall','#a78bfa'],['20 min','Core Concepts Deep Dive','#6366f1'],['15 min','Active Recall Sprint','#818cf8']].map(([time,label,color],i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 5, borderLeft: `2px solid ${color}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 36 }}>{time}</span>
                  <span style={{ fontSize: 11, color: 'rgba(226,232,240,0.7)' }}>{label}</span>
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ── 2. AI Study Coach ── */}
          <FeatureCard color="#7c5cfc" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>} title="AI Study Coach" desc="Ask questions, get explanations, quiz yourself. Like having a tutor available 24/7 for every course.">
            <div style={{ padding: '16px 16px 8px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7c5cfc', letterSpacing: 1, marginBottom: 10 }}>YOUR WEEK-BY-WEEK PLAN</div>
              {[
                { week: 'Week 1', label: 'Foundation & Understanding', sessions: [['Session 1','Memory: encoding, storage, retrieval','60m'],['Session 2','Sensation & Perception basics','45m']] },
                { week: 'Week 2', label: 'Midterm Prep Sprint', sessions: [['Session 1','Active Recall, all units','60m']] },
              ].map((w, wi) => (
                <div key={wi} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{w.week}</span>
                    <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.4)' }}>{w.label}</span>
                  </div>
                  {w.sessions.map(([s, label, dur], si) => (
                    <div key={si} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderTop: si > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#7c5cfc', fontWeight: 600, marginBottom: 2 }}>{s}</div>
                        <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.65)' }}>{label}</div>
                      </div>
                      <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.35)', flexShrink: 0, marginLeft: 8 }}>{dur}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ── 3. Smart Flashcards ── */}
          <FeatureCard color="#22c55e" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>} title="Smart Flashcards" desc="AI generates flashcards from your course material. Rate difficulty and focus on what you actually need to review.">
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 10, color: 'rgba(226,232,240,0.4)' }}>
                <span>Card 3 of 15</span><span>23% covered</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '20px 16px', textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1, marginBottom: 10 }}>CONCEPT</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.5, marginBottom: 12 }}>What is Miller's Law regarding short-term memory?</div>
                <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.3)', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>Tap to reveal answer</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['✗ Reviewing','rgba(239,68,68,0.15)','#ef4444'],['~ Almost','rgba(234,179,8,0.15)','#eab308'],['✓ Know it','rgba(34,197,94,0.15)','#22c55e']].map(([label,bg,color],i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '7px 4px', background: bg, borderRadius: 8, fontSize: 10, fontWeight: 600, color }}>{label}</div>
                ))}
              </div>
            </div>
          </FeatureCard>

          {/* ── 4. Focus Mode ── */}
          <FeatureCard color="#f97316" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>} title="Focus Mode" desc="Distraction-free study timer with session tracking. See your streak grow as you build consistent habits.">
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.35)', marginBottom: 12 }}>60 min session</div>
              <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 14px' }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#f97316" strokeWidth="6"
                    strokeDasharray="276" strokeDashoffset="80" strokeLinecap="round"
                    transform="rotate(-90 50 50)"/>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>24:35</div>
                  <div style={{ fontSize: 9, color: '#f97316', fontWeight: 600 }}>Active Recall</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 11, color: 'rgba(226,232,240,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>⏸ Pause</div>
                <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 11, color: 'rgba(226,232,240,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>Skip →</div>
              </div>
              <div style={{ padding: '9px', background: 'rgba(34,197,94,0.15)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>✓ Finish Block</div>
            </div>
          </FeatureCard>

          {/* ── 5. Study Schedule ── */}
          <FeatureCard color="#2dd4bf" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} title="Study Schedule" desc="See your entire week planned out, every session, every course, organized by time and priority.">
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                {['Mon','Tue','Wed','Thu','Fri'].map((d,i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'rgba(226,232,240,0.35)', marginBottom: 5 }}>{d}</div>
                    <div style={{ height: 28, borderRadius: 6, background: [i===0||i===2||i===4 ? 'rgba(99,102,241,0.35)' : i===1 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.04)'][0], border: `1px solid ${[i===0||i===2||i===4 ? 'rgba(99,102,241,0.5)' : i===1 ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)'][0]}`, margin: '0 2px' }} />
                  </div>
                ))}
              </div>
              {[
                ['9:00 AM','PSYC 101: Memory','#6366f1'],
                ['11:00 AM','Biology: Cell Division','#22c55e'],
                ['2:30 PM','PSYC 101: Perception','#6366f1'],
              ].map(([time, label, color], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 5, borderLeft: `2px solid ${color}` }}>
                  <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.35)', minWidth: 52 }}>{time}</span>
                  <span style={{ fontSize: 11, color: 'rgba(226,232,240,0.75)' }}>{label}</span>
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ── 6. Progress Dashboard ── */}
          <FeatureCard color="#a78bfa" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>} title="Progress Dashboard" desc="Track your streaks, sessions completed, hours studied. Stay motivated with real data on your progress.">
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display:'flex', justifyContent:'center', color:'#f97316' }}><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd"/></svg></div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>7</div>
                  <div style={{ fontSize: 9, color: 'rgba(226,232,240,0.4)' }}>day streak</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display:'flex', justifyContent:'center', color:'#22c55e' }}><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg></div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>32</div>
                  <div style={{ fontSize: 9, color: 'rgba(226,232,240,0.4)' }}>sessions done</div>
                </div>
              </div>
              <div style={{ background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#a78bfa', marginBottom: 10, border: '1px solid rgba(167,139,250,0.2)' }}>
                Great start. Consistency is everything. Keep going!
              </div>
              {[['PSYC 101', 78, '#6366f1'],['Biology', 52, '#22c55e'],['Study Hours', 65, '#a78bfa']].map(([label, pct, color], i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(226,232,240,0.5)', marginBottom: 4 }}>
                    <span>{label}</span><span>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </FeatureCard>

        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section style={{
        textAlign: 'center', padding: '60px 24px 100px',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 600, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(91,110,245,0.10) 0%, transparent 65%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />
        <h2 style={{
          fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 800,
          color: '#fff', letterSpacing: '-0.6px', marginBottom: 14, position: 'relative',
        }}>
          Ready to study smarter?
        </h2>
        <p style={{
          fontSize: 16, color: 'rgba(226,232,240,0.45)', marginBottom: 32, position: 'relative',
        }}>
          Join thousands of students already using StudyEdge to crush their classes.
        </p>
        <button
          onClick={() => onGetStarted('signup')}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none', color: '#fff', borderRadius: 12, padding: '14px 36px',
            fontSize: 16, fontWeight: 700, cursor: 'pointer', position: 'relative',
            boxShadow: '0 0 30px rgba(99,102,241,0.35), 0 4px 20px rgba(0,0,0,0.3)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.target.style.boxShadow = '0 0 45px rgba(99,102,241,0.55), 0 4px 20px rgba(0,0,0,0.3)'}
          onMouseLeave={e => e.target.style.boxShadow = '0 0 30px rgba(99,102,241,0.35), 0 4px 20px rgba(0,0,0,0.3)'}
        >
          Get Started Free →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: 'rgba(226,232,240,0.25)',
      }}>
        <span>© 2026 StudyEdge. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="mailto:support@getstudyedge.com" style={{ color: 'rgba(226,232,240,0.35)', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>
    </div>
  )
}
