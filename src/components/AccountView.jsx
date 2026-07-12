import { useState, useMemo } from 'react'
import { getActivePlan, getCachedSubscription, initSubscription, isTrialActive, hasUsedTrial, getTrialDaysRemaining, createCheckoutSession, activateTrial } from '../lib/subscription'
import { supabase } from '../lib/supabase'
import ReferralCard from './ReferralCard'

const PLAN_INFO = {
  free: {
    label: 'Free',
    features: [
      '1 course (preview only)',
      '2 AI messages total',
      'Session Blueprint · 1 total',
      'Brain Dump, Quiz Burst, Exam Rescue · 1 each',
      'Focus Mode · 30 min/day',
      'Coach Plan · 1 total',
    ],
    color: '#64748b',
  },
  pro: {
    label: 'Pro',
    features: [
      '5 courses · full semester planned',
      '100 AI actions/month',
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

const card = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.07)',
  borderRadius: 14,
  padding: '20px 24px',
  marginBottom: 12,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const sectionLabel = {
  margin: '0 0 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#9B9B9B',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

export default function AccountView({
  userEmail,
  userId,
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
  const [trialStarting, setTrialStarting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const handleStartTrial = async () => {
    if (trialStarting) return
    setTrialStarting(true)
    try {
      const url = await activateTrial(userId, userEmail)
      if (!url) { setTrialStarting(false); return }
      window.location.href = url
    } catch {
      setTrialStarting(false)
    }
  }
  const [smsPhone, setSmsPhone] = useState('')
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsEdit, setSmsEdit] = useState(false)

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

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete account')
      }
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  const handleManageSubscription = async () => {
    if (portalLoading) return
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'create-portal-session', userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to open billing portal')
      window.location.href = data.url
    } catch (err) {
      alert(err.message)
      setPortalLoading(false)
    }
  }

  const handleCancelTrial = async () => {
    if (!confirm('Cancel your free trial?\n\nYou\'ll move to the free plan immediately.')) return
    setCanceling(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const sub = getCachedSubscription()
      if (sub?.stripeSubId) {
        // Stripe-backed trial — cancel via API so Stripe stops billing
        const res = await fetch('/api/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ action: 'cancel-trial', userId: session?.user?.id }),
        })
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        initSubscription(session.user.id, data.subscription ?? { ...sub, plan: 'free', status: 'cancelled', stripeSubId: null, currentPeriodEnd: null })
      } else {
        // Legacy DB-only trial (backwards compat) — cancel directly in DB
        const cancelled = { ...sub, status: 'cancelled', trial_cancelled: true }
        const now = new Date().toISOString()
        const { error } = await supabase
          .from('user_data')
          .upsert({ user_id: session.user.id, subscription: cancelled, updated_at: now }, { onConflict: 'user_id' })
        if (error) throw new Error('Failed')
        initSubscription(session.user.id, cancelled)
      }
      setCanceled(true)
    } catch {
      alert('Something went wrong. Please try again or contact support@getstudyedge.com.')
    } finally {
      setCanceling(false)
    }
  }

  const handleSaveSms = async () => {
    setSmsSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/sms-opt-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ phone: smsPhone, enabled: true }),
      })
      if (res.ok) { setSmsEnabled(true); setSmsEdit(false) }
      else { const d = await res.json(); alert(d.error ?? 'Failed to save') }
    } catch { alert('Something went wrong') }
    finally { setSmsSaving(false) }
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 560, margin: '0 auto', background: '#F7F6F3', minHeight: '100%' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111111', marginBottom: 20 }}>Account</h1>

      {/* Profile card */}
      <div style={{ ...card, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12,
            background: '#3B61C4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111111' }}>{userEmail ?? 'User'}</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: planInfo.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {planInfo.label}
              {trialActive && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(59,97,196,0.10)', color: '#3B61C4' }}>
                  FREE TRIAL
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Progress & Results card */}
      <div style={{ ...card, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={sectionLabel}>Progress &amp; Results</p>
          {onShowProgress && (
            <button
              onClick={onShowProgress}
              style={{ padding: 0, background: 'none', border: 'none', fontSize: 12, color: '#3B61C4', fontWeight: 600, cursor: 'pointer' }}
            >
              Full analytics →
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'This week', value: `${progressStats.weekHours}h`, sub: `${progressStats.totalHours}h total`, primary: true },
            { label: 'Sessions', value: progressStats.sessions, sub: 'completed' },
            { label: 'Study streak', value: `${progressStats.streak}d`, sub: progressStats.streak === 0 ? 'Start today' : 'in a row' },
            { label: 'Avg recall', value: progressStats.avgRecall != null ? `${progressStats.avgRecall}%` : '-', sub: progressStats.avgRecall != null ? 'across sessions' : 'No data yet' },
          ].map(({ label, value, sub, primary }) => (
            <div key={label} style={{ background: '#F7F6F3', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.07)' }}>
              <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
              <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700, color: primary ? '#3B61C4' : '#111111', letterSpacing: '-0.02em' }}>{value}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#6B6B6B' }}>{sub}</p>
            </div>
          ))}
        </div>
        {completedSessions.length === 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#9B9B9B', textAlign: 'center' }}>Complete your first study session to see stats here.</p>
        )}
      </div>

      {/* Current Plan card */}
      <div style={{ ...card, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={sectionLabel}>Current Plan</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111111' }}>{planInfo.label}</p>
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
                ? <>You have <strong style={{ color: '#111111' }}>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left</strong> in your free trial. Upgrade before it ends to keep full access.</>
                : <>Your trial has ended. Upgrade to keep full Pro access.</>
              }
            </p>
            {trialDaysLeft !== null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 3,
                    background: trialDaysLeft <= 2 ? '#DC2626' : '#3B61C4',
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
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
                    fontSize: 12, color: '#9B9B9B',
                    cursor: canceling ? 'not-allowed' : 'pointer',
                    opacity: canceling ? 0.5 : 1,
                  }}
                >
                  {canceling ? 'Canceling…' : 'Cancel trial'}
                </button>
              </div>
            ) : (
              <p style={{ marginBottom: 14, fontSize: 12, color: '#059669', fontWeight: 600 }}>
                Trial canceled. Your free access has ended.
              </p>
            )}
          </>
        )}

        <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {planInfo.features.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6B6B6B' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={planInfo.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {/* Free trial CTA - only when plan is free and trial never used */}
        {plan === 'free' && !trialUsed && !trialActive && (
          <div style={{
            background: '#F0EFEC',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 12, padding: '16px',
            marginBottom: 4,
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111111' }}>
              Start your 7-day free trial
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B6B6B' }}>
              Full Pro access for 7 days. $0 today, then $2.99/wk. Cancel anytime in your account.
            </p>
            <button
              onClick={handleStartTrial}
              disabled={trialStarting}
              style={{
                width: '100%', padding: '11px',
                background: '#3B61C4',
                border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: trialStarting ? 'not-allowed' : 'pointer',
                opacity: trialStarting ? 0.7 : 1,
              }}
            >
              {trialStarting ? 'Loading…' : 'Start Free Trial →'}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              style={{
                width: '100%', padding: '10px',
                background: 'none', border: '1px solid rgba(0,0,0,0.10)',
                borderRadius: 10, color: '#6B6B6B',
                fontSize: 13, fontWeight: 600,
                cursor: portalLoading ? 'not-allowed' : 'pointer',
                opacity: portalLoading ? 0.5 : 1,
              }}
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>
          </div>
        )}
        {plan === 'unlimited' && (
          <button
            onClick={handleManageSubscription}
            disabled={portalLoading}
            style={{
              width: '100%', padding: '10px',
              background: 'none', border: '1px solid rgba(0,0,0,0.10)',
              borderRadius: 10, color: '#6B6B6B',
              fontSize: 13, fontWeight: 600,
              cursor: portalLoading ? 'not-allowed' : 'pointer',
              opacity: portalLoading ? 0.5 : 1,
            }}
          >
            {portalLoading ? 'Opening…' : 'Manage subscription'}
          </button>
        )}
      </div>

      {/* Referral card */}
      <div style={{ ...card, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <ReferralCard />
      </div>

      {/* Settings card */}
      <div style={card}>
        <p style={sectionLabel}>Settings</p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {onConnectGoogleCalendar && (
            <button
              onClick={googleCalendarConnected ? undefined : onConnectGoogleCalendar}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 0',
                background: 'none', border: 'none',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111111' }}>Google Calendar</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9B9B' }}>
                  {googleCalendarConnected ? 'Connected. Syncing your schedule.' : 'Connect to sync your schedule'}
                </p>
              </div>
              {googleCalendarConnected
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '3px 10px', borderRadius: 999 }}>Connected</span>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
              }
            </button>
          )}
          <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .96h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111111' }}>Exam SMS Reminders</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9B9B' }}>
                  {smsEnabled ? `Texts sent to ${smsPhone}` : 'Get a text the day before exams'}
                </p>
              </div>
              <button
                onClick={() => setSmsEdit(e => !e)}
                style={{ fontSize: 11, fontWeight: 700, color: '#3B61C4', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {smsEnabled ? 'Edit' : 'Set up'}
              </button>
            </div>
            {smsEdit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <input
                  type="tel"
                  placeholder="+1XXXXXXXXXX"
                  value={smsPhone}
                  onChange={e => setSmsPhone(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13 }}
                />
                <button
                  onClick={handleSaveSms}
                  disabled={smsSaving}
                  style={{ padding: '8px 14px', background: '#3B61C4', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {smsSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onImportSyllabus}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 0',
              background: 'none', border: 'none',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111111' }}>Import Syllabus</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9B9B' }}>Add exams and deadlines from a course document</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button
            onClick={onEditPlan}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 0',
              background: 'none', border: 'none',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111111' }}>Edit Study Plan</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9B9B' }}>Modify your courses and schedule settings</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('studyedge:open-feedback'))}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 0',
              background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111111' }}>Send Feedback</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9B9B' }}>Tell Ryan what's confusing, broken, or missing</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Sign out + delete account card */}
      <div style={{ ...card, marginBottom: 8 }}>
        {onSignOut && (
          <button
            onClick={onSignOut}
            style={{
              width: '100%', padding: '11px',
              background: 'none', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, color: '#DC2626',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            Sign Out
          </button>
        )}
        {!showDeleteConfirm ? (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ background: 'none', border: 'none', fontSize: 12, color: '#9B9B9B', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', padding: 0 }}
            >
              Delete account &amp; data
            </button>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#111111', fontWeight: 600 }}>Delete your account?</p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
              This permanently deletes your account, all study data, and cancels any active subscription. This cannot be undone.
            </p>
            {deleteError && (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#DC2626' }}>{deleteError}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{ flex: 1, padding: '10px', background: '#DC2626', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                disabled={deleting}
                style={{ padding: '10px 16px', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 10, fontSize: 13, color: '#6B6B6B', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
