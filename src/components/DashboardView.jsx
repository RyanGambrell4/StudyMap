import { useMemo, useEffect, useRef, useState } from 'react'
import { useCelebration } from '../utils/useCelebration'
import { useStreak } from '../utils/useStreak'
import { getCurrentGrade, letterGrade, gradeStatus, STATUS_COLORS } from '../utils/gradeCalc'
import { getActivePlan } from '../lib/subscription'

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
  onNavigateToGrades,
  onNavigateToTutor,
  onShowPaywall,
  coachPlans,
  onOpenStudyCoach,
}) {
  const plan = getActivePlan()
  const [gamePlanIdx, setGamePlanIdx] = useState(0)

  // ── Determine current week from a coach plan's weeklyFocus ─────────────────
  function getCurrentWeekInfo(weeklyFocus, sessionIndex) {
    if (!weeklyFocus?.length) return null
    // Try structured dates first
    const today = new Date(todayStr + 'T12:00:00')
    for (let i = 0; i < weeklyFocus.length; i++) {
      const w = weeklyFocus[i]
      if (w.startDate && w.endDate && todayStr >= w.startDate && todayStr <= w.endDate) {
        const totalBefore = weeklyFocus.slice(0, i).reduce((s, wk) => s + (wk.sessions?.length ?? 0), 0)
        const weekSessions = w.sessions?.length ?? 0
        const completedInWeek = Math.min(Math.max((sessionIndex ?? 0) - totalBefore, 0), weekSessions)
        return { weekIndex: i, total: weeklyFocus.length, theme: w.theme, weekSessions, completedInWeek }
      }
    }
    // Fallback: parse "Week of Month Day"
    for (let i = 0; i < weeklyFocus.length; i++) {
      const w = weeklyFocus[i]
      const match = w.week?.match(/Week of (\w+) (\d+)/)
      if (match) {
        const weekStart = new Date(`${match[1]} ${match[2]}, ${today.getFullYear()}`)
        if (!isNaN(weekStart)) {
          const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6)
          if (today >= weekStart && today <= weekEnd) {
            const totalBefore = weeklyFocus.slice(0, i).reduce((s, wk) => s + (wk.sessions?.length ?? 0), 0)
            const weekSessions = w.sessions?.length ?? 0
            const completedInWeek = Math.min(Math.max((sessionIndex ?? 0) - totalBefore, 0), weekSessions)
            return { weekIndex: i, total: weeklyFocus.length, theme: w.theme, weekSessions, completedInWeek }
          }
        }
      }
    }
    // Final fallback: first week
    const w = weeklyFocus[0]
    const weekSessions = w.sessions?.length ?? 0
    const completedInWeek = Math.min(sessionIndex ?? 0, weekSessions)
    return { weekIndex: 0, total: weeklyFocus.length, theme: w.theme, weekSessions, completedInWeek }
  }
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
      <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a]">
        <div className="px-6 py-10 max-w-2xl mx-auto">

          {/* Header */}
          <div className="mb-10">
            <p className="text-slate-500 text-sm font-medium mb-1 tracking-wide">{formatDate(todayStr)}</p>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{greeting()}</h1>
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
                <h2 className="text-2xl font-bold text-white mb-2 leading-tight">Your account is ready.<br />Now set up your courses.</h2>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">
                  Everything in StudyEdge, your study plan, sessions, deadlines, coaching, and tools, runs on your courses. Add them to unlock the full app.
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
                { done: false, label: 'Add your courses', note: 'Required. Unlocks your study plan.', required: true },
                { done: false, label: 'Import your syllabus', note: 'Required. Pulls in all exams and deadlines.', required: true },
                { done: false, label: 'Your sessions generate automatically', note: 'Sit back, we handle the scheduling.', required: false },
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

        {/* ── Your Game Plan ── */}
        {courses.length > 0 && (() => {
          const courseId = courses[gamePlanIdx]?.id ?? gamePlanIdx
          const cached = (coachPlans ?? {})[courseId]
          const course = courses[gamePlanIdx]
          const dot = course?.color?.dot ?? '#6366f1'
          const daysLeft = daysBetween(todayStr, course?.examDate)
          const isUrgent = daysLeft >= 0 && daysLeft <= 7
          const isWarning = daysLeft > 7 && daysLeft <= 14
          const nextSess = nextSessionPerCourse[gamePlanIdx]

          return (
            <div>
              <h2 className="text-slate-500 dark:text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Your Game Plan</h2>

              {/* Course selector chips */}
              {courses.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {courses.map((c, i) => {
                    const d = c.color?.dot ?? '#6366f1'
                    const active = gamePlanIdx === i
                    return (
                      <button
                        key={i}
                        onClick={() => setGamePlanIdx(i)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                        style={active
                          ? { backgroundColor: `${d}18`, color: d, borderColor: `${d}50` }
                          : { backgroundColor: 'transparent', color: '#64748b', borderColor: 'rgba(148,163,184,0.25)' }
                        }
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d }} />
                        <span className="truncate max-w-[120px]">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Single course card */}
              {cached?.plan ? (
                <div
                  className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden"
                  style={{ borderLeftWidth: 4, borderLeftColor: dot }}
                >
                  <div className="px-5 py-5">
                    {/* Header + exam badge */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <p className="text-slate-900 dark:text-white font-bold text-base">{course.name}</p>
                      {daysLeft > 0 && (
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                          isUrgent ? 'bg-red-500/12 text-red-400 dark:bg-red-500/15 dark:text-red-400'
                          : isWarning ? 'bg-amber-500/12 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400'
                        }`}>
                          Final in {daysLeft}d
                        </span>
                      )}
                    </div>

                    {/* Current week focus */}
                    {(() => {
                      const weekInfo = getCurrentWeekInfo(cached.plan.weeklyFocus, cached.sessionIndex)
                      const emphasis = cached.formData?.emphasisTopics
                      const struggles = cached.struggles?.length ? cached.struggles : null
                      const pct = weekInfo ? (weekInfo.weekSessions > 0 ? Math.round((weekInfo.completedInWeek / weekInfo.weekSessions) * 100) : 0) : 0
                      return (
                        <>
                          {weekInfo && (
                            <div className="mb-4">
                              <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">
                                <span className="text-slate-400 dark:text-slate-500">Week {weekInfo.weekIndex + 1} of {weekInfo.total}</span>
                                {weekInfo.theme && <span className="text-slate-400 dark:text-slate-600 mx-1.5">·</span>}
                                {weekInfo.theme && <span>Focus: {weekInfo.theme}</span>}
                              </p>
                            </div>
                          )}

                          {/* Session progress */}
                          {weekInfo && weekInfo.weekSessions > 0 && (
                            <div className="mb-4">
                              <div className="flex justify-between text-xs font-semibold mb-1.5">
                                <span className="text-slate-500 dark:text-slate-400">{weekInfo.completedInWeek} of {weekInfo.weekSessions} sessions completed</span>
                                <span style={{ color: dot }}>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, backgroundColor: dot }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Professor emphasis */}
                          {emphasis && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Prof emphasizes:</span> {emphasis}
                            </p>
                          )}

                          {/* Struggles */}
                          {struggles && (
                            <p className="text-xs text-amber-600 dark:text-amber-400/80 mb-3 leading-relaxed">
                              <span className="mr-1">📌</span>
                              <span className="font-semibold">Needs attention:</span> {struggles.join(', ')}
                            </p>
                          )}
                        </>
                      )
                    })()}

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-1">
                      <button
                        onClick={() => onOpenStudyCoach && onOpenStudyCoach(gamePlanIdx)}
                        className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                      >
                        View Full Plan →
                      </button>
                      {nextSess && (
                        <button
                          onClick={() => onStartFocus(nextSess)}
                          className="ml-auto text-xs font-bold px-4 py-2 rounded-xl transition-all"
                          style={{
                            background: `linear-gradient(135deg, ${dot}30, ${dot}18)`,
                            color: dot,
                            border: `1px solid ${dot}50`,
                          }}
                        >
                          Start Studying →
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Connection reinforcement footer */}
                  <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-700/30">
                    <p className="text-[10px] text-slate-400 dark:text-slate-600">Your sessions, flashcards, and AI tutor are all synced to this plan</p>
                  </div>
                </div>
              ) : (
                <div
                  className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden"
                  style={{ borderLeftWidth: 4, borderLeftColor: dot }}
                >
                  <div className="px-5 py-5">
                    <p className="text-slate-900 dark:text-white font-bold text-base mb-4">{course.name}</p>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 dark:text-slate-100 font-semibold text-sm mb-1">Set up your study plan</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mb-1.5">
                          Tell us your goals, what your professor emphasizes, and your schedule, and we'll build a week-by-week plan that powers your entire experience.
                        </p>
                        <p className="text-slate-400 dark:text-slate-500 text-[11px] leading-relaxed">
                          This unlocks personalized sessions, smarter flashcards, and AI tutoring tailored to your course.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenStudyCoach && onOpenStudyCoach(gamePlanIdx)}
                      className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                      style={{ backgroundColor: dot, boxShadow: `0 4px 14px ${dot}40` }}
                    >
                      Create Study Plan →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Grade Snapshot ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-500 dark:text-slate-300 text-sm font-bold uppercase tracking-widest">Grade Snapshot</h2>
            {plan !== 'free' && onNavigateToGrades && (
              <button onClick={() => onNavigateToGrades(0)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                Grade Hub →
              </button>
            )}
          </div>
          {plan === 'free' ? (
            <div className="relative rounded-2xl overflow-hidden">
              {/* Blurred fake preview */}
              <div className="filter blur-sm pointer-events-none select-none bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden">
                {[['Calculus II', '#6366f1', 'A', '91%'], ['Physics', '#f59e0b', 'B+', '88%'], ['English', '#10b981', 'A-', '90%']].map(([name, color, letter, pct]) => (
                  <div key={name} className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-700/40 last:border-0" style={{ borderLeft: `3px solid ${color}` }}>
                    <p className="flex-1 text-slate-700 dark:text-slate-200 font-semibold text-sm">{name}</p>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${color}20`, color }}>{letter} · {pct}</span>
                  </div>
                ))}
              </div>
              {/* Lock overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-[2px] rounded-2xl gap-3 px-6 text-center">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Grade Hub is Pro</p>
                  <p className="text-slate-400 text-xs mt-1">Track grades, project your final, and plan your path to your target grade.</p>
                </div>
                <button
                  onClick={onShowPaywall}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
                >
                  Upgrade to Pro →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden">
              {courses.map((course, idx) => {
                const comps = course.gradeData?.components ?? []
                const current = getCurrentGrade(comps)
                const target = course.gradeData?.targetGrade ?? null
                const status = current !== null && target ? gradeStatus(current, target) : 'unknown'
                const sc = STATUS_COLORS[status]
                const dot = course.color?.dot ?? '#6366f1'
                return (
                  <button
                    key={idx}
                    onClick={() => onNavigateToGrades && onNavigateToGrades(idx)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors text-left border-b border-slate-100 dark:border-slate-700/40 last:border-0"
                    style={{ borderLeft: `3px solid ${dot}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 dark:text-slate-100 font-semibold text-sm truncate">{course.name}</p>
                    </div>
                    {current !== null ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: sc.bg, color: sc.color }}>
                        {letterGrade(current)} · {current.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 shrink-0">Set up →</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── AI Tutor Quick Access ── */}
        <div>
          <h2 className="text-slate-500 dark:text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">AI Tutor</h2>
          {plan === 'free' ? (
            <div className="relative rounded-2xl overflow-hidden">
              {/* Blurred fake chat preview */}
              <div className="filter blur-sm pointer-events-none select-none bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5 space-y-3">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/30 shrink-0" />
                  <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-500 max-w-[80%]">Can you explain L'Hôpital's rule with an example?</div>
                </div>
                <div className="flex gap-3 justify-end">
                  <div className="bg-indigo-600/20 rounded-xl px-3 py-2 text-xs text-indigo-300 max-w-[80%]">Sure! L'Hôpital's rule states that for indeterminate forms...</div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/30 shrink-0" />
                  <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-500 max-w-[80%]">What should I focus on for my exam next week?</div>
                </div>
              </div>
              {/* Lock overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-[2px] rounded-2xl gap-3 px-6 text-center">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">AI Tutor is Pro</p>
                  <p className="text-slate-400 text-xs mt-1">Ask questions, get explanations, and flag topics that feed back into your study plan.</p>
                </div>
                <button
                  onClick={onShowPaywall}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
                >
                  Upgrade to Pro →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
              <div className="flex flex-wrap gap-2 mb-4">
                {courses.map((course, idx) => {
                  const dot = course.color?.dot ?? '#6366f1'
                  return (
                    <button
                      key={idx}
                      onClick={() => onNavigateToTutor && onNavigateToTutor()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all hover:opacity-80"
                      style={{ backgroundColor: `${dot}18`, color: dot, borderColor: `${dot}40` }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                      {course.name}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => onNavigateToTutor && onNavigateToTutor()}
                className="w-full flex items-center gap-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600/40 rounded-xl px-4 py-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-sm"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>Ask a question...</span>
              </button>
            </div>
          )}
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
