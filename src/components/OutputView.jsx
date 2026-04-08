import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { generateSchedule } from '../utils/generateSchedule'
import {
  getCachedSyllabusEvents,
  getCachedManualSessions,
  saveSyllabusEvents,
  saveManualSessions,
} from '../lib/db'
import FocusMode from './FocusMode'
import BlueprintScreen from './BlueprintScreen'
import SyllabusUploadModal from './SyllabusUploadModal'
import CalendarMonthView from './CalendarMonthView'
import CalendarDayView from './CalendarDayView'
import AddSessionModal from './AddSessionModal'
import AppShell from './AppShell'
import DashboardView from './DashboardView'
import { useSessionReminders } from '../utils/useSessionReminders'
import CoursesView from './CoursesView'
import ProgressView from './ProgressView'
import StudyToolsView from './StudyToolsView'
import StudyCoachView from './StudyCoachView'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TARGET_THRESHOLDS = { A: 90, B: 80, C: 70, 'Pass/Fail': 60 }

function gradeStatus(avg, threshold) {
  if (avg >= threshold) return 'on-track'
  if (avg >= threshold - 10) return 'at-risk'
  return 'needs-recovery'
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function buildRecoverySessions(courses, recoveryIdxSet, sessionMinutes) {
  const sessions = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  recoveryIdxSet.forEach(idx => {
    const course = courses[idx]
    if (!course) return
    const examDate = new Date(course.examDate + 'T12:00:00')
    const cutoff = new Date(examDate); cutoff.setDate(cutoff.getDate() - 7)
    if (cutoff <= today) return
    const start = new Date(today); start.setDate(start.getDate() + 1)
    const daysToWed = (3 - start.getDay() + 7) % 7
    start.setDate(start.getDate() + (daysToWed === 0 ? 7 : daysToWed))
    let current = new Date(start)
    while (current <= cutoff) {
      const key = current.toISOString().split('T')[0]
      sessions.push({
        id: `recovery-${idx}-${key}`,
        dateStr: key,
        courseId: idx,
        courseName: course.name,
        color: course.color,
        sessionType: 'Grade Recovery',
        duration: sessionMinutes,
        daysUntilExam: Math.round((examDate - current) / 86400000),
        isRecovery: true,
        startTime: null,
        endTime: null,
      })
      current = new Date(current); current.setDate(current.getDate() + 7)
    }
  })
  return sessions
}

// ─── SessionBlock ─────────────────────────────────────────────────────────────
function SessionBlock({ session, completed, onToggle }) {
  return (
    <div
      className={`rounded-lg px-2 pt-1.5 pb-1.5 mb-1 text-white text-xs leading-tight relative transition-all group cursor-pointer ${completed ? 'opacity-40' : 'opacity-90 hover:opacity-100'}`}
      style={{
        backgroundColor: session.color.dot,
        backgroundImage: session.isRecovery
          ? 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.12) 4px,rgba(0,0,0,0.12) 8px)'
          : undefined,
      }}
      onClick={() => onToggle(session.id)}
    >
      {session.startTime && (
        <div className="text-white/60 text-[9px] font-medium mb-0.5">{session.startTime}</div>
      )}
      <div className={`font-semibold truncate ${completed ? 'line-through' : ''}`}>{session.courseName}</div>
      <div className="text-white/70 text-[10px]">{session.isRecovery ? '↑ Recovery' : session.sessionType}</div>
    </div>
  )
}

// ─── SyllabusEventBlock ───────────────────────────────────────────────────────
function SyllabusEventBlock({ event }) {
  return (
    <div
      className="rounded-lg px-2 py-1 mb-1 text-xs leading-tight border"
      style={{ borderColor: event.color.dot, backgroundColor: `${event.color.dot}18` }}
    >
      <div className="font-semibold truncate" style={{ color: event.color.dot }}>{event.name}</div>
      <div className="text-slate-400 text-[10px]">{event.type}</div>
    </div>
  )
}

