// Weekly Recap
// Compute last week's snapshot for the Monday/Sunday debrief card.
// Uses the same completedSessionLog that momentum + dashboard already load —
// no new persistence.

function isoWeekStart(dateStr) {
  // Monday-based week: for a given YYYY-MM-DD, return that week's Monday.
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - offset)
  return monday.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// The recap only fires on Monday (dow=1) OR Sunday (dow=0) for the just-ended
// week. On any other day, return null so the card stays hidden.
export function shouldShowWeeklyRecap(todayStr) {
  const d = new Date(todayStr + 'T12:00:00')
  const dow = d.getDay()
  return dow === 0 || dow === 1
}

export function computeWeeklyRecap(completedSessionLog = [], todayStr) {
  if (!shouldShowWeeklyRecap(todayStr)) return null

  // "Last week" = the 7 days before the current week's Monday.
  const thisMonday = isoWeekStart(todayStr)
  const lastMonday = addDays(thisMonday, -7)
  const lastSunday = addDays(thisMonday, -1)

  const sessions = (completedSessionLog ?? []).filter(s => {
    const ds = s.dateStr ?? s.date
    return ds && ds >= lastMonday && ds <= lastSunday
  })

  if (sessions.length === 0) return null

  // Total minutes: prefer elapsedSeconds when present, fall back to duration.
  const totalMinutes = sessions.reduce((acc, s) => {
    if (typeof s.elapsedSeconds === 'number' && s.elapsedSeconds > 0) {
      return acc + s.elapsedSeconds / 60
    }
    return acc + (s.duration ?? 0)
  }, 0)

  const activeDayCount = new Set(sessions.map(s => s.dateStr ?? s.date)).size

  // Top course by minutes.
  const byCourse = {}
  sessions.forEach(s => {
    const key = s.courseName ?? `Course ${s.courseId ?? '?'}`
    const mins = (typeof s.elapsedSeconds === 'number' && s.elapsedSeconds > 0)
      ? s.elapsedSeconds / 60
      : (s.duration ?? 0)
    byCourse[key] = (byCourse[key] ?? 0) + mins
  })
  const topCourseEntry = Object.entries(byCourse).sort((a, b) => b[1] - a[1])[0]
  const topCourse = topCourseEntry
    ? { name: topCourseEntry[0], minutes: Math.round(topCourseEntry[1]) }
    : null

  // Avg recall across sessions that recorded a score.
  const withRecall = sessions.filter(s => typeof s.recallScore === 'number')
  const avgRecall = withRecall.length
    ? Math.round(withRecall.reduce((a, s) => a + s.recallScore, 0) / withRecall.length)
    : null

  // Compare to the week BEFORE last week for a delta line.
  const prevMonday = addDays(lastMonday, -7)
  const prevSunday = addDays(lastMonday, -1)
  const prev = (completedSessionLog ?? []).filter(s => {
    const ds = s.dateStr ?? s.date
    return ds && ds >= prevMonday && ds <= prevSunday
  })
  const prevMinutes = prev.reduce((acc, s) => {
    if (typeof s.elapsedSeconds === 'number' && s.elapsedSeconds > 0) return acc + s.elapsedSeconds / 60
    return acc + (s.duration ?? 0)
  }, 0)

  const deltaMinutes = Math.round(totalMinutes - prevMinutes)

  return {
    weekStart:      lastMonday,
    weekEnd:        lastSunday,
    sessionCount:   sessions.length,
    totalMinutes:   Math.round(totalMinutes),
    activeDayCount,
    topCourse,
    avgRecall,
    deltaMinutes,
  }
}
