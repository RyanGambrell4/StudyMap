import { getActivePlan, getCachedSubscription } from '../lib/subscription'
import ReferralCard from './ReferralCard'

const PLAN_INFO = {
  free: {
    label: 'Free',
    features: ['Calendar & study planner', 'AI study plan (1 course)', 'Basic progress tracking'],
    color: '#64748b',
  },
  pro: {
    label: 'Pro',
    features: ['Everything in Free', 'Unlimited AI Study Coach', 'Grade Hub & grade tracking', 'AI Tutor chat', 'Flashcards & quizzes'],
    color: '#3B61C4',
  },
  unlimited: {
    label: 'Unlimited',
    features: ['Everything in Pro', 'Priority AI responses', 'Advanced analytics', 'Early access to new features'],
    color: '#059669',
  },
}

export default function AccountView({
  userEmail,
  onSignOut,
  onImportSyllabus,
  onEditPlan,
  googleCalendarConnected,
  onConnectGoogleCalendar,
  onShowPaywall,
}) {
  const plan = getActivePlan()
  const sub = getCachedSubscription()
  const isTrialing = sub?.status === 'trialing'
  const trialEndsAt = isTrialing && sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd)
    : null
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86400000))
    : null
  const planInfo = PLAN_INFO[plan] ?? PLAN_INFO.free
  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'

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
            {isTrialing && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(59,97,196,0.10)', color: '#3B61C4' }}>
                FREE TRIAL
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Plan */}
      <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Plan</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>{planInfo.label}</p>
          {isTrialing && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: 'rgba(59,97,196,0.08)', color: '#3B61C4', border: '1px solid rgba(59,97,196,0.20)' }}>
              Free Trial
            </span>
          )}
        </div>
        {isTrialing && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
            {trialDaysLeft !== null && trialDaysLeft > 0
              ? <>Your free trial ends in <strong style={{ color: '#1A1A1A' }}>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong>. You won't be charged until then — cancel anytime before day 7.</>
              : <>Your free trial has ended. You now have full Pro access.</>
            }
          </p>
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
        {plan === 'free' && (
          <button
            onClick={() => onShowPaywall?.('courses')}
            style={{
              width: '100%', padding: '11px', backgroundColor: '#3B61C4',
              border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Start free trial →
          </button>
        )}
        {plan === 'pro' && (
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
