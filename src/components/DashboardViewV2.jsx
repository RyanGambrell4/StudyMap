import { useMemo, useState, useEffect, useCallback } from 'react'
import { useStreak } from '../utils/useStreak'
import { getWeeklyGoal, computeWeeklyProgress } from '../lib/weeklyGoal'
import { getMasteryForCourse, getDueForReview } from '../lib/masteryStore'
import { daysBetween } from '../utils/dateUtils'
import MissionControlCard from './MissionControlCard'
import { track } from '../lib/analytics'

// ── Design tokens (from handoff doc — do not deviate) ─────────────────────────
const T = {
  bg:        '#F7F8FA',
  card:      '#FFFFFF',
  border:    'rgba(0,0,0,0.07)',
  text:      '#1C1B18',
  muted:     '#5C5952',
  dim:       '#6E6B64',
  blue:      '#3452D9',
  blueHov:   '#2A43B8',
  red:       '#D64545',
  redBg:     'rgba(214,69,69,0.08)',
  amber:     '#8A6A2E',
  amberBg:   'rgba(232,177,74,0.18)',
  neutral:   '#696E78',
  neutralBg: '#EFF1F4',
}

const SERIF = "'Source Serif 4', Georgia, serif"
const SANS  = "'Inter', system-ui, sans-serif"

const COURSE_COLORS = [
  { dot: '#8B5CF6', halo: 'rgba(139,92,246,0.15)' },
  { dot: '#10A56E', halo: 'rgba(16,165,110,0.15)' },
  { dot: '#3B62E8', halo: 'rgba(59,98,232,0.15)' },
  { dot: '#F59E0B', halo: 'rgba(245,158,11,0.15)' },
  { dot: '#EC4899', halo: 'rgba(236,72,153,0.15)' },
  { dot: '#0891B2', halo: 'rgba(8,145,178,0.15)' },
]
const courseColor = (idx) => COURSE_COLORS[idx % COURSE_COLORS.length]

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`.toUpperCase()
}

function shortDate(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00')
  const dns = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  return `${dns[d.getDay()]} ${d.getDate()}`
}

function examBadgeLabel(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00')
  const dns = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const mos = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${dns[d.getDay()]} · ${mos[d.getMonth()]} ${d.getDate()}`
}

function daysUntil(dateStr, todayStr) {
  return daysBetween(todayStr, dateStr)
}

function chipLabel(daysAway) {
  if (daysAway <= 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  if (daysAway <= 6) return `${daysAway} days`
  return 'Next week'
}

function chipColors(daysAway) {
  if (daysAway <= 1) return { color: T.red, bg: T.redBg }
  if (daysAway <= 3) return { color: T.amber, bg: T.amberBg }
  return { color: T.neutral, bg: T.neutralBg }
}

function sessionTypeLabel(type) {
  if (!type) return 'study session'
  const map = {
    'Lecture Review':    'lecture review',
    'Deep Dive':         'deep dive',
    'Practice Problems': 'practice problems',
    'Past Exam Paper':   'past exam practice',
    'Flashcard Drill':   'flashcard drill',
    'Spaced Review':     'spaced review',
    'Recall Challenge':  'recall challenge',
    'Quick Quiz':        'quick quiz',
    'Essay Outline':     'essay outline',
    'Concept Map':       'concept map',
  }
  return map[type] ?? type.toLowerCase()
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoCheck = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12.5l5.5 5.5L20 6.5"/>
  </svg>
)

const IcoFlame = ({ color = '#F5820B', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2c1 3.5-.7 5.2-2 6.6C8.6 10 7.5 11.3 7.5 14a4.5 4.5 0 0 0 9 0c0-1.2-.4-2.2-1-3-.3 1-.9 1.6-1.7 2 .4-2.6-.3-5.4-1.8-7.4A11 11 0 0 0 12 2z"/>
  </svg>
)

const IcoChevron = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B8B5AE" strokeWidth="2.2" strokeLinecap="round">
    <path d="M9 5l7 7-7 7"/>
  </svg>
)

const IcoZap = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8780" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z"/>
  </svg>
)

const IcoPencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8780" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
)

const IcoHeadphones = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8780" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14v-2a8 8 0 0 1 16 0v2"/>
    <rect x="3" y="14" width="4" height="6" rx="1.5"/>
    <rect x="17" y="14" width="4" height="6" rx="1.5"/>
  </svg>
)

