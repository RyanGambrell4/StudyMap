import { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import Spinner from './ui/spinner'
import { track } from '../lib/analytics'
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
  getCachedAllNotes,
  saveCoachPlanHardNote,
  getCachedStudyTools,
} from '../lib/db'
import { runAdaptation } from '../utils/adaptationEngine'
import AdaptModal from './AdaptModal'
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
import { useStreak } from '../utils/useStreak'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFocusMinutes, hasUsedTrial, canUseFeature } from '../lib/subscription'
const CoursesView    = lazy(() => import('./CoursesView'))
const ProgressView   = lazy(() => import('./ProgressView'))
const StudyToolsView = lazy(() => import('./StudyToolsView'))
const StudyCoachView = lazy(() => import('./StudyCoachView'))
const PracticeExamView = lazy(() => import('./PracticeExamView'))
import AIChatView from './AIChatView'
const GradeHubView   = lazy(() => import('./GradeHubView'))
const AccountView    = lazy(() => import('./AccountView'))
const DiagramsView        = lazy(() => import('./DiagramsView'))
const ProblemSolverView   = lazy(() => import('./ProblemSolverView'))
const EssayArchitectView  = lazy(() => import('./EssayArchitectView'))
import CheatSheetModal from './CheatSheetModal'
import BrainDumpModal from './BrainDumpModal'
import ExamRescueModal from './ExamRescueModal'
import QuickQuizBurst from './QuickQuizBurst'
import PodcastGenerator from './PodcastGenerator'
import TeachItBackModal from './TeachItBackModal'
import ConnectionsModeModal from './ConnectionsModeModal'
import TimedChallengeModal from './TimedChallengeModal'
import SessionRatingModal from './SessionRatingModal'

