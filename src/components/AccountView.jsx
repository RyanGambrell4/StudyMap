import { useState, useMemo } from 'react'
import { getActivePlan, getCachedSubscription, initSubscription, isTrialActive, hasUsedTrial, getTrialDaysRemaining } from '../lib/subscription'
import { supabase } from '../lib/supabase'
import ReferralCard from './ReferralCard'

const PLAN_INFO = {
  free: {
    label: 'Free',
    features: [
      '1 course (full schedule & planner)',
      '2 AI messages / day',
      'Session Blueprint · 1 free/day',
      'Brain Dump, Quiz Burst, Exam Rescue · 2 free/week',
      'Focus Mode · 60 min/day free',
      'Coach Plan · 1 free total',
    ],
    color: '#64748b',
  },
  pro: {
    label: 'Pro',
    features: [
      '5 courses · full semester planned',
      '75 AI actions/month',
      'AI Study Coach · rebuild anytime',
      'Unlimited blueprints & focus sessions',
      'Unlimited brain training',
      'Grade Hub · all courses',
    ],
    color: '#3B61C4',
  },
  unlimited: {
    label: 'Unlimited',
    features: [
      'Everything in Pro',
      'Unlimited AI actions',
      'Priority AI responses',
      'Advanced analytics',
      'Early access to new features',
    ],
    color: '#059669',
  },
}

function sessionMinutes(s) {
  if (s.elapsedSeconds != null && s.elapsedSeconds > 0) return s.elapsedSeconds / 60
  return s.duration ?? 0
}

function getMonWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