// ── Recall tooltip ────────────────────────────────────────────────────────────
function RecallTip({ children, tip }) {
  const [vis, setVis] = useState(false)
  return (
    <span
      style={{ position: 'relative', borderBottom: '1px dotted rgba(0,0,0,0.35)', cursor: 'help', display: 'inline' }}
      onMouseEnter={() => setVis(true)}
      onMouseLeave={() => setVis(false)}
    >
      {children}
      {vis && (
        <span style={{
          position: 'absolute',
          left: '50%',
          bottom: 'calc(100% + 8px)',
          transform: 'translateX(-50%)',
          background: '#1C1B18',
          color: '#fff',
          fontSize: 11.5,
          lineHeight: 1.45,
          padding: '8px 11px',
          borderRadius: 7,
          width: 220,
          textAlign: 'center',
          zIndex: 30,
          whiteSpace: 'normal',
          fontWeight: 400,
          pointerEvents: 'none',
          display: 'block',
        }}>
          {tip}
        </span>
      )}
    </span>
  )
}

// ── Exam Banner ───────────────────────────────────────────────────────────────
function ExamBanner({ course, todayStr }) {
  const days = daysUntil(course.examDate, todayStr)
  const label = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${T.red}`,
      borderRadius: 12,
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 4px 16px rgba(23,30,55,0.06),0 1px 3px rgba(23,30,55,0.04)',
      marginBottom: -32,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
          {course.name} exam {label}
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
          Today's session targets the topics most likely to show up.
        </div>
      </div>
      <div style={{
        flexShrink: 0,
        fontSize: 11.5,
        fontWeight: 600,
        color: T.red,
        background: T.redBg,
        borderRadius: 999,
        padding: '4px 11px',
        whiteSpace: 'nowrap',
      }}>
        {examBadgeLabel(course.examDate)}
      </div>
    </div>
  )
}

// ── Hero: Normal ──────────────────────────────────────────────────────────────
function HeroNormal({ nextSession, avgRecall, dueCount, payoffLine, onStartFocus, onNavigateToCalendar }) {
  const [hov, setHov] = useState(false)
  const recallAfter = avgRecall != null ? Math.min(95, avgRecall + 8) : null

  return (
    <div style={{
      background: 'linear-gradient(180deg,rgba(52,82,217,.07) 0%,rgba(52,82,217,.025) 40%,rgba(255,255,255,.9) 100%),#fff',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(52,82,217,0.14)',
      borderRadius: 16,
      padding: '64px 48px 48px',
      textAlign: 'center',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85),0 12px 32px rgba(23,30,55,0.10),0 4px 12px rgba(52,82,217,0.08)',
    }}>
      <button
        onClick={() => nextSession && onStartFocus(nextSession)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        disabled={!nextSession}
        style={{
          fontFamily: SANS,
          background: hov ? T.blueHov : T.blue,
          color: '#fff',
          border: 'none',
          borderRadius: 13,
          fontSize: 16.5,
          fontWeight: 600,
          width: 280,
          padding: '16px 0',
          cursor: nextSession ? 'pointer' : 'default',
          boxShadow: hov ? '0 8px 22px rgba(52,82,217,0.36)' : '0 6px 18px rgba(52,82,217,0.28)',
          transform: hov ? 'translateY(-1px)' : 'none',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
          opacity: nextSession ? 1 : 0.6,
          display: 'block',
          margin: '0 auto',
        }}
      >
        {nextSession ? 'Start next session' : 'No sessions scheduled'}
      </button>

      <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginTop: 22 }}>
        {nextSession ? (
          <>
            {nextSession.duration}-min {sessionTypeLabel(nextSession.sessionType)} · {nextSession.courseName} ·{' '}
            {recallAfter != null ? (
              <RecallTip tip="If your exam were today, you'd remember about this much of the material.">
                gets recall to ~{recallAfter}%
              </RecallTip>
            ) : dueCount > 0 ? (
              <span>{dueCount} flashcards due</span>
            ) : (
              <span>stay on track</span>
            )}
          </>
        ) : (
          'You are all caught up for now.'
        )}
      </div>

      {payoffLine && nextSession && (
        <div style={{ fontSize: 13.5, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
          {payoffLine}
        </div>
      )}

      <a
        href="#"
        onClick={(e) => { e.preventDefault(); onNavigateToCalendar?.() }}
        style={{
          display: 'inline-block',
          fontSize: 12.5,
          fontWeight: 500,
          color: T.blue,
          marginTop: 18,
          borderBottom: '1px solid rgba(52,82,217,0.3)',
          textDecoration: 'none',
        }}
      >
        change session
      </a>
    </div>
  )
}

// ── Hero: Done for today ───────────────────────────────────────────────────────
function HeroDone({ streak, weeklyMinutes, weeklyGoalHours, nextSession }) {
  const hoursThis   = weeklyMinutes / 60
  const pct         = Math.min(100, Math.round((hoursThis / weeklyGoalHours) * 100))
  const hoursLabel  = `${hoursThis.toFixed(1)} of ${weeklyGoalHours} hrs this week`
  const tomorrowLabel = nextSession
    ? `Tomorrow: ${nextSession.duration}-min ${sessionTypeLabel(nextSession.sessionType)}, ${nextSession.courseName}.`
    : null

  return (
    <div style={{
      background: 'linear-gradient(180deg,rgba(52,82,217,.07) 0%,rgba(52,82,217,.025) 40%,rgba(255,255,255,.9) 100%),#fff',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(52,82,217,0.14)',
      borderRadius: 16,
      padding: '64px 48px 48px',
      textAlign: 'center',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85),0 12px 32px rgba(23,30,55,0.10),0 4px 12px rgba(52,82,217,0.08)',
    }}>
      <div style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: T.blue,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 18px rgba(52,82,217,0.28)',
      }}>
        <IcoCheck size={24} />
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, marginTop: 20 }}>
        Done for today. Streak at {streak} {streak === 1 ? 'day' : 'days'}.
      </div>
      <div style={{ maxWidth: 340, margin: '22px auto 0' }}>
        <div style={{ height: 6, background: '#EAECF0', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: T.blue, borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>{hoursLabel}</div>
      </div>
      {tomorrowLabel && (
        <div style={{ fontSize: 13.5, color: T.muted, marginTop: 22 }}>{tomorrowLabel}</div>
      )}
    </div>
  )
}

// ── Hero: New user ────────────────────────────────────────────────────────────
function SetupRow({ step, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        background: hov ? '#FAF9F7' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      {step.done ? (
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: T.blue,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <IcoCheck size={11} />
        </div>
      ) : (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          border: '1.5px solid rgba(0,0,0,0.18)', flexShrink: 0,
        }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{step.title}</div>
        <div style={{ fontSize: 12.5, color: T.dim, marginTop: 1 }}>{step.hint}</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B8B5AE" strokeWidth="2.2" strokeLinecap="round">
        <path d="M9 5l7 7-7 7"/>
      </svg>
    </div>
  )
}

function HeroNewUser({ setupSteps, onStepClick }) {
  const done  = setupSteps.filter(s => s.done).length
  const total = setupSteps.length
  const pct   = Math.round((done / total) * 100)
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: '38px 44px',
      boxShadow: '0 12px 32px rgba(23,30,55,0.10),0 4px 12px rgba(23,30,55,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 16.5, fontWeight: 600 }}>Set up your study plan</div>
        <div style={{ fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }}>{done} of {total} done</div>
      </div>
      <div style={{ height: 4, background: '#EFEDE8', borderRadius: 2, margin: '14px 0 20px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: T.blue, borderRadius: 2 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {setupSteps.map((step, i) => (
          <SetupRow key={i} step={step} onClick={() => onStepClick?.(step)} />
        ))}
      </div>
      <div style={{ fontSize: 13, color: T.muted, marginTop: 16, textAlign: 'center' }}>
        Two minutes, then your first session is one click away.
      </div>
    </div>
  )
}

// ── Stat strip ────────────────────────────────────────────────────────────────
function StatStrip({ streak, weeklyMinutes, weeklyGoalHours, sessionsThisWeek, isNewUser }) {
  const hoursThis  = weeklyMinutes / 60
  const pct        = Math.min(100, Math.round((hoursThis / weeklyGoalHours) * 100))
  const weeklyLabel = `${hoursThis.toFixed(1)} of ${weeklyGoalHours} hrs this week`

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 10, padding: '0 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isNewUser ? (
          <>
            <IcoFlame color="#C9C6BF" size={16} />
            <span style={{ fontSize: 13, color: T.dim }}>Streak starts with your first session</span>
          </>
        ) : (
          <>
            <IcoFlame />
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{streak}-day streak</span>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)', margin: '0 22px', flexShrink: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {isNewUser ? (
          <>
            <div style={{ flex: 1, height: 6, background: '#EAECF0', borderRadius: 3, minWidth: 60 }} />
            <span style={{ fontSize: 13, color: T.dim, flexShrink: 0 }}>Weekly goal: not set yet</span>
          </>
        ) : (
          <>
            <div style={{ flex: 1, height: 6, background: '#EAECF0', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: T.blue, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 13, color: T.muted, flexShrink: 0, whiteSpace: 'nowrap' }}>{weeklyLabel}</span>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)', margin: '0 22px', flexShrink: 0 }} />

      <div style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
        {isNewUser ? (
          <span style={{ fontSize: 13, color: T.dim }}>Sessions show up here</span>
        ) : (
          <span style={{ fontSize: 13, color: T.muted }}>
            <span style={{ fontWeight: 600, color: T.text }}>{sessionsThisWeek}</span> sessions this week
          </span>
        )}
      </div>
    </div>
  )
}

// ── Course row ────────────────────────────────────────────────────────────────
function CourseRow({ course, idx, todayStr, recall, onClick }) {
  const [hov, setHov] = useState(false)
  const col  = courseColor(idx)
  const days = course.examDate ? daysUntil(course.examDate, todayStr) : null

  let status     = 'On track'
  let statusColor = T.muted
  let showTip    = false
  const tipText  = "If your exam were today, you'd remember about this much of the material."

  if (days !== null && days >= 0 && days <= 7) {
    const dns = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const d   = new Date(course.examDate + 'T12:00:00')
    const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `Exam ${dns[d.getDay()]}`
    status      = recall != null ? `${when} · recall ${recall}%` : when
    statusColor = T.text
    showTip     = recall != null
  } else if (days !== null && days > 7 && days <= 21) {
    status = recall != null ? `${days} days · recall ${recall}%` : `${days} days to exam`
  } else if (recall != null && recall < 60) {
    status = `Recall ${recall}%. Needs work.`
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 10px',
        margin: '0 -10px',
        borderRadius: 10,
        cursor: 'pointer',
        background: hov ? '#F3F5F9' : 'transparent',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        transition: 'background 0.12s',
      }}
    >
      <div style={{
        width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
        background: col.dot, boxShadow: `0 0 0 3px ${col.halo}`,
      }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: '#141310' }}>
        {course.name}
      </div>
      <div style={{ flexShrink: 0, fontSize: 13, color: statusColor }}>
        {showTip ? <RecallTip tip={tipText}>{status}</RecallTip> : status}
      </div>
      <IcoChevron />
    </div>
  )
}

// ── Courses card ──────────────────────────────────────────────────────────────
function CoursesCard({ courses, todayStr, courseMastery, isNewUser, onNavigateToCourses, onNavigateToGrades }) {
  const sorted = useMemo(() => {
    return [...courses]
      .map((c, idx) => {
        const days   = c.examDate ? daysUntil(c.examDate, todayStr) : Infinity
        const recall = courseMastery[String(c.id ?? idx)]
        return { course: c, idx, days, recall }
      })
      .sort((a, b) => {
        if (a.days !== b.days) return a.days - b.days
        const ra = a.recall ?? 100
        const rb = b.recall ?? 100
        return ra - rb
      })
      .slice(0, 3)
  }, [courses, todayStr, courseMastery])

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: '30px 36px',
      boxShadow: '0 4px 16px rgba(23,30,55,0.06),0 1px 3px rgba(23,30,55,0.04)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: T.dim, marginBottom: 6,
      }}>
        Your courses
      </div>

      {isNewUser ? (
        <div style={{ textAlign: 'center', padding: '22px 0 10px' }}>
          <div style={{ fontSize: 14.5, fontWeight: 500 }}>Add your first course</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 5, lineHeight: 1.5 }}>
            Courses you add show up here, sorted by what needs attention.
          </div>
          <button
            onClick={onNavigateToCourses}
            style={{
              fontFamily: SANS, marginTop: 16, background: T.card,
              color: T.blue, border: '1px solid rgba(52,82,217,0.4)',
              borderRadius: 10, fontSize: 13.5, fontWeight: 600,
              padding: '9px 22px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            + Add a course
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sorted.map(({ course, idx, recall }) => (
              <CourseRow
                key={course.id ?? idx}
                course={course}
                idx={idx}
                todayStr={todayStr}
                recall={recall}
                onClick={() => onNavigateToGrades?.(idx)}
              />
            ))}
          </div>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); onNavigateToCourses?.() }}
            style={{
              display: 'inline-block', fontSize: 13, fontWeight: 500,
              color: T.blue, marginTop: 14, textDecoration: 'none',
            }}
          >
            View all courses
          </a>
        </>
      )}
    </div>
  )
}

// ── Deadline row ──────────────────────────────────────────────────────────────
function DeadlineRow({ item }) {
  const [hov, setHov] = useState(false)
  const { color, bg } = chipColors(item.daysAway)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '13px 10px', margin: '0 -10px', borderRadius: 10,
        cursor: 'default',
        background: hov ? '#F3F5F9' : 'transparent',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ flexShrink: 0, width: 64, fontSize: 12.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
        {item.dateLabel}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600, color: '#141310' }}>
        {item.label}
      </div>
      <div style={{
        flexShrink: 0, fontSize: 11.5, fontWeight: 600,
        borderRadius: 999, padding: '3px 10px', color, background: bg,
      }}>
        {item.chip}
      </div>
      <IcoChevron />
    </div>
  )
}

// ── Deadlines card ────────────────────────────────────────────────────────────
function DeadlinesCard({ deadlines, isNewUser }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: '30px 36px',
      boxShadow: '0 4px 16px rgba(23,30,55,0.06),0 1px 3px rgba(23,30,55,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: T.dim, whiteSpace: 'nowrap',
        }}>
          Upcoming deadlines
        </div>
        <div style={{ fontSize: 12, color: '#9A978F', whiteSpace: 'nowrap' }}>Next 14 days</div>
      </div>

      {isNewUser ? (
        <div style={{ fontSize: 13.5, color: T.dim, padding: '20px 0 8px', lineHeight: 1.5 }}>
          Nothing on the calendar yet. Add exam dates and we'll map your next two weeks here.
        </div>
      ) : deadlines.length === 0 ? (
        <div style={{ fontSize: 13.5, color: T.dim, padding: '16px 0 8px', lineHeight: 1.5 }}>
          Nothing due in the next 14 days. You are ahead of schedule.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
          {deadlines.map((d, i) => <DeadlineRow key={i} item={d} />)}
        </div>
      )}
    </div>
  )
}

// ── Study tools row ───────────────────────────────────────────────────────────
function StudyToolsRow({ onNavigateToTools, onOpenQuizBurst, onOpenBrainDump, onOpenPodcast }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onNavigateToTools}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: T.card,
        border: `1px solid ${hov ? 'rgba(52,82,217,0.35)' : T.border}`,
        borderRadius: 14, padding: '19px 28px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 4px 16px rgba(23,30,55,0.06),0 1px 3px rgba(23,30,55,0.04)',
        cursor: 'pointer', color: T.text,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Explore Study Tools</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: T.dim, fontSize: 12.5 }}>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={(e) => { e.stopPropagation(); onOpenQuizBurst?.() }}
        >
          <IcoZap /> Quiz Burst
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={(e) => { e.stopPropagation(); onOpenBrainDump?.() }}
        >
          <IcoPencil /> Brain Dump
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={(e) => { e.stopPropagation(); onOpenPodcast?.() }}
        >
          <IcoHeadphones /> Podcast
        </span>
      </div>
      <IcoChevron />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════════════════
export default function DashboardViewV2({
  courses = [],
  todayStr,
  allSessions = [],
  syllabusEventsByDate = {},
  completedIds,
  nextSession,
  allComplete,
  completedSessions = [],
  weeklyHourGoal,
  assignments = [],
  onStartFocus,
  onNavigateToCourses,
  onNavigateToCalendar,
  onNavigateToGrades,
  onNavigateToTools,
  onOpenQuizBurst,
  onOpenBrainDump,
  onOpenPodcast,
  onShowPaywall,
  onOpenSessionBundle,
  onOpenCourseDiagnostic,
}) {
  // Inject Source Serif 4 font once
  useEffect(() => {
    if (document.querySelector('link[data-serif4]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.setAttribute('data-serif4', '1')
    link.href = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap'
    document.head.appendChild(link)
  }, [])

  const { currentStreak } = useStreak()
  const weeklyGoal = useMemo(() => getWeeklyGoal(todayStr), [todayStr])
  const weeklyProgress = useMemo(
    () => computeWeeklyProgress(completedSessions, todayStr),
    [completedSessions, todayStr]
  )

  // Per-course average recall from masteryStore
  const courseMastery = useMemo(() => {
    const map = {}
    courses.forEach((c, idx) => {
      const id     = String(c.id ?? idx)
      const topics = getMasteryForCourse(id)
      if (topics.length > 0) {
        map[id] = Math.round(topics.reduce((s, t) => s + t.score, 0) / topics.length)
      }
    })
    return map
  }, [courses])

  // Hero mode
  const isNewUser = courses.length === 0
  const doneForToday = useMemo(() => {
    if (isNewUser) return false
    const todaySessions = allSessions.filter(s => s.dateStr === todayStr)
    return todaySessions.length > 0 && todaySessions.every(s => completedIds.has(s.id))
  }, [allSessions, completedIds, todayStr, isNewUser])

  // Next session after today (for done-state preview)
  const nextDaySession = useMemo(() => {
    if (!doneForToday) return null
    return allSessions.find(s => s.dateStr > todayStr && !completedIds.has(s.id)) ?? null
  }, [allSessions, completedIds, todayStr, doneForToday])

  // Exam banner: soonest course with exam in 0-7 days
  const examBannerCourse = useMemo(() => {
    return courses
      .filter(c => {
        if (!c.examDate) return false
        const d = daysUntil(c.examDate, todayStr)
        return d >= 0 && d <= 7
      })
      .sort((a, b) => daysUntil(a.examDate, todayStr) - daysUntil(b.examDate, todayStr))[0] ?? null
  }, [courses, todayStr])

  // Payoff line + recall info for hero
  const { payoffLine, avgRecall, dueCount } = useMemo(() => {
    if (!nextSession) return { payoffLine: null, avgRecall: null, dueCount: 0 }
    const cid    = String(nextSession.courseId)
    const topics = getMasteryForCourse(cid)
    const avg    = topics.length > 0
      ? Math.round(topics.reduce((s, t) => s + t.score, 0) / topics.length)
      : null
    const weak   = topics.filter(t => t.score < 55).sort((a, b) => a.score - b.score)
    const due    = getDueForReview(cid).length

    let line = null
    if (weak.length > 0) {
      line = `${weak[0].topic} is your weakest area right now. This session closes the gap.`
    } else if (avg != null && avg < 70) {
      line = `${nextSession.courseName} recall is below target. This session builds it back up.`
    } else if (avg != null) {
      line = `You're making progress. Keep the streak going.`
    }

    return { payoffLine: line, avgRecall: avg, dueCount: due }
  }, [nextSession])

  // Deadlines: exams + assignments + syllabus events in next 14 days
  const deadlines = useMemo(() => {
    const cutoff = new Date(todayStr + 'T12:00:00')
    cutoff.setDate(cutoff.getDate() + 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const items = []

    // Course exams
    courses.forEach(c => {
      if (!c.examDate || c.examDate < todayStr || c.examDate > cutoffStr) return
      const days = daysUntil(c.examDate, todayStr)
      items.push({
        dateStr:   c.examDate,
        dateLabel: shortDate(c.examDate),
        label:     `${c.name} exam`,
        daysAway:  days,
        chip:      chipLabel(days),
      })
    })

    // Syllabus events
    Object.entries(syllabusEventsByDate).forEach(([dateStr, events]) => {
      if (!dateStr || dateStr < todayStr || dateStr > cutoffStr) return
      const days = daysUntil(dateStr, todayStr)
      ;(events ?? []).forEach(e => {
        items.push({
          dateStr,
          dateLabel: shortDate(dateStr),
          label:     e.name ?? e.title ?? e.type ?? 'Event',
          daysAway:  days,
          chip:      chipLabel(days),
        })
      })
    })

    // Assignments not yet completed
    assignments.forEach(a => {
      if (!a.dueDate || a.dueDate < todayStr || a.dueDate > cutoffStr) return
      if (a.status === 'completed' || a.loggedGrade != null) return
      const days = daysUntil(a.dueDate, todayStr)
      items.push({
        dateStr:   a.dueDate,
        dateLabel: shortDate(a.dueDate),
        label:     a.name ?? 'Assignment',
        daysAway:  days,
        chip:      chipLabel(days),
      })
    })

    return items
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
      .slice(0, 4)
  }, [courses, syllabusEventsByDate, assignments, todayStr])

  // Setup steps for new user
  const setupSteps = useMemo(() => {
    const hasCourses  = courses.length > 0
    const hasExams    = courses.some(c => c.examDate)
    const hasGoal     = weeklyGoal.declared
    return [
      { title: 'Add your courses',  hint: 'Pick from your school or type them in',  done: hasCourses },
      { title: 'Set exam dates',    hint: 'So sessions ramp up at the right time',  done: hasExams   },
      { title: 'Set a weekly goal', hint: 'Most students start with 5 hours',        done: hasGoal   },
    ]
  }, [courses, weeklyGoal])

  const handleStepClick = useCallback((step) => {
    track('setup_step_clicked', { step: step.title })
    if (step.title === 'Add your courses' || step.title === 'Set exam dates') {
      onNavigateToCourses?.()
    }
    // "Set a weekly goal" has no dedicated page — navigate to courses for now
    else {
      onNavigateToCourses?.()
    }
  }, [onNavigateToCourses])

  const dateLabel    = formatDateLabel(todayStr)
  const greetingText = greeting()
  const subline = doneForToday
    ? "Today's work is in the bank."
    : isNewUser
    ? "Let's get you set up. Two minutes, tops."
    : 'One focused session today keeps you on pace.'

  // Responsive outer padding
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640
  const outerPad = isNarrow ? '28px 16px 60px' : '52px 32px 80px'

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: SANS, color: T.text }}>
      <div style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: outerPad,
        display: 'flex',
        flexDirection: 'column',
        gap: 48,
      }}>
        {/* Greeting */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: T.dim, marginBottom: 10,
          }}>
            {dateLabel}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 46, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.01em' }}>
            {greetingText}<span style={{ color: T.blue }}>.</span>
          </div>
          <div style={{ fontSize: 14.5, color: T.muted, marginTop: 12 }}>{subline}</div>
        </div>

        {/* Mission Control — one card per active course. Wave 4: surfaces
            everything Waves 1-3 wrote (mastery deltas, coach micro-updates,
            weak topics, gaps closed, session count) so the dashboard reflects
            actual student state instead of just today's schedule. */}
        {!isNewUser && courses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {courses.slice(0, 3).map((c, i) => (
              <MissionControlCard
                key={c.id ?? i}
                course={c}
                todayStr={todayStr}
                onStartBundle={() => onOpenSessionBundle?.()}
                onStartDiagnostic={(course) => onOpenCourseDiagnostic?.(course)}
                onOpenQuizBurst={({ topic }) => onOpenQuizBurst?.({ courseIdx: i, topic })}
              />
            ))}
          </div>
        )}

        {/* Exam banner (≤7 days, normal state only) */}
        {examBannerCourse && !isNewUser && (
          <ExamBanner course={examBannerCourse} todayStr={todayStr} />
        )}

        {/* Hero */}
        {isNewUser ? (
          <HeroNewUser setupSteps={setupSteps} onStepClick={handleStepClick} />
        ) : doneForToday ? (
          <HeroDone
            streak={currentStreak}
            weeklyMinutes={weeklyProgress.minutes}
            weeklyGoalHours={weeklyGoal.hours}
            nextSession={nextDaySession}
          />
        ) : (
          <HeroNormal
            nextSession={nextSession}
            avgRecall={avgRecall}
            dueCount={dueCount}
            payoffLine={payoffLine}
            onStartFocus={onStartFocus}
            onNavigateToCalendar={onNavigateToCalendar}
          />
        )}

        {/* Stat strip */}
        <StatStrip
          streak={currentStreak}
          weeklyMinutes={weeklyProgress.minutes}
          weeklyGoalHours={weeklyGoal.hours}
          sessionsThisWeek={weeklyProgress.sessions}
          isNewUser={isNewUser}
        />

        {/* Courses */}
        <CoursesCard
          courses={courses}
          todayStr={todayStr}
          courseMastery={courseMastery}
          isNewUser={isNewUser}
          onNavigateToCourses={onNavigateToCourses}
          onNavigateToGrades={onNavigateToGrades}
        />

        {/* Deadlines */}
        <DeadlinesCard deadlines={deadlines} isNewUser={isNewUser} />

        {/* Study tools */}
        <StudyToolsRow
          onNavigateToTools={onNavigateToTools}
          onOpenQuizBurst={onOpenQuizBurst}
          onOpenBrainDump={onOpenBrainDump}
          onOpenPodcast={onOpenPodcast}
        />
      </div>
    </div>
  )
}
