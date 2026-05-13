import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { generateSchedule } from '../utils/generateSchedule'
import { clean } from '../utils/strings'
import {
  getCachedSyllabusEvents,
  getCachedManualSessions,
  saveSyllabusEvents,
  saveManualSessions,
  getCachedCoachPlan,
  getCachedCompletedSessions,
  saveCompletedSession,
  removeCompletedSession,
} from '../lib/db'
import FocusMode from './FocusMode'
import BlueprintScreen from './BlueprintScreen'
import SyllabusUploadModal from './SyllabusUploadModal'
import CalendarMonthView from './CalendarMonthView'
import CalendarDayView from './CalendarDayView'
import CalendarWeekView from './CalendarWeekView'
import AddSessionModal from './AddSessionModal'
import AppShell from './AppShell'
import DashboardView from './DashboardView'
import { useSessionReminders } from '../utils/useSessionReminders'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan } from '../lib/subscription'
import CoursesView from './CoursesView'
import ProgressView from './ProgressView'
import StudyToolsView from './StudyToolsView'
import StudyCoachView from './StudyCoachView'
import AIChatView from './AIChatView'
import GradeHubView from './GradeHubView'
import AccountView from './AccountView'

// ─── TutorView ────────────────────────────────────────────────────────────────
function TutorView({ courses, userId, onShowPaywall }) {
  const [selectedCourse, setSelectedCourse] = useState(courses.length > 0 ? 0 : -1)
  const course = courses[selectedCourse] ?? null

  return (
    <div className="flex flex-col h-full min-h-0 max-w-3xl mx-auto w-full px-4 py-6">
      {/* Header + course selector */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">AI Tutor</h1>
        <p className="text-slate-500 text-sm mb-4">Ask questions, get explanations, and flag difficult topics that feed back into your study plan.</p>
        {courses.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {courses.map((c, i) => {
              const dot = c.color?.dot ?? '#6366f1'
              const active = selectedCourse === i
              return (
                <button
                  key={i}
                  onClick={() => setSelectedCourse(i)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all border"
                  style={active
                    ? { backgroundColor: `${dot}20`, color: dot, borderColor: `${dot}50` }
                    : { backgroundColor: 'transparent', color: '#64748b', borderColor: 'rgba(148,163,184,0.3)' }
                  }
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
        {courses.length === 0 && (
          <p className="text-slate-400 text-sm">Add courses to start using the AI Tutor.</p>
        )}
      </div>

      {/* Chat */}
      {course && (
        <div className="flex-1 min-h-0 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 shrink-0">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              AI Tutor · <span style={{ color: course.color?.dot ?? '#6366f1' }}>{clean(course.name)}</span>
            </p>
          </div>
          <AIChatView
            courseId={course.id ?? selectedCourse}
            courseName={course.name}
            examDate={course.examDate ?? null}
            targetGrade={course.targetGrade ?? null}
            userId={userId}
            learningStyle={learningStyle}
            onShowPaywall={onShowPaywall}
          />
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TARGET_THRESHOLDS = { A: 80, B: 70, C: 60, 'Pass/Fail': 50 }

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
      className={`rounded-xl px-2 pt-1.5 pb-1.5 mb-1 text-xs leading-tight relative transition-all cursor-pointer ${completed ? 'opacity-35' : 'hover:brightness-110'}`}
      style={{
        backgroundColor: `${session.color.dot}22`,
        borderLeft: `3px solid ${session.color.dot}`,
        backgroundImage: session.isRecovery
          ? 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.06) 4px,rgba(0,0,0,0.06) 8px)'
          : undefined,
      }}
      onClick={() => onToggle(session.id)}
    >
      {session.startTime && (
        <div className="text-slate-500 dark:text-slate-500 text-[9px] font-medium mb-0.5">{session.startTime}</div>
      )}
      <div className={`font-semibold truncate ${completed ? 'line-through' : ''}`} style={{ color: session.color.dot }}>{session.courseName}</div>
      <div className="text-slate-500 dark:text-slate-500 text-[10px]">{session.isRecovery ? '↑ Recovery' : session.sessionType}</div>
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
function DayCell({ day, completedIds, onToggle, syllabusEventsForDay, onAddSession, isLast }) {
  return (
    <div className={`min-h-[110px] px-1.5 pb-2 group ${!isLast ? 'border-r border-slate-700/30 dark:border-slate-700/30' : ''} ${day.isPast ? 'opacity-60' : ''}`}>
      {/* Day header */}
      <div className="flex flex-col items-center mb-2 pt-1">
        <span className={`text-[10px] font-medium uppercase tracking-widest mb-1 ${day.isSunday ? 'text-slate-600' : 'text-slate-500'}`}>{day.dayName}</span>
        <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
          day.isToday
            ? 'bg-indigo-500 text-white'
            : day.isSunday
              ? 'text-slate-600'
              : 'text-slate-400'
        }`}>
          {day.dayNum}
        </div>
        {!day.isSunday && (
          <button
            onClick={() => onAddSession(day.dateStr)}
            className="no-print opacity-0 group-hover:opacity-100 transition-opacity mt-1 p-0.5 rounded text-slate-600 hover:text-indigo-400"
            title="Add session"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>
      {/* Sessions */}
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
  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i
  const isExamMode = courses.some(c => EXAM_PATTERN.test(c.name))
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
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', lineHeight: 1 }}>StudyEdge AI</div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{isExamMode ? 'My Prep Window' : 'My Semester Plan'}</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 18 }} />
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{isExamMode ? 'Sections' : 'Courses'}</div>
            {courses.map((course, idx) => {
              const today = new Date(); today.setHours(0,0,0,0)
              const daysLeft = Math.round((new Date(course.examDate + 'T12:00:00') - today) / 86400000)
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: course.color.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, color: '#e2e8f0', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(course.name)}</div>
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
                  {stats.nearestExam.name} · in {stats.nearestExam.days} days
                </div>
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center', color: '#334155', fontSize: 11, fontWeight: 500, letterSpacing: '0.04em' }}>getstudyedge.com</div>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
        <h3 style={{ color: '#1A1A1A', fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>Log Grade</h3>
        {logTarget && (
          <p style={{ color: '#6B6B6B', fontSize: 14, margin: '0 0 16px' }}>
            <span style={{ color: '#1A1A1A', fontWeight: 600 }}>{logTarget.name}</span>
            <span style={{ margin: '0 6px', color: '#C0C0C0' }}>·</span>{courses[logTarget.courseIdx]?.name}
            <span style={{ margin: '0 6px', color: '#C0C0C0' }}>·</span>{logTarget.weight}% of grade
          </p>
        )}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Your score (%)</label>
        <input
          type="number" value={gradeInput} min="0" max="100" step="0.1"
          onChange={e => setGradeInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave()}
          placeholder="e.g. 84" autoFocus
          style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }}
        />
        {gradeError && <p style={{ color: '#dc2626', fontSize: 12, margin: '0 0 12px' }}>{gradeError}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', color: '#6B6B6B', fontWeight: 600, padding: '10px', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSave} style={{ flex: 1, background: '#3B61C4', border: 'none', color: '#fff', fontWeight: 700, padding: '10px', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>Save Grade</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OutputView({
  courses, schedule, learningStyle, yearLevel, schoolType,
  initialCompletedIds, initialAssignments, onSavePlan, onEditPlan, onSignOut, onAddCourse, onEditCourse, onDeleteCourse,
  userEmail, userId, onShowPaywall,
}) {
  const result = useMemo(
    () => generateSchedule(courses, schedule, learningStyle, yearLevel),
    [courses, schedule, learningStyle, yearLevel]
  )
  const { weeks, stats, sessionMinutes } = result

  // ── state ──
  const [completedIds, setCompletedIds] = useState(() => initialCompletedIds ?? new Set())
  const [completedSessionLog, setCompletedSessionLog] = useState(() => getCachedCompletedSessions())
  const [focusSession, setFocusSession] = useState(null)
  const [blueprintSession, setBlueprintSession] = useState(null) // session waiting for blueprint
  const [activeBlueprint, setActiveBlueprint] = useState(null)  // chosen blueprint (or null = skip)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [showFirstQueryNudge, setShowFirstQueryNudge] = useState(false)

  // ── First-query nudge listener ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.detail.count === 1 && !localStorage.getItem('first_query_nudge_shown') && getActivePlan() === 'free') {
        setShowFirstQueryNudge(true)
      }
    }
    window.addEventListener('studyedge:ai-query-used', handler)
    return () => window.removeEventListener('studyedge:ai-query-used', handler)
  }, [])
  // ─────────────────────────────────────────────────────────────────────────────

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

  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i
  const isExamMode = courses.some(c => EXAM_PATTERN.test(c.name))

  const [assignments, setAssignments] = useState(() => initialAssignments ?? [])
  const [logGradeId, setLogGradeId] = useState(null)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeError, setGradeError] = useState('')
  const [recoveryAlerts, setRecoveryAlerts] = useState([])
  const [showShareCard, setShowShareCard] = useState(false)
  const [gradesCourseIdx, setGradesCourseIdx] = useState(0)
  const [coachCourseIdx, setCoachCourseIdx] = useState(0)
  const [coachPlans, setCoachPlans] = useState({})

  useEffect(() => {
    if (activeSection === 'dashboard') {
      const plans = {}
      courses.forEach((course, idx) => {
        const id = course.id ?? idx
        const cached = getCachedCoachPlan(id)
        if (cached) plans[id] = cached
      })
      setCoachPlans(plans)
    }
  }, [activeSection, courses])

  const handleOpenStudyCoach = useCallback((idx) => {
    if (getActivePlan() === 'free') {
      onShowPaywall?.('coach')
      return
    }
    setCoachCourseIdx(idx ?? 0)
    setActiveSection('coach')
  }, [onShowPaywall])

  const [syllabusEvents, setSyllabusEvents] = useState(() => getCachedSyllabusEvents() ?? [])
  const [syllabusModalCourse, setSyllabusModalCourse] = useState(null)
  const [syllabusInitialFile, setSyllabusInitialFile] = useState(null)

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('studyedge_view_mode') ?? 'week')
  const todayStr = new Date().toISOString().split('T')[0]
  const todayMonthStr = todayStr.slice(0, 7)
  const [activeDayStr, setActiveDayStr] = useState(todayStr)
  const [expandedDayStr, setExpandedDayStr] = useState(null)
  const [currentMonthStr, setCurrentMonthStr] = useState(todayMonthStr)
  const [manualSessions, setManualSessions] = useState(() => getCachedManualSessions() ?? [])
  const [addSessionDayStr, setAddSessionDayStr] = useState(null)

  // ── Google Calendar & Notion Calendar ────────────────────────────────────────
  const [googleEvents, setGoogleEvents] = useState([])
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalToast, setGcalToast] = useState(null) // 'connected' | 'error' | null
  const [fixConflictsLoading, setFixConflictsLoading] = useState(false)
  const [rescheduleResults, setRescheduleResults] = useState(null)
  const [sessionTimeOverrides, setSessionTimeOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('studyedge_session_time_overrides') ?? '{}') } catch { return {} }
  })

  useEffect(() => {
    // Detect redirect back from OAuth
    const params = new URLSearchParams(window.location.search)
    const gcal = params.get('gcal')
    if (gcal === 'connected') {
      setGcalToast('connected')
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      setTimeout(() => setGcalToast(null), 4000)
    } else if (gcal === 'error') {
      setGcalToast('error')
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      setTimeout(() => setGcalToast(null), 4000)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    getAccessToken().then(token =>
      fetch('/api/google-calendar-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.connected) setGcalConnected(true)
          if (data.events?.length) setGoogleEvents(data.events)
        })
        .catch(() => {})
    )
  }, [userId])

  const handleConnectGoogleCalendar = () => {
    window.location.href = `/api/google-auth?userId=${encodeURIComponent(userId)}`
  }

  const handleSessionMove = useCallback((sessionId, newDateStr, newStartTime, newEndTime) => {
    setSessionTimeOverrides(prev => ({
      ...prev,
      [sessionId]: { startTime: newStartTime, endTime: newEndTime, dateStr: newDateStr },
    }))
  }, [])

  const handleApplySuggestion = (suggestion) => {
    setSessionTimeOverrides(prev => ({
      ...prev,
      [suggestion.sessionId]: { startTime: suggestion.suggestedStart, endTime: suggestion.suggestedEnd },
    }))
  }

  const handleApplyAll = () => {
    if (!rescheduleResults?.length) return
    const updates = {}
    rescheduleResults.forEach(r => { updates[r.sessionId] = { startTime: r.suggestedStart, endTime: r.suggestedEnd } })
    setSessionTimeOverrides(prev => ({ ...prev, ...updates }))
    setRescheduleResults(null)
  }

  const handleFixConflicts = async () => {
    if (!conflictMap.size) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setFixConflictsLoading(true)
    setRescheduleResults(null)
    try {
      const conflictingSessions = allSessions.filter(s => conflictMap.has(s.id))
      const token = await getAccessToken()
      const res = await fetch('/api/reschedule-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conflictingSessions,
          googleEvents,
          timePreference: schedule.preferredTime,
        }),
      })
      const data = await res.json()
      setRescheduleResults(data.suggestions ?? [])
      incrementAIQuery()
    } catch (e) {
      console.error('[handleFixConflicts]', e)
      setRescheduleResults([])
    } finally {
      setFixConflictsLoading(false)
    }
  }

  // ── persist ──
  useEffect(() => { onSavePlan(completedIds, assignments) }, [completedIds, assignments])

  // Safety net: flush latest state to Supabase on hard browser close
  const _pendingSave = useRef({ completedIds, assignments })
  useEffect(() => { _pendingSave.current = { completedIds, assignments } }, [completedIds, assignments])
  useEffect(() => {
    const flush = () => onSavePlan(_pendingSave.current.completedIds, _pendingSave.current.assignments)
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [onSavePlan])
  useEffect(() => { saveSyllabusEvents(syllabusEvents) }, [syllabusEvents])
  useEffect(() => { saveManualSessions(manualSessions) }, [manualSessions])
  useEffect(() => { localStorage.setItem('studyedge_view_mode', viewMode) }, [viewMode])
  useEffect(() => { localStorage.setItem('studyedge_session_time_overrides', JSON.stringify(sessionTimeOverrides)) }, [sessionTimeOverrides])

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
    const hasOverrides = Object.keys(sessionTimeOverrides).length > 0

    let base = weeks
    if (extras.length) {
      const byDate = {}
      extras.forEach(s => { if (!byDate[s.dateStr]) byDate[s.dateStr] = []; byDate[s.dateStr].push(s) })
      base = weeks.map(week => ({
        ...week,
        days: week.days.map(day => {
          const extra = byDate[day.dateStr] ?? []
          return extra.length ? { ...day, sessions: [...day.sessions, ...extra] } : day
        }),
      }))
    }

    if (!hasOverrides) return base

    // Collect sessions being moved to a different date
    const dateMoved = {} // sessionId → newDateStr (only when date actually differs from original)
    Object.entries(sessionTimeOverrides).forEach(([id, ov]) => {
      if (ov.dateStr) dateMoved[id] = ov.dateStr
    })
    const hasDateMoves = Object.keys(dateMoved).length > 0

    // Snapshot all sessions by id (so we can re-insert at new date)
    const allSessionsById = {}
    if (hasDateMoves) {
      base.forEach(week => week.days.forEach(day => day.sessions.forEach(s => {
        allSessionsById[s.id] = { ...s, _origDateStr: day.dateStr }
      })))
    }

    // First pass: apply time overrides; remove sessions whose date was moved
    let result = base.map(week => ({
      ...week,
      days: week.days.map(day => ({
        ...day,
        sessions: day.sessions
          .filter(s => !dateMoved[s.id] || dateMoved[s.id] === day.dateStr)
          .map(s => {
            const ov = sessionTimeOverrides[s.id]
            if (!ov) return s
            const { dateStr: _d, ...timeOv } = ov  // strip dateStr from session fields
            return { ...s, ...timeOv }
          }),
      })),
    }))

    // Second pass: inject moved sessions into their new dates
    if (hasDateMoves) {
      const movedByNewDate = {}
      Object.entries(dateMoved).forEach(([id, newDate]) => {
        const orig = allSessionsById[id]
        if (!orig || orig._origDateStr === newDate) return
        const ov = sessionTimeOverrides[id]
        const { _origDateStr, ...clean } = orig
        const session = {
          ...clean,
          ...(ov?.startTime ? { startTime: ov.startTime } : {}),
          ...(ov?.endTime   ? { endTime:   ov.endTime   } : {}),
        }
        if (!movedByNewDate[newDate]) movedByNewDate[newDate] = []
        movedByNewDate[newDate].push(session)
      })
      result = result.map(week => ({
        ...week,
        days: week.days.map(day => {
          const incoming = movedByNewDate[day.dateStr] ?? []
          return incoming.length ? { ...day, sessions: [...day.sessions, ...incoming] } : day
        }),
      }))
    }

    return result
  }, [weeks, recoverySessions, manualSessions, sessionTimeOverrides])

  const allSessions = useMemo(() =>
    weeksWithAll.flatMap(w => w.days).flatMap(d => d.sessions.map(s => ({ ...s, dateStr: d.dateStr }))),
    [weeksWithAll]
  )

  // ── Class schedule blocks (shown on calendar for in-person classes) ────────────
  const classBlocksByDate = useMemo(() => {
    const fmt12 = t => {
      if (!t) return ''
      const [h, m] = t.split(':').map(Number)
      return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    }
    const map = {}
    courses.forEach((course, courseIdx) => {
      const cs = course.classSchedule
      if (!cs?.days?.length || !cs.semesterStart || !cs.semesterEnd || cs.isDE) return
      const end = new Date(cs.semesterEnd + 'T12:00:00')
      for (let d = new Date(cs.semesterStart + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
        if (!cs.days.includes(dayName)) continue
        const key = d.toISOString().split('T')[0]
        if (!map[key]) map[key] = []
        map[key].push({
          id: `class-${courseIdx}-${key}`,
          courseId: courseIdx,
          courseName: course.name,
          color: course.color,
          startTime: fmt12(cs.startTime),
          endTime: fmt12(cs.endTime),
          _type: 'class',
        })
      }
    })
    return map
  }, [courses])

  useSessionReminders(allSessions, completedIds, todayStr)

  // ── Conflict detection ────────────────────────────────────────────────────────
  const conflictMap = useMemo(() => {
    const map = new Map() // sessionId → gcal event title
    if (!googleEvents.length) return map
    function parseSessionTime(str) {
      if (!str) return null
      const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (!m) return null
      let h = parseInt(m[1])
      const min = parseInt(m[2])
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
      return h * 60 + min
    }
    allSessions.forEach(session => {
      const startMin = parseSessionTime(session.startTime)
      if (startMin === null) return
      const endMin = startMin + (session.duration ?? 60)
      for (const gcal of googleEvents) {
        if (!gcal.start?.includes('T')) continue
        if (gcal.start.split('T')[0] !== session.dateStr) continue
        const gStart = new Date(gcal.start)
        const gEnd   = gcal.end ? new Date(gcal.end) : new Date(gStart.getTime() + 30 * 60000)
        const gsMin  = gStart.getHours() * 60 + gStart.getMinutes()
        const geMin  = gEnd.getHours()   * 60 + gEnd.getMinutes()
        if (startMin < geMin && endMin > gsMin) {
          map.set(session.id, gcal.title)
          break
        }
      }
    })
    return map
  }, [allSessions, googleEvents])

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
  const handleStartFocus = useCallback(s => {
    if (getActivePlan() === 'free') {
      onShowPaywall?.('blueprint')
      return
    }
    setBlueprintSession(s)
    setActiveBlueprint(null)
  }, [onShowPaywall])
  const handleBlueprintStart = useCallback((blueprint) => {
    setActiveBlueprint(blueprint)
    setFocusSession(blueprintSession)
    setBlueprintSession(null)
  }, [blueprintSession])
  const handleBlueprintExit = useCallback(() => { setBlueprintSession(null); setActiveBlueprint(null) }, [])
  const handleFocusComplete = useCallback((id) => {
    setCompletedIds(prev => new Set([...prev, id]))
    setFocusSession(sess => {
      if (sess) {
        const record = { id: sess.id, dateStr: sess.dateStr, courseId: sess.courseId, courseName: sess.courseName, duration: sess.duration }
        setCompletedSessionLog(prev => {
          const filtered = prev.filter(s => s.id !== record.id)
          return [...filtered, record].slice(-500)
        })
        saveCompletedSession(record)
      }
      return null
    })
    setActiveBlueprint(null)
  }, [])
  const handleFocusStartNext = useCallback((id, _elapsed, nextSess) => {
    setCompletedIds(prev => new Set([...prev, id]))
    setBlueprintSession(nextSess)
    setFocusSession(null)
    setActiveBlueprint(null)
  }, [])
  const handleFocusExit = useCallback(() => { setFocusSession(null); setActiveBlueprint(null) }, [])
  const handleToggle = useCallback(id => {
    setCompletedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) {
        n.delete(id)
        setCompletedSessionLog(prev => prev.filter(s => s.id !== id))
        removeCompletedSession(id)
      } else {
        n.add(id)
        const sess = allSessions.find(s => s.id === id)
        if (sess) {
          const record = { id: sess.id, dateStr: sess.dateStr, courseId: sess.courseId, courseName: sess.courseName, duration: sess.duration }
          setCompletedSessionLog(prev => {
            const filtered = prev.filter(s => s.id !== record.id)
            return [...filtered, record].slice(-500)
          })
          saveCompletedSession(record)
        }
      }
      return n
    })
  }, [allSessions])

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
    setCurrentMonthStr(monthKey)
    if (viewMode === 'week') {
      document.getElementById(`month-${monthKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  const handlePrevWeek = () => {
    const d = new Date(activeDayStr + 'T12:00:00'); d.setDate(d.getDate() - 7)
    setActiveDayStr(d.toISOString().split('T')[0])
  }
  const handleNextWeek = () => {
    const d = new Date(activeDayStr + 'T12:00:00'); d.setDate(d.getDate() + 7)
    setActiveDayStr(d.toISOString().split('T')[0])
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── First-query nudge modal ── */}
      {showFirstQueryNudge && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 20, padding: '36px 32px', maxWidth: 420, width: '100%', textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
            <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>
              You just used your first AI boost.
            </h2>
            <p style={{ color: '#6B6B6B', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Pro gives you <strong style={{ color: '#3B61C4' }}>75 boosts per month</strong> — that's enough for a daily study session all month. Try it free for 7 days.
            </p>
            <button
              onClick={() => {
                localStorage.setItem('first_query_nudge_shown', '1')
                setShowFirstQueryNudge(false)
                onShowPaywall?.('ai')
              }}
              style={{
                width: '100%', padding: '13px', marginBottom: 10,
                background: '#3B61C4',
                border: 'none', borderRadius: 12, color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Start 7-day free trial →
            </button>
            <button
              onClick={() => {
                localStorage.setItem('first_query_nudge_shown', '1')
                setShowFirstQueryNudge(false)
              }}
              style={{ background: 'none', border: 'none', color: '#9B9B9B', fontSize: 13, cursor: 'pointer' }}
            >
              Keep using the free plan
            </button>
          </div>
        </div>
      )}

      {blueprintSession && (
        <BlueprintScreen
          session={blueprintSession}
          course={courses[blueprintSession.courseId] ?? null}
          onStartSession={handleBlueprintStart}
          onExit={handleBlueprintExit}
          onShowPaywall={onShowPaywall}
          learningStyle={learningStyle}
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
          course={courses[focusSession.courseId] ?? null}
          onShowPaywall={onShowPaywall}
          userId={userId}
          learningStyle={learningStyle}
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
          initialFile={syllabusInitialFile}
          onConfirm={(items, selectedCourseIdx) => handleSyllabusConfirm(selectedCourseIdx, items)}
          onClose={() => { setSyllabusModalCourse(null); setSyllabusInitialFile(null) }}
          onShowPaywall={onShowPaywall}
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

      {gcalToast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, pointerEvents: 'none',
          padding: '10px 20px', borderRadius: 12, fontSize: '0.875rem', fontWeight: 600,
          background: gcalToast === 'connected' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${gcalToast === 'connected' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: gcalToast === 'connected' ? '#34d399' : '#f87171',
          backdropFilter: 'blur(8px)',
        }}>
          {gcalToast === 'connected' ? '✓ Google Calendar connected' : '✕ Google Calendar connection failed'}
        </div>
      )}

      <AppShell
        activeSection={activeSection}
        setActiveSection={section => {
          if (section === 'coach' && getActivePlan() === 'free') {
            onShowPaywall?.('coach')
            return
          }
          setActiveSection(section)
        }}
        onImportSyllabus={() => setSyllabusModalCourse(-1)}
        onShare={() => setShowShareCard(true)}
        onEditPlan={onEditPlan}
        onSignOut={onSignOut}
        userEmail={userEmail}
        onNavigateToAccount={() => setActiveSection('account')}
        googleCalendarConnected={gcalConnected}
        onConnectGoogleCalendar={handleConnectGoogleCalendar}
        courses={courses}
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
            onNavigateToCalendar={(dateStr) => {
              if (dateStr) { setActiveDayStr(dateStr); setViewMode('day') }
              setActiveSection('calendar')
            }}
            onNavigateToProgress={() => setActiveSection('progress')}
            onNavigateToGrades={(idx) => { setGradesCourseIdx(idx); setActiveSection('grades') }}
            onNavigateToTutor={() => setActiveSection('tutor')}
            onNavigateToTools={() => setActiveSection('tools')}
            onShowPaywall={onShowPaywall}
            coachPlans={coachPlans}
            onOpenStudyCoach={handleOpenStudyCoach}
            schoolType={schoolType}
          />
        )}

        {/* ── Calendar ── */}
        {activeSection === 'calendar' && (
          <div className="px-4 py-6 max-w-7xl mx-auto">
            {/* View controls */}
            <div className="flex items-center justify-between mb-6">
              {/* Month navigation — only shown in month view; day/week views have their own nav */}
              {viewMode === 'month' ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const idx = availableMonths.indexOf(currentMonthStr)
                      if (idx > 0) handleJumpToMonth(availableMonths[idx - 1])
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                    style={{ color: '#9B9B9B' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-base font-semibold min-w-[140px] text-center" style={{ color: '#1A1A1A' }}>
                    {(() => {
                      const [y, m] = currentMonthStr.split('-').map(Number)
                      return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    })()}
                  </span>
                  <button
                    onClick={() => {
                      const idx = availableMonths.indexOf(currentMonthStr)
                      if (idx < availableMonths.length - 1) handleJumpToMonth(availableMonths[idx + 1])
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                    style={{ color: '#9B9B9B' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div /> /* spacer so toggle stays right-aligned */
              )}

              {/* Fix Conflicts button */}
              {conflictMap.size > 0 && (
                <button
                  onClick={handleFixConflicts}
                  disabled={fixConflictsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 border border-amber-500/40 bg-amber-900/20 hover:bg-amber-900/40 transition-colors disabled:opacity-60"
                >
                  {fixConflictsLoading ? (
                    <div className="w-3 h-3 rounded-full border border-amber-400 border-t-transparent animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  Fix {conflictMap.size} conflict{conflictMap.size !== 1 ? 's' : ''}
                </button>
              )}

            {/* View toggle */}
              <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.10)', backgroundColor: '#F1F3F5' }}>
                {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([mode, label]) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    style={{
                      padding: '6px 16px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      backgroundColor: viewMode === mode ? '#3B61C4' : 'transparent',
                      color: viewMode === mode ? '#FFFFFF' : '#6B6B6B',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reschedule results panel */}
            {rescheduleResults !== null && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-900/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-amber-300">Suggested rescheduled times</h4>
                  <button onClick={() => setRescheduleResults(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {rescheduleResults.length === 0 ? (
                  <p className="text-xs text-slate-500">No suggestions available.</p>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      {rescheduleResults.map((r, i) => {
                        const session = allSessions.find(s => s.id === r.sessionId)
                        const applied = sessionTimeOverrides[r.sessionId]?.startTime === r.suggestedStart
                        return (
                          <div key={i} className="flex items-start justify-between gap-3 text-xs">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5" />
                              <div className="min-w-0">
                                <span className="text-slate-300 font-medium">{session?.courseName ?? r.sessionId}</span>
                                <span className="text-slate-500 mx-1">·</span>
                                <span className="text-amber-300">{r.date} {r.suggestedStart}–{r.suggestedEnd}</span>
                                <p className="text-slate-500 mt-0.5 truncate">{r.reason}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleApplySuggestion(r)}
                              disabled={applied}
                              className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
                                applied
                                  ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 cursor-default'
                                  : 'bg-amber-900/40 text-amber-300 border border-amber-600/50 hover:bg-amber-900/70'
                              }`}
                            >
                              {applied ? '✓ Applied' : 'Apply'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <button
                      onClick={handleApplyAll}
                      className="w-full py-2 rounded-lg text-xs font-medium text-white bg-amber-600/80 hover:bg-amber-600 transition-colors"
                    >
                      Apply all suggestions
                    </button>
                  </>
                )}
              </div>
            )}

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
                googleEvents={googleEvents}
                userId={userId}
                gcalConnected={gcalConnected}
                conflictMap={conflictMap}
                onSessionMove={handleSessionMove}
                onAddSession={setAddSessionDayStr}
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
                onAddSession={setAddSessionDayStr}
                googleEvents={googleEvents}
                conflictMap={conflictMap}
              />
            )}

            {/* Week view */}
            {viewMode === 'week' && (
              <CalendarWeekView
                activeDayStr={activeDayStr}
                allDaysMap={allDaysMap}
                syllabusEventsByDate={syllabusEventsByDate}
                classBlocksByDate={classBlocksByDate}
                completedIds={completedIds}
                onToggle={handleToggle}
                onAddSession={setAddSessionDayStr}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
                googleEvents={googleEvents}
                conflictMap={conflictMap}
                onSessionMove={handleSessionMove}
              />
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
            onImportSyllabus={(idx, file) => { setSyllabusInitialFile(file ?? null); setSyllabusModalCourse(idx ?? -1) }}
            onAddCourse={onAddCourse}
            onEditCourse={onEditCourse}
            onDeleteCourse={onDeleteCourse}
            onShowPaywall={onShowPaywall}
            onOpenStudyCoach={handleOpenStudyCoach}
            onNavigateToGradeHub={() => setActiveSection('grades')}
            schoolType={schoolType}
          />
        )}

        {/* ── Progress ── */}
        {activeSection === 'progress' && (
          <ProgressView
            courses={courses}
            allSessions={allSessions}
            completedIds={completedIds}
            completedSessionLog={completedSessionLog}
            todayStr={todayStr}
          />
        )}

        {/* ── Study Tools ── */}
        {activeSection === 'tools' && (
          <StudyToolsView
            courses={courses}
            userId={userId}
            onShowPaywall={onShowPaywall}
            learningStyle={learningStyle}
            onNavigateToCoach={() => { if (getActivePlan() === 'free') { onShowPaywall?.('coach'); return } setActiveSection('coach') }}
          />
        )}

        {/* ── Study Coach ── */}
        {activeSection === 'coach' && (
          <StudyCoachView
            courses={courses}
            userId={userId}
            onShowPaywall={onShowPaywall}
            googleEvents={googleEvents}
            preferredTime={schedule.preferredTime}
            learningStyle={learningStyle}
            onStartFocus={handleStartFocus}
            onNavigateToCourses={() => setActiveSection('courses')}
            onPushToSchedule={incoming => {
              setManualSessions(prev => {
                const courseId = incoming[0]?.courseId
                const filtered = prev.filter(s => !s.fromCoachPlan || s.courseId !== courseId)
                return [...filtered, ...incoming]
              })
            }}
          />
        )}

        {/* ── Grade Hub / Score Tracker ── */}
        {activeSection === 'grades' && (
          isExamMode ? (
            <div style={{ padding: '48px 32px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e8e8f0', marginBottom: 8 }}>Score Tracker</h2>
              <p style={{ fontSize: 14, color: '#8888a0', lineHeight: 1.6, marginBottom: 24 }}>
                Log your practice test scores over time to track your progress toward your target score. Coming soon — score logging, FL score trends, and section-by-section breakdown.
              </p>
              <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#818cf8', fontWeight: 600, marginBottom: 6 }}>Your target scores</p>
                {courses.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8888a0', padding: '4px 0', borderBottom: i < courses.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <span>{c.name}</span>
                    <span style={{ color: '#e8e8f0', fontWeight: 600 }}>{c.targetScore || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <GradeHubView
            courses={courses}
            onEditCourse={onEditCourse}
            userId={userId}
            onShowPaywall={onShowPaywall}
            initialCourseIdx={gradesCourseIdx}
            onSyncToCalendar={incoming => {
              setManualSessions(prev => {
                // Remove any previously synced coach-plan sessions for these course/week combos
                // so re-syncing doesn't stack duplicates
                const filtered = prev.filter(s => !s.fromCoachPlan || s.courseId !== incoming[0]?.courseId)
                return [...filtered, ...incoming]
              })
            }}
          />
          )
        )}

        {/* ── AI Tutor ── */}
        {activeSection === 'tutor' && (
          <TutorView
            courses={courses}
            userId={userId}
            onShowPaywall={onShowPaywall}
          />
        )}

        {/* ── Account ── */}
        {activeSection === 'account' && (
          <AccountView
            userEmail={userEmail}
            onSignOut={onSignOut}
            onImportSyllabus={() => setSyllabusModalCourse(-1)}
            onEditPlan={onEditPlan}
            googleCalendarConnected={gcalConnected}
            onConnectGoogleCalendar={handleConnectGoogleCalendar}
            onShowPaywall={onShowPaywall}
          />
        )}

        {/* Print header */}
        <div className="hidden print:block p-8 border-b border-gray-200">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">StudyEdge AI · Personalized Study Plan</h1>
          <p className="text-gray-500">{stats.totalCourses} courses · {stats.totalHours}h planned</p>
        </div>

      </AppShell>
    </>
  )
}
