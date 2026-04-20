import { useMemo, useEffect, useRef, useState } from 'react'
import { useCelebration } from '../utils/useCelebration'
import { useStreak } from '../utils/useStreak'
import { getCurrentGrade, letterGrade, gradeStatus, STATUS_COLORS } from '../utils/gradeCalc'
import { getActivePlan } from '../lib/subscription'

// ── Color tokens ───────────────────────────────────────────────────────────────
const C = {
  pageBg:      '#080D18',
  cardBg:      '#0D1525',
  cardBorder:  '#1A2540',
  accent:      '#6366F1',
  textPrimary: '#F0F4FF',
  textSec:     '#8896B3',
  textMuted:   '#3D4F6B',
  success:     '#10B981',
  warning:     '#F59E0B',
}

// Badge palette: indigo / rose / orange / sky / slate
const BADGE = {
  indigo: { bg: '#6366F120', text: '#818CF8' },
  rose:   { bg: '#F43F5E20', text: '#FB7185' },
  orange: { bg: '#F9731620', text: '#FB923C' },
  sky:    { bg: '#0EA5E920', text: '#38BDF8' },
  slate:  { bg: '#64748B20', text: '#94A3B8' },
}

const COURSE_COLORS = ['#6366F1', '#EC4899', '#06B6D4', '#F59E0B', '#10B981', '#F97316']

function courseColor(idx) {
  return COURSE_COLORS[idx % COURSE_COLORS.length]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}

