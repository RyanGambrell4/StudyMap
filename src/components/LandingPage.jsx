import { useState, useEffect, useRef } from 'react'

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
  const [stickyDismissed, setStickyDismissed] = useState(
    () => sessionStorage.getItem('sticky_bar_dismissed') === '1'
  )

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const heroStageRef = useRef(null)
  useEffect(() => {
    const stage = heroStageRef.current
    if (!stage) return
    const STAGE_W = 1920
    const scale = () => {
      const w = stage.parentElement.offsetWidth
      stage.style.transform = `scale(${w / STAGE_W})`
    }
    const ro = new ResizeObserver(scale)
    ro.observe(stage.parentElement)
    scale()
    return () => ro.disconnect()
  }, [])

  const goTrial = () => window.location.href = '/app?signup=1&plan=pro&billing=monthly&trial=1'

  return (
    /* intentionally dark — marketing landing page; the app shell itself is light-themed */
    <div style={{ backgroundColor: '#060614', color: '#e2e8f0', minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ── Sticky bottom trial bar ── */}
      {!stickyDismissed && scrollY > 300 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
          background: 'linear-gradient(90deg, #1e1b4b, #312e81)',
          borderTop: '1px solid rgba(99,102,241,0.4)',
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 14, color: '#c7d2fe', fontWeight: 500 }}>
            ✦ Try Pro free for 7 days — card charged after trial, cancel anytime before.
          </span>
          <button
            onClick={goTrial}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none', borderRadius: 8, padding: '8px 20px',
              fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Start free trial →
          </button>
          <button
            onClick={() => { sessionStorage.setItem('sticky_bar_dismissed', '1'); setStickyDismissed(true) }}
            style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

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
            alt="StudyEdge AI"
            style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'contain' }}
          />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>StudyEdge AI</span>
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
      <section aria-label="StudyEdge landing hero" style={{
        position: 'relative', width: '100%', aspectRatio: '16/5',
        overflow: 'hidden', background: '#060614', isolation: 'isolate',
      }}>
        {/* 1920×600 stage — scaled to fill container width */}
        <div ref={heroStageRef} style={{
          position: 'absolute', inset: 0,
          width: 1920, height: 600,
          transformOrigin: 'top left',
        }}>

          {/* Background: frost */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(900px 480px at 72% 55%, #0d1117 0%, rgba(13,17,23,0.55) 35%, rgba(13,17,23,0) 70%)',
            zIndex: 0,
          }} />
          {/* Background: glow */}
          <div aria-hidden="true" style={{
            position: 'absolute', left: '58%', top: '30%',
            width: 1200, height: 800,
            transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(closest-side, rgba(99,102,241,0.18), rgba(99,102,241,0.05) 45%, rgba(99,102,241,0) 75%)',
            filter: 'blur(6px)', zIndex: 0,
          }} />
          {/* Background: dot grid */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            WebkitMaskImage: 'radial-gradient(ellipse 1000px 500px at 65% 50%, rgba(0,0,0,0.55), transparent 70%)',
            maskImage: 'radial-gradient(ellipse 1000px 500px at 65% 50%, rgba(0,0,0,0.55), transparent 70%)',
            zIndex: 0,
          }} />

          {/* Left copy */}
          <div style={{
            position: 'absolute', left: 100, top: '50%', transform: 'translateY(-50%)',
            zIndex: 4, width: 640,
          }}>
            {/* Brand chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '6px 12px 6px 8px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.025)',
              borderRadius: 999, fontSize: 13, fontWeight: 500,
              letterSpacing: '0.01em', color: 'rgba(255,255,255,0.78)',
              marginBottom: 28, backdropFilter: 'blur(8px)',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12, color: '#fff',
                boxShadow: '0 4px 12px rgba(99,102,241,0.45)', flexShrink: 0,
              }}>S</span>
              <span>StudyEdge AI</span>
              <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>getstudyedge.com</span>
            </div>

            {/* Headline */}
            <h1 style={{
              fontSize: 70, lineHeight: 0.98, letterSpacing: '-0.035em',
              fontWeight: 600, margin: '0 0 22px', color: '#fff',
            }}>
              While others cram.<br />
              <span style={{
                fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
                fontWeight: 400, letterSpacing: '-0.02em',
                background: 'linear-gradient(180deg, #ffffff 0%, #c7c8ff 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>You execute</span><span style={{ color: '#6366F1' }}>.</span>
            </h1>

            {/* Subline */}
            <p style={{
              fontSize: 19, lineHeight: 1.5, color: 'rgba(226,232,240,0.62)',
              margin: '0 0 28px', maxWidth: 520, fontWeight: 400, letterSpacing: '-0.005em',
            }}>
              Your AI study system — plans, coaches, tracks, and tells you exactly where to focus. Every course. All semester.
            </p>

            {/* Social proof */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: 500, letterSpacing: '-0.005em',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#6366F1',
                boxShadow: '0 0 12px #6366F1', flexShrink: 0,
              }} />
              <span>Built for serious students &nbsp;·&nbsp; <strong style={{ color: '#fff', fontWeight: 600 }}>9.6h studied this week</strong></span>
            </div>
          </div>

          {/* Mockup */}
          <div style={{
            position: 'absolute', right: -30, top: 10, zIndex: 3,
            perspective: 2400, perspectiveOrigin: '50% 50%',
            width: 940, height: 580,
          }}>
            <div style={{
              width: 940, height: 580,
              transform: 'rotateX(4deg) rotateY(-7deg) rotateZ(0.3deg)',
              transformOrigin: '50% 50%', transformStyle: 'preserve-3d',
              boxShadow: '0 50px 100px rgba(0,0,0,0.65), 0 25px 50px rgba(0,0,0,0.45), 0 0 80px rgba(99,102,241,0.10), 0 0 0 1px rgba(255,255,255,0.06)',
              borderRadius: 12, overflow: 'hidden', background: '#1c1c1e',
            }}>
              {/* Browser chrome */}
              <div style={{
                height: 34, background: '#1c1c1e',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12,
              }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#ff5f57','#febc2e','#28c840'].map(c => (
                    <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  ))}
                </div>
                <div style={{
                  flex: 1, maxWidth: 380, margin: '0 auto',
                  background: '#2a2a2d', borderRadius: 7, padding: '6px 12px',
                  fontSize: 12, color: 'rgba(255,255,255,0.55)',
                  display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.005em',
                }}>
                  <svg style={{ width: 10, height: 10, opacity: 0.6, flexShrink: 0 }} viewBox="0 0 16 16" fill="none">
                    <path d="M4 7V5a4 4 0 1 1 8 0v2M3.5 7h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <span>app.getstudyedge.com<strong style={{ color: '#fff', fontWeight: 500 }}>/dashboard</strong></span>
                </div>
                <div style={{ width: 60 }} />
              </div>

              {/* App interior */}
              <div style={{
                height: 546, background: '#F5F4EF', color: '#0F172A',
                padding: '20px 26px 0', overflow: 'hidden', fontSize: 12.5,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}>
                <div style={{ color: '#6366F1', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>FRIDAY, MAY 22</div>
                <h2 style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 30, lineHeight: 1.02, margin: '0 0 6px', letterSpacing: '-0.01em', color: '#0F172A' }}>
                  Good morning<span style={{ color: '#6366F1' }}>.</span>
                </h2>
                <p style={{ color: '#64748B', fontSize: 12, marginBottom: 16, letterSpacing: '-0.005em' }}>9 sessions on the schedule. Linear Algebra exam in 3 days.</p>

                {/* Top grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14, marginBottom: 14 }}>
                  {/* Up Next */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)', position: 'relative', overflow: 'hidden', minHeight: 170 }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(254,215,170,0.45) 0%, rgba(255,255,255,0) 55%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#EA580C', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> UP NEXT TODAY
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: '#EA580C', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, whiteSpace: 'nowrap' }}>
                        Organic Chemistry <span style={{ color: '#94A3B8', fontWeight: 400 }}>· 9:00 AM → 10:00 AM</span>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#0F172A', display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                        Practice <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400, letterSpacing: 0 }}>60 min</span>
                      </div>
                      <button style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EA580C', color: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 600, fontSize: 12.5, boxShadow: '0 6px 16px rgba(234,88,12,0.28)', letterSpacing: '-0.005em', fontFamily: 'inherit', cursor: 'pointer', border: 'none' }}>
                        <span style={{ display: 'block', width: 0, height: 0, borderLeft: '7px solid #fff', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' }} />
                        Start session
                      </button>
                      <div style={{ marginTop: 14, display: 'flex', gap: 18, alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                        {['Mark done','Skip','Pomodoro · 25 + 5'].map((t, i, a) => (
                          <span key={t} style={i < a.length - 1 ? { paddingRight: 18, borderRight: '1px solid #E5E7EB' } : {}}>{t}</span>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>AI-structured session blocks · recall checkpoints</div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> QUICK ACTIONS
                    </div>
                    {[
                      { icon: '◫', bg: '#EEF2FF', color: '#4F46E5', title: 'Study Coach', desc: 'AI-powered weekly plan' },
                      { icon: '◎', bg: '#ECFDF5', color: '#059669', title: 'Grade Hub', desc: 'Track grades and targets' },
                      { icon: '▤', bg: '#F3E8FF', color: '#7C3AED', title: 'Flashcards', desc: 'Test your knowledge' },
                    ].map(({ icon, bg, color, title, desc }) => (
                      <div key={title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 4px', borderBottom: '1px solid #F1F5F9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{icon}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: '#0F172A' }}>{title}</div>
                            <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 1 }}>{desc}</div>
                          </div>
                        </div>
                        <span style={{ color: '#CBD5E1', fontSize: 14 }}>›</span>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ gridColumn: '1/-1', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8', textAlign: 'center', marginBottom: 2 }}>STUDY HACKS</div>
                      {[
                        { bg: '#F5F3FF', border: '#EDE9FE', icon: '◫', color: '#7C3AED', name: 'Brain Dump' },
                        { bg: '#FEF2F2', border: '#FEE2E2', icon: '◈', color: '#EF4444', name: 'Rescue Plan' },
                        { bg: '#FFF7ED', border: '#FED7AA', icon: '⚡', color: '#EA580C', name: 'Quiz Burst' },
                      ].map(({ bg, border, icon, color, name }) => (
                        <div key={name} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, fontSize: 12, color }}>{icon}</div>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0F172A' }}>{name}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, padding: '9px 12px', background: '#F8FAFC', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B' }}>
                      <div><strong style={{ color: '#0F172A' }}>9.7h</strong> this week · <strong style={{ color: '#0F172A' }}>78%</strong> recall</div>
                      <div style={{ color: '#6366F1', fontWeight: 600 }}>Progress →</div>
                    </div>
                  </div>
                </div>

                {/* Brief */}
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#EA580C', marginBottom: 4 }}>● TODAY'S BRIEF</div>
                    <div style={{ color: '#0F172A', fontWeight: 500 }}>Linear Algebra exam in 3 days. Add focused review sessions this week to stay on track.</div>
                  </div>
                  <button style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 500, color: '#0F172A', whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>View schedule</button>
                </div>

                {/* Bottom grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 18 }}>
                  {/* Courses */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> COURSES
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>Hrs · Recall <span style={{ color: '#4F46E5', fontWeight: 500, marginLeft: 8 }}>View all</span></div>
                    </div>
                    {[
                      { name: 'Cell Biology', last: 'Last studied today', hours: '7.2h', sessions: '12 sessions', status: 'On track', action: '88.5% · A', bar: '#22C55E', pillBg: '#FFEDD5', pillColor: '#C2410C' },
                      { name: 'Organic Chemistry', last: 'Last studied today', hours: '2.0h', sessions: '4 sessions', status: 'Needs Work', action: 'Brain Dump →', bar: '#F97316', pillBg: '#FFEDD5', pillColor: '#C2410C' },
                      { name: 'Cognitive Psychology', last: 'Last studied yesterday', hours: '2.2h', sessions: '5 sessions', status: 'Needs Work', action: 'Brain Dump →', bar: '#A855F7', pillBg: '#FFEDD5', pillColor: '#C2410C' },
                      { name: 'Linear Algebra', last: 'Last studied today · exam in 3 days', hours: '3.6h', sessions: '8 sessions', status: 'Priority', action: 'Rescue Plan →', bar: '#3B82F6', pillBg: '#FEE2E2', pillColor: '#B91C1C' },
                    ].map(({ name, last, hours, sessions, status, action, bar, pillBg, pillColor }, i) => (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', padding: i === 0 ? '4px 0 8px' : '8px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 3, height: 26, borderRadius: 2, background: bar, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{last}</div>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', textAlign: 'right' }}>{hours}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1, textAlign: 'right' }}>{sessions}</div>
                        </div>
                        <div>
                          <div style={{ background: pillBg, color: pillColor, borderRadius: 999, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{status}</div>
                          <div style={{ color: '#EA580C', fontSize: 10.5, fontWeight: 500, marginTop: 3, textAlign: 'right' }}>{action}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* This Week */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> THIS WEEK
                      </div>
                      <div style={{ background: '#ECFDF5', color: '#059669', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>✓ On pace</div>
                    </div>
                    {[
                      { bg: '#FFF7ED', color: '#EA580C', icon: '◉', label: 'Study streak', value: '14', unit: 'days', delta: '↑ +3' },
                      { bg: '#F8FAFC', color: '#64748B', icon: '◷', label: 'Hours studied', value: '9.6', unit: 'hrs', delta: '↑ +1.4' },
                      { bg: '#ECFDF5', color: '#16A34A', icon: '✓', label: 'Sessions done', value: '8', unit: '', delta: '↑ +2' },
                    ].map(({ bg, color, icon, label, value, unit, delta }, i) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 12, alignItems: 'center', padding: i === 0 ? '6px 0 10px' : '10px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9', fontSize: 13 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 13 }}>{icon}</div>
                        <div style={{ color: '#475569', fontSize: 13 }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', letterSpacing: '-0.02em' }}>{value}{unit && <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginLeft: 3 }}>{unit}</span>}</div>
                        <div style={{ background: '#ECFDF5', color: '#059669', borderRadius: 6, padding: '2px 6px', fontSize: 10.5, fontWeight: 600 }}>{delta}</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', marginBottom: 6 }}>
                        <span>Weekly goal</span>
                        <span style={{ color: '#0F172A', fontWeight: 600 }}>9.6 of 10h</span>
                      </div>
                      <div style={{ height: 6, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: '96%', height: '100%', background: 'linear-gradient(90deg, #22C55E, #16A34A)', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating card: Grade Hub */}
          <div style={{
            position: 'absolute', zIndex: 6,
            background: '#fff', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.55), 0 15px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
            color: '#0F172A', overflow: 'hidden',
            width: 290, right: 700, bottom: 24, transform: 'rotate(-2deg)',
            padding: '16px 18px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> Grade Hub
              </div>
              <div style={{ fontSize: 10.5, color: '#16A34A', fontWeight: 600, background: '#ECFDF5', padding: '3px 8px', borderRadius: 999 }}>3.78 GPA</div>
            </div>
            {[
              { dot: '#22C55E', name: 'Cell Biology',    pct: '88.5%', letter: 'A',  lc: '#16A34A' },
              { dot: '#3B82F6', name: 'Linear Algebra',  pct: '90.2%', letter: 'A−', lc: '#22C55E' },
              { dot: '#F97316', name: 'Organic Chem',    pct: '86.4%', letter: 'B+', lc: '#4F46E5' },
              { dot: '#A855F7', name: 'Cognitive Psyc',  pct: '82.0%', letter: 'B',  lc: '#64748B' },
            ].map(({ dot, name, pct, letter, lc }, i) => (
              <div key={name} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto auto', gap: 10, alignItems: 'center', padding: i === 0 ? '2px 0 9px' : '9px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.005em' }}>{name}</div>
                <div style={{ fontSize: 12.5, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{pct}</div>
                <div style={{ fontSize: 13, fontWeight: 800, width: 30, textAlign: 'right', letterSpacing: '-0.02em', color: lc }}>{letter}</div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Cumulative GPA</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1, color: '#0F172A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>3.78</div>
            </div>
          </div>

          {/* Floating card: Streak */}
          <div style={{
            position: 'absolute', zIndex: 6,
            background: '#fff', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.55), 0 15px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
            color: '#0F172A', overflow: 'hidden',
            width: 270, right: 110, bottom: 12, transform: 'rotate(2deg)',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg, #FB923C, #EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 6px 14px rgba(251,146,60,0.4)', flexShrink: 0 }}>🔥</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: '#0F172A', lineHeight: 1 }}>
                  14<span style={{ fontSize: 13, fontWeight: 500, color: '#64748B', marginLeft: 4, letterSpacing: 0 }}>day streak</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, letterSpacing: '-0.005em' }}>Longest this semester</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 32, marginBottom: 8 }}>
              {[30,45,38,60,55,72,68,80,75,88,92,96,60,60].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: i >= 12 ? '#E2E8F0' : 'linear-gradient(180deg, #6366F1, #4F46E5)', borderRadius: 2, opacity: i >= 12 ? 1 : 0.9 }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
              <span>Hours this week</span>
              <strong style={{ color: '#0F172A', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>9.6 hrs</strong>
            </div>
          </div>

          {/* Vignette */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.4) 100%), radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)',
          }} />
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

      {/* ── Testimonials ── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800,
            color: '#fff', letterSpacing: '-0.6px', marginBottom: 10,
          }}>
            Students who stopped winging it
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(226,232,240,0.4)', maxWidth: 420, margin: '0 auto' }}>
            Real results from real students this semester.
          </p>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
        }}>
          {[
            {
              quote: "I went from a C+ to a B+ in Organic Chemistry. Having a session plan every time I sat down made the difference — I stopped wasting time figuring out what to study.",
              name: 'Maya R.',
              role: '3rd year · Pre-Med',
              color: '#6366f1',
            },
            {
              quote: "Finals week used to be pure panic. This semester I had everything mapped out 3 weeks before. I actually slept the night before my Calc exam.",
              name: 'Jordan T.',
              role: '2nd year · Engineering',
              color: '#8b5cf6',
            },
            {
              quote: "The flashcards it generates from my notes are way better than what I'd make myself. I just do a session and it handles the rest.",
              name: 'Priya S.',
              role: '1st year · Business',
              color: '#ec4899',
            },
            {
              quote: "I have 5 courses and a part-time job. Before this I was always behind. Now I actually know what to do every day and I'm keeping up.",
              name: 'Marcus L.',
              role: '4th year · Psychology',
              color: '#f59e0b',
            },
            {
              quote: "The Study Coach is what got me. It knows which topics I'm weak on and focuses my sessions there. My GPA went from 2.8 to 3.4 in one semester.",
              name: 'Aisha K.',
              role: '2nd year · Biology',
              color: '#10b981',
            },
            {
              quote: "I was skeptical about another study app but the AI session blueprints are genuinely useful. It's the only app I've used for more than a week.",
              name: 'Chris M.',
              role: '3rd year · Computer Science',
              color: '#22d3ee',
            },
          ].map(({ quote, name, role, color }) => (
            <div key={name} style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: '24px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {/* Stars */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="13" height="13" viewBox="0 0 20 20" fill={color}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                ))}
              </div>
              {/* Quote */}
              <p style={{
                fontSize: 14, color: 'rgba(226,232,240,0.7)',
                lineHeight: 1.65, margin: 0, flex: 1,
              }}>
                "{quote}"
              </p>
              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: `${color}22`, border: `1px solid ${color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color,
                }}>
                  {name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.35)' }}>{role}</div>
                </div>
              </div>
            </div>
          ))}
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
          Join thousands of students already using StudyEdge AI to crush their classes.
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
        <span>© 2026 StudyEdge AI. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="mailto:support@getstudyedge.com" style={{ color: 'rgba(226,232,240,0.35)', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>
    </div>
  )
}
