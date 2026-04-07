import { useState, useMemo } from 'react'

const TARGET_THRESHOLDS = { A: 90, B: 80, C: 70, 'Pass/Fail': 60 }

function gradeColor(score, threshold) {
  if (score >= threshold) return 'text-emerald-400'
  if (score >= threshold - 10) return 'text-amber-400'
  return 'text-red-400'
}

export default function CoursesView({
  courses,
  allSessions,
  syllabusEventsByDate,
  completedIds,
  assignments,
  onLogGrade,
  onImportSyllabus,
}) {
  const [expandedIdx, setExpandedIdx] = useState(null)

  const todayStr = new Date().toISOString().split('T')[0]

  const syllabusForCourse = useMemo(() => {
    const map = {}
    Object.values(syllabusEventsByDate).flat().forEach(e => {
      if (e.courseIdx !== null && e.courseIdx !== undefined) {
        if (!map[e.courseIdx]) map[e.courseIdx] = []
        map[e.courseIdx].push(e)
      }
    })
    return map
  }, [syllabusEventsByDate])

  const sessionsByCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, i) => {
      map[i] = allSessions.filter(s => s.courseId === i).sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    })
    return map
  }, [courses, allSessions])

  const gradesByCourse = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      if (!map[a.courseIdx]) map[a.courseIdx] = []
      map[a.courseIdx].push(a)
    })
    return map
  }, [assignments])

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Courses</h1>

      <div className="space-y-3">
        {courses.map((course, idx) => {
          const expanded = expandedIdx === idx
          const sessions = sessionsByCourse[idx] ?? []
          const completed = sessions.filter(s => completedIds.has(s.id)).length
          const pct = sessions.length ? Math.round((completed / sessions.length) * 100) : 0
          const grades = gradesByCourse[idx] ?? []
          const loggedGrades = grades.filter(g => g.loggedGrade !== null)
          const threshold = TARGET_THRESHOLDS[course.targetGrade] ?? 80
          const avgGrade = loggedGrades.length
            ? Math.round(loggedGrades.reduce((s, g) => s + g.loggedGrade * g.weight, 0) / loggedGrades.reduce((s, g) => s + g.weight, 0) * 10) / 10
            : null
          const daysLeft = Math.round((new Date(course.examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000)
          const syllabusEvts = syllabusForCourse[idx] ?? []

          return (
            <div key={idx} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedIdx(expanded ? null : idx)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors text-left"
              >
                <div className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: course.color.dot }} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-100">{course.name}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                    <span>{daysLeft > 0 ? `${daysLeft}d to exam` : 'Exam passed'}</span>
                    <span>·</span>
                    <span>{completed}/{sessions.length} sessions</span>
                    <span>·</span>
                    <span>Target: {course.targetGrade}</span>
                    {avgGrade !== null && (
                      <>
                        <span>·</span>
                        <span className={gradeColor(avgGrade, threshold)}>Avg: {avgGrade}%</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-semibold text-slate-400">{pct}%</span>
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {expanded && (
                <div className="border-t border-slate-700/50 px-5 py-4 space-y-5">

                  {/* Sessions */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Sessions</h3>
                    {sessions.length === 0 ? (
                      <p className="text-slate-600 text-sm">No sessions scheduled.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {sessions.map(s => {
                          const done = completedIds.has(s.id)
                          const isPast = s.dateStr < todayStr
                          return (
                            <div key={s.id} className={`flex items-center gap-3 text-sm ${done ? 'opacity-50' : isPast ? 'opacity-60' : ''}`}>
                              <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-0.5 ${done ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                              <span className={`flex-1 truncate ${done ? 'line-through text-slate-500' : 'text-slate-300'}`}>{s.sessionType}</span>
                              <span className="text-slate-500 text-xs shrink-0">
                                {new Date(s.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-slate-600 text-xs shrink-0">{s.duration}m</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Syllabus events */}
                  {syllabusEvts.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Syllabus Events</h3>
                      <div className="space-y-1.5">
                        {syllabusEvts.sort((a, b) => a.date.localeCompare(b.date)).map(e => (
                          <div key={e.id} className="flex items-center gap-3 text-sm" style={{ borderLeft: `2px solid ${e.color.dot}`, paddingLeft: '10px' }}>
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-300 truncate block">{e.name}</span>
                              <span className="text-slate-500 text-xs">{e.type}</span>
                            </div>
                            <span className="text-slate-500 text-xs shrink-0">
                              {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grades */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Grades</h3>
                      {grades.length > 0 && avgGrade !== null && (
                        <span className={`text-sm font-bold ${gradeColor(avgGrade, threshold)}`}>Avg: {avgGrade}%</span>
                      )}
                    </div>
                    {grades.length === 0 ? (
                      <p className="text-slate-600 text-sm">No assignments added. <span className="text-slate-500">Edit your plan to add assignments and log grades.</span></p>
                    ) : (
                      <div className="space-y-2">
                        {grades.map(g => (
                          <div key={g.id} className="flex items-center gap-3 text-sm">
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-300 truncate block">{g.name}</span>
                              <span className="text-slate-500 text-xs">{g.type} · {g.weight}% of grade · Due {new Date(g.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                            {g.loggedGrade !== null ? (
                              <span className={`font-bold text-sm shrink-0 ${gradeColor(g.loggedGrade, threshold)}`}>{g.loggedGrade}%</span>
                            ) : (
                              <button
                                onClick={() => onLogGrade(g.id)}
                                className="text-xs text-indigo-400 hover:text-indigo-300 shrink-0 border border-indigo-500/30 hover:border-indigo-400/60 px-2.5 py-1 rounded-lg transition-all"
                              >
                                Log grade
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Import syllabus for this course */}
                  <button
                    onClick={() => onImportSyllabus(idx)}
                    className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Import syllabus for {course.name}
                  </button>

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
