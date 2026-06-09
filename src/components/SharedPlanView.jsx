import { useMemo } from 'react'

function decode(hash) {
  try {
    const b64 = hash.startsWith('#') ? hash.slice(1) : hash
    return JSON.parse(decodeURIComponent(atob(b64)))
  } catch {
    return null
  }
}

export default function SharedPlanView() {
  const plan = useMemo(() => decode(window.location.hash), [])

  if (!plan) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F8FAFC', fontFamily: "'Inter', system-ui, sans-serif",
        gap: 12,
      }}>
        <div style={{ fontSize: 40 }}>🔗</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111111', margin: 0 }}>Invalid or expired link</h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>This study plan link couldn't be decoded.</p>
        <a href="/" style={{
          marginTop: 8, padding: '10px 22px', borderRadius: 10,
          background: '#6366F1', color: '#fff', fontSize: 14, fontWeight: 600,
          textDecoration: 'none',
        }}>Go to StudyEdge AI</a>
      </div>
    )
  }

  const { courseName, goal, weeks = [], topics = [] } = plan

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#F8FAFC',
      fontFamily: "'Inter', system-ui, sans-serif", color: '#111111',
    }}>
      {/* Nav */}
      <nav style={{
        borderBottom: '1px solid #E2E8F0', backgroundColor: '#fff',
        padding: '14px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'contain' }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#111111', letterSpacing: '-0.2px' }}>StudyEdge AI</span>
        </a>
        <a
          href="/app?signup=1"
          style={{
            padding: '8px 18px', borderRadius: 9,
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Try it free →
        </a>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <div style={{
          backgroundColor: '#fff', border: '1px solid #E2E8F0',
          borderRadius: 16, padding: '28px 28px 24px', marginBottom: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#EEF2FF', border: '1px solid #C7D2FE',
            borderRadius: 999, padding: '4px 12px', marginBottom: 14,
            fontSize: 12, fontWeight: 600, color: '#6366F1',
          }}>
            📋 Shared Study Plan
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111111', margin: '0 0 8px', letterSpacing: '-0.3px' }}>
            {courseName}
          </h1>
          {goal && (
            <p style={{ fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600, color: '#111111' }}>Goal:</span> {goal}
            </p>
          )}
        </div>

        {/* Priority Topics */}
        {topics.length > 0 && (
          <div style={{
            backgroundColor: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 16, padding: '22px 28px', marginBottom: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#6366F1', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Priority Topics
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topics.map((t, i) => (
                <span key={i} style={{
                  padding: '5px 12px', borderRadius: 999,
                  background: '#F1F5F9', border: '1px solid #E2E8F0',
                  fontSize: 13, color: '#334155', fontWeight: 500,
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Plan */}
        {weeks.length > 0 && (
          <div style={{
            backgroundColor: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 16, padding: '22px 28px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#6366F1', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 16px' }}>
              Week-by-Week Plan
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {weeks.map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '12px 16px', borderRadius: 10,
                  background: '#F8FAFC', border: '1px solid #F1F5F9',
                }}>
                  <div style={{
                    minWidth: 28, height: 28, borderRadius: 8,
                    background: '#EEF2FF', border: '1px solid #C7D2FE',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#6366F1',
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 2 }}>
                      {w.week}
                      {w.theme ? `: ${w.theme}` : ''}
                    </div>
                    {w.sessions > 0 && (
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>
                        {w.sessions} session{w.sessions !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{
          marginTop: 28, textAlign: 'center',
          padding: '28px 24px', borderRadius: 16,
          background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
          border: '1px solid #C7D2FE',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111111', marginBottom: 8, letterSpacing: '-0.2px' }}>
            Generate your own AI study plan
          </div>
          <p style={{ fontSize: 14, color: '#475569', margin: '0 0 18px', lineHeight: 1.6 }}>
            Upload your syllabus and get a week-by-week plan built around your courses in 30 seconds.
          </p>
          <a
            href="/app?signup=1"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 10,
              background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              color: '#fff', fontSize: 15, fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
            }}
          >
            Get started free
          </a>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>
            Joined by 2,000+ students this semester
          </div>
        </div>
      </div>
    </div>
  )
}
