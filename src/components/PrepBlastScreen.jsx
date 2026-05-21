import { useState, useEffect } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan } from '../lib/subscription'
import { getCachedCoachPlan } from '../lib/db'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', blue: '#3B61C4',
}

const MODE_CONFIG = {
  weakness:       { color: '#8B5CF6', icon: '↓', label: 'Weak areas' },
  'exam-topics':  { color: '#DC2626', icon: '★', label: 'Exam focus' },
  'focus-question': { color: '#3B61C4', icon: '?', label: 'Focus question' },
}

function selectMode(session, course, isPro) {
  if (!isPro) return 'weakness'
  const daysUntilExam = course?.examDate
    ? Math.round((new Date(course.examDate + 'T12:00') - Date.now()) / 86400000)
    : null
  if (daysUntilExam !== null && daysUntilExam <= 7) return 'exam-topics'
  return 'focus-question'
}

export default function PrepBlastScreen({ session, course, onDismiss, userId }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const [blast, setBlast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const mode = selectMode(session, course, isPro)
    const coachPlan = getCachedCoachPlan(session.courseId)
    const coachFocus = coachPlan?.phases?.[0]?.focus ?? coachPlan?.weeklyFocus ?? null

    async function fetchBlast(attempt = 0) {
      if (!canUseAI()) { setLoading(false); setBlast(null); return }
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/prep-blast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            courseName: session.courseName,
            sessionType: session.sessionType,
            mode,
            coachFocus: coachFocus ?? undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        incrementAIQuery()
        setBlast(data)
        setError(false)
      } catch (e) {
        console.error('[prep-blast]', e)
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 1200))
          return fetchBlast(attempt + 1)
        }
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    setLoading(true)
    setError(false)
    fetchBlast()
  }, [retryCount])

  const mode = blast?.mode ?? 'weakness'
  const cfg = MODE_CONFIG[mode] ?? MODE_CONFIG.weakness
  const courseColor = course?.color?.dot ?? D.blue

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#F7F6F3',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes blast-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${courseColor}30`, borderTopColor: courseColor, animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 14, color: D.textMuted, fontWeight: 500 }}>Preparing your session...</div>
        </div>
      ) : error ? (
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="20" height="20" fill="none" stroke="#DC2626" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
            </svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: D.text, margin: '0 0 6px' }}>Couldn't load your prep brief</p>
          <p style={{ fontSize: 13, color: D.textMuted, margin: '0 0 24px', lineHeight: 1.55 }}>There was a problem reaching the AI. You can retry or skip straight to your session.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => { setRetryCount(c => c + 1) }}
              style={{ padding: '12px', background: courseColor, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
            <button
              onClick={onDismiss}
              style={{ padding: '12px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 10, color: D.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Skip, start session
            </button>
          </div>
        </div>
      ) : !blast ? (
        // No AI quota — skip gracefully with a start button
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: D.textMuted, margin: '0 0 20px', lineHeight: 1.55 }}>Ready to study {session.courseName}?</p>
          <button onClick={onDismiss} style={{ width: '100%', padding: '14px', background: courseColor, border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Start session
          </button>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 440, animation: 'blast-in 0.4s ease' }}>
          {/* Course label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: courseColor, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: D.textMuted }}>{session.courseName}</span>
            <span style={{ fontSize: 12, color: D.textDim }}>·</span>
            <span style={{ fontSize: 12, color: D.textDim }}>{session.sessionType ?? 'Study Session'}</span>
          </div>

          {/* Mode pill */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '4px 12px', borderRadius: 999,
              color: cfg.color, background: `${cfg.color}12`, border: `1px solid ${cfg.color}25`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 12 }}>{cfg.icon}</span>
              {cfg.label}
            </span>
          </div>

          {/* Headline */}
          <h2 style={{ fontSize: 22, fontWeight: 700, color: D.text, textAlign: 'center', letterSpacing: -0.5, margin: '0 0 20px', lineHeight: 1.25 }}>
            {blast.headline}
          </h2>

          {/* Content */}
          <div style={{ background: D.bgCard, borderRadius: 16, border: `1px solid ${D.border}`, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: '20px 24px', marginBottom: 24 }}>
            {mode === 'focus-question' ? (
              <>
                <p style={{ fontSize: 16, fontWeight: 600, color: D.text, lineHeight: 1.55, margin: '0 0 14px' }}>{blast.question}</p>
                {blast.why && <p style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.55, margin: 0, padding: '12px 0 0', borderTop: `1px solid ${D.border}` }}>{blast.why}</p>}
              </>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(blast.points ?? []).map((point, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, background: `${cfg.color}12`, border: `1px solid ${cfg.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: cfg.color, flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 14, color: D.text, lineHeight: 1.5, fontWeight: 500 }}>{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Action prompt */}
          {blast.actionPrompt && (
            <p style={{ fontSize: 13, color: D.textMuted, textAlign: 'center', lineHeight: 1.55, margin: '0 0 24px' }}>
              {blast.actionPrompt}
            </p>
          )}

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            style={{
              width: '100%', padding: '14px',
              background: courseColor, border: 'none', borderRadius: 12,
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 4px 16px ${courseColor}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Got it, start session
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
