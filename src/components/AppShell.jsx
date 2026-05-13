import { useState, useCallback, useEffect, useRef } from 'react'
import { getActivePlan, getCachedSubscription } from '../lib/subscription'
import OnboardingTour from './OnboardingTour'

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAV_BG      = '#FFFFFF'
const PAGE_BG     = '#F7F6F3'
const ACCENT      = '#3B61C4'
const TEXT        = '#111111'
const MUTED       = '#6B6B6B'
const BORDER      = '#E5E5E5'

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    id: 'calendar',
    label: 'Schedule',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'coach',
    label: 'Study Coach',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
  {
    id: 'tools',
    label: 'Study Tools',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    id: 'grades',
    label: 'Grades',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  {
    id: 'courses',
    label: 'Courses',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
]

// Mobile: first 5 items
const MOBILE_NAV = NAV_ITEMS.slice(0, 5)

const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i

function NavIcon({ path, active }) {
  return (
    <svg
      style={{ width: 18, height: 18, flexShrink: 0, color: active ? ACCENT : MUTED }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d={path} />
    </svg>
  )
}

export default function AppShell({
  activeSection,
  setActiveSection,
  onImportSyllabus,
  onShare,
  onEditPlan,
  onSignOut,
  userEmail,
  onNavigateToAccount,
  googleCalendarConnected,
  onConnectGoogleCalendar,
  courses,
  children,
}) {
  const isExamMode = Array.isArray(courses) && courses.some(c => EXAM_PATTERN.test(c.name))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [startTour, setStartTour] = useState(null)
  const settingsRef = useRef(null)
  const handleTourReady = useCallback((fn) => setStartTour(() => fn), [])

  useEffect(() => { window.scrollTo(0, 0) }, [activeSection])

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsOpen])

  const plan = getActivePlan()
  const planLabel = plan === 'unlimited' ? 'Unlimited' : plan === 'pro' ? 'Pro' : 'Free'

  const sub = getCachedSubscription()
  const isTrialing = sub?.status === 'trialing'
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(
    () => sessionStorage.getItem('studyedge_trial_banner_dismissed') === '1'
  )
  const daysLeft = isTrialing && sub?.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24)))
    : null
  const trialMsg = daysLeft !== null && daysLeft <= 2
    ? "Your trial ends tomorrow — don't lose access to your courses and AI tools."
    : daysLeft !== null
      ? `Your Pro trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — keep access to everything.`
      : null
  const showTrialBanner = isTrialing && trialMsg && !trialBannerDismissed

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'
  const displayName = userEmail?.split('@')[0] ?? 'Account'

  const SETTINGS_ITEMS = [
    {
      label: 'Import Syllabus',
      onClick: () => { setSettingsOpen(false); onImportSyllabus?.() },
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    },
    {
      label: 'Share Plan',
      onClick: () => { setSettingsOpen(false); onShare?.() },
      icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
    },
    {
      label: 'Edit Plan',
      onClick: () => { setSettingsOpen(false); onEditPlan?.() },
      icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG }}>

      {/* ── Top navigation bar ── */}
      <header
        className="hidden lg:flex"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          background: NAV_BG,
          borderBottom: `1px solid ${BORDER}`,
          zIndex: 40,
          alignItems: 'center',
          padding: '0 32px',
          gap: 0,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 36, flexShrink: 0 }}>
          <img src="/favicon.png" alt="StudyEdge AI" style={{ height: 28, width: 28, objectFit: 'contain' }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: TEXT, letterSpacing: '-0.01em' }}>
            StudyEdge AI
          </span>
          {startTour && (
            <button
              onClick={startTour}
              title="Take a tour"
              style={{ marginLeft: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <svg style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'stretch', height: '100%', flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                id={`tour-nav-${item.id}`}
                onClick={() => setActiveSection(item.id)}
                style={{
                  padding: '0 14px',
                  height: '100%',
                  borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  color: active ? ACCENT : MUTED,
                  fontWeight: active ? 600 : 500,
                  fontSize: 13,
                  background: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = TEXT }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = MUTED }}
              >
                {item.id === 'grades' && isExamMode ? 'Scores' : item.label}
              </button>
            )
          })}
        </nav>

        {/* Right side: settings + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          {/* Settings dropdown */}
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setSettingsOpen(v => !v)}
              style={{
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                color: settingsOpen ? TEXT : MUTED,
                background: settingsOpen ? '#F0EFEC' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!settingsOpen) { e.currentTarget.style.background = '#F0EFEC'; e.currentTarget.style.color = TEXT } }}
              onMouseLeave={e => { if (!settingsOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED } }}
            >
              <svg style={{ width: 17, height: 17 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {settingsOpen && (
              <div style={{
                position: 'absolute',
                top: 40,
                right: 0,
                width: 200,
                background: '#FFFFFF',
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                padding: '6px 0',
                zIndex: 100,
              }}>
                {SETTINGS_ITEMS.map(({ label, onClick, icon }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', width: '100%', background: 'none', border: 'none', color: TEXT, fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <svg style={{ width: 14, height: 14, color: MUTED, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                    </svg>
                    {label}
                  </button>
                ))}
                {onConnectGoogleCalendar && (
                  <button
                    onClick={googleCalendarConnected ? undefined : () => { setSettingsOpen(false); onConnectGoogleCalendar?.() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', width: '100%', background: 'none', border: 'none', color: googleCalendarConnected ? '#16A34A' : TEXT, fontSize: 13, fontWeight: 500, cursor: googleCalendarConnected ? 'default' : 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { if (!googleCalendarConnected) e.currentTarget.style.background = '#F7F6F3' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <svg style={{ width: 14, height: 14, color: googleCalendarConnected ? '#16A34A' : MUTED, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {googleCalendarConnected ? '✓ Calendar Connected' : 'Connect Google Cal'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Avatar / Account */}
          <button
            onClick={onNavigateToAccount}
            title={displayName}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 4px 4px 4px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#F0EFEC'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {initials}
            </div>
            {plan !== 'free' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: plan === 'unlimited' ? '#16A34A' : ACCENT }}>
                {planLabel}
              </span>
            )}
            {plan === 'free' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>Upgrade</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        className="lg:pt-14 pb-24 lg:pb-0 min-h-screen"
        style={{ overflowX: 'hidden', minWidth: 0, width: '100%' }}
      >
        {showTrialBanner && (
          <div style={{
            background: '#FFF7ED',
            borderBottom: '1px solid #FED7AA',
            padding: '10px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ fontSize: 13, color: '#92400E', fontWeight: 500 }}>
              {trialMsg}
            </span>
            <button
              onClick={() => {
                sessionStorage.setItem('studyedge_trial_banner_dismissed', '1')
                setTrialBannerDismissed(true)
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </main>

      {/* Onboarding tour */}
      <OnboardingTour onReady={handleTourReady} />

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex"
        style={{
          background: '#FFFFFF',
          borderTop: `1px solid ${BORDER}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {MOBILE_NAV.map(item => {
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <NavIcon path={item.icon} active={active} />
              <span style={{ fontSize: 9, fontWeight: 500, color: active ? ACCENT : MUTED }}>
                {item.id === 'grades' && isExamMode ? 'Scores' : item.label}
              </span>
            </button>
          )
        })}
        {/* Account tab */}
        <button
          onClick={onNavigateToAccount}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '10px 0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg
            style={{ width: 18, height: 18, color: activeSection === 'account' ? ACCENT : MUTED }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'account' ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span style={{ fontSize: 9, fontWeight: 500, color: activeSection === 'account' ? ACCENT : MUTED }}>
            Account
          </span>
        </button>
      </nav>

    </div>
  )
}
