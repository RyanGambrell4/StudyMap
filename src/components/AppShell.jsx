import { useState, useCallback } from 'react'
import { getActivePlan } from '../lib/subscription'
import OnboardingTour from './OnboardingTour'

// ── Color tokens ───────────────────────────────────────────────────────────────
const SIDEBAR_BG      = '#060B14'
const ITEM_ACTIVE_BG  = '#1A2952'
const ACCENT          = '#6366F1'
const ICON_ACTIVE     = '#6366F1'
const LABEL_ACTIVE    = '#F0F4FF'
const ICON_INACTIVE   = '#3D4F6B'
const LABEL_INACTIVE  = '#8896B3'
const BORDER_COLOR    = '#0F1929'

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    id: 'courses',
    label: 'Courses',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
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
    id: 'progress',
    label: 'Progress',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
]

// ── Mobile tab items (top 5 only to avoid overflow) ───────────────────────────
const MOBILE_NAV = NAV_ITEMS.slice(0, 5)

function NavIcon({ path, active }) {
  return (
    <svg
      style={{ width: 18, height: 18, flexShrink: 0, color: active ? ICON_ACTIVE : ICON_INACTIVE }}
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
  onToggleTheme,
  theme,
  userEmail,
  onNavigateToAccount,
  googleCalendarConnected,
  onConnectGoogleCalendar,
  children,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [startTour, setStartTour] = useState(null)
  const handleTourReady = useCallback((fn) => setStartTour(() => fn), [])

  const plan = getActivePlan()
  const planLabel = plan === 'unlimited' ? 'Unlimited' : plan === 'pro' ? 'Pro' : 'Free'
  const planColors = {
    free:      { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
    pro:       { bg: 'rgba(99,102,241,0.15)',  color: '#818cf8' },
    unlimited: { bg: 'rgba(16,185,129,0.15)',  color: '#34d399' },
  }
  const pc = planColors[plan] ?? planColors.free
  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'
  const displayName = userEmail?.split('@')[0] ?? 'Account'

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#080D18' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden lg:flex flex-col w-56 shrink-0 fixed inset-y-0 left-0 z-40"
        style={{ backgroundColor: SIDEBAR_BG, borderRight: `1px solid ${BORDER_COLOR}` }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
        >
          <img src="/favicon.png" alt="StudyEdge" style={{ height: 32, width: 32, objectFit: 'contain' }} />
          <span style={{ color: LABEL_ACTIVE, fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
            StudyEdge
          </span>
          {startTour && (
            <button
              onClick={startTour}
              title="Take a tour"
              style={{
                marginLeft: 'auto',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                color: ICON_INACTIVE,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                id={`tour-nav-${item.id}`}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? LABEL_ACTIVE : LABEL_INACTIVE,
                  backgroundColor: active ? ITEM_ACTIVE_BG : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = '#0F1929'; e.currentTarget.style.color = '#C8D6F0' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LABEL_INACTIVE } }}
              >
                <NavIcon path={item.icon} active={active} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Settings overflow */}
        <div style={{ padding: '0 10px', borderTop: `1px solid ${BORDER_COLOR}` }}>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              color: LABEL_INACTIVE,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0F1929'; e.currentTarget.style.color = '#C8D6F0' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LABEL_INACTIVE }}
          >
            <svg style={{ width: 18, height: 18, flexShrink: 0, color: ICON_INACTIVE }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
            <svg
              style={{
                width: 12,
                height: 12,
                marginLeft: 'auto',
                color: ICON_INACTIVE,
                transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {settingsOpen && (
            <div style={{ paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[
                {
                  label: 'Import Syllabus',
                  onClick: onImportSyllabus,
                  icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
                },
                {
                  label: 'Share Plan',
                  onClick: onShare,
                  icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
                },
                {
                  label: 'Print / PDF',
                  onClick: () => window.print(),
                  icon: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
                },
                {
                  label: 'Edit Plan',
                  onClick: onEditPlan,
                  icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
                  danger: true,
                },
              ].map(({ label, onClick, icon, danger }) => (
                <button
                  key={label}
                  onClick={onClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 500,
                    color: LABEL_INACTIVE,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0F1929'; e.currentTarget.style.color = danger ? '#f87171' : '#C8D6F0' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LABEL_INACTIVE }}
                >
                  <svg style={{ width: 15, height: 15, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                  {label}
                </button>
              ))}

              {onConnectGoogleCalendar && (
                <button
                  onClick={googleCalendarConnected ? undefined : onConnectGoogleCalendar}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 500,
                    color: googleCalendarConnected ? '#34d399' : LABEL_INACTIVE,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: googleCalendarConnected ? 'default' : 'pointer',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <svg style={{ width: 15, height: 15, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {googleCalendarConnected ? 'Calendar Connected' : 'Connect Google Cal'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Account section */}
        <div style={{ padding: '10px', borderTop: `1px solid ${BORDER_COLOR}` }}>
          <button
            onClick={onNavigateToAccount}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0F1929' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {/* Avatar */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {initials}
            </div>

            {/* Name + plan */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: LABEL_ACTIVE, fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, backgroundColor: pc.bg, color: pc.color }}>
                  {planLabel}
                </span>
                {plan === 'free' && (
                  <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 600 }}>Upgrade</span>
                )}
              </div>
            </div>

            {/* Gear icon */}
            <svg style={{ width: 15, height: 15, color: ICON_INACTIVE, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-56 pb-20 lg:pb-0 min-h-screen">
        {children}
      </main>

      {/* Onboarding tour */}
      <OnboardingTour onReady={handleTourReady} />

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex"
        style={{
          backgroundColor: 'rgba(6,11,20,0.97)',
          borderTop: `1px solid ${BORDER_COLOR}`,
          backdropFilter: 'blur(12px)',
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
                gap: 4,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: active ? ACCENT : ICON_INACTIVE,
              }}
            >
              <NavIcon path={item.icon} active={active} />
              <span style={{ fontSize: 9, fontWeight: 500, color: active ? LABEL_ACTIVE : LABEL_INACTIVE }}>
                {item.label}
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
            gap: 4,
            padding: '10px 0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg
            style={{ width: 18, height: 18, color: activeSection === 'account' ? ACCENT : ICON_INACTIVE }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'account' ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span style={{ fontSize: 9, fontWeight: 500, color: activeSection === 'account' ? LABEL_ACTIVE : LABEL_INACTIVE }}>
            Account
          </span>
        </button>
      </nav>

    </div>
  )
}
