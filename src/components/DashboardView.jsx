import { useMemo, useEffect, useRef } from 'react'
import { useCelebration } from '../utils/useCelebration'
import { useStreak } from '../utils/useStreak'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// Derive a gradient from a hex color — darker version for gradient end
function colorToGradient(hex) {
  // Parse hex -> RGB -> darken for gradient
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dark = `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.55)}, ${Math.round(b * 0.55)})`
  return `linear-gradient(135deg, ${hex} 0%, ${dark} 100%)`
}

export default function DashboardView({
  courses,
  todayStr,
  allSessions,
  syllabusEventsByDate,
  completedIds,
  courseStats,
  stats,
  weeksWithAll,
  onToggle,
  onStartFocus,
  nextSession,
  allComplete,
  onImportSyllabus,
  onAddSession,
  onNavigateToCourses,
}) {
  const celebrate = useCelebration()

  // Fire big confetti once when all sessions for the day are complete
  const allCompleteKey = todayStr + (allComplete ? '-done' : '')
  const allCompleteFiredRef = useRef(null)
  useEffect(() => {
    if (allComplete && allCompleteFiredRef.current !== allCompleteKey) {
      allCompleteFiredRef.current = allCompleteKey
      celebrate('big')
      recordCompletion(todayStr)
    }
  }, [allComplete, allCompleteKey])

  // Wrap onToggle to fire light confetti on check-off
  const handleToggle = (id) => {
    if (!completedIds.has(id)) celebrate('light')
    onToggle(id)
  }

  const daysBetween = (a, b) =>
    Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)

  const tomorrowStr = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }, [todayStr])

  const todaySessions = useMemo(
    () => allSessions.filter(s => s.dateStr === todayStr),
    [allSessions, todayStr]
  )
  const tomorrowSessions = useMemo(
    () => allSessions.filter(s => s.dateStr === tomorrowStr),
    [allSessions, tomorrowStr]
  )
  const showSessions = todaySessions.length > 0 ? todaySessions : tomorrowSessions
  const isToday      = todaySessions.length > 0
  const noSessions   = todaySessions.length === 0 && tomorrowSessions.length === 0

  // Hero session = first incomplete session from showSessions
  const heroSession = useMemo(
    () => showSessions.find(s => !completedIds.has(s.id)) ?? showSessions[0] ?? null,
    [showSessions, completedIds]
  )

  const upcomingDeadlines = useMemo(() => {
    const all = Object.values(syllabusEventsByDate).flat()
    return all
      .filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
  }, [syllabusEventsByDate, todayStr])

  const nextSessionPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const s = allSessions.find(
        s => s.courseId === idx && s.dateStr >= todayStr && !completedIds.has(s.id)
      )
      if (s) map[idx] = s
    })
    return map
  }, [courses, allSessions, todayStr, completedIds])

  const { currentStreak, lastCompletedDate, recordCompletion } = useStreak()
  const streak = currentStreak

  const { weekSessions, weekHours } = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00')
    const dow = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const monStr = mon.toISOString().split('T')[0]
    const sunStr = sun.toISOString().split('T')[0]
    const done = allSessions.filter(
      s => s.dateStr >= monStr && s.dateStr <= sunStr && completedIds.has(s.id)
    )
    return {
      weekSessions: done.length,
      weekHours: Math.round(done.reduce((acc, s) => acc + (s.duration ?? 0), 0) / 60 * 10) / 10,
    }
  }, [allSessions, completedIds, todayStr])

  const weekDays = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00')
    const dow = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(mon); day.setDate(mon.getDate() + i)
      const dateStr = day.toISOString().split('T')[0]
      const daySessions = allSessions.filter(s => s.dateStr === dateStr)
      const doneSessions = daySessions.filter(s => completedIds.has(s.id))
      return {
        dateStr,
        letter: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        dayNum: day.getDate(),
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
        hasSessions: daySessions.length > 0,
        allDone: daySessions.length > 0 && doneSessions.length === daySessions.length,
        dots: [...new Set(daySessions.map(s => s.color?.dot))].slice(0, 3),
        primaryColor: daySessions[0]?.color?.dot ?? null,
      }
    })
  }, [allSessions, completedIds, todayStr])

  // Primary color for hero card — from next upcoming session's course
  const heroColor = heroSession?.color?.dot ?? '#6366f1'

  // ── Setup state: no courses yet ─────────────────────────────────────────────
  if (courses.length === 0) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #080e1c 100%)' }}>
        <div className="px-6 py-10 max-w-2xl mx-auto">

          {/* Header */}
          <div className="mb-10">
            <p className="text-slate-500 text-sm font-medium mb-1 tracking-wide">{formatDate(todayStr)}</p>
            <h1 className="text-4xl font-bold text-white tracking-tight">{greeting()}</h1>
          </div>

          {/* Setup hero */}
          <div className="rounded-3xl overflow-hidden mb-6" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)' }}>
            <div className="px-8 py-8 relative">
              <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-10 blur-3xl bg-white pointer-events-none" />
              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 bg-white/15 text-white/80 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Setup required
                </span>
                <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Your account is ready —<br />now set up your courses</h2>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">
                  Everything in StudyEdge — your study plan, sessions, deadlines, coaching, and tools — runs on your courses. Add them to unlock the full app.
                </p>
                <button
                  onClick={onNavigateToCourses}
                  className="bg-white text-indigo-700 font-bold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-black/20 hover:brightness-95 active:scale-95 transition-all inline-flex items-center gap-2"
                >
                  Add Your First Course
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Step checklist */}
            <div className="border-t border-white/10 px-8 py-5 space-y-3">
              {[
                { done: false, label: 'Add your courses', note: 'Required — unlocks your study plan', required: true },
                { done: false, label: 'Import your syllabus', note: 'Required — pulls in all exams and deadlines', required: true },
                { done: false, label: 'Your sessions generate automatically', note: 'Sit back — we handle the scheduling', required: false },
              ].map(({ done, label, note, required }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    done ? 'bg-emerald-400 border-emerald-400' : 'border-white/30'
                  }`}>
                    {done && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/80 text-sm font-semibold">{label}</span>
                      {required && <span className="text-amber-400 text-xs font-bold">Required</span>}
                    </div>
                    <p className="text-white/40 text-xs mt-0.5">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a]">
      <div className="px-6 py-10 max-w-3xl mx-auto space-y-10">

        {/* ── Header ── */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-slate-500 text-sm font-medium mb-1 tracking-wide">{formatDate(todayStr)}</p>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{greeting()}</h1>
          </div>
          {/* Streak badge */}
          {(streak > 1 || lastCompletedDate === todayStr) ? (
            <div className="shrink-0 flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 rounded-2xl px-4 py-2.5">
              <span className="text-xl leading-none">🔥</span>
              <div>
                <p className="text-orange-500 dark:text-orange-300 font-black text-xl leading-none">{streak}</p>
                <p className="text-orange-500/70 dark:text-orange-400/70 text-xs font-semibold mt-0.5">day streak</p>
              </div>
            </div>
          ) : (
            <div className="shrink-0 flex items-center gap-2 bg-slate-200/80 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-700/40 rounded-2xl px-4 py-2.5">
              <span className="text-xl leading-none">🔥</span>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Start your streak</p>
            </div>
          )}
        </div>

        {/* ── Stats Strip ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: streak, label: 'Day streak', icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
            ), accent: '#f97316' },
            { value: weekSessions, label: 'Sessions this week', icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ), accent: '#10b981' },
            { value: `${weekHours}h`, label: 'Studied this week', icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ), accent: '#818cf8' },
          ].map(({ value, label, icon, accent }) => (
            <div
              key={label}
              className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/40 rounded-2xl px-4 py-5"
              style={{ borderTopWidth: 2, borderTopColor: `${accent}40` }}
            >
              <div className="flex items-center gap-1.5 mb-2" style={{ color: accent }}>{icon}</div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none mb-1.5">{value}</p>
              <p className="text-slate-500 text-xs font-medium leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Hero Study Card ── */}
        <div>
          {noSessions ? (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-800/40 px-8 py-10 text-center">
              <p className="text-slate-700 dark:text-slate-300 font-semibold text-lg mb-1">All clear</p>
              <p className="text-slate-400 dark:text-slate-600 text-sm">No sessions scheduled for today or tomorrow</p>
            </div>
          ) : (
            <div
              className="rounded-3xl p-8 relative overflow-hidden"
              style={{ background: colorToGradient(heroColor) }}
            >
              {/* Glow orb */}
              <div
                className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
                style={{ backgroundColor: '#ffffff' }}
              />
              <div className="relative z-10 flex items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-white/70 text-xs font-bold uppercase tracking-widest">
                      {isToday ? 'Up next today' : 'Up next tomorrow'}
                    </span>
                    <span className="bg-white/15 text-white/80 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      {isToday ? 'Today' : 'Tomorrow'}
                    </span>
                  </div>
                  <p className="text-white text-2xl font-bold leading-tight mb-1 truncate">
                    {heroSession?.courseName}
                  </p>
                  <p className="text-white/60 text-sm font-medium">
                    {heroSession?.sessionType}
                    {heroSession?.startTime ? ` · ${heroSession.startTime}` : ''}
                    {` · ${heroSession?.duration} min`}
                  </p>
                  {showSessions.length > 1 && (
                    <p className="text-white/40 text-xs mt-2">
                      +{showSessions.length - 1} more session{showSessions.length > 2 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col gap-2.5">
                  <button
                    onClick={() => heroSession && onStartFocus(heroSession)}
                    className="bg-white text-slate-900 font-bold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-black/30 hover:brightness-95 active:scale-95 transition-all whitespace-nowrap"
                  >
                    Start Session
                  </button>
                  <button
                    onClick={() => heroSession && handleToggle(heroSession.id)}
                    className="bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold px-4 py-2 rounded-xl transition-all text-center"
                  >
                    Mark done
                  </button>
                </div>
              </div>

              {/* Additional sessions row */}
              {showSessions.length > 1 && (
                <div className="relative z-10 mt-5 pt-5 border-t border-white/10 space-y-2">
                  {showSessions.slice(1).map(session => {
                    const done = completedIds.has(session.id)
                    return (
                      <div key={session.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                          <span className={`text-sm font-medium truncate ${done ? 'line-through text-white/30' : 'text-white/70'}`}>
                            {session.courseName} · {session.sessionType}
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggle(session.id)}
                          className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                            done ? 'bg-white/40 border-transparent' : 'border-white/30 hover:border-white/60'
                          }`}
                        >
                          {done && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Week Strip ── */}
        <div>
          <h2 className="text-slate-500 dark:text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">This Week</h2>
          <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-4">
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => (
                <div key={day.dateStr} className="flex flex-col items-center gap-2 py-2">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    day.isToday ? 'text-white' : 'text-slate-400 dark:text-slate-600'
                  }`}>
                    {day.letter}
                  </span>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                    style={
                      day.isToday
                        ? { backgroundColor: heroColor, boxShadow: `0 0 12px ${heroColor}66` }
                        : {}
                    }
                  >
                    <span className={`text-sm font-bold leading-none ${
                      day.isToday ? 'text-white' :
                      day.isPast   ? 'text-slate-400 dark:text-slate-600' :
                                     'text-slate-700 dark:text-slate-300'
                    }`}>
                      {day.dayNum}
                    </span>
                  </div>
                  <div className="h-4 flex items-center justify-center">
                    {day.allDone ? (
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : day.hasSessions ? (
                      <div className="flex gap-0.5">
                        {day.dots.map((color, i) => (
                          <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Course Cards ── */}
        <div>
          <h2 className="text-slate-500 dark:text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Your Courses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courseStats.map(({ course, total, completed, dot }, idx) => {
              const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
              const daysLeft = daysBetween(todayStr, course.examDate)
              const isUrgent = daysLeft >= 0 && daysLeft <= 7
              const isWarning = daysLeft > 7 && daysLeft <= 14
              const nextSess = nextSessionPerCourse[idx]

              return (
                <div
                  key={idx}
                  className="group bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-6 cursor-default transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600/60 hover:scale-[1.01]"
                  style={{ borderLeftWidth: 4, borderLeftColor: dot }}
                >
                  <div className="flex items-start gap-4 mb-5">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 font-black text-white text-2xl shadow-lg"
                      style={{ backgroundColor: dot, boxShadow: `0 4px 14px ${dot}55` }}
                    >
                      {course.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="font-bold text-slate-900 dark:text-white text-base truncate mb-1">{course.name}</p>
                      <div className="flex items-center gap-1.5">
                        {isUrgent && (
                          <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                        <span className={`text-sm font-bold ${
                          isUrgent ? 'text-red-400' :
                          isWarning ? 'text-amber-400' :
                          'text-slate-500'
                        }`}>
                          {daysLeft > 0 ? `${daysLeft}d to exam` : daysLeft === 0 ? 'Exam today' : 'Exam passed'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="flex justify-between text-xs font-semibold mb-2">
                      <span className="text-slate-500">{completed} of {total} sessions</span>
                      <span style={{ color: dot }}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: dot }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => nextSess && onStartFocus(nextSess)}
                    disabled={!nextSess}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={
                      nextSess
                        ? {
                            background: `linear-gradient(135deg, ${dot}30, ${dot}18)`,
                            color: dot,
                            border: `1px solid ${dot}50`,
                          }
                        : { backgroundColor: 'rgba(241,245,249,0.8)', color: '#94a3b8', border: '1px solid rgba(203,213,225,0.8)', cursor: 'default' }
                    }
                  >
                    {nextSess ? 'Study Now' : 'All sessions complete'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Upcoming Deadlines ── */}
        <div className="pb-6">
          <h2 className="text-slate-500 dark:text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Upcoming Deadlines</h2>

          {upcomingDeadlines.length === 0 ? (
            <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl px-8 py-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700/50 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-900 dark:text-white font-bold text-base mb-2">Import your syllabus</p>
              <p className="text-slate-500 text-sm mb-6 max-w-xs">See all your exams, quizzes, and deadlines pulled straight from your course documents</p>
              <button
                onClick={onImportSyllabus}
                className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/40"
              >
                Import Syllabus
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden">
              {upcomingDeadlines.map((event, i) => {
                const days = daysBetween(todayStr, event.date)
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
                      i < upcomingDeadlines.length - 1 ? 'border-b border-slate-100 dark:border-slate-700/40' : ''
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 dark:text-white text-sm font-bold truncate">{event.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5 font-medium">{event.courseName} · {event.type}</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 px-3 py-1.5 rounded-full ${
                      days <= 3 ? 'bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300' :
                      days <= 7 ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300' :
                      'bg-slate-100 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400'
                    }`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