// ─── TutorView ────────────────────────────────────────────────────────────────
function TutorView({ courses, userId, onShowPaywall, learningStyle, onNavigateToCoach, initialMessage, paywallTrigger = 'ai' }) {
  const [selectedCourse, setSelectedCourse] = useState(courses.length > 0 ? 0 : -1)
  const course = courses[selectedCourse] ?? null

  return (
    <div className="flex flex-col h-full min-h-0 max-w-3xl mx-auto w-full px-4 py-6">
      {/* Header + course selector */}
      <div className="mb-4 shrink-0">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111111', marginBottom: 4 }}>AI Tutor</h1>
        <p style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 16, lineHeight: 1.5 }}>Ask questions, get explanations, and flag difficult topics that feed back into your study plan.</p>
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
                    : { backgroundColor: 'transparent', color: '#6B6B6B', borderColor: 'rgba(0,0,0,0.12)' }
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
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" fill="none" stroke="#3B61C4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '0 0 4px' }}>No courses yet</p>
              <p style={{ fontSize: 13, color: '#9B9B9B', margin: 0, maxWidth: 220, lineHeight: 1.5 }}>Add a course to unlock your AI tutor and get personalized help for every topic.</p>
            </div>
            {onNavigateToCoach && (
              <button
                onClick={onNavigateToCoach}
                style={{ padding: '10px 22px', background: '#3B61C4', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Add your first course →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chat */}
      {course && (
        <div style={{ flex: 1, minHeight: 0, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#111111' }}>
              AI Tutor · <span style={{ color: course.color?.dot ?? '#3B61C4' }}>{clean(course.name)}</span>
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
            onNavigateToCoach={onNavigateToCoach}
            initialMessage={initialMessage}
            paywallTrigger={paywallTrigger}
          />
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TARGET_THRESHOLDS = { A: 80, B: 70, C: 60, 'Pass/Fail': 50 }

function minsToAmPm(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function amPmToMins(str) {
  if (!str) return null
  const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
  return h * 60 + min
}

const PREF_START_MIN = { Morning: 8 * 60, Afternoon: 13 * 60, Evening: 18 * 60 }

function amPmToISO(dateStr, timeStr) {
  const mins = amPmToMins(timeStr)
  if (mins === null) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function buildRecoverySessions(courses, recoveryIdxSet, sessionMinutes, preferredTime = 'Evening') {
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
        startTime: minsToAmPm(PREF_START_MIN[preferredTime] ?? 18 * 60),
        endTime: minsToAmPm((PREF_START_MIN[preferredTime] ?? 18 * 60) + sessionMinutes),
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
        <div className="text-slate-500 text-[9px] font-medium mb-0.5">{session.startTime}</div>
      )}
      <div className={`font-semibold truncate ${completed ? 'line-through' : ''}`} style={{ color: session.color.dot }}>{session.courseName}</div>
      <div className="text-slate-500 text-[10px]">{session.isRecovery ? '↑ Recovery' : session.sessionType}</div>
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
    <div className={`min-h-[110px] px-1.5 pb-2 group ${!isLast ? 'border-r border-slate-200' : ''} ${day.isPast ? 'opacity-60' : ''}`}>
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
  const { weeks, stats, sessionMinutes, examConflicts = [] } = result

  // ── state ──
  const [completedIds, setCompletedIds] = useState(() => initialCompletedIds ?? new Set())
  const [completedSessionLog, setCompletedSessionLog] = useState(() => getCachedCompletedSessions())
  const [focusSession, setFocusSession] = useState(null)
  const [blueprintSession, setBlueprintSession] = useState(null) // session waiting for blueprint
  const [activeBlueprint, setActiveBlueprint] = useState(null)  // chosen blueprint (or null = skip)
  const [activeSection, setActiveSection] = useState('dashboard')
  // ── Adaptive plan state ──────────────────────────────────────────────────────
  const [pendingAdaptation, setPendingAdaptation] = useState(null) // { injectedSession, reason, dayName }
  const [pendingPaywallAdaptation, setPendingPaywallAdaptation] = useState(null) // free user teaser
  const [showAdaptModal, setShowAdaptModal] = useState(false)
  const [showPaywallAdaptModal, setShowPaywallAdaptModal] = useState(false)
  const [showFirstQueryNudge, setShowFirstQueryNudge] = useState(false)
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [showBrainDump, setShowBrainDump] = useState(false)
  const [showExamRescue, setShowExamRescue] = useState(false)
  const [showQuizBurst, setShowQuizBurst] = useState(false)
  const [showPodcast, setShowPodcast] = useState(false)
  const [showTeachItBack, setShowTeachItBack] = useState(false)
  const [showConnectionsMode, setShowConnectionsMode] = useState(false)
  const [showTimedChallenge, setShowTimedChallenge] = useState(false)
  const [pendingDrillTopic, setPendingDrillTopic] = useState(null)
  const [ratingSession, setRatingSession] = useState(null) // session to rate after completion

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

  // ── Drill-topics event from PracticeExamResults ───────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      setPendingDrillTopic(e.detail?.topic ?? null)
      setActiveSection('tools')
    }
    window.addEventListener('studyedge:drill-topics', handler)
    return () => window.removeEventListener('studyedge:drill-topics', handler)
  }, [])
  // ─────────────────────────────────────────────────────────────────────────────

  // ── SPA section-change tracking ──────────────────────────────────────────────
  const prevSection = useRef(null)
  useEffect(() => {
    if (prevSection.current !== null) {
      track('view_changed', { view: activeSection, previous_view: prevSection.current })
    }
    prevSection.current = activeSection
  }, [activeSection])

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
  const [tutorPrefill, setTutorPrefill] = useState(null)

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
    setCoachCourseIdx(idx ?? 0)
    setActiveSection('coach')
  }, [])

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
  const [restDays, setRestDays] = useState(() => {
    try { return JSON.parse(localStorage.getItem('studyedge_rest_days') ?? '[]') } catch { return [] }
  })

  // ── Google Calendar & Notion Calendar ────────────────────────────────────────
  const [googleEvents, setGoogleEvents] = useState([])
  const [gcalConnected, setGcalConnected] = useState(false)
  const [notionConnected, setNotionConnected] = useState(false)
  const [gcalToast, setGcalToast] = useState(null) // 'connected' | 'error' | null
  const manualSessionsRef = useRef(manualSessions)
  useEffect(() => { manualSessionsRef.current = manualSessions }, [manualSessions])
  const [scheduleToast, setScheduleToast] = useState(null) // string | null
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

  const refreshGoogleEvents = useCallback(() => {
    if (!userId) return
    getAccessToken().then(token =>
      fetch('/api/google-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      })
        .then(r => r.json())
        .then(data => {
          setGcalConnected(!!data.connected)
          setNotionConnected(!!data.notionConnected)
          if (data.events) setGoogleEvents(data.events)
        })
        .catch(() => {})
    )
  }, [userId])

  useEffect(() => {
    refreshGoogleEvents()
    const interval = setInterval(refreshGoogleEvents, 5 * 60 * 1000)
    const onVisible = () => { if (!document.hidden) refreshGoogleEvents() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshGoogleEvents])

  const handleConnectGoogleCalendar = () => {
    window.location.href = `/api/google-auth?userId=${encodeURIComponent(userId)}`
  }

  const handleDeleteSession = useCallback((sessionId) => {
    const session = manualSessionsRef.current.find(s => s.id === sessionId)
    setManualSessions(prev => prev.filter(s => s.id !== sessionId))
    setSessionTimeOverrides(prev => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
    if (session?.googleEventId) {
      getAccessToken().then(token =>
        fetch('/api/google-calendar?action=delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userId, googleEventId: session.googleEventId }),
        }).catch(() => {})
      )
    }
  }, [userId])

  const handleToggleRestDay = useCallback((dateStr) => {
    setRestDays(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    )
  }, [])

  const handleBulkRescheduleWeek = useCallback((mondayStr, sessionIds) => {
    // Push every session in the week forward 7 days
    setSessionTimeOverrides(prev => {
      const next = { ...prev }
      sessionIds.forEach(id => {
        const existing = next[id]
        if (existing) {
          const d = new Date(existing.dateStr + 'T12:00:00')
          d.setDate(d.getDate() + 7)
          next[id] = { ...existing, dateStr: d.toISOString().split('T')[0] }
        }
      })
      return next
    })
    setManualSessions(prev => prev.map(s => {
      if (!sessionIds.includes(s.id)) return s
      const d = new Date(s.dateStr + 'T12:00:00')
      d.setDate(d.getDate() + 7)
      return { ...s, dateStr: d.toISOString().split('T')[0] }
    }))
  }, [])

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
  useEffect(() => { localStorage.setItem('studyedge_rest_days', JSON.stringify(restDays)) }, [restDays])

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
    () => buildRecoverySessions(courses, recoveryCoursesIdx, sessionMinutes ?? 60, schedule?.preferredTime),
    [courses, recoveryCoursesIdx, sessionMinutes, schedule]
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
  const { currentStreak } = useStreak()

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
    // Inject SM-2 flashcard review events onto their due dates
    const studyTools = getCachedStudyTools()
    const cards = studyTools?.flashcards ?? []
    if (cards.length) {
      const cardsByDate = {}
      cards.forEach(card => {
        const dateStr = card.nextReview ? card.nextReview.split('T')[0] : todayStr
        if (!cardsByDate[dateStr]) cardsByDate[dateStr] = 0
        cardsByDate[dateStr]++
      })
      Object.entries(cardsByDate).forEach(([dateStr, count]) => {
        if (!map[dateStr]) map[dateStr] = []
        const isDue = dateStr <= todayStr
        map[dateStr].push({
          id: `flashcard-review-${dateStr}`,
          date: dateStr,
          name: `${count} flashcard${count > 1 ? 's' : ''} ${isDue ? 'due' : 'scheduled'}`,
          type: 'Spaced Review',
          color: { dot: '#A78BFA' },
        })
      })
    }
    return map
  }, [syllabusEvents, todayStr])

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
      if (!canUseFocusMinutes(1)) {
        onShowPaywall?.('focus')
        return
      }
      // Check blueprint limit before opening blueprint screen (1 total on free plan)
      if (!canUseFeature('blueprint').allowed) {
        onShowPaywall?.('blueprint')
        return
      }
      // Allow free users to start — FocusMode enforces the 30-min daily cap internally
    }
    track('session_started', { courseId: s.courseId, courseName: s.courseName, sessionType: s.sessionType, studyMethod: s.studyMethod ?? null, duration: s.duration })
    // Fire first_session_started exactly once per user. Anchors the
    // "signup -> first action" funnel without double-counting on every
    // start. Keyed on userId so a different account on the same device
    // still gets a fresh fire.
    try {
      const key = `studyedge_first_session_started_${userId ?? 'anon'}`
      if (typeof window !== 'undefined' && !window.localStorage.getItem(key)) {
        track('first_session_started', {
          courseId: s.courseId,
          courseName: s.courseName,
          sessionType: s.sessionType,
          duration: s.duration,
        })
        window.localStorage.setItem(key, '1')
      }
    } catch {}
    setBlueprintSession(s)
    setActiveBlueprint(null)
  }, [onShowPaywall, userId])
  const handleBlueprintStart = useCallback((blueprint) => {
    setActiveBlueprint(blueprint)
    setFocusSession(blueprintSession)
    setBlueprintSession(null)
  }, [blueprintSession])
  const handleBlueprintExit = useCallback(() => { setBlueprintSession(null); setActiveBlueprint(null) }, [])
  const handleFocusComplete = useCallback((id, elapsed, recallData) => {
    setCompletedIds(prev => new Set([...prev, id]))
    setFocusSession(sess => {
      if (sess) {
        const record = {
          id: sess.id,
          dateStr: sess.dateStr,
          courseId: sess.courseId,
          courseName: sess.courseName,
          sessionType: sess.sessionType ?? null,
          duration: sess.duration,
          elapsedSeconds: (typeof elapsed === 'number' && elapsed > 0) ? elapsed : null,
          recallScore: recallData?.score ?? null,
        }
        setCompletedSessionLog(prev => {
          const filtered = prev.filter(s => s.id !== record.id)
          return [...filtered, record].slice(-500)
        })
        saveCompletedSession(record)
        track('session_completed', { courseId: sess.courseId, courseName: sess.courseName, sessionType: sess.sessionType, studyMethod: sess.studyMethod ?? null, elapsedSeconds: record.elapsedSeconds, recallScore: recallData?.score ?? null })

        // First-session email -- fires once per user after their very first session.
        const priorSessions = getCachedCompletedSessions().filter(s => s.id !== record.id)
        if (userId && priorSessions.length === 0) {
          fetch('/api/first-session-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, courseName: sess.courseName }),
          }).catch(() => {})
        }

        // Run adaptation engine if recall data was provided
        if (recallData?.score !== undefined) {
          const todayStr = new Date().toISOString().split('T')[0]
          const result = runAdaptation(sess, recallData.score, courses, getCachedManualSessions(), todayStr, schedule?.preferredTime)
          if (result) {
            if (getActivePlan() !== 'free') {
              // Paid: inject the session and show the adapt modal
              setManualSessions(prev => [...prev, result.injectedSession])
              setPendingAdaptation(result)
              setShowAdaptModal(true)
            } else {
              // Free: show the paywall teaser with what would have changed
              setPendingPaywallAdaptation(result)
              setShowPaywallAdaptModal(true)
            }
          }
        }
      }
      return null
    })
    setActiveBlueprint(null)
  }, [courses])
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
          // Show session rating modal after a short delay
          setTimeout(() => setRatingSession(sess), 300)
        }
      }
      return n
    })
  }, [allSessions])

  const handleRatingSave = useCallback(async (rating, hardNotes) => {
    if (!ratingSession) return
    const sess = ratingSession
    setRatingSession(null)
    // Update completed session record with rating + hard_notes
    const record = {
      id: sess.id,
      dateStr: sess.dateStr,
      courseId: sess.courseId,
      courseName: sess.courseName,
      duration: sess.duration,
      rating,
      hard_notes: hardNotes || null,
    }
    saveCompletedSession(record)
    // Store hard note as pending feedback for the coach plan
    if (hardNotes) {
      try {
        await saveCoachPlanHardNote(sess.courseId, hardNotes, sess.sessionType || 'session')
      } catch (_) {}
    }
  }, [ratingSession])

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

  const handleAddManualSession = rawSession => {
    let s = { ...rawSession }

    // Assign a default start time if none provided
    const prefStart = PREF_START_MIN[schedule?.preferredTime] ?? 18 * 60
    if (!s.startTime) {
      s.startTime = minsToAmPm(prefStart)
      s.endTime = minsToAmPm(prefStart + s.duration)
    }

    // Overlap detection: find all timed sessions on this date
    const existingTimed = allSessions
      .filter(ex => ex.dateStr === s.dateStr && ex.startTime)
      .map(ex => ({
        startMin: amPmToMins(ex.startTime) ?? 0,
        endMin: amPmToMins(ex.endTime) ?? (amPmToMins(ex.startTime) ?? 0) + (ex.duration ?? 60),
      }))
      .sort((a, b) => a.startMin - b.startMin)

    let curStart = amPmToMins(s.startTime) ?? prefStart
    let shifted = false
    for (const ex of existingTimed) {
      if (curStart < ex.endMin && curStart + s.duration > ex.startMin) {
        curStart = ex.endMin + 15
        shifted = true
      }
    }

    if (shifted) {
      s.startTime = minsToAmPm(curStart)
      s.endTime = minsToAmPm(curStart + s.duration)
      setScheduleToast(`Session moved to ${s.startTime} to avoid overlap`)
      setTimeout(() => setScheduleToast(null), 5000)
    }

    track('session_added', { courseId: s.courseId, courseName: s.courseName, sessionType: s.sessionType })
    setManualSessions(prev => [...prev, s])
    setAddSessionDayStr(null)

    // Push to Google Calendar if connected
    if (gcalConnected) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const sessionId = s.id
      const startISO = s.startTime ? amPmToISO(s.dateStr, s.startTime) : null
      const endISO = s.endTime ? amPmToISO(s.dateStr, s.endTime) : null
      const gcalTitle = s.isEvent ? s.courseName : `${s.courseName} – ${s.sessionType}`
      getAccessToken().then(token =>
        fetch('/api/google-calendar?action=add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            userId,
            title: gcalTitle,
            description: s.isEvent ? undefined : 'StudyEdge AI study session',
            startDateTime: startISO,
            endDateTime: endISO,
            date: startISO ? undefined : s.dateStr,
            timeZone: tz,
          }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.eventId) {
              setManualSessions(prev => prev.map(ms =>
                ms.id === sessionId ? { ...ms, googleEventId: data.eventId } : ms
              ))
            }
          })
          .catch(() => {})
      )
    }
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
            <div style={{ width:56, height:56, borderRadius:14, background:'rgba(59,97,196,0.08)', border:'1px solid rgba(59,97,196,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="24" height="24" fill="none" stroke="#3B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
            </div>
            <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>
              Your AI tutor is working.
            </h2>
            <p style={{ color: '#6B6B6B', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              You've used 1 of your 5 free AI questions. Pro gives you <strong style={{ color: '#3B61C4' }}>100 per month</strong> - enough to cover every course, all semester. {hasUsedTrial() ? '$2.99/wk.' : '3-day free trial, then $2.99/wk.'}
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
              {hasUsedTrial() ? 'Upgrade to Pro →' : 'Start 3-day free trial →'}
            </button>
            <button
              onClick={() => {
                localStorage.setItem('first_query_nudge_shown', '1')
                setShowFirstQueryNudge(false)
              }}
              style={{ background: 'none', border: 'none', color: '#9B9B9B', fontSize: 13, cursor: 'pointer' }}
            >
              Continue - I still have 4 free questions left
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
          completedSessions={completedSessionLog}
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
          onOpenBrainDump={() => { track('feature_opened', { feature: 'brain_dump', source: 'focus_complete' }); setShowBrainDump(true) }}
          course={courses[focusSession.courseId] ?? null}
          onShowPaywall={onShowPaywall}
          userId={userId}
          learningStyle={learningStyle}
          currentStreak={currentStreak}
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

      {/* ── Session rating modal ── */}
      {ratingSession && (
        <SessionRatingModal
          session={ratingSession}
          onSave={handleRatingSave}
          onSkip={() => setRatingSession(null)}
          onShowPaywall={onShowPaywall}
        />
      )}

      {/* ── Adapt modal (paid users) ── */}
      {showAdaptModal && pendingAdaptation && (
        <AdaptModal
          adaptation={pendingAdaptation}
          onAccept={() => { setShowAdaptModal(false) }}
          onEdit={(sess) => {
            setShowAdaptModal(false)
            setAddSessionDayStr(sess.dateStr)
          }}
          onDismiss={() => {
            setManualSessions(prev => prev.filter(s => s.id !== pendingAdaptation.injectedSession.id))
            setPendingAdaptation(null)
            setShowAdaptModal(false)
          }}
        />
      )}

      {/* ── Paywall adaptation teaser (free users) ── */}
      {showPaywallAdaptModal && pendingPaywallAdaptation && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 22, width: '100%', maxWidth: 380,
            boxShadow: '0 24px 64px rgba(0,0,0,0.14)', overflow: 'hidden',
          }}>
            <div style={{ height: 4, background: 'linear-gradient(90deg, #3B61C4, #6B8AE8)' }} />
            <div style={{ padding: '28px 24px 24px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(59,97,196,0.10)', border: '1px solid rgba(59,97,196,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <svg width="22" height="22" fill="none" stroke="#3B61C4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
                </svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#111111', letterSpacing: -0.3 }}>
                Your plan would have updated
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B6B6B', lineHeight: 1.55 }}>
                {pendingPaywallAdaptation.reason} Upgrade to let your plan actually adapt.
              </p>
              <div style={{
                borderRadius: 12, border: '1px solid rgba(59,97,196,0.20)',
                background: 'rgba(59,97,196,0.04)', padding: '12px 16px',
                marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 3, height: 36, borderRadius: 2, background: '#3B61C4', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#3B61C4', marginBottom: 2 }}>Would have added</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111111' }}>
                    {pendingPaywallAdaptation.injectedSession.courseName} &middot; Review &middot; {pendingPaywallAdaptation.dayName}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setShowPaywallAdaptModal(false); onShowPaywall?.('adapt') }}
                style={{
                  width: '100%', padding: '12px 0',
                  background: '#3B61C4', color: '#fff',
                  border: 'none', borderRadius: 11,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  marginBottom: 10, fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(59,97,196,0.35)',
                }}
              >
                {hasUsedTrial() ? 'Upgrade to Pro - $2.99/wk' : 'Start free trial - 3 days free'}
              </button>
              <button
                onClick={() => { setShowPaywallAdaptModal(false); setPendingPaywallAdaptation(null) }}
                style={{
                  width: '100%', padding: '10px 0',
                  background: 'transparent', border: 'none',
                  fontSize: 13, fontWeight: 600, color: '#9B9B9B',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {gcalToast === 'connected'
                ? <polyline points="20 6 9 17 4 12" />
                : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
            </svg>
            {gcalToast === 'connected' ? 'Google Calendar connected' : 'Google Calendar connection failed'}
          </span>
        </div>
      )}

      {scheduleToast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, pointerEvents: 'none',
          padding: '10px 20px', borderRadius: 12, fontSize: '0.875rem', fontWeight: 600,
          background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
          color: '#D97706', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
            <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
          </svg>
          {scheduleToast}
        </div>
      )}

      <AppShell
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onImportSyllabus={() => setSyllabusModalCourse(-1)}
        onShare={() => setShowShareCard(true)}
        onEditPlan={onEditPlan}
        onSignOut={onSignOut}
        userEmail={userEmail}
        onNavigateToAccount={() => setActiveSection('account')}
        googleCalendarConnected={gcalConnected}
        onConnectGoogleCalendar={handleConnectGoogleCalendar}
        courses={courses}
        onOpenBrainDump={() => { track('feature_opened', { feature: 'brain_dump' }); setShowBrainDump(true) }}
        onOpenQuizBurst={() => { track('feature_opened', { feature: 'quiz_burst' }); setShowQuizBurst(true) }}
        onOpenExamRescue={() => { track('feature_opened', { feature: 'exam_rescue' }); setShowExamRescue(true) }}
        onNavigateToTools={() => setActiveSection('tools')}
        onOpenPaywall={onShowPaywall}
      >

        {/* Recovery alerts */}
        {recoveryAlerts.length > 0 && (
          <div className="px-6 pt-6 space-y-2 max-w-4xl mx-auto">
            {recoveryAlerts.map((name, i) => (
              <div key={i} className="flex items-start gap-3 bg-amber-950/40 border border-amber-800/40 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
                </svg>
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
            onNavigateToTutor={(msg) => { if (msg) setTutorPrefill(msg); setActiveSection('tutor') }}
            onNavigateToTools={() => setActiveSection('tools')}
            onDrillTopic={(topic) => { setPendingDrillTopic(topic); setActiveSection('tools') }}
            onShowPaywall={onShowPaywall}
            userEmail={userEmail}
            userId={userId}
            weeklyHourGoal={schedule?.hoursPerWeek ?? 10}
            recoveryCoursesIdx={recoveryCoursesIdx}
            examConflicts={examConflicts}
            coachPlans={coachPlans}
            onOpenStudyCoach={handleOpenStudyCoach}
            schoolType={schoolType}
            pendingAdaptation={pendingAdaptation}
            onShowAdaptModal={() => setShowAdaptModal(true)}
            onOpenCheatSheet={() => { track('feature_opened', { feature: 'cheat_sheet' }); setShowCheatSheet(true) }}
            onOpenBrainDump={() => { track('feature_opened', { feature: 'brain_dump' }); setShowBrainDump(true) }}
            onOpenExamRescue={() => { track('feature_opened', { feature: 'exam_rescue' }); setShowExamRescue(true) }}
            onOpenQuizBurst={() => { track('feature_opened', { feature: 'quiz_burst' }); setShowQuizBurst(true) }}
            onOpenPodcast={() => { track('feature_opened', { feature: 'podcast' }); setShowPodcast(true) }}
            completedSessions={completedSessionLog}
          />
        )}

        {/* ── Calendar ── */}
        {activeSection === 'calendar' && (
          <div className="px-4 py-6 max-w-7xl mx-auto">
            {/* Recovery banner */}
            {recoveryCoursesIdx.size > 0 && (
              <div style={{
                marginBottom: 16, padding: '12px 16px', borderRadius: 12,
                background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="15" height="15" fill="none" stroke="#DC2626" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                    <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
                  </svg>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>Grade Recovery Mode: </span>
                    <span style={{ fontSize: 13, color: '#6B6B6B' }}>
                      Extra weekly sessions added for {[...recoveryCoursesIdx].map(i => courses[i]?.name).filter(Boolean).join(', ')} to help close the gap.
                    </span>
                  </div>
                </div>
                <button onClick={() => setActiveSection('grades')} style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  View grades →
                </button>
              </div>
            )}
            {/* Exam conflict banner */}
            {examConflicts.length > 0 && (
              <div style={{
                marginBottom: 16, padding: '12px 16px', borderRadius: 12,
                background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:700, color:'#D97706' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
                  </svg>
                  Exam Cluster Detected
                </div>
                {examConflicts.map((c, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: '#6B6B6B' }}>
                    <strong style={{ color: '#1A1A1A' }}>{c.courseA}</strong> and <strong style={{ color: '#1A1A1A' }}>{c.courseB}</strong> exams are only <strong>{c.gapDays} day{c.gapDays !== 1 ? 's' : ''}</strong> apart. Front-load {c.courseA} prep now to avoid a crunch.
                  </div>
                ))}
              </div>
            )}

            {/* View controls */}
            <div className="flex items-center justify-between mb-6">
              {/* Month navigation - only shown in month view; day/week views have their own nav */}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-60"
                >
                  {fixConflictsLoading ? (
                    <Spinner size="xs" color="#D97706" track="rgba(217,119,6,0.2)" style={{ width: 12, height: 12 }} />
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
                              {applied ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Applied</span>) : 'Apply'}
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
                onDeleteSession={handleDeleteSession}
                sessionNotes={getCachedAllNotes()}
                examDates={courses.filter(c => c.examDate).map(c => ({ dateStr: c.examDate, courseName: c.name, color: c.color }))}
                restDays={restDays}
                onToggleRestDay={handleToggleRestDay}
                onBulkRescheduleWeek={handleBulkRescheduleWeek}
                plan={getActivePlan()}
                onShowPaywall={onShowPaywall}
              />
            )}
          </div>
        )}

        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spinner size="md" />
          </div>
        }>

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
            onShowPaywall={onShowPaywall}
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
            onOpenCheatSheet={() => setShowCheatSheet(true)}
            onOpenBrainDump={() => setShowBrainDump(true)}
            onOpenExamRescue={() => setShowExamRescue(true)}
            onOpenQuizBurst={() => setShowQuizBurst(true)}
            onOpenPodcast={() => setShowPodcast(true)}
            onOpenTeachItBack={() => setShowTeachItBack(true)}
            onOpenConnectionsMode={() => setShowConnectionsMode(true)}
            onOpenTimeAttack={() => setShowTimedChallenge(true)}
            initialDrillTopic={pendingDrillTopic}
            onDrillTopicConsumed={() => setPendingDrillTopic(null)}
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
            completedSessions={completedSessionLog}
            scheduledSessions={manualSessions}
            restDays={restDays}
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
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111111', marginBottom: 8 }}>Score Tracker</h2>
              <p style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.6, marginBottom: 24 }}>
                Log your practice test scores over time to track your progress toward your target. Coming soon: score logging, full-length trends, and section-by-section breakdown.
              </p>
              <div style={{ padding: '16px 20px', borderRadius: 12, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#3B61C4', fontWeight: 600, marginBottom: 6 }}>Your target scores</p>
                {courses.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6B6B6B', padding: '4px 0', borderBottom: i < courses.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                    <span>{c.name}</span>
                    <span style={{ color: '#111111', fontWeight: 600 }}>{c.targetScore || '-'}</span>
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

        {/* ── Practice Exam ── */}
        {activeSection === 'practice' && (
          <PracticeExamView
            courses={courses}
            onShowPaywall={onShowPaywall}
          />
        )}

        {/* ── AI Tutor ── */}
        {activeSection === 'tutor' && (
          <TutorView
            courses={courses}
            userId={userId}
            onShowPaywall={onShowPaywall}
            learningStyle={learningStyle}
            onNavigateToCoach={() => setActiveSection('coach')}
            initialMessage={tutorPrefill}
            paywallTrigger={tutorPrefill ? 'ai-struggle' : 'ai'}
            key={tutorPrefill ?? 'default'}
          />
        )}

        {/* ── Account ── */}
        {activeSection === 'account' && (
          <AccountView
            userEmail={userEmail}
            userId={userId}
            onSignOut={onSignOut}
            onImportSyllabus={() => setSyllabusModalCourse(-1)}
            onEditPlan={onEditPlan}
            googleCalendarConnected={gcalConnected}
            onConnectGoogleCalendar={handleConnectGoogleCalendar}
            onShowPaywall={onShowPaywall}
            onShowProgress={() => setActiveSection('progress')}
            completedSessions={completedSessionLog}
            courses={courses}
            todayStr={todayStr}
          />
        )}

        {/* ── Diagrams ── */}
        {activeSection === 'diagrams' && (
          <DiagramsView
            courses={courses}
            userId={userId}
            onShowPaywall={onShowPaywall}
          />
        )}


        {/* ── Problem Solver ── */}
        {activeSection === 'problem-solver' && (
          <ProblemSolverView
            userId={userId}
            onShowPaywall={onShowPaywall}
          />
        )}

        {/* ── Essay Architect ── */}
        {activeSection === 'essay-architect' && (
          <EssayArchitectView
            userId={userId}
            onShowPaywall={onShowPaywall}
          />
        )}

        </Suspense>

        {/* Print header */}
        <div className="hidden print:block p-8 border-b border-gray-200">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">StudyEdge AI · Personalized Study Plan</h1>
          <p className="text-gray-500">{stats.totalCourses} courses · {stats.totalHours}h planned</p>
        </div>

      </AppShell>

      {showCheatSheet && (
        <CheatSheetModal
          courses={courses}
          userId={userId}
          onClose={() => setShowCheatSheet(false)}
          onShowPaywall={onShowPaywall}
        />
      )}
      {showBrainDump && (
        <BrainDumpModal
          courses={courses}
          userId={userId}
          onClose={() => setShowBrainDump(false)}
          onShowPaywall={onShowPaywall}
          onDrillGaps={(topic) => { setShowBrainDump(false); setPendingDrillTopic(topic); setActiveSection('tools') }}
        />
      )}
      {showExamRescue && (
        <ExamRescueModal
          courses={courses}
          userId={userId}
          onClose={() => setShowExamRescue(false)}
          onShowPaywall={onShowPaywall}
        />
      )}
      {showQuizBurst && (
        <QuickQuizBurst
          courses={courses}
          userId={userId}
          onClose={() => setShowQuizBurst(false)}
          onShowPaywall={onShowPaywall}
          onOpenCheatSheet={() => { setShowQuizBurst(false); setShowCheatSheet(true) }}
        />
      )}
      {showPodcast && (
        <PodcastGenerator
          courses={courses}
          userId={userId}
          onClose={() => setShowPodcast(false)}
          onShowPaywall={onShowPaywall}
        />
      )}
      {showTeachItBack && (
        <TeachItBackModal
          courses={courses}
          onClose={() => setShowTeachItBack(false)}
          onShowPaywall={onShowPaywall}
        />
      )}
      {showConnectionsMode && (
        <ConnectionsModeModal
          courses={courses}
          onClose={() => setShowConnectionsMode(false)}
          onShowPaywall={onShowPaywall}
        />
      )}
      {showTimedChallenge && (
        <TimedChallengeModal
          courses={courses}
          userId={userId}
          onClose={() => setShowTimedChallenge(false)}
          onShowPaywall={onShowPaywall}
        />
      )}
    </>
  )
}