function formatRelativeTime(dateStr, todayStr) {
  const diff = daysBetween(dateStr, todayStr)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.round(diff / 7)}w ago`
  return `${Math.round(diff / 30)}mo ago`
}

function formatTime(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, style, accentBorder }) {
  return (
    <div style={{
      backgroundColor: C.cardBg,
      border: `1px solid ${accentBorder ?? C.cardBorder}`,
      borderRadius: 14,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: C.textSec,
      margin: 0,
    }}>
      {children}
    </p>
  )
}

// ── Donut ring ────────────────────────────────────────────────────────────────
function DonutRing({ pct = 0 }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      <circle cx={60} cy={60} r={r} fill="none" stroke={C.cardBorder} strokeWidth={8} />
      <circle
        cx={60} cy={60} r={r}
        fill="none"
        stroke={C.accent}
        strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={60} y={56} textAnchor="middle" fill={C.textPrimary} style={{ fontSize: 18, fontWeight: 800, fontFamily: 'inherit' }}>
        {pct}%
      </text>
      <text x={60} y={72} textAnchor="middle" fill={C.textMuted} style={{ fontSize: 9, fontFamily: 'inherit' }}>
        of goal
      </text>
    </svg>
  )
}

// ── Chevron right icon ─────────────────────────────────────────────────────────
function ChevronRight() {
  return (
    <svg style={{ width: 14, height: 14, color: C.textMuted, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ variant = 'slate', children }) {
  const { bg, text } = BADGE[variant] ?? BADGE.slate
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 999,
      backgroundColor: bg,
      color: text,
      flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DashboardView
// ═══════════════════════════════════════════════════════════════════════════════
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
  onNavigateToTools,
  onShowPaywall,
  coachPlans,
  onOpenStudyCoach,
}) {
  const plan = getActivePlan()
  const { currentStreak, lastCompletedDate, recordCompletion } = useStreak()
  const celebrate = useCelebration()
  const streak = currentStreak

  const [aiBriefDismissed, setAiBriefDismissed] = useState(false)

  // ── Celebration on all-complete ─────────────────────────────────────────────
  const allCompleteKey = todayStr + (allComplete ? '-done' : '')
  const allCompleteFiredRef = useRef(null)
  useEffect(() => {
    if (allComplete && allCompleteFiredRef.current !== allCompleteKey) {
      allCompleteFiredRef.current = allCompleteKey
      celebrate('big')
      recordCompletion(todayStr)
    }
  }, [allComplete, allCompleteKey])

  const handleToggle = (id) => {
    if (!completedIds.has(id)) celebrate('light')
    onToggle(id)
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todaySessions = useMemo(
    () => allSessions.filter(s => s.dateStr === todayStr),
    [allSessions, todayStr]
  )

  const nextUncompletedSession = useMemo(
    () => allSessions.find(s => s.dateStr >= todayStr && !completedIds.has(s.id)) ?? null,
    [allSessions, completedIds, todayStr]
  )

  // Week bounds
  const { weekStart, weekEnd, prevWeekStart, prevWeekEnd } = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00')
    const dow = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7)
    const prevSun = new Date(sun); prevSun.setDate(sun.getDate() - 7)
    return {
      weekStart: mon.toISOString().split('T')[0],
      weekEnd: sun.toISOString().split('T')[0],
      prevWeekStart: prevMon.toISOString().split('T')[0],
      prevWeekEnd: prevSun.toISOString().split('T')[0],
    }
  }, [todayStr])

  const thisWeekDone = useMemo(
    () => allSessions.filter(s => s.dateStr >= weekStart && s.dateStr <= weekEnd && completedIds.has(s.id)),
    [allSessions, completedIds, weekStart, weekEnd]
  )
  const prevWeekDone = useMemo(
    () => allSessions.filter(s => s.dateStr >= prevWeekStart && s.dateStr <= prevWeekEnd && completedIds.has(s.id)),
    [allSessions, completedIds, prevWeekStart, prevWeekEnd]
  )

  const weekHours = Math.round(thisWeekDone.reduce((acc, s) => acc + (s.duration ?? 0), 0) / 60 * 10) / 10
  const prevWeekHours = Math.round(prevWeekDone.reduce((acc, s) => acc + (s.duration ?? 0), 0) / 60 * 10) / 10
  const weekSessionCount = thisWeekDone.length
  const prevWeekSessionCount = prevWeekDone.length

  const deltaHours = Math.round((weekHours - prevWeekHours) * 10) / 10
  const deltaSessions = weekSessionCount - prevWeekSessionCount

  // Upcoming exam
  const upcomingExam = useMemo(() => {
    if (!courses.length) return null
    const exams = courses
      .map((c, i) => ({ course: c, idx: i, days: c.examDate ? daysBetween(todayStr, c.examDate) : null }))
      .filter(e => e.days !== null && e.days >= 0)
      .sort((a, b) => a.days - b.days)
    return exams[0] ?? null
  }, [courses, todayStr])

  // Last session per course
  const lastSessionPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const done = allSessions
        .filter(s => s.courseId === idx && completedIds.has(s.id) && s.dateStr <= todayStr)
        .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
      if (done.length) map[idx] = done[0]
    })
    return map
  }, [courses, allSessions, completedIds, todayStr])

  // Progress per course
  const progressPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const total = allSessions.filter(s => s.courseId === idx).length
      const done  = allSessions.filter(s => s.courseId === idx && completedIds.has(s.id)).length
      map[idx] = { total, done }
    })
    return map
  }, [courses, allSessions, completedIds])

  // Weekly goal
  const weeklyGoalHours = 20
  const goalPct = Math.min(100, Math.round((weekHours / weeklyGoalHours) * 100))

  // Subtitle
  const subtitle = useMemo(() => {
    const todayCount = todaySessions.length
    const parts = []
    if (todayCount > 0) {
      parts.push(`${todayCount} session${todayCount > 1 ? 's' : ''} scheduled today`)
    }
    if (upcomingExam && upcomingExam.days <= 30) {
      parts.push(`${upcomingExam.course.name} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}`)
    }
    if (!parts.length) return 'Keep up the momentum. Every session counts.'
    return parts.join('. ') + '.'
  }, [todaySessions, upcomingExam])

  // AI Brief message (derived from data)
  const aiBrief = useMemo(() => {
    if (upcomingExam && upcomingExam.days <= 7) {
      return `${upcomingExam.course.name} is coming up in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}. Focus on reviewing key concepts and past problems today.`
    }
    if (todaySessions.length > 0 && nextUncompletedSession) {
      return `You have ${todaySessions.length} session${todaySessions.length > 1 ? 's' : ''} planned. Starting with ${nextUncompletedSession.courseName} is your best move right now.`
    }
    if (weekHours > 0 && deltaHours > 0) {
      return `You're up ${deltaHours}h from last week. Keep the momentum going — consistency beats intensity every time.`
    }
    return `Add sessions to your schedule and stay consistent. Small daily progress compounds into big results at exam time.`
  }, [upcomingExam, todaySessions, nextUncompletedSession, weekHours, deltaHours])

  // ── Upcoming deadlines ───────────────────────────────────────────────────────
  const upcomingDeadlines = useMemo(() => {
    const all = Object.values(syllabusEventsByDate ?? {}).flat()
    return all
      .filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
  }, [syllabusEventsByDate, todayStr])

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (courses.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.pageBg, padding: '40px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {formatDateHeader(todayStr)}
          </p>
          <h1 style={{ color: C.textPrimary, fontSize: 32, fontWeight: 800, marginBottom: 8, lineHeight: 1.15 }}>
            {greeting()}.
          </h1>
          <p style={{ color: C.textSec, fontSize: 14, marginBottom: 32 }}>
            Add your first course to unlock your study plan.
          </p>

          <Card style={{ padding: 32, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              backgroundColor: `${C.accent}18`, border: `1px solid ${C.accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg style={{ width: 28, height: 28, color: C.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p style={{ color: C.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              No courses added yet
            </p>
            <p style={{ color: C.textSec, fontSize: 13, marginBottom: 24 }}>
              Add your courses to generate a personalized study plan, track progress, and get AI coaching.
            </p>
            <button
              onClick={onNavigateToCourses}
              style={{
                backgroundColor: C.accent,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                padding: '11px 28px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Add Your First Course
            </button>
          </Card>
        </div>
      </div>
    )
  }

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.pageBg, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 48px' }}>

        {/* Two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }} className="dashboard-grid">
          <style>{`
            @media (min-width: 1024px) {
              .dashboard-grid { grid-template-columns: 64fr 36fr !important; }
            }
          `}</style>

          {/* ════════════════════════════════════════
              LEFT COLUMN
          ════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 1. Greeting header */}
            <div>
              <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 6 }}>
                {formatDateHeader(todayStr)}
              </p>
              <h1 style={{ color: C.textPrimary, fontSize: 30, fontWeight: 800, lineHeight: 1.2, marginBottom: 6 }}>
                {greeting()}.
              </h1>
              <p style={{ color: C.textSec, fontSize: 14, lineHeight: 1.5 }}>
                {subtitle}
              </p>
            </div>

            {/* 2. UP NEXT TODAY */}
            <Card accentBorder={nextUncompletedSession ? C.accent : C.cardBorder}>
              <div style={{ padding: '18px 20px 14px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SectionLabel>Up Next Today</SectionLabel>
                    {todaySessions.length > 0 && (
                      <StatusBadge variant="indigo">
                        {todaySessions.length} session{todaySessions.length !== 1 ? 's' : ''}
                      </StatusBadge>
                    )}
                  </div>
                </div>

                {nextUncompletedSession ? (
                  <>
                    {/* Course + time row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: nextUncompletedSession.color?.dot ?? C.accent,
                      }} />
                      <span style={{ color: C.textSec, fontSize: 12, fontWeight: 500 }}>
                        {nextUncompletedSession.courseName ?? ''}
                      </span>
                      {nextUncompletedSession.startTime && (
                        <>
                          <span style={{ color: C.textMuted, fontSize: 12 }}>·</span>
                          <span style={{ color: C.textSec, fontSize: 12 }}>
                            {formatTime(nextUncompletedSession.startTime)}
                          </span>
                        </>
                      )}
                      <StatusBadge variant="slate" style={{ marginLeft: 'auto' }}>Focus block</StatusBadge>
                    </div>

                    {/* Session title */}
                    <p style={{ color: C.textPrimary, fontSize: 20, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                      {nextUncompletedSession.sessionType ?? 'Study Session'}
                      {nextUncompletedSession.duration ? ` · ${nextUncompletedSession.duration} min` : ''}
                    </p>

                    {/* Button row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onStartFocus(nextUncompletedSession)}
                        style={{
                          backgroundColor: C.accent,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 700,
                          padding: '9px 20px',
                          borderRadius: 9,
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <svg style={{ width: 13, height: 13 }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Start Session
                      </button>
                      <button
                        onClick={() => handleToggle(nextUncompletedSession.id)}
                        style={{
                          backgroundColor: 'transparent',
                          color: C.textSec,
                          fontSize: 13,
                          fontWeight: 600,
                          padding: '9px 16px',
                          borderRadius: 9,
                          border: `1px solid ${C.cardBorder}`,
                          cursor: 'pointer',
                        }}
                      >
                        Mark Done
                      </button>
                      <button
                        style={{
                          backgroundColor: 'transparent',
                          color: C.textMuted,
                          fontSize: 13,
                          fontWeight: 500,
                          padding: '9px 16px',
                          borderRadius: 9,
                          border: `1px solid ${C.cardBorder}`,
                          cursor: 'pointer',
                        }}
                      >
                        Skip
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '12px 0 4px', textAlign: 'center' }}>
                    <p style={{ color: C.textSec, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                      No sessions scheduled today.
                    </p>
                    <p style={{ color: C.textMuted, fontSize: 13 }}>
                      Add a course to get started with your study plan.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* 3. COMPACT STATS STRIP */}
            <Card style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {[
                  {
                    label: 'Streak',
                    value: streak,
                    unit: streak === 1 ? 'day' : 'days',
                    delta: streak > 0 ? `+${streak}` : null,
                    badgeVariant: 'orange',
                  },
                  {
                    label: 'This Week',
                    value: weekHours,
                    unit: 'hrs',
                    delta: deltaHours !== 0 ? (deltaHours > 0 ? `+${deltaHours}` : `${deltaHours}`) : null,
                    badgeVariant: deltaHours >= 0 ? 'indigo' : 'rose',
                  },
                  {
                    label: 'Sessions',
                    value: weekSessionCount,
                    unit: '',
                    delta: deltaSessions !== 0 ? (deltaSessions > 0 ? `+${deltaSessions}` : `${deltaSessions}`) : null,
                    badgeVariant: deltaSessions >= 0 ? 'sky' : 'rose',
                  },
                ].map(({ label, value, unit, delta, badgeVariant }, i, arr) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      paddingLeft: i === 0 ? 0 : 20,
                      paddingRight: i === arr.length - 1 ? 0 : 20,
                      borderLeft: i === 0 ? 'none' : `1px solid ${C.cardBorder}`,
                    }}
                  >
                    <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>
                      {label}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ color: C.textPrimary, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                        {value}
                      </span>
                      {unit && (
                        <span style={{ color: C.textSec, fontSize: 12, fontWeight: 500 }}>{unit}</span>
                      )}
                      {delta && (
                        <StatusBadge variant={badgeVariant}>{delta}</StatusBadge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 4. AI BRIEF */}
            {!aiBriefDismissed && (
              <Card accentBorder={`${C.accent}50`} style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    backgroundColor: `${C.accent}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg style={{ width: 16, height: 16, color: C.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                        AI Brief
                      </span>
                    </div>
                    <p style={{ color: C.textSec, fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
                      {aiBrief}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => nextUncompletedSession && onStartFocus && onStartFocus(nextUncompletedSession)}
                        style={{
                          backgroundColor: C.accent,
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '6px 14px',
                          borderRadius: 7,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Swap Session
                      </button>
                      <button
                        onClick={() => setAiBriefDismissed(true)}
                        style={{
                          backgroundColor: 'transparent',
                          color: C.textMuted,
                          fontSize: 12,
                          fontWeight: 500,
                          padding: '6px 10px',
                          borderRadius: 7,
                          border: `1px solid ${C.cardBorder}`,
                          cursor: 'pointer',
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 5. COURSES */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <SectionLabel>Courses</SectionLabel>
                <button
                  onClick={onNavigateToCourses}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: C.accent, fontSize: 12, fontWeight: 600,
                  }}
                >
                  View all
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {courses.map((course, idx) => {
                  const color = course.color?.dot ?? courseColor(idx)
                  const prog = progressPerCourse[idx] ?? { total: 0, done: 0 }
                  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0
                  const last = lastSessionPerCourse[idx]
                  const daysToExam = course.examDate ? daysBetween(todayStr, course.examDate) : null
                  const examSoon = daysToExam !== null && daysToExam >= 0 && daysToExam <= 14

                  // On track / Behind logic
                  const hasUpcoming = allSessions.some(s => s.courseId === idx && s.dateStr >= todayStr)
                  const onTrack = pct >= 50 || !hasUpcoming
                  const trackVariant = onTrack ? 'sky' : 'rose'
                  const trackLabel = onTrack ? 'On track' : 'Behind'

                  return (
                    <Card key={idx} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Color bar */}
                      <div style={{ width: 3, height: 44, borderRadius: 999, backgroundColor: color, flexShrink: 0 }} />

                      {/* Course info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          {course.code && (
                            <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 600 }}>{course.code}</span>
                          )}
                          <span style={{ color: C.textPrimary, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {course.name}
                          </span>
                          <StatusBadge variant={trackVariant}>{trackLabel}</StatusBadge>
                        </div>
                        {last && (
                          <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 7 }}>
                            Last session {formatRelativeTime(last.dateStr, todayStr)}
                          </p>
                        )}
                        {/* Progress bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 4, backgroundColor: '#1A2540', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 999, transition: 'width 0.4s ease' }} />
                          </div>
                          <span style={{ color: C.textSec, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            {prog.done}/{prog.total}
                          </span>
                        </div>
                      </div>

                      {/* Right: pct + exam */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{pct}%</p>
                        {daysToExam !== null && daysToExam >= 0 && (
                          <StatusBadge variant={examSoon ? 'orange' : 'slate'}>
                            {daysToExam === 0 ? 'Exam today' : `${daysToExam}d`}
                          </StatusBadge>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* 6. DEADLINE RADAR */}
            {upcomingDeadlines.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <SectionLabel>Deadline Radar</SectionLabel>
                  <StatusBadge variant="rose">{upcomingDeadlines.length} upcoming</StatusBadge>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingDeadlines.map((event, i) => {
                    const days = daysBetween(todayStr, event.date)
                    const urgent = days <= 3
                    const soon = days <= 7
                    const badgeVariant = urgent ? 'rose' : soon ? 'orange' : 'slate'

                    return (
                      <Card key={event.id ?? i} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Day number */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                          backgroundColor: urgent ? `${BADGE.rose.bg}` : soon ? `${BADGE.orange.bg}` : '#1A2540',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 1,
                        }}>
                          <span style={{ color: urgent ? BADGE.rose.text : soon ? BADGE.orange.text : C.textMuted, fontSize: 16, fontWeight: 800, lineHeight: 1 }}>
                            {days === 0 ? '!' : days}
                          </span>
                          <span style={{ color: urgent ? BADGE.rose.text : soon ? BADGE.orange.text : C.textMuted, fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {days === 0 ? 'today' : days === 1 ? 'day' : 'days'}
                          </span>
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {event.name}
                          </p>
                          <p style={{ color: C.textMuted, fontSize: 11 }}>{event.courseName}</p>
                        </div>

                        <StatusBadge variant={badgeVariant}>
                          {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                        </StatusBadge>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

          </div>

          {/* ════════════════════════════════════════
              RIGHT COLUMN
          ════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 1. QUICK ACTIONS */}
            <Card>
              <div style={{ padding: '18px 20px' }}>
                <SectionLabel>Quick Actions</SectionLabel>
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    {
                      title: 'Study Coach',
                      sub: 'AI-powered weekly study plan',
                      iconBg: `${C.accent}20`,
                      iconColor: C.accent,
                      iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
                      onClick: () => { if (typeof onOpenStudyCoach === 'function') onOpenStudyCoach(0) },
                    },
                    {
                      title: 'Grade Hub',
                      sub: 'Track assignments and grades',
                      iconBg: '#EC489920',
                      iconColor: '#EC4899',
                      iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
                      onClick: () => { if (typeof onNavigateToGrades === 'function') onNavigateToGrades(0) },
                    },
                    {
                      title: 'Review Flashcards',
                      sub: 'Test your knowledge',
                      iconBg: `${C.success}20`,
                      iconColor: C.success,
                      iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
                      onClick: () => { if (typeof onNavigateToTools === 'function') onNavigateToTools() },
                    },
                  ].map(({ title, sub, iconBg, iconColor, iconPath, onClick }) => (
                    <button
                      key={title}
                      onClick={onClick}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 8px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0F1929' }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 9,
                        backgroundColor: iconBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <svg style={{ width: 17, height: 17, color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, marginBottom: 1 }}>{title}</p>
                        <p style={{ color: C.textMuted, fontSize: 11 }}>{sub}</p>
                      </div>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* 2. GOALS card */}
            <Card>
              <div style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <SectionLabel>Weekly Goal</SectionLabel>
                  <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 12 }}>
                    Edit
                  </button>
                </div>

                {/* Donut */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
                  <DonutRing pct={goalPct} />
                  <p style={{ color: C.textSec, fontSize: 12, marginTop: 8 }}>
                    {weekHours} of {weeklyGoalHours} hours
                  </p>
                </div>

                {/* Exam targets */}
                <div style={{ borderTop: `1px solid ${C.cardBorder}`, paddingTop: 14 }}>
                  <SectionLabel>Exam Targets</SectionLabel>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {courses.filter(c => c.examDate && daysBetween(todayStr, c.examDate) >= 0).length > 0 ? (
                      courses
                        .map((c, i) => ({ c, i }))
                        .filter(({ c }) => c.examDate && daysBetween(todayStr, c.examDate) >= 0)
                        .slice(0, 4)
                        .map(({ c, i }) => {
                          const days = daysBetween(todayStr, c.examDate)
                          const color = c.color?.dot ?? courseColor(i)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                              <span style={{ flex: 1, color: C.textSec, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.name}
                              </span>
                              <StatusBadge variant={days <= 7 ? 'orange' : 'slate'}>
                                {days === 0 ? 'Today' : `${days}d`}
                              </StatusBadge>
                            </div>
                          )
                        })
                    ) : (
                      <p style={{ color: C.textMuted, fontSize: 12 }}>No upcoming exams</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* 3. TODAY'S PLAN */}
            <Card>
              <div style={{ padding: '18px 20px' }}>
                <SectionLabel>Today's Plan</SectionLabel>

                {todaySessions.length === 0 ? (
                  <p style={{ color: C.textMuted, fontSize: 13, marginTop: 12 }}>No sessions scheduled today.</p>
                ) : (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {todaySessions.map(session => {
                      const done = completedIds.has(session.id)
                      const color = session.color?.dot ?? C.accent
                      return (
                        <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 500, width: 52, flexShrink: 0 }}>
                            {session.startTime ? formatTime(session.startTime) : '--'}
                          </span>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: done ? C.success : color, flexShrink: 0 }} />
                          <span style={{
                            flex: 1,
                            color: done ? C.textMuted : C.textSec,
                            fontSize: 13,
                            fontWeight: 500,
                            textDecoration: done ? 'line-through' : 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {session.courseName} {session.sessionType ? `· ${session.sessionType}` : ''}
                          </span>
                          {session.duration && (
                            <StatusBadge variant="slate">{session.duration}m</StatusBadge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* 4. GRADE SNAPSHOT */}
            {courses.some(c => (c.gradeData?.components ?? []).length > 0) && (
              <Card>
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <SectionLabel>Grade Snapshot</SectionLabel>
                    <button
                      onClick={() => typeof onNavigateToGrades === 'function' && onNavigateToGrades(0)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 12, fontWeight: 600 }}
                    >
                      Details
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {courses.map((course, idx) => {
                      const components = course.gradeData?.components ?? []
                      if (!components.length) return null
                      const current = getCurrentGrade(components)
                      const target = course.gradeData?.targetGrade ?? null
                      const status = current !== null && target ? gradeStatus(current, target) : 'unknown'
                      const color = course.color?.dot ?? courseColor(idx)
                      const statusColorMap = { 'on-track': C.success, 'at-risk': C.warning, 'needs-recovery': '#F87171', 'unknown': C.textMuted }
                      const statusBadgeVariant = { 'on-track': 'sky', 'at-risk': 'orange', 'needs-recovery': 'rose', 'unknown': 'slate' }
                      const grade = letterGrade(current)
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: C.textSec, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {course.name}
                          </span>
                          {current !== null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{ color: statusColorMap[status], fontSize: 12, fontWeight: 700 }}>
                                {Math.round(current)}%
                              </span>
                              <StatusBadge variant={statusBadgeVariant[status]}>{grade}</StatusBadge>
                            </div>
                          ) : (
                            <span style={{ color: C.textMuted, fontSize: 11 }}>No data</span>
                          )}
                        </div>
                      )
                    }).filter(Boolean)}
                  </div>
                </div>
              </Card>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
