import { useMemo, useEffect, useRef, useState } from 'react'
import ReferralCard from './ReferralCard'
import { useCelebration } from '../utils/useCelebration'
import { useStreak } from '../utils/useStreak'
import { getCurrentGrade, letterGrade, gradeStatus } from '../utils/gradeCalc'
import { getActivePlan, getAIQueriesUsed } from '../lib/subscription'
import { clean } from '../utils/strings'
import { daysBetween, formatShortDate } from '../utils/dateUtils'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:           '#F7F6F3',
  bgCard:       '#FFFFFF',
  border:       'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.12)',
  text:         '#111111',
  textMuted:    '#6B6B6B',
  textDim:      '#9B9B9B',
  accent:       '#E8531A',
  green:        '#16A34A',
  amber:        '#D97706',
  red:          '#DC2626',
  blue:         '#2563EB',
}

const COURSE_COLORS = ['#3B82F6', '#8B5CF6', '#059669', '#D97706', '#EC4899', '#0891B2']
const courseColor = (idx) => COURSE_COLORS[idx % COURSE_COLORS.length]

// ── Helpers ────────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`
}

function formatTime(timeStr) {
  if (!timeStr) return null
  const parts = timeStr.split(':')
  const h = Number(parts[0])
  if (isNaN(h)) return null
  const m = isNaN(Number(parts[1])) ? 0 : Number(parts[1])
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function addMinutes(timeStr, mins) {
  if (!timeStr) return null
  const parts = timeStr.split(':')
  const h = Number(parts[0])
  if (isNaN(h)) return null
  const m = isNaN(Number(parts[1])) ? 0 : Number(parts[1])
  const total = h * 60 + m + (Number(mins) || 0)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ── Inline SVG icons ───────────────────────────────────────────────────────────
const IcoFlame  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
const IcoClock  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
const IcoCheck  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
const IcoPlay   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
const IcoChevron= () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
const IcoZap    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
const IcoStar   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
const IcoMsg    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IcoBrain  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/></svg>
const IcoGrad   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10l10-4 10 4-10 4-10-4z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6"/></svg>
const IcoCards  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 9h6M7 13h4"/><path d="M21 8v10a2 2 0 01-2 2H8"/></svg>
const IcoArrowUp = () => <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M3 8l3-4 3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoArrowDown = () => <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M3 4l3 4 3-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>

// ── Label ─────────────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: D.textDim, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: D.bgCard,
        border: `1px solid ${D.border}`,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
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
  onNavigateToCalendar,
  onNavigateToProgress,
  onNavigateToGrades,
  onNavigateToTutor,
  onNavigateToTools,
  onShowPaywall,
  coachPlans,
  onOpenStudyCoach,
  schoolType,
}) {
  const plan = getActivePlan()
  const aiUsed = getAIQueriesUsed()
  const [aiChipDismissed, setAiChipDismissed] = useState(
    () => sessionStorage.getItem('studyedge_ai_chip_dismissed') === '1'
  )
  const showAiChip = plan === 'free' && aiUsed >= 7 && !aiChipDismissed
  const [trialCardDismissed, setTrialCardDismissed] = useState(
    () => localStorage.getItem('studyedge_trial_card_dismissed') === '1'
  )
  const showTrialCard = plan === 'free' && !trialCardDismissed
  const { currentStreak, recordCompletion } = useStreak()
  const celebrate = useCelebration()
  const streak = currentStreak
  const [aiBriefDismissed, setAiBriefDismissed] = useState(() =>
    sessionStorage.getItem('studyedge_brief_dismissed') === '1'
  )
  const [sessionIdx, setSessionIdx] = useState(0)
  const [upNextHovered, setUpNextHovered] = useState(false)
  const [aiBriefHovered, setAiBriefHovered] = useState(false)
  const [aiCoachHovered, setAiCoachHovered] = useState(false)

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
  const weeklyGoalHours = 10
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
        const shortName = clean(e.name).length > 18 ? clean(e.name).slice(0, 18) + '…' : clean(e.name)
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

  // AI Brief
  const aiMessage = useMemo(() => {
    if (upcomingExam && upcomingExam.days <= 7) {
      return `${clean(upcomingExam.course.name)} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}. Add focused review sessions this week to stay on track.`
    }
    if (upcomingDeadlines.length > 0) {
      const d = upcomingDeadlines[0]
      const days = daysBetween(todayStr, d.date)
      if (days <= 3) return `${clean(d.name)} is due ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}. Consider prioritizing this in your next session.`
    }
    if (weekHours > 0 && deltaHours > 0) {
      return `You're up ${deltaHours}h from last week. Keep the momentum. Consistency beats intensity every time.`
    }
    return `Stay consistent with your sessions. Small daily progress compounds into big results at exam time.`
  }, [upcomingExam, upcomingDeadlines, weekHours, deltaHours, todayStr])

  // AI Coach card
  const aiCoachMessage = useMemo(() => {
    if (upcomingExam && upcomingExam.days <= 3) {
      return `Do a full practice test for ${clean(upcomingExam.course.name)} today. Testing yourself now reveals gaps while there's still time to fix them.`
    }
    if (upcomingExam && upcomingExam.days <= 14) {
      return `Space out ${Math.min(upcomingExam.days, 3)} review sessions for ${clean(upcomingExam.course.name)} before the exam. Focus on your weakest topics first.`
    }
    if (upcomingDeadlines.length > 0) {
      const d = upcomingDeadlines[0]
      return `Work on ${clean(d.name)} in your next session. Break it into 25-minute blocks to make steady progress without burnout.`
    }
    if (weekSessionCount === 0) {
      return `Start your first session of the week today. Even 30 minutes of focused study builds the habit that carries you through exams.`
    }
    return `Open your next scheduled session and spend the first 10 minutes on active recall before reviewing your notes.`
  }, [upcomingExam, upcomingDeadlines, weekSessionCount])

  // Subtitle
  const subtitle = useMemo(() => {
    const parts = []
    if (todaySessions.length > 0) parts.push(`${todaySessions.length} session${todaySessions.length > 1 ? 's' : ''} on the schedule`)
    if (upcomingExam && upcomingExam.days <= 14) parts.push(`${clean(upcomingExam.course.name)} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}`)
    if (!parts.length) return 'Keep up the momentum. Every session counts.'
    return parts.join('. ') + '.'
  }, [todaySessions, upcomingExam])

  const urgencyColor = (d) => d <= 2 ? '#DC2626' : d <= 5 ? '#D97706' : D.textDim
  const urgencyLabel = (d) => d <= 2 ? 'Urgent' : d <= 5 ? 'Soon' : 'Planned'

  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i
  const isExamMode = schoolType === 'exam' || courses.some(c => EXAM_PATTERN.test(c.name))

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (courses.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0EFEC', border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="22" height="22" fill="none" stroke={D.textMuted} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 style={{ color: D.text, fontSize: 20, fontWeight: 600, letterSpacing: -0.3, margin: '0 0 8px' }}>
            {isExamMode ? 'Your prep plan is ready to build.' : 'Your study plan is ready to build.'}
          </h2>
          <p style={{ color: D.textMuted, fontSize: 14, lineHeight: 1.65, margin: '0 0 24px' }}>
            {isExamMode
              ? 'Add your first exam section to unlock your personalized prep schedule, session blueprints, and score tracker.'
              : 'Add your first course to unlock your personalized study schedule, session blueprints, and grade tracker.'}
          </p>
          <button
            onClick={onNavigateToCourses}
            style={{
              background: D.accent, color: '#fff',
              fontSize: 14, fontWeight: 600, padding: '11px 24px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              letterSpacing: -0.1,
            }}
          >
            {isExamMode ? 'Add your first section' : 'Add your first course'}
          </button>
          <p style={{ color: D.textDim, fontSize: 12, margin: '12px 0 0' }}>Takes about 30 seconds</p>
        </div>
      </div>
    )
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowY: 'auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
        @media (max-width: 767px) {
          .dash-header { padding: 20px 16px 6px !important; }
          .dash-grid { grid-template-columns: 1fr !important; padding: 12px 16px 48px !important; gap: 12px !important; }
          .dash-grid > * { grid-column: auto !important; }
          .dash-course-row { grid-template-columns: 4px 1fr !important; gap: 10px !important; }
          .dash-course-meta { display: none !important; }
          .dash-radar-row { grid-template-columns: 3px 1fr auto !important; gap: 10px !important; }
          .dash-radar-date { display: none !important; }
          .dash-up-next-btns { flex-wrap: wrap !important; gap: 8px !important; }
          .dash-pomodoro { display: none !important; }
          .dash-quick-actions { order: 10 !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="dash-header" style={{ padding: '28px 32px 8px' }}>
        {showAiChip && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
            borderRadius: 999, padding: '5px 14px', marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: D.amber, fontWeight: 600 }}>
              {10 - aiUsed} study boost{(10 - aiUsed) !== 1 ? 's' : ''} left this month
            </span>
            <button
              onClick={() => onShowPaywall?.('ai')}
              style={{ fontSize: 12, fontWeight: 700, color: D.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Upgrade
            </button>
            <button
              onClick={() => { sessionStorage.setItem('studyedge_ai_chip_dismissed', '1'); setAiChipDismissed(true) }}
              style={{ fontSize: 16, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 600, color: D.textDim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          {formatDateHeader(todayStr)}
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 38, fontWeight: 400, margin: 0, letterSpacing: -0.5, lineHeight: 1.15, color: D.text }}>
          {greeting()}.
        </h1>
        <p style={{ fontSize: 14, color: D.textMuted, margin: '6px 0 0', fontWeight: 400 }}>
          {subtitle}
        </p>
      </div>

      {/* ── Exam countdown banner (exam mode only) ── */}
      {isExamMode && upcomingExam && (() => {
        const d = upcomingExam.days
        const phase = d > 90 ? 0 : d > 60 ? 1 : d > 30 ? 2 : 3
        const phases = ['Content Foundation', 'Practice & Passages', 'Official Materials', 'Final Crunch']
        const phaseColors = [D.blue, D.green, D.amber, D.accent]
        const accentColor = phaseColors[phase]
        const hoursPerDay = d > 0 ? Math.max(2, Math.min(10, Math.round(300 / d))) : 8
        return (
          <div style={{ padding: '12px 32px 4px' }}>
            <div style={{
              background: D.bgCard,
              border: `1px solid ${D.border}`,
              borderLeft: `3px solid ${accentColor}`,
              borderRadius: 10,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              padding: '14px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: accentColor, lineHeight: 1 }}>{d}</span>
                  <span style={{ fontSize: 12, color: D.textMuted, fontWeight: 500 }}>days</span>
                </div>
                <div style={{ width: 1, height: 28, background: D.border, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: D.text }}>{clean(upcomingExam.course.name)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: D.textMuted }}>
                    {d <= 7 ? 'Final week. Timed practice and weak-area review only.' : `~${hoursPerDay}h/day recommended to reach your target.`}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: D.textDim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Prep phase</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: accentColor }}>{phases[phase]}</div>
                </div>
                {upcomingExam.course.targetScore && (
                  <>
                    <div style={{ width: 1, height: 28, background: D.border, flexShrink: 0 }} />
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: D.text, letterSpacing: '-0.02em' }}>{upcomingExam.course.targetScore}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Pro trial banner ── */}
      {showTrialCard && (
        <div style={{ padding: '12px 32px 4px' }}>
          <div style={{
            background: D.bgCard,
            border: `1px solid ${D.border}`,
            borderLeft: `3px solid ${D.accent}`,
            borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: D.text }}>
                Try Pro free for 7 days
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: D.textMuted, lineHeight: 1.5 }}>
                5 courses, 75 AI boosts, Study Coach, Session Blueprints. Cancel before day 7, pay nothing.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                onClick={() => onShowPaywall?.('courses')}
                style={{
                  background: D.accent,
                  border: 'none', borderRadius: 8, padding: '8px 16px',
                  fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Start free trial
              </button>
              <button
                onClick={() => { localStorage.setItem('studyedge_trial_card_dismissed', '1'); setTrialCardDismissed(true) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: 20, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grid ── */}
      <div className="dash-grid" style={{ padding: '20px 32px 48px', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>

        {/* ── CARS Daily Drill nudge (MCAT users only) ── */}
        {courses.some(c => /CARS/i.test(c.name)) && (
          <div style={{
            gridColumn: 'span 12',
            display: 'flex', alignItems: 'center', gap: 14,
            background: D.bgCard,
            border: `1px solid ${D.border}`,
            borderLeft: `3px solid ${D.blue}`,
            borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            padding: '12px 18px',
          }}>
            <div style={{ color: D.blue, flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: D.text }}>Daily CARS Drill</p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: D.textMuted }}>MCAT top scorers read one CARS passage every day. Make it the first thing you do — 10 minutes, no exceptions.</p>
            </div>
            <button
              onClick={() => onOpenStudyCoach?.()}
              style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'none', color: D.blue, border: `1px solid rgba(37,99,235,0.3)`, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Plan today's session
            </button>
          </div>
        )}

        {/* ── UP NEXT TODAY (span 8) — hero element ── */}
        <div
          onMouseEnter={() => setUpNextHovered(true)}
          onMouseLeave={() => setUpNextHovered(false)}
          onClick={() => displaySession && typeof onNavigateToCalendar === 'function' && onNavigateToCalendar(displaySession.dateStr)}
          style={{
            gridColumn: 'span 8',
            background: D.bgCard,
            border: `1px solid ${upNextHovered ? 'rgba(0,0,0,0.14)' : D.border}`,
            borderRadius: 12,
            display: 'flex', overflow: 'hidden',
            cursor: displaySession ? 'pointer' : 'default',
            boxShadow: upNextHovered ? '0 4px 12px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.08)',
            transition: 'box-shadow 0.15s, border-color 0.15s',
          }}
        >
          {/* Color bar */}
          <div style={{
            width: 4,
            background: displaySession ? (displaySession.color?.dot ?? courseColor(displaySession.courseId ?? 0)) : D.border,
            flexShrink: 0,
          }} />

          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Label>Up next today</Label>
              {uncompletedToday.length > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: D.textDim, marginRight: 6 }}>{uncompletedToday.length} queued</span>
                  {uncompletedToday.slice(0, 6).map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setSessionIdx(i) }}
                      style={{
                        width: i === sessionIdx ? 16 : 6, height: 6, borderRadius: 3,
                        background: i === sessionIdx ? D.text : D.border,
                        border: 'none', cursor: 'pointer',
                        transition: 'all 0.15s', padding: 0,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {displaySession ? (
              <>
                <div style={{ fontSize: 12, color: D.textMuted, fontWeight: 500, marginBottom: 4 }}>
                  {clean(displaySession.courseName)}
                  {displaySession.startTime && (
                    <span style={{ color: D.textDim, marginLeft: 8 }}>
                      {formatTime(displaySession.startTime)} &rarr; {formatTime(addMinutes(displaySession.startTime, displaySession.duration ?? 60))}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.4, color: D.text, lineHeight: 1.2, marginBottom: 'auto' }}>
                  {displaySession.sessionType ?? 'Study Session'}
                  {displaySession.duration ? (
                    <span style={{ fontSize: 16, fontWeight: 400, color: D.textMuted, marginLeft: 10 }}>{displaySession.duration} min</span>
                  ) : null}
                </div>

                <div className="dash-up-next-btns" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStartFocus && onStartFocus(displaySession) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      background: D.accent, color: '#fff',
                      padding: '10px 18px', borderRadius: 8,
                      fontSize: 13.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                    }}
                  >
                    <IcoPlay /> Start session
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(displaySession.id) }}
                    style={{ fontSize: 13, color: D.textMuted, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Mark done
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSessionIdx(i => (i + 1) % Math.max(uncompletedToday.length, 1)) }}
                    style={{ fontSize: 13, color: D.textMuted, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Skip
                  </button>
                  <div className="dash-pomodoro" style={{ marginLeft: 'auto', fontSize: 11, color: D.textDim, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IcoZap /> Pomodoro · 25 + 5
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 10 }}>
                  AI-structured session blocks · recall checkpoints
                </div>
              </>
            ) : (
              <div style={{ paddingTop: 8 }}>
                {isExamMode && allSessions.length === 0 ? (
                  <>
                    <p style={{ color: D.textMuted, fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
                      Head to Study Coach to build your full prep schedule.
                    </p>
                    <button
                      onClick={() => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0)}
                      style={{ background: D.accent, color: '#fff', fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                    >
                      Open Study Coach
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ color: D.textMuted, fontSize: 14, marginBottom: 0 }}>No sessions scheduled for today.</p>
                    <button
                      onClick={() => typeof onAddSession === 'function' && onAddSession()}
                      style={{ marginTop: 12, background: 'none', color: D.accent, fontSize: 13, fontWeight: 600, padding: 0, border: 'none', cursor: 'pointer' }}
                    >
                      Add a session
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── QUICK ACTIONS (span 4) ── */}
        <Card className="dash-quick-actions" style={{ gridColumn: 'span 4', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>
          <Label style={{ padding: '0 4px', marginBottom: 12 }}>Quick actions</Label>
          <div style={{ marginBottom: 8 }} />
          {[
            { icon: <IcoBrain />, label: 'Study Coach', sub: 'AI-powered weekly plan', onClick: () => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0) },
            { icon: <IcoGrad />, label: 'Grade Hub', sub: 'Track grades and targets', onClick: () => typeof onNavigateToGrades === 'function' && onNavigateToGrades(0) },
            { icon: <IcoCards />, label: 'Review flashcards', sub: 'Test your knowledge', onClick: () => typeof onNavigateToTools === 'function' && onNavigateToTools() },
          ].map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', borderRadius: 8, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', width: '100%', transition: 'background 0.12s', borderBottom: i < 2 ? `1px solid ${D.border}` : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: D.textMuted, flexShrink: 0 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: D.text }}>{a.label}</div>
                <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 1 }}>{a.sub}</div>
              </div>
              <span style={{ color: D.textDim }}><IcoChevron /></span>
            </button>
          ))}
        </Card>

        {/* ── AI BRIEF (span 12) — no badge, just the text ── */}
        {!aiBriefDismissed && (
          <Card
            style={{
              gridColumn: 'span 12',
              padding: '18px 22px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Label style={{ marginBottom: 8 }}>Today's brief</Label>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: D.text, fontWeight: 400 }}>
                  {aiMessage}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start', paddingTop: 2 }}>
                <button
                  onClick={() => typeof onNavigateToCalendar === 'function' && onNavigateToCalendar()}
                  style={{ fontSize: 12, fontWeight: 600, color: D.text, padding: '7px 13px', borderRadius: 7, border: `1px solid ${D.borderStrong}`, background: 'none', cursor: 'pointer' }}
                >
                  View schedule
                </button>
                <button
                  onClick={() => { sessionStorage.setItem('studyedge_brief_dismissed', '1'); setAiBriefDismissed(true) }}
                  style={{ fontSize: 16, color: D.textDim, padding: '5px 6px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ── COURSES (span 6) ── */}
        <Card style={{ gridColumn: 'span 6', padding: '20px 0' }} onClick={onNavigateToCourses}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 14 }}>
            <Label>{isExamMode ? 'Sections' : 'Courses'}</Label>
            <span style={{ fontSize: 12, color: D.textMuted, cursor: 'pointer' }}>View all</span>
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

            return (
              <div key={idx} className="dash-course-row" style={{
                display: 'grid', gridTemplateColumns: '4px 1fr 180px 80px',
                gap: 16, alignItems: 'center',
                padding: '11px 20px',
                borderTop: `1px solid ${D.border}`,
              }}>
                <div style={{ width: 4, height: 24, background: color, borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: D.text }}>{clean(course.name)}</div>
                  <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 2 }}>
                    {lastLabel ? `Last session ${lastLabel}` : 'No sessions yet'}
                  </div>
                </div>
                <div className="dash-course-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 3, background: '#EEECE8', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${prog.pct}%`, height: '100%', background: color }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: D.textMuted, width: 30, textAlign: 'right', flexShrink: 0 }}>{prog.pct}%</span>
                </div>
                <div className="dash-course-meta" style={{ fontSize: 11.5, color: D.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dueNext ?? ''}
                </div>
              </div>
            )
          })}
        </Card>

        {/* ── THIS WEEK (span 6) ── */}
        <Card style={{ gridColumn: 'span 6', padding: 20 }} onClick={onNavigateToProgress}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Label>This week</Label>
            <span style={{ fontSize: 12, color: onPace ? D.green : D.amber, fontWeight: 600 }}>
              {onPace ? 'On pace' : 'Behind'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              {
                label: 'Study streak',
                value: streak,
                unit: streak === 1 ? 'day' : 'days',
                delta: streak,
                positive: streak > 0,
                icon: <IcoFlame />,
              },
              {
                label: 'Hours studied',
                value: weekHours,
                unit: 'hrs',
                delta: deltaHours,
                positive: deltaHours >= 0,
                icon: <IcoClock />,
              },
              {
                label: 'Sessions done',
                value: weekSessionCount,
                unit: '',
                delta: deltaSessions,
                positive: deltaSessions >= 0,
                icon: <IcoCheck />,
              },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 0',
                borderBottom: i < 2 ? `1px solid ${D.border}` : 'none',
              }}>
                <span style={{ color: D.textDim, flexShrink: 0 }}>{stat.icon}</span>
                <div style={{ flex: 1, fontSize: 13, color: D.textMuted }}>{stat.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: D.text, letterSpacing: -0.5 }}>{stat.value}</span>
                  {stat.unit && <span style={{ fontSize: 12, color: D.textMuted }}>{stat.unit}</span>}
                </div>
                {stat.delta !== undefined && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    fontSize: 11, color: stat.positive ? D.green : D.red,
                    background: stat.positive ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                    padding: '3px 7px', borderRadius: 5, flexShrink: 0,
                  }}>
                    {stat.positive ? <IcoArrowUp /> : <IcoArrowDown />}
                    {stat.positive ? '+' : ''}{stat.delta}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: D.textDim, marginBottom: 6 }}>
              <span>Weekly goal</span>
              <span>{weekHours} of {weeklyGoalHours}h</span>
            </div>
            <div style={{ height: 4, background: '#EEECE8', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${goalPct}%`, height: '100%', background: onPace ? D.green : D.amber, borderRadius: 2 }} />
            </div>
          </div>
        </Card>

        {/* ── DEADLINE RADAR (span 7) ── */}
        {upcomingDeadlines.length > 0 && (
          <Card style={{ gridColumn: 'span 7', padding: 20 }} onClick={onNavigateToCalendar}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Label>Upcoming deadlines</Label>
                <div style={{ fontSize: 12, color: D.textDim, marginTop: 2 }}>Next 14 days</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: D.textDim }}>
                {[['#DC2626','Urgent'],['#D97706','Soon'],['#9B9B9B','Planned']].map(([col,lbl]) => (
                  <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />{lbl}
                  </span>
                ))}
              </div>
            </div>

            {/* Timeline bar */}
            <div style={{ position: 'relative', height: 24, marginBottom: 16 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1, background: D.border }} />
              {upcomingDeadlines.map((evt, i) => {
                const days = daysBetween(todayStr, evt.date)
                const left = Math.min(98, (days / 14) * 100)
                return (
                  <div key={i} style={{ position: 'absolute', left: `${left}%`, top: 0, transform: 'translateX(-50%)' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: urgencyColor(days),
                      marginTop: 8,
                      border: `2px solid ${D.bgCard}`,
                    }} />
                  </div>
                )
              })}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: -2, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: D.textDim }}>
                <span>Today</span><span>+7d</span><span>+14d</span>
              </div>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {upcomingDeadlines.map((evt, i) => {
                const days = daysBetween(todayStr, evt.date)
                const uc = urgencyColor(days)
                return (
                  <div key={evt.id ?? i} className="dash-radar-row" style={{
                    display: 'grid', gridTemplateColumns: '3px 1fr 70px 55px',
                    gap: 12, alignItems: 'center',
                    padding: '10px 0',
                    borderTop: i > 0 ? `1px solid ${D.border}` : 'none',
                  }}>
                    <div style={{ width: 3, height: 20, background: evt.color?.dot ?? D.borderStrong, borderRadius: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(evt.name)}</div>
                      <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 1 }}>{clean(evt.courseName)}</div>
                    </div>
                    <div className="dash-radar-date" style={{ fontSize: 11.5, color: D.textMuted, whiteSpace: 'nowrap' }}>{formatShortDate(evt.date)}</div>
                    <div style={{ fontSize: 12, color: uc, fontWeight: 600, whiteSpace: 'nowrap' }}>{days}d · {urgencyLabel(days)}</div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── AI COACH RECOMMENDATION (span 5 or 12) ── */}
        <Card
          style={{
            gridColumn: upcomingDeadlines.length > 0 ? 'span 5' : 'span 12',
            padding: 20,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <Label style={{ marginBottom: 12 }}>Study Coach recommendation</Label>

          <p style={{ margin: '0 0 auto', fontSize: 15, lineHeight: 1.6, color: D.textMuted, fontWeight: 400, flex: 1 }}>
            {aiCoachMessage}
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={() => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0)}
              style={{
                flex: 1, padding: '9px 14px',
                background: D.text,
                border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <IcoStar /> Build my plan
            </button>
            <button
              onClick={() => typeof onNavigateToTutor === 'function' && onNavigateToTutor()}
              style={{
                flex: 1, padding: '9px 14px',
                background: 'none',
                border: `1px solid ${D.borderStrong}`,
                borderRadius: 8,
                fontSize: 13, fontWeight: 500, color: D.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <IcoMsg /> Talk to your coach
            </button>
          </div>
        </Card>

        {/* ── Referral card (free users only) ── */}
        {plan === 'free' && (
          <div style={{ gridColumn: 'span 12' }}>
            <ReferralCard />
          </div>
        )}

      </div>
    </div>
  )
}