export default function AccountView({
  userEmail,
  onSignOut,
  onImportSyllabus,
  onEditPlan,
  googleCalendarConnected,
  onConnectGoogleCalendar,
  onShowPaywall,
  onShowProgress,
  completedSessions = [],
  courses = [],
  todayStr,
}) {
  const plan = getActivePlan()
  const trialActive = isTrialActive()
  const trialUsed = hasUsedTrial()
  const trialDaysLeft = getTrialDaysRemaining()
  const planInfo = PLAN_INFO[plan] ?? PLAN_INFO.free
  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'

  const [canceling, setCanceling] = useState(false)
  const [canceled, setCanceled] = useState(false)

  // ── Progress stats ────────────────────────────────────────────────────────────
  const progressStats = useMemo(() => {
    const ws = getMonWeekStart(todayStr ?? new Date().toISOString().slice(0, 10))
    let totalMins = 0, weekMins = 0
    completedSessions.forEach(s => {
      const m = sessionMinutes(s)
      totalMins += m
      if (s.dateStr >= ws) weekMins += m
    })
    const withRecall = completedSessions.filter(s => s.recallScore != null)
    const avgRecall = withRecall.length
      ? Math.round(withRecall.reduce((a, s) => a + s.recallScore, 0) / withRecall.length)
      : null
    // streak
    const datesSet = new Set(completedSessions.map(s => s.dateStr))
    let streak = 0
    const d = new Date((todayStr ?? new Date().toISOString().slice(0, 10)) + 'T12:00:00')
    if (!datesSet.has(todayStr)) d.setDate(d.getDate() - 1)
    while (streak < 999) {
      const k = d.toISOString().slice(0, 10)
      if (!datesSet.has(k)) break
      streak++
      d.setDate(d.getDate() - 1)
    }
    return {
      totalHours: (totalMins / 60).toFixed(1),
      weekHours: (weekMins / 60).toFixed(1),
      sessions: completedSessions.length,
      avgRecall,
      streak,
    }
  }, [completedSessions, todayStr])

  const handleCancelTrial = async () => {
    if (!confirm('Cancel your free trial? You\'ll lose Pro access immediately.')) return
    setCanceling(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-trial', userId: user.id }),
      })
      if (!res.ok) throw new Error('Failed')
      initSubscription(user.id, { plan: 'free', status: 'cancelled', stripeSubId: null, currentPeriodEnd: null })
      setCanceled(true)
    } catch {
      alert('Something went wrong. Please try again or contact support@getstudyedge.com.')
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div style={{ padding: '40px 24px', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1A1A1A', marginBottom: 32 }}>Account</h1>

      {/* Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: '#3B61C4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 15, fontWeight: 800, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{userEmail ?? 'User'}</p>
          <p style={{ margin: 0, fontSize: 12, color: planInfo.color, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            {planInfo.label}
            {trialActive && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(59,97,196,0.10)', color: '#3B61C4' }}>
                FREE TRIAL
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Progress & Results */}
      <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progress & Results</p>
          {onShowProgress && (
            <button
              onClick={onShowProgress}
              style={{ padding: 0, background: 'none', border: 'none', fontSize: 12, color: '#3B61C4', fontWeight: 600, cursor: 'pointer' }}
            >
              Full analytics →
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'This week', value: `${progressStats.weekHours}h`, sub: `${progressStats.totalHours}h total` },
            { label: 'Sessions', value: progressStats.sessions, sub: 'completed' },
            { label: 'Study streak', value: `${progressStats.streak}d`, sub: progressStats.streak === 0 ? 'Start today' : 'in a row' },
            { label: 'Avg recall', value: progressStats.avgRecall != null ? `${progressStats.avgRecall}%` : '—', sub: progressStats.avgRecall != null ? 'across sessions' : 'No data yet' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: '#F7F6F3', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
              <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.02em' }}>{value}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#9B9B9B' }}>{sub}</p>
            </div>
          ))}
        </div>
        {completedSessions.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: '#C0C0C0', textAlign: 'center' }}>Complete your first study session to see stats here.</p>
        )}
      </div>

      {/* Plan */}
      <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Plan</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>{planInfo.label}</p>
          {trialActive && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: 'rgba(59,97,196,0.08)', color: '#3B61C4', border: '1px solid rgba(59,97,196,0.20)' }}>
              Free Trial
            </span>
          )}
        </div>

        {/* Trial progress display */}
        {trialActive && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
              {trialDaysLeft !== null && trialDaysLeft > 0
                ? <>You have <strong style={{ color: '#1A1A1A' }}>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left</strong> in your free trial. Upgrade before it ends to keep full access.</>
                : <>Your trial has ended. Upgrade to keep full Pro access.</>
              }
            </p>
            {/* Trial days progress bar */}
            {trialDaysLeft !== null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 3,
                    background: trialDaysLeft <= 2 ? '#EF4444' : '#3B61C4',
                    width: `${Math.min(100, ((7 - trialDaysLeft) / 7) * 100)}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9B9B9B' }}>
                  {7 - trialDaysLeft} of 7 days used
                </p>
              </div>
            )}
            {!canceled ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => onShowPaywall?.('ai')}
                  style={{
                    flex: 1, padding: '10px',
                    background: '#3B61C4', border: 'none', borderRadius: 10,
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    minWidth: 140,
                  }}
                >
                  Upgrade to Pro →
                </button>
                <button
                  onClick={handleCancelTrial}
                  disabled={canceling}
                  style={{
                    padding: '10px 14px',
                    background: 'none', border: '1px solid rgba(0,0,0,0.10)',
                    borderRadius: 10,
                    fontSize: 12, color: '#BBBBBB',
                    cursor: canceling ? 'not-allowed' : 'pointer',
                    opacity: canceling ? 0.5 : 1,
                  }}
                >
                  {canceling ? 'Canceling…' : 'Cancel trial'}
                </button>
              </div>
            ) : (
              <p style={{ marginBottom: 10, fontSize: 12, color: '#059669', fontWeight: 600 }}>
                Trial canceled. Your free access has ended.
              </p>
            )}
          </>
        )}

        <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {planInfo.features.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6B6B6B' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={planInfo.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {/* Free trial CTA — only when plan is free and trial never used */}
        {plan === 'free' && !trialUsed && !trialActive && (
          <div style={{
            background: 'linear-gradient(135deg, #e8f4fd, #f0f9f4)',
            border: '1.5px solid rgba(59,130,246,0.2)',
            borderRadius: 12, padding: '16px',
            marginBottom: 12,
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>
              Start your 7-day free trial — no card required
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B6B6B' }}>
              Full Pro access. Cancel anytime. Zero payment info needed.
            </p>
            <button
              onClick={() => onShowPaywall?.('trial')}
              style={{
                width: '100%', padding: '11px',
                background: 'linear-gradient(135deg, #3B82F6, #10B981)',
                border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Start Free Trial →
            </button>
          </div>
        )}

        {/* Paid upgrade CTAs */}
        {plan === 'free' && (trialUsed || trialActive) && !trialActive && (
          <button
            onClick={() => onShowPaywall?.('courses')}
            style={{
              width: '100%', padding: '11px', backgroundColor: '#3B61C4',
              border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Upgrade to Pro →
          </button>
        )}
        {plan === 'pro' && !trialActive && (
          <button
            onClick={onShowPaywall}
            style={{
              width: '100%', padding: '11px', backgroundColor: '#059669',
              border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Upgrade to Unlimited →
          </button>
        )}
        {plan === 'unlimited' && (
          <p style={{ fontSize: 13, color: '#9B9B9B' }}>You're on the best plan. Thank you!</p>
        )}
      </div>

      {/* Referral */}
      <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <ReferralCard />
      </div>

      {/* Settings */}
      <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Settings</p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {onConnectGoogleCalendar && (
            <button
              onClick={googleCalendarConnected ? undefined : onConnectGoogleCalendar}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'none', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>Google Calendar</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9B9B9B', marginTop: 2 }}>
                  {googleCalendarConnected ? 'Connected — syncing your schedule' : 'Connect to sync your schedule'}
                </p>
              </div>
              {googleCalendarConnected
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '3px 10px', borderRadius: 999 }}>Connected</span>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C0C0C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
              }
            </button>
          )}
          <button
            onClick={onImportSyllabus}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', background: 'none', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>Import Syllabus</p>
              <p style={{ margin: 0, fontSize: 12, color: '#9B9B9B', marginTop: 2 }}>Add exams and deadlines from a course document</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C0C0C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button
            onClick={onEditPlan}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>Edit Study Plan</p>
              <p style={{ margin: 0, fontSize: 12, color: '#9B9B9B', marginTop: 2 }}>Modify your courses and schedule settings</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C0C0C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Sign out */}
      {onSignOut && (
        <button
          onClick={onSignOut}
          style={{ width: '100%', padding: '11px', background: 'none', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Sign Out
        </button>
      )}

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <a
          href={`mailto:support@getstudyedge.com?subject=Delete%20my%20account&body=Please%20delete%20my%20account%20and%20all%20associated%20data.%0A%0AEmail%3A%20${encodeURIComponent(userEmail ?? '')}`}
          style={{ fontSize: 12, color: '#C0C0C0', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Delete account &amp; data
        </a>
      </div>
    </div>
  )
}
