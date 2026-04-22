import { getActivePlan } from '../lib/subscription'

const PLAN_INFO = {
  free: {
    label: 'Free',
    features: ['Calendar & study planner', 'AI study plan (1 course)', 'Basic progress tracking'],
    color: '#94a3b8',
    bg: 'rgba(100,116,139,0.12)',
    border: 'rgba(100,116,139,0.25)',
  },
  pro: {
    label: 'Pro',
    features: ['Everything in Free', 'Unlimited AI Study Coach', 'Grade Hub & grade tracking', 'AI Tutor chat', 'Flashcards & quizzes'],
    color: '#818cf8',
    bg: 'rgba(99,102,241,0.12)',
    border: 'rgba(99,102,241,0.25)',
  },
  unlimited: {
    label: 'Unlimited',
    features: ['Everything in Pro', 'Priority AI responses', 'Advanced analytics', 'Early access to new features'],
    color: '#34d399',
    bg: 'rgba(16,185,129,0.12)',
    border: 'rgba(16,185,129,0.25)',
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
  const planInfo = PLAN_INFO[plan] ?? PLAN_INFO.free
  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'

  return (
    <div className="px-6 py-10 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Account</h1>

      {/* Profile card */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-6 flex items-center gap-5">
        <div
          className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-black shrink-0 shadow-lg shadow-indigo-500/25"
        >
          {initials}
        </div>
        <div>
          <p className="text-slate-900 dark:text-white font-bold text-base">{userEmail ?? 'User'}</p>
          <span
            className="inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: planInfo.bg, color: planInfo.color, border: `1px solid ${planInfo.border}` }}
          >
            {planInfo.label}
          </span>
        </div>
      </div>

      {/* Plan card */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">Current Plan</h2>
        <div
          className="rounded-xl p-4 mb-5"
          style={{ backgroundColor: planInfo.bg, border: `1px solid ${planInfo.border}` }}
        >
          <p className="font-bold text-base mb-3" style={{ color: planInfo.color }}>{planInfo.label}</p>
          <ul className="space-y-2">
            {planInfo.features.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <svg className="w-3.5 h-3.5 shrink-0" style={{ color: planInfo.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
        {plan === 'free' && (
          <button
            onClick={onShowPaywall}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-900/30"
          >
            Upgrade to Pro →
          </button>
        )}
        {plan === 'pro' && (
          <button
            onClick={onShowPaywall}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-emerald-900/30"
          >
            Upgrade to Unlimited →
          </button>
        )}
        {plan === 'unlimited' && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">You're on the best plan. Thank you!</p>
        )}
      </div>

      {/* Settings */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden">
        <h2 className="text-base font-bold text-slate-900 dark:text-white px-6 pt-5 pb-3">Settings</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/40">
          {onConnectGoogleCalendar && (
            <button
              onClick={googleCalendarConnected ? undefined : onConnectGoogleCalendar}
              className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Google Calendar</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {googleCalendarConnected ? 'Connected, syncing your schedule' : 'Connect to sync your schedule'}
                </p>
              </div>
              {googleCalendarConnected ? (
                <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full shrink-0">Connected</span>
              ) : (
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={onImportSyllabus}
            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Import Syllabus</p>
              <p className="text-xs text-slate-500 mt-0.5">Add exams and deadlines from a course document</p>
            </div>
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={onEditPlan}
            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Edit Study Plan</p>
              <p className="text-xs text-slate-500 mt-0.5">Modify your courses and schedule settings</p>
            </div>
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sign out */}
      {onSignOut && (
        <button
          onClick={onSignOut}
          className="w-full text-red-500 dark:text-red-400 font-semibold text-sm py-3 rounded-xl border border-red-500/20 hover:bg-red-500/5 transition-all"
        >
          Sign Out
        </button>
      )}

      {/* Delete account */}
      <div className="text-center pb-2">
        <a
          href={`mailto:support@getstudyedge.com?subject=Delete%20my%20account&body=Please%20delete%20my%20account%20and%20all%20associated%20data.%0A%0AEmail%3A%20${encodeURIComponent(userEmail ?? '')}`}
          className="text-xs text-slate-500 dark:text-slate-600 hover:text-red-400 transition-colors underline underline-offset-2"
        >
          Delete account &amp; data
        </a>
      </div>
    </div>
  )
}
