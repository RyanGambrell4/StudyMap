import { useState, useEffect } from 'react'

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
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" fill="none" stroke="#fff" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
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
          AI builds your perfect study plan for every session. Flashcards, focus timer, study coach — everything you need in one app.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 60 }}>
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
          maxWidth: 1100, margin: '0 auto', position: 'relative', padding: '0 24px',
        }}>
          {/* Glow behind image */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '110%', height: '110%',
            background: 'radial-gradient(ellipse, rgba(91,110,245,0.15) 0%, transparent 60%)',
            filter: 'blur(50px)', pointerEvents: 'none',
          }} />
          <img
            src="/hero-landing.png"
            alt="StudyEdge app — dashboard, AI study planner, flashcards, focus mode, and study coach"
            style={{
              width: '100%', borderRadius: 16, position: 'relative',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 0 60px rgba(91,110,245,0.18), 0 40px 80px rgba(0,0,0,0.5)',
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
          {[
            {
              icon: '✦', color: '#6366f1',
              title: 'AI Session Planner',
              desc: 'AI breaks every study session into timed steps — warm-up, deep review, active recall, and more. No guessing what to do next.',
            },
            {
              icon: '💬', color: '#7c5cfc',
              title: 'AI Study Coach',
              desc: 'Ask questions, get explanations, quiz yourself — like having a tutor available 24/7 for every course.',
            },
            {
              icon: '🃏', color: '#22c55e',
              title: 'Smart Flashcards',
              desc: 'AI generates flashcards from your course material. Rate difficulty and focus on what you actually need to review.',
            },
            {
              icon: '🎯', color: '#f97316',
              title: 'Focus Mode',
              desc: 'Distraction-free study timer with session tracking. See your streak grow as you build consistent habits.',
            },
            {
              icon: '📅', color: '#2dd4bf',
              title: 'Study Schedule',
              desc: 'See your entire day planned out — every session, every course, organized by time and priority.',
            },
            {
              icon: '📊', color: '#a78bfa',
              title: 'Progress Dashboard',
              desc: 'Track your streaks, sessions completed, hours studied. Stay motivated with real data on your progress.',
            },
          ].map((f, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '28px 24px',
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${f.color}18`, border: `1px solid ${f.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(226,232,240,0.45)', lineHeight: 1.6 }}>{f.desc}</p>
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
