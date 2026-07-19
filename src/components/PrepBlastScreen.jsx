import { useState, useEffect } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan } from '../lib/subscription'
import { getCachedCoachPlan } from '../lib/db'
import { track } from '../lib/analytics'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', muted: '#6B6B6B', dim: '#9B9B9B',
  accent: '#3B61C4', green: '#16A34A', amber: '#D97706', red: '#DC2626',
}

const MODE_CONFIG = {
  weakness:         { color: '#3B61C4', label: 'Weak areas',     desc: 'Focus on closing these gaps' },
  'exam-topics':    { color: '#DC2626', label: 'Exam focus',     desc: 'Most likely on your exam' },
  'focus-question': { color: '#3B61C4', label: 'Focus question', desc: 'Answer this before you finish' },
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
        track('prep_blast_generated', { mode, courseName: session.courseName, sessionType: session.sessionType, plan })
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
  const courseColor = course?.color?.dot ?? D.accent

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: D.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pb-in { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Spinner size="md" color={courseColor} track={`${courseColor}25`} />
          <div style={{ fontSize: 13, color: D.muted, fontWeight: 500 }}>Preparing session brief...</div>
        </div>

      ) : error ? (
        <div style={{ width: '100%', maxWidth: 400, background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '28px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6 }}>Couldn't load session brief</div>
          <p style={{ fontSize: 13, color: D.muted, lineHeight: 1.6, margin: '0 0 20px' }}>Couldn't load the session brief. You can retry or go straight in.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setRetryCount(c => c + 1)} style={{ flex: 1, padding: '11px', background: courseColor, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Retry
            </button>
            <button onClick={onDismiss} style={{ flex: 1, padding: '11px', background: 'none', border: `1px solid ${D.borderStrong}`, borderRadius: 10, color: D.muted, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Skip
            </button>
          </div>
        </div>

      ) : !blast ? (
        <div style={{ width: '100%', maxWidth: 400, background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '28px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: D.muted, margin: '0 0 20px', lineHeight: 1.6 }}>Ready to study {session.courseName}?</p>
          <button onClick={onDismiss} style={{ width: '100%', padding: '13px', background: courseColor, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Start session
          </button>
        </div>

      ) : (
        <div style={{ width: '100%', maxWidth: 460, animation: 'pb-in 0.35s ease' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: courseColor, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: D.text }}>{session.courseName}</span>
              <span style={{ fontSize: 12, color: D.dim }}>·</span>
              <span style={{ fontSize: 12, color: D.muted }}>{session.sessionType ?? 'Study Session'}</span>
            </div>
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: 5,
              color: cfg.color, background: `${cfg.color}10`, border: `1px solid ${cfg.color}20`,
            }}>
              {cfg.label}
            </span>
          </div>

          {/* Main card */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>

            {/* Card header */}
            <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${D.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.muted, marginBottom: 4 }}>
                {cfg.desc}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: D.text, letterSpacing: -0.3, lineHeight: 1.25 }}>
                {blast.headline}
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '14px 20px' }}>
              {mode === 'focus-question' ? (
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: D.text, lineHeight: 1.55, margin: '0 0 12px' }}>{blast.question}</p>
                  {blast.why && (
                    <p style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.6, margin: 0, paddingTop: 12, borderTop: `1px solid ${D.border}` }}>
                      {blast.why}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(blast.points ?? []).map((point, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                        background: `${cfg.color}10`, border: `1px solid ${cfg.color}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: cfg.color,
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13.5, color: D.text, lineHeight: 1.5, fontWeight: 450 }}>{point}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action prompt footer */}
            {blast.actionPrompt && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${D.border}`, background: 'rgba(0,0,0,0.015)' }}>
                <p style={{ fontSize: 12, color: D.muted, lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>
                  {blast.actionPrompt}
                </p>
              </div>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={onDismiss}
            style={{
              width: '100%', padding: '13px 20px',
              background: courseColor, border: 'none', borderRadius: 11,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              letterSpacing: -0.1,
            }}
          >
            Got it, start session
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
