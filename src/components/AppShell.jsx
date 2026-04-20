import { useState, useCallback } from 'react'
import { getActivePlan } from '../lib/subscription'
import OnboardingTour from './OnboardingTour'

// ── Nav items (5 primary) ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'grades',
    label: 'Grades',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
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

function NavIcon({ path, active }) {
  return (
    <svg className={`w-5 h-5 transition-colors ${active ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d={path} />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
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

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0F172A] flex">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white dark:bg-[#0B1120] border-r border-slate-200 dark:border-slate-800 fixed inset-y-0 left-0 z-40">
        {/* Logo + theme toggle */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-slate-800">
          <img src="/favicon.png" alt="StudyEdge" style={{ height: '36px', width: '36px', objectFit: 'contain' }} />
          {startTour && (
            <button
              onClick={startTour}
              title="Take a tour"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={onToggleTheme}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                id={`tour-nav-${item.id}`}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-600 dark:text-indigo-300'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <NavIcon path={item.icon} active={active} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* ⚙ Settings overflow */}
        <div className="px-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
            <svg className={`w-3.5 h-3.5 ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {settingsOpen && (
            <div className="pb-2 space-y-0.5">
              <button
                onClick={onImportSyllabus}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Import Syllabus
              </button>
              <button
                onClick={onShare}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share Plan
              </button>
              <button
                onClick={() => window.print()}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print / PDF
              </button>
              <button
                onClick={onEditPlan}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Plan
              </button>
              {onConnectGoogleCalendar && (
                <button
                  onClick={googleCalendarConnected ? undefined : onConnectGoogleCalendar}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                    googleCalendarConnected
                      ? 'text-emerald-500 dark:text-emerald-400 cursor-default'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {googleCalendarConnected ? 'Calendar Connected' : 'Connect Google Cal'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Account section */}
        <div className="px-3 pb-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onNavigateToAccount}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 text-white text-xs font-bold shadow">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-700 dark:text-slate-200 text-xs font-semibold truncate leading-tight">
                {userEmail?.split('@')[0] ?? 'Account'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: pc.bg, color: pc.color }}
                >
                  {planLabel}
                </span>
                {plan === 'free' && (
                  <span className="text-[10px] text-indigo-400 font-semibold">Upgrade →</span>
                )}
              </div>
            </div>
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
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 flex">
        {NAV_ITEMS.map(item => {
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${
                active ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <NavIcon path={item.icon} active={active} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
        {/* Account tab — opens AccountView where users can upgrade + access settings */}
        <button
          onClick={onNavigateToAccount}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${
            activeSection === 'account' ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <svg className={`w-5 h-5 transition-colors ${activeSection === 'account' ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'account' ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[10px] font-medium">Account</span>
        </button>
      </nav>

    </div>
  )
}