// ─── DayCell ──────────────────────────────────────────────────────────────────
function DayCell({ day, completedIds, onToggle, syllabusEventsForDay, onAddSession }) {
  return (
    <div className={`min-h-[100px] p-1.5 rounded-xl border transition-all group ${
      day.isToday  ? 'bg-slate-700/50 border-indigo-500/50 ring-1 ring-indigo-500/30' :
      day.isPast   ? 'bg-slate-800/20 border-slate-700/20' :
                     'bg-slate-800/30 border-slate-700/30'
    }`}>
      <div className="flex items-center justify-between mb-1 px-1">
        <div>
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${day.isToday ? 'text-indigo-400' : 'text-slate-500'}`}>{day.dayName}</span>
          <span className={`text-sm font-bold leading-none ${day.isToday ? 'text-white' : day.isSunday ? 'text-slate-600' : 'text-slate-300'}`}>{day.dayNum}</span>
        </div>
        {!day.isSunday && (
          <button
            onClick={() => onAddSession(day.dateStr)}
            className="no-print opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-600 hover:text-indigo-400"
            title="Add session"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>
      <div>
        {day.sessions.map(session => (
          <SessionBlock
            key={session.id}
            session={session}
            completed={completedIds.has(session.id)}
            onToggle={onToggle}
          />
        ))}
        {(syllabusEventsForDay ?? []).map(e => (
          <SyllabusEventBlock key={e.id} event={e} />
        ))}
      </div>
    </div>
  )
}

// ─── Share card modal ─────────────────────────────────────────────────────────
function ShareCardModal({ courses, stats, onClose }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="flex flex-col items-center gap-4">
        <p className="text-slate-400 text-sm">Screenshot this card to share your plan</p>
        <div style={{
          width: 360, background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 60%)',
          borderRadius: 24, padding: '28px 24px 24px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.4)', flexShrink: 0 }}>
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', lineHeight: 1 }}>StudyEdge</div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>My Semester Plan</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 18 }} />
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Courses</div>
            {courses.map((course, idx) => {
              const today = new Date(); today.setHours(0,0,0,0)
              const daysLeft = Math.round((new Date(course.examDate + 'T12:00:00') - today) / 86400000)
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: course.color.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, color: '#e2e8f0', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{course.name}</div>
                  <div style={{ color: '#64748b', fontSize: 11, flexShrink: 0 }}>{daysLeft > 0 ? `${daysLeft}d` : 'done'}</div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[
              { label: 'Hours Planned', value: `${stats.totalHours}h`, color: '#34d399' },
              { label: 'Sessions', value: stats.totalSessions, color: '#818cf8' },
              { label: 'Courses', value: stats.totalCourses, color: '#fb923c' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ color, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</div>
                <div style={{ color: '#64748b', fontSize: 10, marginTop: 4, fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
          {stats.nearestExam && (
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" fill="none" stroke="#fbbf24" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>NEXT EXAM</div>
                <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats.nearestExam.name} — in {stats.nearestExam.days} days
                </div>
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center', color: '#334155', fontSize: 11, fontWeight: 500, letterSpacing: '0.04em' }}>studymap.app</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Close</button>
      </div>
    </div>
  )
}

// ─── Log Grade modal ──────────────────────────────────────────────────────────
function LogGradeModal({ logGradeId, assignments, courses, gradeInput, setGradeInput, gradeError, onSave, onClose }) {
  const logTarget = assignments.find(a => a.id === logGradeId)
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-1">Log Grade</h3>
        {logTarget && (
          <p className="text-slate-400 text-sm mb-4">
            <span className="text-slate-200 font-medium">{logTarget.name}</span>
            <span className="mx-1.5 text-slate-600">·</span>{courses[logTarget.courseIdx]?.name}
            <span className="mx-1.5 text-slate-600">·</span>{logTarget.weight}% of grade
          </p>
        )}
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Your score (%)</label>
        <input
          type="number" value={gradeInput} min="0" max="100" step="0.1"
          onChange={e => setGradeInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave()}
          placeholder="e.g. 84" autoFocus
          className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm mb-1"
        />
        {gradeError && <p className="text-red-400 text-xs mb-3">{gradeError}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-2.5 rounded-xl text-sm transition-colors">Cancel</button>
          <button onClick={onSave} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">Save Grade</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OutputView({
  courses, schedule, learningStyle, yearLevel,
  initialCompletedIds, initialAssignments, onSavePlan, onEditPlan, onSignOut, onAddCourse,
  onToggleTheme, theme, userEmail,
}) {
  const result = useMemo(
    () => generateSchedule(courses, schedule, learningStyle, yearLevel),
    [courses, schedule, learningStyle, yearLevel]
  )
  const { weeks, stats, sessionMinutes } = result

  // ── state ──
  const [completedIds, setCompletedIds] = useState(() => initialCompletedIds ?? new Set())
  const [focusSession, setFocusSession] = useState(null)
  const [blueprintSession, setBlueprintSession] = useState(null) // session waiting for blueprint
  const [activeBlueprint, setActiveBlueprint] = useState(null)  // chosen blueprint (or null = skip)
  const [activeSection, setActiveSection] = useState('dashboard')

  // ── Browser back-button support ──────────────────────────────────────────────
  const sectionMounted = useRef(false)
  useEffect(() => {
    if (!sectionMounted.current) {
      window.history.replaceState({ section: 'dashboard' }, '', '#dashboard')
      sectionMounted.current = true
    } else {
      window.history.pushState({ section: activeSection }, '', `#${activeSection}`)
    }
  }, [activeSection])
  useEffect(() => {
    const onPop = (e) => {
      const section = e.state?.section ?? 'dashboard'
      setActiveSection(section)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // ─────────────────────────────────────────────────────────────────────────────

  const [assignments, setAssignments] = useState(() => initialAssignments ?? [])
  const [logGradeId, setLogGradeId] = useState(null)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeError, setGradeError] = useState('')
  const [recoveryAlerts, setRecoveryAlerts] = useState([])
  const [showShareCard, setShowShareCard] = useState(false)

  const [syllabusEvents, setSyllabusEvents] = useState(() => getCachedSyllabusEvents() ?? [])
  const [syllabusModalCourse, setSyllabusModalCourse] = useState(null)

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('studymap_view_mode') ?? 'week')
  const todayStr = new Date().toISOString().split('T')[0]
  const todayMonthStr = todayStr.slice(0, 7)
  const [activeDayStr, setActiveDayStr] = useState(todayStr)
  const [expandedDayStr, setExpandedDayStr] = useState(null)
  const [currentMonthStr, setCurrentMonthStr] = useState(todayMonthStr)
  const [manualSessions, setManualSessions] = useState(() => getCachedManualSessions() ?? [])
  const [addSessionDayStr, setAddSessionDayStr] = useState(null)

  // ── persist ──
  useEffect(() => { onSavePlan(completedIds, assignments) }, [completedIds, assignments])
  useEffect(() => { saveSyllabusEvents(syllabusEvents) }, [syllabusEvents])
  useEffect(() => { saveManualSessions(manualSessions) }, [manualSessions])
  useEffect(() => { localStorage.setItem('studymap_view_mode', viewMode) }, [viewMode])

  // ── recovery ──
  const recoveryCoursesIdx = useMemo(() => {
    const set = new Set()
    courses.forEach((course, idx) => {
      const logged = assignments.filter(a => a.courseIdx === idx && a.loggedGrade !== null)
      if (!logged.length) return
      const totalW = logged.reduce((s, a) => s + a.weight, 0)
      if (!totalW) return
      const avg = logged.reduce((s, a) => s + a.loggedGrade * a.weight, 0) / totalW
      if (avg < (TARGET_THRESHOLDS[course.targetGrade] ?? 80) - 10) set.add(idx)
    })
    return set
  }, [assignments, courses])

  const recoverySessions = useMemo(
    () => buildRecoverySessions(courses, recoveryCoursesIdx, sessionMinutes ?? 60),
    [courses, recoveryCoursesIdx, sessionMinutes]
  )

  // ── merged weeks ──
  const weeksWithAll = useMemo(() => {
    const extras = [...recoverySessions, ...manualSessions]
    if (!extras.length) return weeks
    const byDate = {}
    extras.forEach(s => { if (!byDate[s.dateStr]) byDate[s.dateStr] = []; byDate[s.dateStr].push(s) })
    return weeks.map(week => ({
      ...week,
      days: week.days.map(day => {
        const extra = byDate[day.dateStr] ?? []
        return extra.length ? { ...day, sessions: [...day.sessions, ...extra] } : day
      }),
    }))
  }, [weeks, recoverySessions, manualSessions])

  const allSessions = useMemo(() =>
    weeksWithAll.flatMap(w => w.days).flatMap(d => d.sessions.map(s => ({ ...s, dateStr: d.dateStr }))),
    [weeksWithAll]
  )

  useSessionReminders(allSessions, completedIds, todayStr)

  const allDaysMap = useMemo(() => {
    const map = {}
    weeksWithAll.forEach(w => w.days.forEach(d => { map[d.dateStr] = d }))
    return map
  }, [weeksWithAll])

  const syllabusEventsByDate = useMemo(() => {
    const map = {}
    syllabusEvents.forEach(e => { if (!map[e.date]) map[e.date] = []; map[e.date].push(e) })
    return map
  }, [syllabusEvents])

  const availableMonths = useMemo(() => {
    const seen = new Set()
    weeksWithAll.forEach(w => w.days.forEach(d => seen.add(d.dateStr.slice(0, 7))))
    return [...seen].sort()
  }, [weeksWithAll])

  const firstWeekOfMonth = useMemo(() => {
    const seen = new Set(); const result = new Set()
    weeksWithAll.forEach(w => {
      const mk = w.days[0].dateStr.slice(0, 7)
      if (!seen.has(mk)) { seen.add(mk); result.add(w.days[0].dateStr) }
    })
    return result
  }, [weeksWithAll])

  const nextSession = useMemo(() =>
    allSessions.find(s => s.dateStr >= todayStr && !completedIds.has(s.id)) ?? null,
    [allSessions, completedIds, todayStr]
  )

  const allComplete = allSessions.length > 0 && completedIds.size === allSessions.length

  const courseStats = useMemo(() =>
    courses.map((course, idx) => {
      const cs = allSessions.filter(s => s.courseId === idx)
      return { course, total: cs.length, completed: cs.filter(s => completedIds.has(s.id)).length, dot: course.color.dot }
    }),
    [courses, allSessions, completedIds]
  )

  // ── handlers ──
  const handleStartFocus = useCallback(s => { setBlueprintSession(s); setActiveBlueprint(null) }, [])
  const handleBlueprintStart = useCallback((blueprint) => {
    setActiveBlueprint(blueprint)
    setFocusSession(blueprintSession)
    setBlueprintSession(null)
  }, [blueprintSession])
  const handleBlueprintExit = useCallback(() => { setBlueprintSession(null); setActiveBlueprint(null) }, [])
  const handleFocusComplete = useCallback((id) => {
    setCompletedIds(prev => new Set([...prev, id])); setFocusSession(null); setActiveBlueprint(null)
  }, [])
  const handleFocusStartNext = useCallback((id, _elapsed, nextSess) => {
    setCompletedIds(prev => new Set([...prev, id]))
    setBlueprintSession(nextSess)
    setFocusSession(null)
    setActiveBlueprint(null)
  }, [])
  const handleFocusExit = useCallback(() => { setFocusSession(null); setActiveBlueprint(null) }, [])
  const handleToggle = useCallback(id => {
    setCompletedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const handleLogGrade = () => {
    const score = parseFloat(gradeInput)
    if (isNaN(score) || score < 0 || score > 100) { setGradeError('Enter a score between 0 and 100'); return }
    const assignment = assignments.find(a => a.id === logGradeId)
    if (!assignment) return
    const courseIdx = assignment.courseIdx
    const course = courses[courseIdx]
    const wasInRecovery = recoveryCoursesIdx.has(courseIdx)
    const newAssignments = assignments.map(a => a.id === logGradeId ? { ...a, loggedGrade: score } : a)
    setAssignments(newAssignments)
    const updated = newAssignments.filter(a => a.courseIdx === courseIdx && a.loggedGrade !== null)
    const totalW = updated.reduce((s, a) => s + a.weight, 0)
    if (totalW > 0) {
      const avg = updated.reduce((s, a) => s + a.loggedGrade * a.weight, 0) / totalW
      if (avg < (TARGET_THRESHOLDS[course.targetGrade] ?? 80) - 10 && !wasInRecovery)
        setRecoveryAlerts(prev => [...prev, course.name])
    }
    setLogGradeId(null); setGradeInput(''); setGradeError('')
  }

  const handleSyllabusConfirm = (courseIdx, items) => {
    const NEUTRAL = { name: 'slate', bg: 'bg-slate-500', dot: '#64748b' }
    const course = courseIdx !== null ? courses[courseIdx] : null
    setSyllabusEvents(prev => [
      ...prev,
      ...items.map(e => ({
        ...e,
        id: `syl-${courseIdx ?? 'all'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        courseIdx,
        courseName: course?.name ?? 'General',
        color: course?.color ?? NEUTRAL,
      })),
    ])
    setSyllabusModalCourse(null)
  }

  const handleAddManualSession = session => {
    setManualSessions(prev => [...prev, session])
    setAddSessionDayStr(null)
  }

  const handleJumpToMonth = monthKey => {
    if (viewMode === 'week') {
      document.getElementById(`month-${monthKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      setCurrentMonthStr(monthKey)
    }
  }

  const handlePrevMonth = () => {
    const [y, m] = currentMonthStr.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setCurrentMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const handleNextMonth = () => {
    const [y, m] = currentMonthStr.split('-').map(Number)
    const d = new Date(y, m, 1)
    setCurrentMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const handlePrevDay = () => {
    const d = new Date(activeDayStr + 'T12:00:00'); d.setDate(d.getDate() - 1)
    setActiveDayStr(d.toISOString().split('T')[0])
  }
  const handleNextDay = () => {
    const d = new Date(activeDayStr + 'T12:00:00'); d.setDate(d.getDate() + 1)
    setActiveDayStr(d.toISOString().split('T')[0])
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {blueprintSession && (
        <BlueprintScreen
          session={blueprintSession}
          course={courses[blueprintSession.courseId] ?? null}
          onStartSession={handleBlueprintStart}
          onExit={handleBlueprintExit}
        />
      )}
      {focusSession && (
        <FocusMode
          session={focusSession}
          blueprint={activeBlueprint}
          onComplete={handleFocusComplete}
          onExit={handleFocusExit}
          onStartNext={handleFocusStartNext}
          nextSession={allSessions.find(s => s.dateStr >= todayStr && !completedIds.has(s.id) && s.id !== focusSession.id) ?? null}
          onGoToTools={() => setActiveSection('tools')}
        />
      )}

      {logGradeId && (
        <LogGradeModal
          logGradeId={logGradeId}
          assignments={assignments}
          courses={courses}
          gradeInput={gradeInput}
          setGradeInput={v => { setGradeInput(v); setGradeError('') }}
          gradeError={gradeError}
          onSave={handleLogGrade}
          onClose={() => { setLogGradeId(null); setGradeInput(''); setGradeError('') }}
        />
      )}

      {syllabusModalCourse !== null && (
        <SyllabusUploadModal
          courses={courses}
          initialCourseIdx={syllabusModalCourse >= 0 ? syllabusModalCourse : null}
          onConfirm={(items, selectedCourseIdx) => handleSyllabusConfirm(selectedCourseIdx, items)}
          onClose={() => setSyllabusModalCourse(null)}
        />
      )}

      {addSessionDayStr && (
        <AddSessionModal
          dateStr={addSessionDayStr}
          courses={courses}
          onConfirm={handleAddManualSession}
          onClose={() => setAddSessionDayStr(null)}
        />
      )}

      {showShareCard && (
        <ShareCardModal courses={courses} stats={stats} onClose={() => setShowShareCard(false)} />
      )}

      <AppShell
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onImportSyllabus={() => setSyllabusModalCourse(-1)}
        onShare={() => setShowShareCard(true)}
        onEditPlan={onEditPlan}
        onSignOut={onSignOut}
        onToggleTheme={onToggleTheme}
        theme={theme}
        userEmail={userEmail}
      >

        {/* Recovery alerts */}
        {recoveryAlerts.length > 0 && (
          <div className="px-6 pt-6 space-y-2 max-w-4xl mx-auto">
            {recoveryAlerts.map((name, i) => (
              <div key={i} className="flex items-start gap-3 bg-amber-950/40 border border-amber-800/40 rounded-xl px-4 py-3">
                <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
                <p className="flex-1 text-amber-300 text-sm">Recovery sessions added for <span className="font-semibold text-amber-200">{name}</span> based on your grade.</p>
                <button onClick={() => setRecoveryAlerts(prev => prev.filter((_, j) => j !== i))} className="text-amber-700 hover:text-amber-400 transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Dashboard ── */}
        {activeSection === 'dashboard' && (
          <DashboardView
            courses={courses}
            todayStr={todayStr}
            allSessions={allSessions}
            syllabusEventsByDate={syllabusEventsByDate}
            completedIds={completedIds}
            courseStats={courseStats}
            stats={stats}
            weeksWithAll={weeksWithAll}
            onToggle={handleToggle}
            onStartFocus={handleStartFocus}
            nextSession={nextSession}
            allComplete={allComplete}
            onImportSyllabus={() => setSyllabusModalCourse(-1)}
            onAddSession={setAddSessionDayStr}
            onNavigateToCourses={() => setActiveSection('courses')}
          />
        )}

        {/* ── Calendar ── */}
        {activeSection === 'calendar' && (
          <div className="px-4 py-6 max-w-7xl mx-auto">
            {/* View controls */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="flex items-center gap-0.5 bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
                {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([mode, label]) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === mode ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableMonths.map(mk => {
                  const [y, m] = mk.split('-').map(Number)
                  const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                  const isActive = viewMode === 'month' ? mk === currentMonthStr : mk === activeDayStr.slice(0, 7)
                  return (
                    <button key={mk} onClick={() => handleJumpToMonth(mk)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                      }`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Day view */}
            {viewMode === 'day' && (
              <CalendarDayView
                dayStr={activeDayStr}
                allDaysMap={allDaysMap}
                syllabusEventsByDate={syllabusEventsByDate}
                completedIds={completedIds}
                onToggle={handleToggle}
                onPrev={handlePrevDay}
                onNext={handleNextDay}
              />
            )}

            {/* Month view */}
            {viewMode === 'month' && (
              <CalendarMonthView
                activeMonth={currentMonthStr}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                allDaysMap={allDaysMap}
                syllabusEventsByDate={syllabusEventsByDate}
                completedIds={completedIds}
                expandedDayStr={expandedDayStr}
                setExpandedDayStr={setExpandedDayStr}
                onDayClick={dateStr => { setActiveDayStr(dateStr); setViewMode('day'); setExpandedDayStr(null) }}
              />
            )}

            {/* Week view */}
            {viewMode === 'week' && (
              <div className="space-y-6">
                {weeksWithAll.map((week, weekIdx) => {
                  const hasAny = week.days.some(d => d.sessions.length > 0 || (syllabusEventsByDate[d.dateStr] ?? []).length > 0)
                  if (!hasAny && week.days.every(d => d.isPast)) return null
                  const weekStart = week.days[0]
                  const weekEnd = week.days[6]
                  const weekMonthKey = weekStart.dateStr.slice(0, 7)
                  const isFirstOfMonth = firstWeekOfMonth.has(weekStart.dateStr)
                  return (
                    <div key={weekIdx} className="print-page" id={isFirstOfMonth ? `month-${weekMonthKey}` : undefined}>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-slate-400 font-semibold text-sm uppercase tracking-wider">
                          {weekStart.monthName} {weekStart.dayNum}–{weekEnd.monthName} {weekEnd.dayNum}
                        </h3>
                        {week.days.some(d => d.isToday) && (
                          <span className="text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">Current Week</span>
                        )}
                        <div className="flex-1 h-px bg-slate-700/50" />
                        <span className="text-xs text-slate-600">{week.days.reduce((s, d) => s + d.sessions.length, 0)} sessions</span>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {week.days.map((day, dayIdx) => (
                          <DayCell
                            key={dayIdx}
                            day={day}
                            completedIds={completedIds}
                            onToggle={handleToggle}
                            syllabusEventsForDay={syllabusEventsByDate[day.dateStr]}
                            onAddSession={setAddSessionDayStr}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div className="no-print mt-4 text-center text-slate-600 text-xs pb-8">
                  <p>Sundays are rest days · {schedule.preferredTime} sessions · {schedule.hoursPerWeek}h/week</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Courses ── */}
        {activeSection === 'courses' && (
          <CoursesView
            courses={courses}
            allSessions={allSessions}
            syllabusEventsByDate={syllabusEventsByDate}
            completedIds={completedIds}
            assignments={assignments}
            onLogGrade={id => { setLogGradeId(id); setGradeInput('') }}
            onImportSyllabus={idx => setSyllabusModalCourse(idx)}
            onAddCourse={onAddCourse}
          />
        )}

        {/* ── Progress ── */}
        {activeSection === 'progress' && (
          <ProgressView
            courses={courses}
            allSessions={allSessions}
            completedIds={completedIds}
            todayStr={todayStr}
          />
        )}

        {/* ── Study Tools ── */}
        {activeSection === 'tools' && (
          <StudyToolsView courses={courses} />
        )}

        {/* ── Study Coach ── */}
        {activeSection === 'coach' && (
          <StudyCoachView courses={courses} />
        )}

        {/* Print header */}
        <div className="hidden print:block p-8 border-b border-gray-200">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">StudyEdge — Personalized Study Plan</h1>
          <p className="text-gray-500">{stats.totalCourses} courses · {stats.totalHours}h planned</p>
        </div>

      </AppShell>
    </>
  )
}
