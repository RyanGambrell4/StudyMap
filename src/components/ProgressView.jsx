import { useMemo } from 'react'

const STREAK_MSGS = [
  { min: 0,  msg: 'Start your first session today to build your streak!' },
  { min: 1,  msg: 'Great start. Consistency is everything. Keep going!' },
  { min: 3,  msg: 'Three days in, you\'re building a real habit. Keep it up.' },
  { min: 7,  msg: 'One week strong. Your future self thanks you.' },
  { min: 14, msg: 'Two weeks of consistency. This is exceptional work.' },
  { min: 21, msg: 'Three weeks. You\'ve officially built a study habit.' },
  { min: 30, msg: 'A month of dedication. You\'re unstoppable.' },
]

function getStreakMsg(streak) {
  let best = STREAK_MSGS[0]
  for (const m of STREAK_MSGS) {
    if (streak >= m.min) best = m
  }
  return best.msg
}

function HoursBar({ label, hours, maxHours, color }) {
  const pct = maxHours > 0 ? Math.min(100, (hours / maxHours) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-sm">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">{Math.round(hours * 10) / 10}h</span>
      </div>
      <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function ProgressView({ courses, allSessions, completedIds, todayStr }) {
  // ── Streak ──
  const streak = useMemo(() => {
    const completedDates = new Set(
      allSessions.filter(s => completedIds.has(s.id)).map(s => s.dateStr)
    )
    let count = 0
    const d = new Date(todayStr + 'T12:00:00')
    // If today has no completions, start counting from yesterday
    if (!completedDates.has(todayStr)) {
      d.setDate(d.getDate() - 1)
    }
    while (true) {
      const key = d.toISOString().split('T')[0]
      if (completedDates.has(key)) {
        count++
        d.setDate(d.getDate() - 1)
      } else {
        break
      }
      if (count > 365) break
    }
    return count
  }, [allSessions, completedIds, todayStr])

  // ── Hours this week vs last week ──
  const { thisWeekHours, lastWeekHours } = useMemo(() => {
    const today = new Date(todayStr + 'T12:00:00')
    const dayOfWeek = today.getDay() // 0=Sun
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7)
    const lastWeekEnd   = new Date(weekStart); lastWeekEnd.setDate(weekStart.getDate() - 1)

    const weekStartStr    = weekStart.toISOString().split('T')[0]
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0]
    const lastWeekEndStr   = lastWeekEnd.toISOString().split('T')[0]

    let thisW = 0, lastW = 0
    allSessions.filter(s => completedIds.has(s.id)).forEach(s => {
      const mins = s.duration ?? 0
      if (s.dateStr >= weekStartStr && s.dateStr <= todayStr) thisW += mins
      else if (s.dateStr >= lastWeekStartStr && s.dateStr <= lastWeekEndStr) lastW += mins
    })
    return { thisWeekHours: thisW / 60, lastWeekHours: lastW / 60 }
  }, [allSessions, completedIds, todayStr])

  // ── Per-course stats ──
  const courseStats = useMemo(() =>
    courses.map((course, idx) => {
      const cs = allSessions.filter(s => s.courseId === idx)
      const done = cs.filter(s => completedIds.has(s.id)).length
      const pct = cs.length ? Math.round((done / cs.length) * 100) : 0
      return { course, total: cs.length, completed: done, pct }
    }),
    [courses, allSessions, completedIds]
  )

  const maxHours = Math.max(thisWeekHours, lastWeekHours, 0.1)
  const totalCompleted = allSessions.filter(s => completedIds.has(s.id)).length

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Progress</h1>

      {/* ── Streak + motivational ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
            <svg className="w-7 h-7" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" /></svg>
          </div>
          <div>
            <p className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">{streak}</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">day streak</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
            <svg className="w-7 h-7" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          </div>
          <div>
            <p className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">{totalCompleted}</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">sessions completed</p>
          </div>
        </div>
      </div>

      {/* Motivational message */}
      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl px-5 py-4 mb-6">
        <p className="text-indigo-600 dark:text-indigo-300 text-sm font-medium">{getStreakMsg(streak)}</p>
      </div>

      {/* ── Hours comparison ── */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 mb-6">
        <h2 className="text-slate-700 dark:text-slate-300 font-semibold mb-4">Study Hours</h2>
        <div className="space-y-4">
          <HoursBar label="This week" hours={thisWeekHours} maxHours={maxHours} color="#6366f1" />
          <HoursBar label="Last week" hours={lastWeekHours} maxHours={maxHours} color="#334155" />
        </div>
        {thisWeekHours > lastWeekHours && lastWeekHours > 0 && (
          <p className="text-emerald-400 text-xs mt-3">↑ {Math.round((thisWeekHours - lastWeekHours) * 10) / 10}h more than last week</p>
        )}
        {thisWeekHours < lastWeekHours && lastWeekHours > 0 && (
          <p className="text-amber-400 text-xs mt-3">↓ {Math.round((lastWeekHours - thisWeekHours) * 10) / 10}h less than last week</p>
        )}
      </div>

      {/* ── Per-course progress ── */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5">
        <h2 className="text-slate-700 dark:text-slate-300 font-semibold mb-4">Sessions by Course</h2>
        <div className="space-y-4">
          {courseStats.map(({ course, total, completed, pct }, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: course.color.dot }} />
                  <span className="text-slate-700 dark:text-slate-300 text-sm truncate">{course.name}</span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums shrink-0">{completed}/{total}</span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : course.color.dot }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
