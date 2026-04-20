import { useMemo, useEffect, useRef, useState } from 'react'
import { useCelebration } from '../utils/useCelebration'
import { useStreak } from '../utils/useStreak'
import { getCurrentGrade, letterGrade, gradeStatus } from '../utils/gradeCalc'
import { getActivePlan } from '../lib/subscription'

// ── Design tokens (matching reference design) ──────────────────────────────────
const D = {
  bg:           '#060614',
  bgCard:       '#0a0a1e',
  border:       'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  text:         '#e8e8f0',
  textMuted:    '#8888a0',
  textDim:      '#55556e',
  accent:       '#6366f1',
  accentGlow:   'rgba(99,102,241,0.35)',
  green:        '#4ade80',
  amber:        '#fbbf24',
  pink:         '#f472b6',
  cyan:         '#22d3ee',
}

const COURSE_COLORS = ['#6366f1', '#f472b6', '#22d3ee', '#fbbf24', '#4ade80', '#f97316']
const courseColor = (idx) => COURSE_COLORS[idx % COURSE_COLORS.length]

// ── Helpers ────────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function formatTime(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`
}

function addMinutes(timeStr, mins) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + (mins ?? 0)
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}

// ── Inline SVG icons ───────────────────────────────────────────────────────────
const IcoFlame  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
const IcoClock  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
const IcoCheck  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
const IcoPlay   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
const IcoChevron= () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
const IcoZap    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
const IcoStar   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
const IcoMsg    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IcoBrain  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/></svg>
const IcoGrad   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10l10-4 10 4-10 4-10-4z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6"/></svg>
const IcoCards  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 9h6M7 13h4"/><path d="M21 8v10a2 2 0 01-2 2H8"/></svg>

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, ...style }}>
      {children}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.05em', color: D.textMuted, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

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
  const { currentStreak, recordCompletion } = useStreak()
  const celebrate = useCelebration()
  const streak = currentStreak
  const [aiBriefDismissed, setAiBriefDismissed] = useState(false)
  const [sessionIdx, setSessionIdx] = useState(0)

  // Celebration
  const allCompleteKey = todayStr + (allComplete ? '-done' : '')
  const firedRef = useRef(null)
  useEffect(() => {
    if (allComplete && firedRef.current !== allCompleteKey) {
      firedRef.current = allCompleteKey
      celebrate('big')
      recordCompletion(todayStr)
    }
  }, [allComplete, allCompleteKey])

  const handleToggle = (id) => {
    if (!completedIds.has(id)) celebrate('light')
    onToggle(id)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const todaySessions = useMemo(
    () => allSessions.filter(s => s.dateStr === todayStr),
    [allSessions, todayStr]
  )

  const uncompletedToday = useMemo(
    () => todaySessions.filter(s => !completedIds.has(s.id)),
    [todaySessions, completedIds]
  )

  const displaySession = uncompletedToday[sessionIdx] ?? uncompletedToday[0] ?? todaySessions[0] ?? null

  const { weekStart, weekEnd, prevWeekStart, prevWeekEnd } = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00')
    const dow = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const pm = new Date(mon); pm.setDate(mon.getDate() - 7)
    const ps = new Date(sun); ps.setDate(sun.getDate() - 7)
    return {
      weekStart: mon.toISOString().split('T')[0],
      weekEnd: sun.toISOString().split('T')[0],
      prevWeekStart: pm.toISOString().split('T')[0],
      prevWeekEnd: ps.toISOString().split('T')[0],
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

  const weekHours = Math.round(thisWeekDone.reduce((a, s) => a + (s.duration ?? 0), 0) / 60 * 10) / 10
  const prevWeekHours = Math.round(prevWeekDone.reduce((a, s) => a + (s.duration ?? 0), 0) / 60 * 10) / 10
  const weekSessionCount = thisWeekDone.length
  const prevWeekSessionCount = prevWeekDone.length
  const deltaHours = Math.round((weekHours - prevWeekHours) * 10) / 10
  const deltaSessions = weekSessionCount - prevWeekSessionCount
  const weeklyGoalHours = 30
  const goalPct = Math.min(100, Math.round((weekHours / weeklyGoalHours) * 100))
  const onPace = goalPct >= Math.round((new Date().getDay() / 7) * 100) - 10

  // Progress per course
  const progressPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const total = allSessions.filter(s => s.courseId === idx).length
      const done = allSessions.filter(s => s.courseId === idx && completedIds.has(s.id)).length
      map[idx] = { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
    })
    return map
  }, [courses, allSessions, completedIds])

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

  // Due next per course
  const dueNextPerCourse = useMemo(() => {
    const map = {}
    const allEvents = Object.values(syllabusEventsByDate ?? {}).flat()
    courses.forEach((c, idx) => {
      const upcoming = allEvents
        .filter(e => e.date >= todayStr)
        .filter(e => {
          const name = (e.courseName ?? '').toLowerCase()
          return name === (c.name ?? '').toLowerCase() || e.courseId === idx
        })
        .sort((a, b) => a.date.localeCompare(b.date))
      if (upcoming.length > 0) {
        const e = upcoming[0]
        const days = daysBetween(todayStr, e.date)
        const dateLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatShortDate(e.date)
        const shortName = (e.name ?? '').length > 18 ? (e.name ?? '').slice(0, 18) + '…' : (e.name ?? '')
        map[idx] = `${shortName} · ${dateLabel}`
      } else if (c.examDate) {
        const days = daysBetween(todayStr, c.examDate)
        if (days >= 0) {
          map[idx] = `Exam · ${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatShortDate(c.examDate)}`
        }
      }
    })
    return map
  }, [courses, syllabusEventsByDate, todayStr])

  // Upcoming deadlines
  const upcomingDeadlines = useMemo(() => {
    const all = Object.values(syllabusEventsByDate ?? {}).flat()
    return all
      .filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4)
  }, [syllabusEventsByDate, todayStr])

  // Upcoming exam
  const upcomingExam = useMemo(() => {
    const exams = courses
      .map((c, i) => ({ course: c, idx: i, days: c.examDate ? daysBetween(todayStr, c.examDate) : null }))
      .filter(e => e.days !== null && e.days >= 0)
      .sort((a, b) => a.days - b.days)
    return exams[0] ?? null
  }, [courses, todayStr])

  // AI coach message
  const aiMessage = useMemo(() => {
    if (upcomingExam && upcomingExam.days <= 7) {
      return `${upcomingExam.course.name} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''} — add focused review sessions this week to stay on track.`
    }
    if (upcomingDeadlines.length > 0) {
      const d = upcomingDeadlines[0]
      const days = daysBetween(todayStr, d.date)
      if (days <= 3) return `${d.name} is due ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}. Consider prioritizing this in your next session.`
    }
    if (weekHours > 0 && deltaHours > 0) {
      return `You're up ${deltaHours}h from last week. Keep the momentum — consistency beats intensity every time.`
    }
    return `Stay consistent with your sessions. Small daily progress compounds into big results at exam time.`
  }, [upcomingExam, upcomingDeadlines, weekHours, deltaHours, todayStr])

  // Subtitle
  const subtitle = useMemo(() => {
    const parts = []
    if (todaySessions.length > 0) parts.push(`${todaySessions.length} session${todaySessions.length > 1 ? 's' : ''} on the schedule`)
    if (upcomingExam && upcomingExam.days <= 14) parts.push(`${upcomingExam.course.name} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}`)
    if (!parts.length) return 'Keep up the momentum. Every session counts.'
    return parts.join(' — ') + '.'
  }, [todaySessions, upcomingExam])

  const urgencyColor = (d) => d <= 2 ? '#F97316' : d <= 5 ? '#38BDF8' : D.textDim
  const urgencyLabel = (d) => d <= 2 ? 'Tight' : d <= 5 ? 'Soon' : 'Planned'

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (courses.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Card style={{ padding: 40, textAlign: 'center', maxWidth: 420 }}>
          <p style={{ color: D.textDim, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 24 }}>
            {formatDateHeader(todayStr)}
          </p>
          <h1 style={{ color: D.text, fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginBottom: 8 }}>{greeting()}.</h1>
          <p style={{ color: D.textMuted, fontSize: 14, marginBottom: 28 }}>Add your first course to unlock your study plan.</p>
          <button
            onClick={onNavigateToCourses}
            style={{ background: D.accent, color: '#fff', fontSize: 13.5, fontWeight: 600, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', boxShadow: `0 8px 24px ${D.accentGlow}` }}
          >
            Add Your First Course
          </button>
        </Card>
      </div>
    )
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowY: 'auto',
      backgroundImage: `radial-gradient(1200px 600px at 85% -10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(900px 500px at 10% 110%, rgba(99,102,241,0.05), transparent 60%)`,
    }}>
      {/* Header */}
      <div style={{ padding: '28px 32px 8px' }}>
        <div style={{ fontSize: 12, color: D.textDim, letterSpacing: '0.03em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.green, boxShadow: `0 0 8px ${D.green}` }} />
          {formatDateHeader(todayStr).toUpperCase()}
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: 0, letterSpacing: -0.8, lineHeight: 1.15, color: D.text }}>
          {greeting()}.
        </h1>
        <p style={{ fontSize: 15, color: D.textMuted, margin: '8px 0 0', fontWeight: 400 }}>
          {subtitle}
        </p>
      </div>

      {/* Grid */}
      <div style={{ padding: '24px 32px 48px', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>

        {/* ── UP NEXT (span 8) ── */}
        <div style={{
          gridColumn: 'span 8',
          background: D.bgCard,
          border: `1px solid ${D.border}`,
          borderRadius: 14,
          display: 'flex', overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Color bar */}
          <div style={{
            width: 4,
            background: displaySession ? (displaySession.color?.dot ?? courseColor(displaySession.courseId ?? 0)) : D.accent,
            flexShrink: 0,
            boxShadow: `0 0 20px ${displaySession ? (displaySession.color?.dot ?? courseColor(displaySession.courseId ?? 0)) : D.accent}55`,
          }} />

          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SectionHeader>Up next today</SectionHeader>
                <span style={{ fontSize: 11, color: D.textDim }}>·</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: D.textDim }}>
                  {uncompletedToday.length} queued
                </span>
              </div>
              {/* Session dots */}
              <div style={{ display: 'flex', gap: 4 }}>
                {uncompletedToday.slice(0, 6).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSessionIdx(i)}
                    style={{
                      width: i === sessionIdx ? 18 : 6, height: 6, borderRadius: 3,
                      background: i === sessionIdx ? D.accent : 'rgba(255,255,255,0.12)',
                      border: 'none', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
              </div>
            </div>

            {displaySession ? (
              <>
                {/* Time range */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  {displaySession.startTime ? (
                    <>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: displaySession.color?.dot ?? courseColor(displaySession.courseId ?? 0), fontWeight: 600 }}>
                        {formatTime(displaySession.startTime)}
                      </span>
                      <span style={{ fontSize: 13, color: D.textDim }}>→</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: D.textMuted }}>
                        {formatTime(addMinutes(displaySession.startTime, displaySession.duration ?? 60))}
                      </span>
                    </>
                  ) : null}
                  <span style={{
                    fontSize: 11, color: D.textDim,
                    padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)',
                  }}>
                    Focus block
                  </span>
                </div>
                {/* Course name */}
                <div style={{ fontSize: 12.5, color: D.textMuted, marginBottom: 4, fontWeight: 500 }}>
                  {displaySession.courseName ?? ''}
                </div>
                {/* Topic */}
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, color: D.text, marginBottom: 'auto' }}>
                  {displaySession.sessionType ?? 'Study Session'}
                  {displaySession.duration ? ` · ${displaySession.duration} min` : ''}
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24 }}>
                  <button
                    onClick={() => onStartFocus && onStartFocus(displaySession)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: D.accent, color: 'white',
                      padding: '10px 18px', borderRadius: 8,
                      fontSize: 13.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                      boxShadow: `0 8px 24px ${D.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                    }}
                  >
                    <IcoPlay /> Start session
                  </button>
                  <button
                    onClick={() => handleToggle(displaySession.id)}
                    style={{ fontSize: 12.5, color: D.textMuted, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Mark done
                  </button>
                  <button
                    style={{ fontSize: 12.5, color: D.textMuted, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Skip
                  </button>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 11, color: D.textDim, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IcoZap /> Pomodoro · 25 + 5
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: D.accent, opacity: 0.7 }} />
                  AI-structured session blocks · recall checkpoints
                </div>
              </>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <p style={{ color: D.textMuted, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No sessions queued.</p>
                <p style={{ color: D.textDim, fontSize: 13 }}>Add a course to generate your study plan.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── QUICK ACTIONS (span 4) ── */}
        <Card style={{ gridColumn: 'span 4', padding: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SectionHeader style={{ marginBottom: 12 }}>Quick actions</SectionHeader>
          <div style={{ marginBottom: 12 }} />
          {[
            { icon: <IcoBrain />, label: 'Study Coach', sub: 'AI-powered weekly plan', color: D.accent, onClick: () => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0) },
            { icon: <IcoGrad />, label: 'Grade Hub', sub: 'Track grades & targets', color: D.green, onClick: () => typeof onNavigateToGrades === 'function' && onNavigateToGrades(0) },
            { icon: <IcoCards />, label: 'Review flashcards', sub: 'Test your knowledge', color: D.pink, onClick: () => typeof onNavigateToTools === 'function' && onNavigateToTools() },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 8, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', width: '100%', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${a.color}18`, color: a.color, display: 'grid', placeItems: 'center' }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: D.text }}>{a.label}</div>
                <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 1 }}>{a.sub}</div>
              </div>
              <IcoChevron />
            </button>
          ))}
        </Card>

        {/* ── AI BRIEF (span 12) ── */}
        {!aiBriefDismissed && (
          <div style={{
            gridColumn: 'span 12',
            position: 'relative',
            background: 'linear-gradient(180deg, rgba(99,102,241,0.06), rgba(139,92,246,0.03) 60%, rgba(10,10,30,0.5))',
            border: '1px solid rgba(99,102,241,0.28)',
            borderRadius: 14,
            padding: '22px 26px',
            boxShadow: '0 0 0 1px rgba(99,102,241,0.06), 0 20px 60px -20px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(600px 180px at 8% 0%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(500px 160px at 95% 100%, rgba(139,92,246,0.14), transparent 60%)' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#a5a7f5', padding: '3px 9px', borderRadius: 999,
                  background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)',
                  marginBottom: 14,
                }}>
                  <span style={{ fontSize: 11 }}>✦</span> AI Brief
                </div>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: D.text, fontWeight: 400, letterSpacing: -0.15, maxWidth: 760 }}>
                  {aiMessage}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => setAiBriefDismissed(true)}
                  style={{ fontSize: 12, fontWeight: 500, color: D.textMuted, padding: '7px 12px', borderRadius: 7, border: `1px solid ${D.borderStrong}`, background: 'none', cursor: 'pointer' }}
                >
                  Dismiss
                </button>
                <button
                  onClick={() => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0)}
                  style={{ fontSize: 12, fontWeight: 600, color: 'white', padding: '7px 14px', borderRadius: 7, background: D.accent, boxShadow: `0 4px 14px ${D.accentGlow}`, border: 'none', cursor: 'pointer' }}
                >
                  Swap session
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STATS ROW (span 12) ── */}
        <div style={{
          gridColumn: 'span 12',
          background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${D.border}`,
          borderRadius: 999,
          height: 44,
          padding: '0 20px',
          display: 'flex', alignItems: 'center',
        }}>
          {[
            { label: 'Current streak', value: streak, unit: streak === 1 ? 'day' : 'days', trend: streak > 0 ? `+${streak}` : '0', icon: <IcoFlame />, accent: D.amber },
            { label: 'Hours studied', value: weekHours, unit: 'hrs', trend: deltaHours >= 0 ? `+${deltaHours}` : `${deltaHours}`, icon: <IcoClock />, accent: D.accent },
            { label: 'Sessions completed', value: weekSessionCount, unit: '', trend: deltaSessions >= 0 ? `+${deltaSessions}` : `${deltaSessions}`, icon: <IcoCheck />, accent: D.green },
          ].map((stat, i) => (
            <>
              <div key={stat.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ color: stat.accent, display: 'inline-flex' }}>{stat.icon}</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 600, color: D.text, letterSpacing: -0.2 }}>
                  {stat.value}{stat.unit && <span style={{ color: D.textMuted, fontWeight: 500, marginLeft: 2, fontSize: 11 }}>{stat.unit}</span>}
                </span>
                <span style={{ fontSize: 11, color: D.textDim }}>{stat.label.toLowerCase()}</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: D.green, fontWeight: 500 }}>{stat.trend}</span>
              </div>
              {i < 2 && <div style={{ width: 1, height: 14, background: D.borderStrong }} />}
            </>
          ))}
        </div>

        {/* ── COURSES (span 6) ── */}
        <Card style={{ gridColumn: 'span 6', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <SectionHeader>Courses</SectionHeader>
            <div style={{ flex: 1 }} />
            <button onClick={onNavigateToCourses} style={{ fontSize: 11.5, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
          </div>
          {courses.map((course, idx) => {
            const color = course.color?.dot ?? courseColor(idx)
            const prog = progressPerCourse[idx] ?? { pct: 0 }
            const last = lastSessionPerCourse[idx]
            const lastLabel = last ? (() => {
              const d = daysBetween(last.dateStr, todayStr)
              return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`
            })() : null
            const dueNext = dueNextPerCourse[idx] ?? null
            // on track: pct >= 50 or no sessions yet
            const total = allSessions.filter(s => s.courseId === idx).length
            const onTrack = total === 0 || prog.pct >= 50
            const pillColor  = onTrack ? '#818CF8' : '#F472B6'
            const pillBg     = onTrack ? 'rgba(99,102,241,0.12)' : 'rgba(244,114,182,0.12)'
            const pillBorder = onTrack ? 'rgba(129,140,248,0.3)' : 'rgba(244,114,182,0.3)'

            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '4px 1fr 200px auto 60px',
                gap: 14, alignItems: 'center',
                padding: '12px 0',
                borderBottom: idx < courses.length - 1 ? `1px solid ${D.border}` : 'none',
              }}>
                <div style={{ width: 4, height: 28, background: color, borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: D.text }}>{course.name}</div>
                  <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 2 }}>
                    {lastLabel ? `Last session ${lastLabel}` : 'No sessions yet'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${prog.pct}%`, height: '100%', background: color, opacity: 0.85 }} />
                  </div>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: D.textMuted, width: 32, textAlign: 'right' }}>{prog.pct}%</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 10.5, fontWeight: 500, color: pillColor,
                    background: pillBg, border: `1px solid ${pillBorder}`,
                    padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: pillColor }} />
                    {onTrack ? 'On track' : 'Behind'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: D.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                  {dueNext ?? ''}
                </div>
                <button
                  onClick={() => typeof onNavigateToGrades === 'function' && onNavigateToGrades(idx)}
                  style={{ fontSize: 11.5, color: D.textMuted, textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Open →
                </button>
              </div>
            )
          })}
        </Card>

        {/* ── WEEKLY OVERVIEW (span 6) ── */}
        <Card style={{ gridColumn: 'span 6', padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <SectionHeader>This week</SectionHeader>
              <div style={{ fontSize: 12, color: D.textDim, marginTop: 2 }}>{weekHours} of {weeklyGoalHours} hours</div>
            </div>
            <div style={{
              fontSize: 10.5, color: D.accent, fontWeight: 600,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              padding: '3px 9px', borderRadius: 999, letterSpacing: '0.03em',
            }}>
              {onPace ? 'ON PACE' : 'BEHIND'}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 22 }}>
            {/* Donut */}
            <div style={{ position: 'relative', width: 116, height: 116, flexShrink: 0 }}>
              {(() => {
                const r = 48, c = 2 * Math.PI * r, pct = goalPct / 100
                return (
                  <svg width="116" height="116" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="58" cy="58" r={r} stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
                    <circle cx="58" cy="58" r={r} stroke={D.accent} strokeWidth="8" fill="none"
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={c * (1 - pct)}
                      style={{ filter: `drop-shadow(0 0 8px ${D.accentGlow})` }}
                    />
                  </svg>
                )
              })()}
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: D.text }}>{goalPct}%</div>
                  <div style={{ fontSize: 10, color: D.textDim, marginTop: -2 }}>of goal</div>
                </div>
              </div>
            </div>
            {/* Stats */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              {[
                { label: 'Current streak', value: streak, unit: streak === 1 ? 'day' : 'days', trend: `+${streak}`, icon: <IcoFlame />, accent: D.amber },
                { label: 'Hours studied', value: weekHours, unit: 'hrs', trend: deltaHours >= 0 ? `+${deltaHours}` : `${deltaHours}`, icon: <IcoClock />, accent: D.accent },
                { label: 'Sessions completed', value: weekSessionCount, unit: '', trend: deltaSessions >= 0 ? `+${deltaSessions}` : `${deltaSessions}`, icon: <IcoCheck />, accent: D.green },
              ].map(stat => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${stat.accent}15`, color: stat.accent, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {stat.icon}
                  </div>
                  <div style={{ fontSize: 11.5, color: D.textDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 17, fontWeight: 600, letterSpacing: -0.3, color: D.text }}>{stat.value}</span>
                    {stat.unit && <span style={{ fontSize: 10.5, color: D.textMuted, fontWeight: 500 }}>{stat.unit}</span>}
                  </div>
                  <div style={{
                    fontFamily: 'ui-monospace, monospace',
                    display: 'flex', alignItems: 'center', gap: 2,
                    fontSize: 10, color: D.green,
                    background: 'rgba(74,222,128,0.08)',
                    padding: '2px 6px', borderRadius: 5, flexShrink: 0,
                  }}>
                    <svg width="7" height="7" viewBox="0 0 12 12" fill="none"><path d="M3 8l3-4 3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {stat.trend}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── DEADLINE RADAR (span 7) ── */}
        {upcomingDeadlines.length > 0 && (
          <Card style={{ gridColumn: 'span 7', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <SectionHeader>Deadline radar</SectionHeader>
                <div style={{ fontSize: 12, color: D.textDim, marginTop: 2 }}>Next 14 days</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, color: D.textDim }}>
                {[['#F97316','Tight'],['#38BDF8','Soon'],['#8896B3','Planned']].map(([col,lbl]) => (
                  <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />{lbl}
                  </span>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div style={{ position: 'relative', height: 28, marginBottom: 18 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 14, height: 2, background: 'linear-gradient(90deg, rgba(249,115,22,0.45), rgba(56,189,248,0.45), rgba(136,150,179,0.4))', borderRadius: 1 }} />
              {upcomingDeadlines.map((evt, i) => {
                const days = daysBetween(todayStr, evt.date)
                const left = Math.min(98, (days / 14) * 100)
                return (
                  <div key={i} style={{ position: 'absolute', left: `${left}%`, top: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: urgencyColor(days),
                      boxShadow: `0 0 10px ${urgencyColor(days)}80`,
                      marginTop: 9,
                      border: `2px solid ${D.bgCard}`,
                    }} />
                  </div>
                )
              })}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: -4, display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: D.textDim, fontFamily: 'ui-monospace, monospace' }}>
                <span>TODAY</span><span>+7d</span><span>+14d</span>
              </div>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
              {upcomingDeadlines.map((evt, i) => {
                const days = daysBetween(todayStr, evt.date)
                const uc = urgencyColor(days)
                return (
                  <div key={evt.id ?? i} style={{
                    display: 'grid', gridTemplateColumns: '3px 1fr 90px 50px 60px',
                    gap: 12, alignItems: 'center',
                    padding: '9px 0',
                    borderBottom: i < upcomingDeadlines.length - 1 ? `1px solid ${D.border}` : 'none',
                  }}>
                    <div style={{ width: 3, height: 22, background: evt.color?.dot ?? D.accent, borderRadius: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.name}</div>
                      <div style={{ fontSize: 11, color: D.textDim, marginTop: 1 }}>{evt.courseName}</div>
                    </div>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: D.textMuted, whiteSpace: 'nowrap' }}>{formatShortDate(evt.date)}</div>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: uc, fontWeight: 600, whiteSpace: 'nowrap' }}>{days}d</div>
                    <div style={{
                      fontSize: 10, fontWeight: 500, color: uc,
                      background: `${uc}15`, border: `1px solid ${uc}35`,
                      padding: '2px 7px', borderRadius: 999,
                      textAlign: 'center', whiteSpace: 'nowrap',
                    }}>{urgencyLabel(days)}</div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── AI COACH RECOMMENDATION (span 5) ── */}
        <div style={{
          gridColumn: upcomingDeadlines.length > 0 ? 'span 5' : 'span 12',
          background: 'linear-gradient(155deg, rgba(99,102,241,0.14) 0%, rgba(99,102,241,0.04) 45%, #0a0a1e 100%)',
          border: '1px solid rgba(99,102,241,0.28)',
          borderRadius: 14, padding: 20,
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Ambient */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)', pointerEvents: 'none' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'grid', placeItems: 'center', boxShadow: `0 0 14px ${D.accentGlow}`, color: '#fff' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.05em', color: D.textMuted, textTransform: 'uppercase' }}>AI Coach · Recommendation</div>
              <div style={{ fontSize: 11, color: D.textDim, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#818CF8', boxShadow: '0 0 6px rgba(129,140,248,0.6)' }} />
                Live · updated just now
              </div>
            </div>
          </div>

          {/* Message */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 8px', position: 'relative' }}>
            <div style={{ fontSize: 17, lineHeight: 1.45, fontWeight: 500, color: D.text, letterSpacing: -0.2, textAlign: 'center', maxWidth: 380 }}>
              {aiMessage}
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <button
              onClick={() => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0)}
              style={{
                flex: 1.2, padding: '10px 14px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                boxShadow: `0 4px 14px ${D.accentGlow}`, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <IcoStar /> Build my plan
            </button>
            <button
              onClick={() => typeof onNavigateToTutor === 'function' && onNavigateToTutor()}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${D.border}`,
                borderRadius: 8,
                fontSize: 12.5, fontWeight: 500, color: D.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <IcoMsg /> Talk to your coach
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
