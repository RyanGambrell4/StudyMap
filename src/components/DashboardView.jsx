import { useMemo, useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import ReadinessPill, { computeReadiness } from './ReadinessPill'
import ReferralCard from './ReferralCard'
import { useCelebration } from '../utils/useCelebration'
import { useStreak } from '../utils/useStreak'
import { usePushNotifications } from '../utils/usePushNotifications'
import { getCurrentGrade, letterGrade, gradeStatus } from '../utils/gradeCalc'
import { getActivePlan, canUseFeature, getFeatureUsage, isTrialActive, hasUsedTrial, getTrialDaysRemaining, createCheckoutSession, activateTrial } from '../lib/subscription'
import { clean } from '../utils/strings'
import { daysBetween, formatShortDate } from '../utils/dateUtils'
import { getWeakTopics } from '../lib/weakTopics'
import SmartStartCard from './SmartStartCard'
import MomentumCard from './MomentumCard'
import ComebackCard from './ComebackCard'
import CrossCourseCard from './CrossCourseCard'
import ExamCountdownCard from './ExamCountdownCard'
import StreakGuardCard from './StreakGuardCard'
import WeeklyRecapCard from './WeeklyRecapCard'
import { getDueForReview, getReviewStats } from '../lib/masteryStore'
import { detectComeback } from '../lib/momentum'

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
  blue:         '#3B61C4',
}

const COURSE_COLORS = ['#3B82F6', '#6366F1', '#059669', '#D97706', '#EC4899', '#0891B2']
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

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoFlame  = ({ color }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
const IcoClock  = ({ color }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
const IcoCheck  = ({ color }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
const IcoPlay   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
const IcoChevron= () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
const IcoZap    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
const IcoStar   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
const IcoMsg    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IcoBrain  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/></svg>
const IcoGrad   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10l10-4 10 4-10 4-10-4z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6"/></svg>
const IcoCards  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 9h6M7 13h4"/><path d="M21 8v10a2 2 0 01-2 2H8"/></svg>
const IcoArrowUp = () => <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M3 8l3-4 3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const READINESS_SCORES = { strong: 100, 'on-track': 75, 'needs-work': 50, 'at-risk': 25, prompt: 10 }
const IcoArrowDown = () => <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M3 4l3 4 3-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>

// ── Label ─────────────────────────────────────────────────────────────────────
function Label({ children, color }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: color || D.textDim, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
      {color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />}
      {children}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, style, onClick, glowColor }) {
  const [hovered, setHovered] = useState(false)
  const gc = glowColor || null
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        background: D.bgCard,
        border: `1px solid ${hovered && gc ? `${gc}45` : hovered ? 'rgba(0,0,0,0.13)' : D.border}`,
        borderRadius: 14,
        boxShadow: hovered
          ? gc ? `0 6px 28px ${gc}20, 0 2px 8px rgba(0,0,0,0.06)` : '0 6px 20px rgba(0,0,0,0.09)'
          : '0 1px 3px rgba(0,0,0,0.07)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Colored icon pill ─────────────────────────────────────────────────────────
function IconPill({ children, color }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
      background: `${color}15`,
      border: `1px solid ${color}25`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color,
    }}>
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
  onDrillTopic,
  onShowPaywall,
  userEmail,
  userId,
  coachPlans,
  onOpenStudyCoach,
  schoolType,
  pendingAdaptation,
  onShowAdaptModal,
  onOpenCheatSheet,
  onOpenBrainDump,
  onOpenExamRescue,
  onOpenQuizBurst,
  onOpenPodcast,
  completedSessions,
  recoveryCoursesIdx = new Set(),
  weeklyHourGoal,
  userCreatedAt,
  onRescheduleSession,
  onOpenReviewQueue,
  onOpenProgress,
}) {
  const plan = getActivePlan()
  const { remaining: aiRemaining } = canUseFeature('aiTutor')
  const aiUsed = aiRemaining !== null ? Math.max(0, 5 - aiRemaining) : 0
  const [trialBannerLoading, setTrialBannerLoading] = useState(false)

  const weakSpots = useMemo(() => {
    if (!coachPlans) return []
    const courseMap = {}
    courses.forEach((c, idx) => { courseMap[String(c.id ?? idx)] = c.name })
    const seen = new Set()
    const result = []
    for (const [courseId, planData] of Object.entries(coachPlans)) {
      const cName = courseMap[String(courseId)] ?? String(courseId)
      for (const topic of (planData?.struggles ?? [])) {
        const key = `${topic}::${cName}`
        if (!seen.has(key)) { seen.add(key); result.push({ topic, courseName: cName }) }
      }
    }
    return result
  }, [coachPlans, courses])

  // Fire the empty-state impression once on mount so we have a denominator
  // for first_course_cta_clicked. courses is stable from props at mount time.
  useEffect(() => {
    if (courses.length === 0) {
      track('dashboard_empty_state_shown', { exam_mode: schoolType === 'exam' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStartTrial = async () => {
    if (trialBannerLoading) return
    setTrialBannerLoading(true)
    try {
      const url = await activateTrial(userId, userEmail)
      if (!url) { setTrialBannerLoading(false); return }
      window.location.href = url
    } catch {
      setTrialBannerLoading(false)
    }
  }
  const [aiChipDismissed, setAiChipDismissed] = useState(
    () => sessionStorage.getItem('studyedge_ai_chip_dismissed') === '1'
  )
  const showAiChip = plan === 'free' && aiUsed >= 3 && !aiChipDismissed
  const aiChipTrialEligible = showAiChip && !hasUsedTrial()
  const [trialCardDismissed, setTrialCardDismissed] = useState(() => {
    const ts = localStorage.getItem('studyedge_trial_card_dismissed_at')
    if (!ts) return false
    const hoursSince = (Date.now() - parseInt(ts, 10)) / 3_600_000
    return hoursSince < 24
  })
  const showTrialCard = plan === 'free' && !hasUsedTrial() && !trialCardDismissed && !showAiChip && !(completedSessions?.length >= 1)

  // ── Session-based nudge: shown when user completes 3+ focus sessions ──────
  const sessionsCount = completedSessions?.length ?? 0
  const [sessionNudgeDismissed, setSessionNudgeDismissed] = useState(() =>
    sessionStorage.getItem('se_session_nudge_dismissed') === '1'
  )
  const showSessionNudge = plan === 'free' && !hasUsedTrial() && sessionsCount >= 3 && !sessionNudgeDismissed && !showAiChip && !isTrialActive()
  useEffect(() => {
    if (showSessionNudge) {
      track('sessions_nudge_shown', { sessions_count: sessionsCount })
    }
  }, [showSessionNudge]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 7-day free user banner: shown once per day for users free for 7+ days ──
  const accountAgeDays = userCreatedAt
    ? Math.floor((Date.now() - new Date(userCreatedAt).getTime()) / 86_400_000)
    : null
  const [sevenDayBannerDismissed, setSevenDayBannerDismissed] = useState(() => {
    const ts = sessionStorage.getItem('se_7day_banner_dismissed_date')
    return ts === new Date().toISOString().slice(0, 10)
  })
  const showSevenDayBanner =
    plan === 'free' &&
    !hasUsedTrial() &&
    accountAgeDays !== null &&
    accountAgeDays >= 7 &&
    !sevenDayBannerDismissed &&
    !showSessionNudge &&
    !showAiChip &&
    !isTrialActive()
  useEffect(() => {
    if (showSevenDayBanner) {
      track('seven_day_free_banner_shown', { account_age_days: accountAgeDays })
    }
  }, [showSevenDayBanner]) // eslint-disable-line react-hooks/exhaustive-deps

  const { currentStreak, lastCompletedDate, recordCompletion, freezeCount, useFreeze } = useStreak()
  const { shouldPrompt: shouldPromptPush, requestAndSubscribe, dismiss: dismissPush } = usePushNotifications(userId)
  const celebrate = useCelebration()
  const streak = currentStreak
  const [aiBriefDismissed, setAiBriefDismissed] = useState(() =>
    sessionStorage.getItem('studyedge_brief_dismissed') === '1'
  )
  const [streakBannerDismissed, setStreakBannerDismissed] = useState(() =>
    sessionStorage.getItem('se_streak_banner_dismissed') === '1'
  )
  const [firstBlueprintCtaDismissed, setFirstBlueprintCtaDismissed] = useState(() =>
    localStorage.getItem('se_first_blueprint_cta_dismissed') === '1'
  )
  const hasCompletedFirstSession = (completedSessions?.length ?? 0) >= 1
  // Streak is "broken" when they had a multi-day streak but didn't study yesterday or today.
  // currentStreak still holds the old value (resets only on next recordCompletion call).
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
  const isStreakBroken = !!(
    lastCompletedDate &&
    lastCompletedDate !== todayStr &&
    lastCompletedDate !== yesterdayStr &&
    currentStreak > 1 &&
    !streakBannerDismissed
  )
  const [sessionIdx, setSessionIdx] = useState(0)
  const [upNextHovered, setUpNextHovered] = useState(false)
  const [startBtnHovered, setStartBtnHovered] = useState(false)
  const [streakToast, setStreakToast] = useState(null)
  const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100]

  const nextStreakMilestone = STREAK_MILESTONES.find(m => m > streak)
  const daysToNextMilestone = nextStreakMilestone ? nextStreakMilestone - streak : null

  // Trigger real-time streak-broken email when streak breaks
  useEffect(() => {
    if (!isStreakBroken || !userEmail || !userId || currentStreak <= 1) return
    const key = `se_streak_trigger_sent_${currentStreak}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    import('../lib/supabase').then(({ getAccessToken }) =>
      getAccessToken().then(token =>
        fetch('/api/streak-broken-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ streak: currentStreak, email: userEmail }),
        }).catch(() => {})
      )
    )
  }, [isStreakBroken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track AI chip impression once per session
  useEffect(() => {
    if (showAiChip) track('ai_chip_shown', { aiUsed, plan })
  }, [showAiChip])

  // Track trial banner impression once per session
  useEffect(() => {
    if (showTrialCard) track('trial_banner_impression', { source: 'trial_card', plan })
  }, [showTrialCard]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasCompletedFirstSession && plan === 'free' && !hasUsedTrial()) {
      track('trial_banner_impression', { source: 'first_blueprint_cta', plan })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show a toast on streak milestones — use sessionStorage so it doesn't
  // re-fire when the component remounts on tab navigation.
  useEffect(() => {
    if (streak > 0 && STREAK_MILESTONES.includes(streak)) {
      const key = 'se_streak_toast_shown'
      const shown = parseInt(sessionStorage.getItem(key) ?? '0', 10)
      if (shown !== streak) {
        sessionStorage.setItem(key, String(streak))
        setStreakToast(streak)
        track('streak_milestone_shown', { streak })
        const duration = plan === 'free' && streak >= 7 ? 7000 : 4500
        const timer = setTimeout(() => setStreakToast(null), duration)
        return () => clearTimeout(timer)
      }
    }
  }, [streak])

  // ── This-week performance stats (for dashboard nudge) ─────────────────────
  const weekPerf = useMemo(() => {
    const sessions = completedSessions ?? []
    const d = new Date(todayStr + 'T12:00:00')
    const dow = d.getDay()
    const wsDate = new Date(d)
    wsDate.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const ws = wsDate.toISOString().slice(0, 10)
    let weekMins = 0
    sessions.forEach(s => {
      if (s.dateStr >= ws) {
        weekMins += s.elapsedSeconds > 0 ? s.elapsedSeconds / 60 : (s.duration ?? 0)
      }
    })
    const withRecall = sessions.filter(s => s.recallScore != null)
    const avgRecall = withRecall.length
      ? Math.round(withRecall.reduce((a, s) => a + s.recallScore, 0) / withRecall.length)
      : null
    return { weekHours: (weekMins / 60).toFixed(1), avgRecall }
  }, [completedSessions, todayStr])

  // Celebration + streak
  const allCompleteKey = todayStr + (allComplete ? '-done' : '')
  const firedRef = useRef(null)
  useEffect(() => {
    if (allComplete && firedRef.current !== allCompleteKey) {
      firedRef.current = allCompleteKey
      celebrate('big')
    }
  }, [allComplete, allCompleteKey])

  // Update streak whenever any of today's sessions become completed (handles FocusMode + manual toggle)
  useEffect(() => {
    const hasCompletedToday = todaySessions.some(s => completedIds.has(s.id))
    if (hasCompletedToday) recordCompletion(todayStr)
  }, [completedIds])

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

  // Sessions from the past 3 days that were never completed — show reschedule prompt
  const missedSessions = useMemo(() => {
    const cutoff = new Date(todayStr + 'T00:00:00')
    cutoff.setDate(cutoff.getDate() - 3)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return allSessions.filter(s => s.dateStr >= cutoffStr && s.dateStr < todayStr && !completedIds.has(s.id)).slice(0, 3)
  }, [allSessions, completedIds, todayStr])

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
  const weeklyGoalHours = weeklyHourGoal ?? 10
  const goalPct = Math.min(100, Math.round((weekHours / weeklyGoalHours) * 100))
  const onPace = goalPct >= Math.round((new Date().getDay() / 7) * 100) - 10

  const progressPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const total = allSessions.filter(s => s.courseId === idx).length
      const done = allSessions.filter(s => s.courseId === idx && completedIds.has(s.id)).length
      map[idx] = { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
    })
    return map
  }, [courses, allSessions, completedIds])

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

  const hoursPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const done = (completedSessions ?? []).filter(s => s.courseId === idx)
      const mins = done.reduce((a, s) => a + (s.duration ?? 0), 0)
      map[idx] = Math.round(mins / 60 * 10) / 10
    })
    return map
  }, [courses, completedSessions])

  const avgRecallPerCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, idx) => {
      const scored = (completedSessions ?? []).filter(s => s.courseId === idx && s.recallScore != null)
      if (!scored.length) { map[idx] = null; return }
      map[idx] = Math.round(scored.reduce((a, s) => a + s.recallScore, 0) / scored.length)
    })
    return map
  }, [courses, completedSessions])

  const overallReadiness = useMemo(() => {
    if (!courses.length) return null
    let totalWeight = 0, totalScore = 0
    courses.forEach((course, idx) => {
      const last = lastSessionPerCourse[idx]
      const status = computeReadiness(course, last, todayStr)
      const score = READINESS_SCORES[status] ?? 50
      const examDate = course.examDate ?? null
      const daysToExam = examDate
        ? Math.max(0, Math.ceil((new Date(examDate + 'T12:00:00').getTime() - Date.now()) / 86400000))
        : 90
      const weight = daysToExam <= 7 ? 4 : daysToExam <= 30 ? 2 : 1
      totalWeight += weight
      totalScore += score * weight
    })
    const score = Math.round(totalScore / totalWeight)
    const label = score >= 80 ? 'On Track' : score >= 60 ? 'Needs Attention' : 'At Risk'
    const color = score >= 80 ? '#16A34A' : score >= 60 ? '#D97706' : '#DC2626'
    return { score, label, color }
  }, [courses, lastSessionPerCourse, todayStr])

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

  const upcomingDeadlines = useMemo(() => {
    const all = Object.values(syllabusEventsByDate ?? {}).flat()
    return all
      .filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4)
  }, [syllabusEventsByDate, todayStr])

  const upcomingExam = useMemo(() => {
    const exams = courses
      .map((c, i) => ({ course: c, idx: i, days: c.examDate ? daysBetween(todayStr, c.examDate) : null }))
      .filter(e => e.days !== null && e.days >= 0)
      .sort((a, b) => a.days - b.days)
    return exams[0] ?? null
  }, [courses, todayStr])

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

  const sessionColor = displaySession ? (displaySession.color?.dot ?? courseColor(displaySession.courseId ?? 0)) : D.blue

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (courses.length === 0) {
    const previews = isExamMode
      ? [
          'Section-by-section blueprints',
          'Score tracker with target gap',
          'Focus sessions that build endurance',
        ]
      : [
          'Weekly plan built around your exams',
          'Session blueprints for every study block',
          'Grade tracker that catches drops early',
        ]
    return (
      <div style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: D.text, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: '0 0 10px', lineHeight: 1.2 }}>
            {isExamMode ? 'One section to get started.' : 'One course to get started.'}
          </h2>
          <p style={{ color: D.textMuted, fontSize: 14.5, lineHeight: 1.65, margin: '0 0 28px', maxWidth: 340, marginLeft: 'auto', marginRight: 'auto' }}>
            {isExamMode
              ? 'Add a section with its test date and we\'ll build your full prep plan automatically.'
              : 'Add a course with its exam date and your AI study plan builds itself in under a minute.'}
          </p>

          {/* What you get preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, textAlign: 'left', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
            {previews.map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: D.textMuted }}>
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke={D.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {p}
              </div>
            ))}
          </div>

          {/* Steps preview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
            {[
              { step: '1', label: isExamMode ? 'Name + test date' : 'Name + exam date' },
              { step: '2', label: 'Your weaknesses' },
              { step: '3', label: 'AI builds the plan' },
            ].map((s, i) => (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: i === 2 ? D.blue : 'rgba(59,97,196,0.1)',
                    border: `2px solid ${i === 2 ? D.blue : 'rgba(59,97,196,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: i === 2 ? '#fff' : D.blue,
                  }}>
                    {i === 2
                      ? <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      : s.step}
                  </div>
                  <span style={{ fontSize: 11, color: D.textMuted, fontWeight: 500, lineHeight: 1.3 }}>{s.label}</span>
                </div>
                {i < 2 && (
                  <div style={{ width: 24, height: 1, background: 'rgba(0,0,0,0.12)', margin: '0 0 18px', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              track('first_course_cta_clicked', { source: 'dashboard_empty_state', exam_mode: !!isExamMode })
              onNavigateToCourses?.()
            }}
            style={{ background: D.blue, color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 32px', borderRadius: 12, border: 'none', cursor: 'pointer', boxShadow: '0 4px 18px rgba(59,97,196,0.3)', width: '100%', maxWidth: 280 }}
          >
            {isExamMode ? 'Add your first section' : 'Add your first course'}
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#9B9B9B' }}>
            About 60 seconds. You can edit anything after.
          </p>

          {typeof onNavigateToTools === 'function' && (
            <button
              onClick={() => {
                track('first_course_cta_clicked', { source: 'dashboard_empty_state_explore', exam_mode: !!isExamMode })
                onNavigateToTools()
              }}
              style={{ marginTop: 16, background: 'none', border: 'none', fontSize: 13, color: D.textMuted, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.2)' }}
            >
              See what Pro unlocks →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowY: 'auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
        @keyframes dash-pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
        @keyframes streak-toast-in { from { opacity:0; transform:translateX(-50%) translateY(-16px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @media (max-width: 767px) {
          .dash-header { padding: 20px 16px 6px !important; }
          .dash-grid { grid-template-columns: 1fr !important; padding: 12px 16px 90px !important; gap: 12px !important; }
          .dash-grid > * { grid-column: auto !important; min-width: 0 !important; max-width: 100% !important; overflow: hidden !important; }
          .dash-course-row { grid-template-columns: 4px 1fr !important; gap: 10px !important; }
          .dash-course-meta { display: none !important; }
          .dash-radar-row { grid-template-columns: 3px 1fr auto !important; gap: 10px !important; }
          .dash-radar-date { display: none !important; }
          .dash-up-next-btns { flex-wrap: wrap !important; gap: 8px !important; }
          .dash-pomodoro { display: none !important; }
          .dash-quick-actions { order: 10 !important; }
          .dash-brief-row { flex-wrap: wrap !important; gap: 10px !important; }
          .dash-brief-btns { flex-shrink: 0 !important; align-self: flex-start !important; }
          .dash-banner-wrap { padding: 10px 16px 4px !important; }
          .dash-banner-inner { flex-wrap: wrap !important; gap: 10px !important; }
          .dash-banner-inner button { white-space: normal !important; }
        }
      `}</style>

      {/* ── Streak milestone toast ── */}
      {streakToast && (
        plan === 'free' && streakToast >= 7 ? (
          <button
            onClick={() => onShowPaywall?.('ai')}
            style={{
              position: 'fixed', top: 20, left: '50%',
              transform: 'translateX(-50%)',
              background: '#1A1A1A', color: '#fff',
              padding: '11px 20px', borderRadius: 999, zIndex: 9999,
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
              animation: 'streak-toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
              fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
              maxWidth: 'calc(100vw - 32px)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <IcoFlame color="#F97316" />
            <span>{streakToast}-day streak!</span>
            <span style={{ fontWeight: 500, color: '#93C5FD', fontSize: 13 }}>
              {hasUsedTrial() ? 'Upgrade to keep it going →' : 'Start free trial →'}
            </span>
          </button>
        ) : (
          <div style={{
            position: 'fixed', top: 20, left: '50%',
            transform: 'translateX(-50%)',
            background: '#1A1A1A', color: '#fff',
            padding: '11px 20px', borderRadius: 999, zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
            animation: 'streak-toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
            fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            <IcoFlame color="#F97316" />
            <span>{streakToast}-day streak!</span>
            <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Keep it up</span>
          </div>
        )
      )}

      {/* ── Header ── */}
      <div className="dash-header" style={{ padding: '28px 32px 8px' }}>
        {showAiChip && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
            borderRadius: 999, padding: '5px 14px', marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: D.amber, fontWeight: 600 }}>
              {aiUsed < 5
                ? <>{5 - aiUsed} free AI question{5 - aiUsed !== 1 ? 's' : ''} left · <span style={{ fontWeight: 400, color: '#9B6C1A' }}>Pro: 100/month</span></>
                : <>Out of free AI questions</>
              }
            </span>
            {aiChipTrialEligible ? (
              <button onClick={handleStartTrial} disabled={trialBannerLoading} style={{ fontSize: 12, fontWeight: 700, color: D.blue, background: 'none', border: 'none', cursor: trialBannerLoading ? 'not-allowed' : 'pointer', padding: 0, opacity: trialBannerLoading ? 0.7 : 1 }}>
                {trialBannerLoading ? 'Loading…' : 'Start free trial →'}
              </button>
            ) : (
              <button onClick={() => onShowPaywall?.('ai')} style={{ fontSize: 12, fontWeight: 700, color: D.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Upgrade</button>
            )}
            <button onClick={() => { sessionStorage.setItem('studyedge_ai_chip_dismissed', '1'); setAiChipDismissed(true) }} style={{ fontSize: 16, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }} aria-label="Dismiss">×</button>
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 600, color: D.blue, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, opacity: 0.7 }}>
          {formatDateHeader(todayStr)}
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 42, fontWeight: 400, margin: 0, letterSpacing: -0.5, lineHeight: 1.1, color: D.text }}>
          {greeting()}<span style={{ color: D.accent }}>.</span>
        </h1>
        <p style={{ fontSize: 14, color: D.textMuted, margin: '8px 0 0', fontWeight: 400 }}>
          {subtitle}
        </p>
      </div>

      {/* ── Exam countdown banner ── */}
      {isExamMode && upcomingExam && (() => {
        const d = upcomingExam.days
        const phase = d > 90 ? 0 : d > 60 ? 1 : d > 30 ? 2 : 3
        const phases = ['Content Foundation', 'Practice & Passages', 'Official Materials', 'Final Crunch']
        const phaseColors = [D.blue, D.green, D.amber, D.accent]
        const accentColor = phaseColors[phase]
        const hoursPerDay = d > 0 ? Math.max(2, Math.min(10, Math.round(300 / d))) : 8
        return (
          <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
            <div style={{
              background: D.bgCard,
              border: `1px solid ${accentColor}30`,
              borderLeft: `4px solid ${accentColor}`,
              borderRadius: 10,
              boxShadow: `0 2px 12px ${accentColor}12`,
              padding: '14px 18px',
            }}>
              <div className="dash-banner-inner" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: accentColor, lineHeight: 1 }}>{d}</span>
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
                  <div style={{ fontSize: 11, fontWeight: 600, color: D.textDim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Prep phase</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{phases[phase]}</div>
                </div>
                {upcomingExam.course.targetScore && (
                  <>
                    <div style={{ width: 1, height: 28, background: D.border, flexShrink: 0 }} />
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>{upcomingExam.course.targetScore}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Grade Recovery banner ── */}
      {recoveryCoursesIdx.size > 0 && (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          <div style={{
            background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)',
            borderLeft: '4px solid #DC2626', borderRadius: 10, padding: '13px 18px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <svg width="18" height="18" fill="none" stroke="#DC2626" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
              <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 2 }}>Grade Recovery Mode Active</div>
              <div style={{ fontSize: 12.5, color: D.textMuted }}>
                Extra weekly sessions scheduled for <strong>{[...recoveryCoursesIdx].map(i => courses[i]?.name).filter(Boolean).join(', ')}</strong>. Your grades are below target and we're helping close the gap.
              </div>
            </div>
            <button
              onClick={() => onNavigateToGrades?.()}
              style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              View grades →
            </button>
          </div>
        </div>
      )}

      {/* ── Pro trial banner ── */}
      {isTrialActive() ? (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          {(() => {
            const daysLeft = getTrialDaysRemaining()
            const expiringSoon = daysLeft <= 1
            const accentColor = expiringSoon ? '#F97316' : D.blue
            return (
              <div className="dash-banner-inner" style={{
                background: expiringSoon
                  ? 'linear-gradient(135deg, rgba(249,115,22,0.05) 0%, rgba(249,115,22,0.1) 100%)'
                  : `linear-gradient(135deg, rgba(59,97,196,0.04) 0%, rgba(59,97,196,0.08) 100%)`,
                border: `1px solid ${expiringSoon ? 'rgba(249,115,22,0.3)' : 'rgba(59,97,196,0.2)'}`,
                borderLeft: `4px solid ${accentColor}`,
                borderRadius: 10,
                boxShadow: expiringSoon ? '0 2px 12px rgba(249,115,22,0.1)' : `0 2px 12px rgba(59,97,196,0.07)`,
                padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: expiringSoon ? '#C2410C' : D.text }}>
                    {expiringSoon
                      ? 'Your trial expires today. Don\'t lose your progress.'
                      : `Your free trial is active. ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining.`}
                  </p>
                  {expiringSoon ? (
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                      Upgrade now to keep your courses, AI tutoring, and everything you've built this week.
                    </p>
                  ) : (
                    <div style={{ marginTop: 6, height: 4, background: 'rgba(59,97,196,0.15)', borderRadius: 999, overflow: 'hidden', maxWidth: 280 }}>
                      <div style={{ height: '100%', borderRadius: 999, background: D.blue, width: `${Math.round(((3 - daysLeft) / 3) * 100)}%`, transition: 'width 0.4s ease' }} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => onShowPaywall?.('upgrade')} style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {expiringSoon ? 'Upgrade Now →' : 'Upgrade to Pro →'}
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      ) : (hasCompletedFirstSession && plan === 'free' && !hasUsedTrial() && !firstBlueprintCtaDismissed) ? (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          <div className="dash-banner-inner" style={{
            background: 'linear-gradient(135deg, #f8f9ff, #eef1ff)',
            border: `1px solid rgba(59,97,196,0.25)`,
            borderLeft: `4px solid ${D.blue}`,
            borderRadius: 10,
            boxShadow: `0 2px 16px rgba(59,97,196,0.09)`,
            padding: '16px 18px',
            display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: D.text }}>
                Your study plan is live. Unlock the full picture.
              </p>
              <p style={{ margin: '4px 0 10px', fontSize: 12, color: D.textMuted, lineHeight: 1.55 }}>
                You generated your first blueprint. The hardest part is done. Unlimited gives you 5 courses, 100 AI coaching sessions/month, and unlimited blueprints. 7-day free trial, then $4.99/wk.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {['5 courses', '100 AI sessions/month', 'Unlimited blueprints'].map(f => (
                  <span key={f} style={{ fontSize: 11, fontWeight: 600, color: D.blue, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                onClick={handleStartTrial}
                disabled={trialBannerLoading}
                style={{ background: D.blue, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: trialBannerLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: trialBannerLoading ? 0.7 : 1 }}
              >
                {trialBannerLoading ? 'Loading…' : 'Start 7-day trial · Cancel anytime'}
              </button>
              <button
                onClick={() => { localStorage.setItem('se_first_blueprint_cta_dismissed', '1'); setFirstBlueprintCtaDismissed(true); track('first_blueprint_cta_dismissed') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: 20, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
                aria-label="Dismiss"
              >×</button>
            </div>
          </div>
        </div>
      ) : showTrialCard ? (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          <div className="dash-banner-inner" style={{
            background: '#FFFFFF',
            border: `1px solid rgba(59,97,196,0.2)`,
            borderLeft: `4px solid ${D.blue}`,
            borderRadius: 10,
            boxShadow: `0 2px 12px rgba(59,97,196,0.07)`,
            padding: '16px 18px',
            display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: D.text }}>
                {upcomingExam && upcomingExam.days <= 5
                  ? `${clean(upcomingExam.course.name)} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}. Unlock Exam Rescue and unlimited sessions with Pro.`
                  : 'You\'re on the free plan. Upgrade to Pro for unlimited sessions.'}

              </p>
              <p style={{ margin: '3px 0 8px', fontSize: 12, color: D.textMuted, lineHeight: 1.5 }}>
                {upcomingExam && upcomingExam.days <= 5
                  ? 'Exam Rescue, Cheat Sheets, and unlimited focus sessions are all included. 7-day free trial, then $4.99/wk.'
                  : 'Removes the 30-min cap, adds 5 courses, 100 AI coaching sessions/month, and unlimited blueprints. 7-day free trial, then $4.99/wk.'}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {['Unlimited sessions', '100 AI actions/month', '5 courses'].map(f => (
                  <span key={f} style={{ fontSize: 11, fontWeight: 600, color: D.blue, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                onClick={handleStartTrial}
                disabled={trialBannerLoading}
                style={{ background: D.blue, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: trialBannerLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: trialBannerLoading ? 0.7 : 1 }}
              >
                {trialBannerLoading ? 'Loading…' : 'Start 7-day trial · Cancel anytime'}
              </button>
              <button onClick={() => { localStorage.setItem('studyedge_trial_card_dismissed_at', String(Date.now())); setTrialCardDismissed(true); track('trial_card_dismissed', { streak }) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: 20, lineHeight: 1, padding: '0 4px', flexShrink: 0 }} aria-label="Dismiss">×</button>
            </div>
          </div>
        </div>
      ) : (plan === 'free' && hasUsedTrial()) ? (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          <div className="dash-banner-inner" style={{
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.08)',
            borderLeft: `4px solid ${D.blue}`,
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: D.text }}>
                {upcomingExam && upcomingExam.days <= 5
                  ? `${clean(upcomingExam.course.name)} exam in ${upcomingExam.days} day${upcomingExam.days !== 1 ? 's' : ''}. Exam Rescue is a Pro feature.`
                  : 'Ready to go back to Pro?'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: D.textMuted }}>$2.99/wk. Cancel anytime. Everything you had during your trial.</p>
            </div>
            <button onClick={() => onShowPaywall?.(upcomingExam && upcomingExam.days <= 5 ? 'examRescue' : 'nav-upgrade')} style={{ background: D.blue, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Upgrade to Pro →
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Session-based trial nudge — triggered after 3+ completed sessions ── */}
      {showSessionNudge && (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          <div className="dash-banner-inner" style={{
            background: '#FFFFFF',
            border: '1px solid rgba(59,97,196,0.2)',
            borderLeft: '4px solid #3B61C4',
            borderRadius: 10,
            boxShadow: '0 2px 12px rgba(59,97,196,0.07)',
            padding: '16px 18px',
            display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: D.text }}>
                You've had {sessionsCount} study sessions. You're actually using this.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: D.textMuted, lineHeight: 1.55 }}>
                Unlock unlimited focus time, 5 courses, and 100 AI coaching sessions/month. 7-day free trial, then $4.99/wk.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                onClick={handleStartTrial}
                disabled={trialBannerLoading}
                style={{ background: D.accent, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: trialBannerLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: trialBannerLoading ? 0.7 : 1 }}
              >
                {trialBannerLoading ? 'Loading…' : 'Start 7-day trial · Cancel anytime'}
              </button>
              <button
                onClick={() => { sessionStorage.setItem('se_session_nudge_dismissed', '1'); setSessionNudgeDismissed(true); track('sessions_nudge_dismissed', { sessions_count: sessionsCount }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: 20, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
                aria-label="Dismiss"
              >×</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7-day free user banner — once per day for users free for 7+ days ── */}
      {showSevenDayBanner && (
        <div className="dash-banner-wrap" style={{ padding: '12px 32px 4px' }}>
          <div className="dash-banner-inner" style={{
            background: '#FFFFFF',
            border: '1px solid rgba(232,83,26,0.2)',
            borderLeft: '4px solid #E8531A',
            borderRadius: 10,
            boxShadow: '0 2px 12px rgba(232,83,26,0.07)',
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: D.text }}>
                You've been on free for {accountAgeDays} days. The trial is still open.
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: D.textMuted, lineHeight: 1.5 }}>
                7 days free, then $4.99/wk. Unlimited sessions, 5 courses, 100 AI actions/month. Cancel anytime.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                onClick={handleStartTrial}
                disabled={trialBannerLoading}
                style={{ background: D.accent, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: trialBannerLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: trialBannerLoading ? 0.7 : 1 }}
              >
                {trialBannerLoading ? 'Loading…' : 'Start 7-day trial · Cancel anytime'}
              </button>
              <button
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  sessionStorage.setItem('se_7day_banner_dismissed_date', today)
                  setSevenDayBannerDismissed(true)
                  track('seven_day_free_banner_dismissed', { account_age_days: accountAgeDays })
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: 20, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
                aria-label="Dismiss"
              >×</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Broken streak recovery banner ── */}
      {isStreakBroken && (
        <div style={{ padding: '0 32px 4px' }}>
          <div style={{
            background: '#FFFBEB',
            border: '1px solid rgba(217,119,6,0.2)',
            borderLeft: '4px solid #F97316',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <IcoFlame color="#F97316" />
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#92400E' }}>
                Your {currentStreak}-day streak broke.
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#B45309', lineHeight: 1.4 }}>
                {freezeCount > 0
                  ? `Use a Streak Freeze to save it. You have ${freezeCount} left.`
                  : 'Start a session today to rebuild it.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              {freezeCount > 0 && (
                <button
                  onClick={() => {
                    useFreeze(todayStr)
                    sessionStorage.setItem('se_streak_banner_dismissed', '1')
                    setStreakBannerDismissed(true)
                    track('streak_freeze_used', { streak: currentStreak, freezesLeft: freezeCount - 1 })
                  }}
                  style={{ background: '#FFFFFF', border: '1.5px solid #F97316', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#F97316', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  Use Freeze ({freezeCount})
                </button>
              )}
              <button
                onClick={() => {
                  track('streak_recovery_cta_clicked', { streak: currentStreak })
                  onNavigateToCourses?.()
                }}
                style={{ background: '#F97316', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Start a session →
              </button>
              <button
                onClick={() => { sessionStorage.setItem('se_streak_banner_dismissed', '1'); setStreakBannerDismissed(true); track('streak_recovery_banner_dismissed', { streak: currentStreak }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                aria-label="Dismiss"
              >×</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Push notification prompt ── */}
      {shouldPromptPush && (
        <div style={{ padding: '0 32px 4px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(107,143,255,0.08), rgba(59,97,196,0.06))',
            border: '1px solid rgba(107,143,255,0.2)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ flexShrink: 0, width: 32, height: 32, background: 'rgba(107,143,255,0.12)', border: '1px solid rgba(107,143,255,0.25)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
                Never miss a study session
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4B5563', lineHeight: 1.4 }}>
                Get a daily nudge at 9 AM so your streak stays alive and exams don't sneak up on you.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <button
                onClick={() => { track('push_subscribe_clicked'); requestAndSubscribe() }}
                style={{ background: '#3B61C4', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Turn on reminders
              </button>
              <button
                onClick={() => { track('push_subscribe_dismissed'); dismissPush() }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
                aria-label="Dismiss"
              >×</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grid ── */}
      <div className="dash-grid" style={{ padding: '20px 32px 48px', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>

        {/* ── Exam Countdown: prominent whenever an exam is ≤ 14 days out ── */}
        <ExamCountdownCard
          courses={courses}
          onStartFocus={() => displaySession ? onStartFocus?.(displaySession) : onOpenStudyCoach?.()}
          onOpenExamRescue={onOpenExamRescue}
          onOpenPracticeExam={onOpenPracticeExam}
        />

        {/* ── Streak Guard: loss-aversion nudge when today hasn't been studied ── */}
        <StreakGuardCard
          streak={streak}
          completedToday={todaySessions.some(s => completedIds.has(s.id))}
          todaySessions={todaySessions}
          freezeCount={freezeCount}
          onUseFreeze={useFreeze}
          onStartFocus={onStartFocus}
        />

        {/* ── Weekly Recap: Monday/Sunday debrief on last week's work ── */}
        <WeeklyRecapCard
          completedSessionLog={completedSessions}
          todayStr={todayStr}
          onStartFocus={() => displaySession ? onStartFocus?.(displaySession) : onOpenStudyCoach?.()}
          onOpenProgress={onOpenProgress ?? onNavigateToProgress}
        />

        {/* ── Momentum Score: composite weekly health ── */}
        <MomentumCard
          completedSessionLog={completedSessions}
          allSessions={allSessions}
          completedIds={completedIds}
          todayStr={todayStr}
          onOpenProgress={onOpenProgress ?? onNavigateToProgress}
        />

        {/* ── Cross-Course Connection: topics shared across 2+ classes ── */}
        <CrossCourseCard
          courses={courses}
          onOpenBrainDump={onOpenBrainDump}
          onOpenReviewQueue={onOpenReviewQueue}
        />

        {/* ── Comeback Mode: warm re-entry when the student's been away ── */}
        {(() => {
          const comeback = detectComeback(completedSessions ?? [])
          if (!comeback) return null
          return (
            <ComebackCard
              daysAway={comeback.daysAway}
              lastSessionDate={comeback.lastSessionDate}
              courses={courses}
              onStartFocus={onStartFocus}
              onOpenBrainDump={onOpenBrainDump}
              todaySessions={todaySessions}
            />
          )
        })()}

        {/* ── Smart Start: today's mission card (always shown when courses exist) ── */}
        <SmartStartCard
          courses={courses}
          upcomingExam={upcomingExam}
          weakSpots={weakSpots}
          todaySessions={todaySessions}
          completedIds={completedIds}
          streak={streak}
          coachPlans={coachPlans}
          onStartFocus={() => displaySession ? onStartFocus?.(displaySession) : onOpenStudyCoach?.()}
          onOpenBrainDump={onOpenBrainDump}
          onOpenQuizBurst={onOpenQuizBurst}
          onOpenExamRescue={onOpenExamRescue}
          onOpenCheatSheet={onOpenCheatSheet}
          onOpenStudyCoach={onOpenStudyCoach}
          onShowPaywall={onShowPaywall}
          onOpenReviewQueue={onOpenReviewQueue}
        />

        {/* ── Today's Plan Timeline ── */}
        {(todaySessions.length > 0 || getDueForReview(null, 3).length > 0) && (() => {
          const dueReviews = getDueForReview(null, 3)
          const completed = completedIds ?? new Set()
          const nowMs = Date.now()
          const parseStart = (t) => {
            if (!t) return null
            const m = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(t).trim())
            if (!m) return null
            let h = parseInt(m[1], 10)
            const mm = parseInt(m[2], 10)
            const ap = m[3]?.toUpperCase()
            if (ap === 'PM' && h < 12) h += 12
            if (ap === 'AM' && h === 12) h = 0
            const d = new Date(); d.setHours(h, mm, 0, 0)
            return d.getTime()
          }
          const allItems = [
            ...todaySessions.map(s => {
              const startMs = parseStart(s.startTime)
              const overdue = !completed.has(s.id) && startMs && startMs + (s.duration ?? 30) * 60 * 1000 < nowMs
              return { type: 'session', id: s.id, label: s.sessionType, sub: clean(s.courseName ?? ''), duration: s.duration, color: s.color?.dot ?? D.blue, done: completed.has(s.id), startTime: s.startTime, overdue }
            }),
            ...dueReviews.map(r => ({ type: 'review', id: r.topic, label: r.topic, sub: 'Review due', color: '#DC2626', done: false, duration: 10 })),
          ]
          if (!allItems.length) return null
          const doneCount = allItems.filter(i => i.done).length
          const pct = allItems.length > 0 ? Math.round((doneCount / allItems.length) * 100) : 0
          return (
            <div style={{ gridColumn: 'span 12', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}>
              <style>{`
                @keyframes tp-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
                .tp-row { transition: background 150ms cubic-bezier(0.4,0,0.2,1); }
                .tp-row:hover { background: rgba(0,0,0,0.02); }
                .tp-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
                .tp-btn:hover { transform: translateY(-1px); }
                .tp-btn:active { transform: scale(0.97); }
                .tp-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(59,97,196,0.35); }
              `}</style>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(59,97,196,0.1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" fill="none" stroke={D.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>Today's Plan</span>
                    <span style={{ fontSize: 11.5, color: D.textMuted, marginTop: 1 }}>{doneCount} of {allItems.length} complete</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: D.textMuted, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  <div style={{ width: 96, height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: pct === 100 ? D.green : D.blue, width: `${pct}%`, transition: 'width 400ms cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                </div>
              </div>
              {/* Items */}
              <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column' }}>
                {allItems.map((item, i) => {
                  const dotColor = item.overdue ? D.amber : item.color
                  return (
                    <div
                      key={`${item.type}-${item.id}-${i}`}
                      className="tp-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px',
                        borderRadius: 10,
                        minHeight: 56,
                        animation: `tp-fade-in 300ms cubic-bezier(0.16,1,0.3,1) both`,
                        animationDelay: `${i * 40}ms`,
                        position: 'relative',
                      }}
                    >
                      {/* Timeline line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, alignSelf: 'stretch', position: 'relative', width: 16 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${item.done ? item.color : dotColor + '80'}`, background: item.done ? item.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)', boxShadow: item.done ? `0 0 0 3px ${item.color}20` : 'none', flexShrink: 0, marginTop: 8 }}>
                          {item.done && (
                            <svg width="7" height="7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                          )}
                        </div>
                        {i < allItems.length - 1 && (
                          <div style={{ width: 2, flex: 1, background: 'rgba(0,0,0,0.08)', marginTop: 2, borderRadius: 1 }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: item.done ? D.textDim : D.text, textDecoration: item.done ? 'line-through' : 'none', letterSpacing: '-0.005em' }}>
                            {item.label}
                          </span>
                          {item.type === 'review' && !item.done && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', padding: '2px 7px', borderRadius: 4, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Review</span>
                          )}
                          {item.overdue && !item.done && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: 'rgba(217,119,6,0.1)', padding: '2px 7px', borderRadius: 4, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Overdue</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: D.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {item.startTime && (
                            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{item.startTime}</span>
                          )}
                          {item.startTime && item.sub && <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span>}
                          {item.sub && <span>{item.sub}</span>}
                          {item.duration && <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span>}
                          {item.duration && <span>{item.duration} min</span>}
                        </div>
                      </div>
                      {/* Action */}
                      {!item.done && (
                        <button
                          className="tp-btn"
                          onClick={() => {
                            if (item.type === 'session') { const s = todaySessions.find(x => x.id === item.id); if (s) onStartFocus?.(s) }
                            else if (item.type === 'review') { onOpenBrainDump?.() }
                          }}
                          style={{
                            flexShrink: 0,
                            minHeight: 40,
                            minWidth: 88,
                            padding: '0 16px',
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: '#fff',
                            background: item.color,
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            letterSpacing: '-0.005em',
                            boxShadow: `0 2px 6px ${item.color}30`,
                          }}
                        >
                          {item.type === 'session' ? 'Start' : 'Review'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Missed sessions reschedule banner ── */}
        {missedSessions.length > 0 && onRescheduleSession && (
          <div style={{
            gridColumn: 'span 12',
            background: '#FFFBEB',
            border: '1px solid rgba(217,119,6,0.2)',
            borderLeft: '4px solid #D97706',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="14" height="14" fill="none" stroke="#D97706" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                {missedSessions.length === 1 ? '1 missed session' : `${missedSessions.length} missed sessions`} from the past few days
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {missedSessions.map(s => {
                const color = s.color?.dot ?? D.blue
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#92400E', flex: 1, minWidth: 120 }}>
                      {clean(s.courseName)} · {s.sessionType ?? 'Study Session'} · {s.dateStr}
                    </span>
                    <button
                      onClick={() => onRescheduleSession(s.id, todayStr)}
                      style={{ background: '#D97706', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      Move to today
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── CARS Daily Drill nudge ── */}
        {courses.some(c => /CARS/i.test(c.name)) && (
          <div style={{
            gridColumn: 'span 12',
            display: 'flex', alignItems: 'center', gap: 14,
            background: D.bgCard,
            border: `1px solid rgba(37,99,235,0.2)`,
            borderLeft: `4px solid ${D.blue}`,
            borderRadius: 10,
            boxShadow: `0 2px 10px rgba(37,99,235,0.08)`,
            padding: '12px 18px',
          }}>
            <div style={{ color: D.blue, flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: D.text }}>Daily CARS Drill</p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: D.textMuted }}>MCAT top scorers read one CARS passage every day. Make it the first thing you do: 10 minutes, no exceptions.</p>
            </div>
            <button onClick={() => onOpenStudyCoach?.()} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'rgba(59,97,196,0.07)', color: D.blue, border: `1px solid rgba(59,97,196,0.2)`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Plan today's session
            </button>
          </div>
        )}

        {/* ── UP NEXT TODAY (span 7) ── */}
        <div
          onMouseEnter={() => setUpNextHovered(true)}
          onMouseLeave={() => setUpNextHovered(false)}
          onClick={() => typeof onNavigateToCalendar === 'function' && onNavigateToCalendar(displaySession?.dateStr ?? todayStr)}
          style={{
            gridColumn: 'span 7',
            background: `linear-gradient(135deg, ${sessionColor}12 0%, #ffffff 60%)`,
            border: `1px solid ${upNextHovered ? `${sessionColor}50` : `${sessionColor}28`}`,
            borderRadius: 14,
            display: 'flex', overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: upNextHovered
              ? `0 8px 30px ${sessionColor}25, 0 2px 8px rgba(0,0,0,0.06)`
              : `0 1px 3px rgba(0,0,0,0.07)`,
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
          }}
        >
          {/* Color bar */}
          <div style={{ width: 5, background: sessionColor, flexShrink: 0 }} />

          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Label color={sessionColor}>Up next today</Label>
              {uncompletedToday.length > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: D.textDim, marginRight: 6 }}>{uncompletedToday.length} queued</span>
                  {uncompletedToday.slice(0, 6).map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setSessionIdx(i) }}
                      style={{
                        width: i === sessionIdx ? 18 : 6, height: 6, borderRadius: 3,
                        background: i === sessionIdx ? sessionColor : D.border,
                        border: 'none', cursor: 'pointer',
                        transition: 'all 0.2s', padding: 0,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {allComplete && todaySessions.length > 0 ? (
              <div style={{ paddingTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: D.text }}>All done for today.</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: D.textMuted }}>
                      {todaySessions.length === 1 ? '1 session complete' : `${todaySessions.length} sessions complete`}
                    </p>
                  </div>
                  {todaySessions.length >= 2 && (
                    <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg, rgba(251,146,60,0.12), rgba(239,68,68,0.10))', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 700, color: '#EA580C', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      You're on a roll
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
                  The best time to test your recall is right after a session, before the forgetting curve kicks in. A quick Brain Dump now doubles what sticks.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={e => { e.stopPropagation(); onOpenBrainDump?.() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', background: '#059669', border: 'none', cursor: 'pointer' }}
                  >
                    Try a Brain Dump →
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onOpenQuizBurst?.() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: D.amber, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', cursor: 'pointer' }}
                  >
                    Quiz Burst
                  </button>
                </div>
              </div>
            ) : displaySession ? (
              <>
                <div style={{ fontSize: 12, color: D.textMuted, fontWeight: 500, marginBottom: 4 }}>
                  <span style={{ color: sessionColor, fontWeight: 600 }}>{clean(displaySession.courseName)}</span>
                  {displaySession.startTime && (
                    <span style={{ color: D.textDim, marginLeft: 8 }}>
                      {formatTime(displaySession.startTime)} &rarr; {formatTime(addMinutes(displaySession.startTime, displaySession.duration ?? 60))}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: D.text, lineHeight: 1.2, marginBottom: 'auto' }}>
                  {displaySession.sessionType ?? 'Study Session'}
                  {displaySession.duration ? (
                    <span style={{ fontSize: 15, fontWeight: 400, color: D.textMuted, marginLeft: 10 }}>{displaySession.duration} min</span>
                  ) : null}
                </div>

                <div className="dash-up-next-btns" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
                  <button
                    onMouseEnter={() => setStartBtnHovered(true)}
                    onMouseLeave={() => setStartBtnHovered(false)}
                    onClick={(e) => { e.stopPropagation(); onStartFocus && onStartFocus(displaySession) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      background: D.accent, color: '#fff',
                      padding: '10px 20px', borderRadius: 9,
                      fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                      boxShadow: startBtnHovered ? `0 4px 16px ${D.accent}50` : `0 2px 8px ${D.accent}30`,
                      transition: 'box-shadow 0.15s, transform 0.1s',
                      transform: startBtnHovered ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <IcoPlay /> Start session
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleToggle(displaySession.id) }} style={{ fontSize: 13, color: D.textMuted, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer' }}>Mark done</button>
                  <button onClick={(e) => { e.stopPropagation(); setSessionIdx(i => (i + 1) % Math.max(uncompletedToday.length, 1)) }} style={{ fontSize: 13, color: D.textMuted, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer' }}>Skip</button>
                  <div className="dash-pomodoro" style={{ marginLeft: 'auto', fontSize: 11, color: D.textDim, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IcoZap /> Pomodoro · 25 + 5
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 10 }}>
                  AI-structured session blocks · recall checkpoints
                </div>
              </>
            ) : (
              <div style={{ paddingTop: 4 }}>
                {isExamMode && allSessions.length === 0 ? (
                  <>
                    <p style={{ color: D.textMuted, fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>Head to Study Coach to build your full prep schedule.</p>
                    <button onClick={() => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0)} style={{ background: D.blue, color: '#fff', fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                      Open Study Coach
                    </button>
                  </>
                ) : (
                  <>
                    {/* Next upcoming session preview */}
                    {nextSession && nextSession.dateStr > todayStr ? (
                      <div style={{ marginBottom: 20, padding: '14px 16px', background: `${nextSession.color?.dot ?? D.blue}10`, borderRadius: 10, border: `1px solid ${nextSession.color?.dot ?? D.blue}30` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Coming up</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: D.text }}>{nextSession.sessionType ?? 'Study Session'}</div>
                        <div style={{ fontSize: 12, color: D.textMuted, marginTop: 3 }}>
                          <span style={{ color: nextSession.color?.dot ?? D.blue, fontWeight: 600 }}>{clean(nextSession.courseName)}</span>
                          {' · '}
                          {(() => { const d = daysBetween(todayStr, nextSession.dateStr); return d === 1 ? 'Tomorrow' : `In ${d} days` })()}
                          {nextSession.duration ? ` · ${nextSession.duration} min` : ''}
                        </div>
                      </div>
                    ) : (
                      <p style={{ color: D.textMuted, fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
                        No sessions today. A Brain Dump or Quiz Burst keeps the material fresh. Even 10 minutes builds the habit.
                      </p>
                    )}

                    {/* Quick study actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                      <button
                        onClick={e => { e.stopPropagation(); onOpenBrainDump?.() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: '#059669', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)', cursor: 'pointer' }}
                      >
                        Brain Dump
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onOpenQuizBurst?.() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: D.amber, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', cursor: 'pointer' }}
                      >
                        Quiz Burst
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); typeof onAddSession === 'function' && onAddSession(todayStr) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: D.blue, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.2)', cursor: 'pointer' }}
                      >
                        + Add session
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── QUICK ACTIONS (span 5) ── */}
        <Card glowColor={D.blue} style={{ gridColumn: 'span 5', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0 4px', marginBottom: 12 }}>
            <Label color={D.blue}>Quick actions</Label>
          </div>
          {[
            { icon: <IcoBrain />, color: D.blue,    label: 'Study Coach',    sub: 'AI-powered weekly plan',   onClick: () => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0) },
            { icon: <IcoGrad />,  color: D.green,   label: 'Grade Hub',      sub: 'Track grades and targets', onClick: () => typeof onNavigateToGrades === 'function' && onNavigateToGrades(0) },
            { icon: <IcoCards />, color: '#3B61C4', label: 'Flashcards',     sub: 'Test your knowledge',      onClick: () => typeof onNavigateToTools === 'function' && onNavigateToTools() },
          ].map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 10, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', width: '100%', transition: 'background 0.12s', borderBottom: i < 2 ? `1px solid ${D.border}` : 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = `${a.color}08` }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <IconPill color={a.color}>{a.icon}</IconPill>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{a.label}</div>
                <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 1 }}>{a.sub}</div>
              </div>
              <span style={{ color: D.textDim }}><IcoChevron /></span>
            </button>
          ))}
          <div style={{ margin: '10px 8px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: D.border }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: D.textDim, textTransform: 'uppercase' }}>Study Hacks</span>
            <div style={{ flex: 1, height: 1, background: D.border }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 4px' }}>
            {[
              { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>, color: '#059669', label: 'Brain Dump',  onClick: () => typeof onOpenBrainDump === 'function' && onOpenBrainDump() },
              { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, color: D.red,     label: 'Rescue Plan', onClick: () => typeof onOpenExamRescue === 'function' && onOpenExamRescue() },
              { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>,               color: D.amber,   label: 'Quiz Burst',  onClick: () => typeof onOpenQuizBurst === 'function' && onOpenQuizBurst() },
              { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>, color: '#0D9488', label: 'Podcast', onClick: () => typeof onOpenPodcast === 'function' && onOpenPodcast() },
            ].map(a => (
              <button
                key={a.label}
                onClick={e => { e.stopPropagation(); a.onClick() }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                  background: `${a.color}08`, border: `1px solid ${a.color}18`,
                  cursor: 'pointer', width: '100%', transition: 'background 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${a.color}15`; e.currentTarget.style.borderColor = `${a.color}35` }}
                onMouseLeave={e => { e.currentTarget.style.background = `${a.color}08`; e.currentTarget.style.borderColor = `${a.color}18` }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${a.color}15`, border: `1px solid ${a.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color }}>
                  {a.icon}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: D.text, lineHeight: 1.3 }}>{a.label}</div>
              </button>
            ))}
          </div>

          {/* ── This-week performance strip ── */}
          <button
            onClick={() => typeof onNavigateToProgress === 'function' && onNavigateToProgress()}
            style={{
              marginTop: 12, padding: '10px 10px', borderRadius: 10,
              background: 'rgba(59,97,196,0.04)', border: '1px solid rgba(59,97,196,0.10)',
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,97,196,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,97,196,0.04)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <div style={{ flex: 1, fontSize: 12, color: '#6B6B6B' }}>
              <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{weekPerf.weekHours}h</span> this week
              {weekPerf.avgRecall != null && (
                <> · <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{weekPerf.avgRecall}%</span> recall</>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#3B61C4' }}>Progress →</span>
          </button>
        </Card>

        {/* ── TODAY'S BRIEF (span 12) ── */}
        {!aiBriefDismissed && (
          <Card
            glowColor={D.accent}
            style={{
              gridColumn: 'span 12',
              padding: '18px 22px',
              borderLeft: `4px solid ${D.accent}`,
              background: `linear-gradient(135deg, rgba(232,83,26,0.03) 0%, #ffffff 50%)`,
            }}
          >
            <div className="dash-brief-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ marginBottom: 8 }}><Label color={D.accent}>Today's brief</Label></div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: D.text, fontWeight: 400 }}>{aiMessage}</p>
              </div>
              <div className="dash-brief-btns" style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start', paddingTop: 2 }}>
                <button onClick={() => typeof onNavigateToCalendar === 'function' && onNavigateToCalendar()} style={{ fontSize: 12, fontWeight: 600, color: D.text, padding: '7px 13px', borderRadius: 7, border: `1px solid ${D.borderStrong}`, background: 'none', cursor: 'pointer' }}>
                  View schedule
                </button>
                <button onClick={() => { sessionStorage.setItem('studyedge_brief_dismissed', '1'); setAiBriefDismissed(true) }} style={{ fontSize: 16, color: D.textDim, padding: '5px 6px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }} aria-label="Dismiss">×</button>
              </div>
            </div>
          </Card>
        )}

        {/* ── AI COACH RECOMMENDATION (span 12) ── */}
        <Card
          glowColor={D.blue}
          style={{
            gridColumn: 'span 12',
            padding: 20, display: 'flex', flexDirection: 'column',
            background: `linear-gradient(145deg, rgba(59,97,196,0.05) 0%, #ffffff 60%)`,
          }}
        >
          <div style={{ marginBottom: 12 }}><Label color={D.blue}>Study Coach recommendation</Label></div>
          <p style={{ margin: '0 0 auto', fontSize: 15, lineHeight: 1.65, color: D.textMuted, fontWeight: 400, flex: 1 }}>
            {aiCoachMessage}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={() => typeof onOpenStudyCoach === 'function' && onOpenStudyCoach(0)}
              style={{
                flex: 1, padding: '10px 14px',
                background: '#3B61C4',
                border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#3155b3' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#3B61C4' }}
            >
              <IcoStar /> Build my plan
            </button>
            <button
              onClick={() => typeof onNavigateToTutor === 'function' && onNavigateToTutor()}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'none', border: `1px solid rgba(59,97,196,0.25)`,
                borderRadius: 9, fontSize: 13, fontWeight: 600, color: D.blue,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,97,196,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <IcoMsg /> Talk to your coach
            </button>
          </div>
        </Card>

        {/* ── WEAK SPOTS (span 12) ── */}
        {(() => {
          const toolWeakTopics = getWeakTopics()
          const hasAny = weakSpots.length > 0 || toolWeakTopics.length > 0
          if (!hasAny) return null
          return (
            <Card glowColor={D.red} style={{ gridColumn: 'span 12', padding: '18px 20px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Label color={D.red}>Your weak spots</Label>
                <span style={{ fontSize: 11.5, color: D.textDim }}>identified from your study sessions · practice to close the gap</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {weakSpots.slice(0, 4).map(({ topic, courseName: cName }, i) => (
                  <div
                    key={`coach-${i}`}
                    style={{
                      background: `${D.red}07`, border: `1px solid ${D.red}18`,
                      borderRadius: 10, padding: '12px 14px',
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.red, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>AI Coach</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D.text, lineHeight: 1.3 }}>{topic}</div>
                    <div style={{ fontSize: 11.5, color: D.textDim, marginBottom: 6 }}>{cName}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onDrillTopic?.(topic)}
                        style={{
                          fontSize: 11.5, fontWeight: 700, color: D.blue,
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: 0, textAlign: 'left',
                        }}
                      >
                        Drill →
                      </button>
                      <button
                        onClick={() => onNavigateToTutor?.(`I need help with ${topic}. I've been getting this wrong in my ${cName} quizzes. Can you quiz me on it and explain what I'm missing?`)}
                        style={{
                          fontSize: 11.5, fontWeight: 700, color: D.red,
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: 0, textAlign: 'left',
                        }}
                      >
                        Ask Coach →
                      </button>
                    </div>
                  </div>
                ))}
                {toolWeakTopics.slice(0, 6 - Math.min(weakSpots.length, 4)).map((topic, i) => (
                  <div
                    key={`tool-${i}`}
                    style={{
                      background: `${D.red}07`, border: `1px solid ${D.red}18`,
                      borderRadius: 10, padding: '12px 14px',
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Study Tools</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D.text, lineHeight: 1.3 }}>{topic}</div>
                    <button
                      onClick={() => onDrillTopic?.(topic)}
                      style={{
                        fontSize: 11.5, fontWeight: 700, color: D.blue,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, textAlign: 'left', marginTop: 6,
                      }}
                    >
                      Drill →
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )
        })()}

        {/* ── COURSES (span 6) ── */}
        <Card glowColor={D.blue} style={{ gridColumn: 'span 6', padding: '20px 0' }} onClick={onNavigateToCourses}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 14 }}>
            <Label color={D.blue}>{isExamMode ? 'Sections' : 'Courses'}</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: D.textDim, fontWeight: 500 }}>Hrs · Recall</span>
              <span style={{ fontSize: 12, color: D.blue, fontWeight: 600, cursor: 'pointer', opacity: 0.7 }}>View all</span>
            </div>
          </div>
          {courses.map((course, idx) => {
            const color = course.color?.dot ?? courseColor(idx)
            const last = lastSessionPerCourse[idx]
            const lastLabel = last ? (() => {
              const d = daysBetween(last.dateStr, todayStr)
              return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`
            })() : null
            const hrs = hoursPerCourse[idx] ?? 0
            const recall = avgRecallPerCourse[idx]
            const readiness = computeReadiness(course, last, todayStr)
            const ctaLabel = readiness === 'at-risk' ? 'Rescue Plan' : readiness === 'needs-work' ? 'Brain Dump' : null
            const ctaFn = readiness === 'at-risk' ? onOpenExamRescue : onOpenBrainDump
            return (
              <div
                key={idx}
                className="dash-course-row"
                style={{ display: 'grid', gridTemplateColumns: '5px 1fr 130px 110px', gap: 12, alignItems: 'center', padding: '11px 20px', borderTop: `1px solid ${D.border}`, transition: 'background 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = `${color}07` }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 5, height: 26, background: color, borderRadius: 3 }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: D.text }}>{clean(course.name)}</div>
                  <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 2 }}>
                    {lastLabel ? `Last studied ${lastLabel}` : 'No sessions yet'}
                  </div>
                </div>
                <div className="dash-course-meta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>{hrs > 0 ? `${hrs}h` : '-'}</span>
                  <span style={{ fontSize: 11, color: D.textDim }}>
                    {recall != null ? `${recall}% recall` : 'no sessions'}
                  </span>
                </div>
                <div className="dash-course-meta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <ReadinessPill status={readiness} />
                  {ctaLabel && (
                    <button
                      onClick={e => { e.stopPropagation(); ctaFn?.() }}
                      style={{ fontSize: 10.5, fontWeight: 700, color: readiness === 'at-risk' ? D.red : D.amber, background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
                    >
                      {ctaLabel} →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </Card>

        {/* ── THIS WEEK (span 6) ── */}
        <Card
          glowColor={onPace ? D.green : D.amber}
          style={{ gridColumn: 'span 6', padding: 20, position: 'relative' }}
          onClick={pendingAdaptation ? onShowAdaptModal : onNavigateToProgress}
        >
          {/* Adaptation badge - pulsing blue dot */}
          {pendingAdaptation && (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              display: 'flex', alignItems: 'center', gap: 6,
              background: `${D.blue}10`, border: `1px solid ${D.blue}30`,
              borderRadius: 999, padding: '3px 10px 3px 6px',
              cursor: 'pointer',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: D.blue, display: 'inline-block',
                animation: 'dash-pulse 1.8s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: D.blue, letterSpacing: '0.02em' }}>
                Plan updated
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Label color={onPace ? D.green : D.amber}>This week</Label>
            <span style={{
              fontSize: 11, fontWeight: 700, color: onPace ? D.green : D.amber,
              background: onPace ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
              border: `1px solid ${onPace ? 'rgba(22,163,74,0.25)' : 'rgba(217,119,6,0.25)'}`,
              padding: '3px 10px', borderRadius: 999, letterSpacing: '0.04em',
            }}>
              {onPace ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>On pace</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>Behind</span>)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'Study streak',  value: streak,         unit: streak === 1 ? 'day' : 'days', delta: streak,        positive: streak > 0,       icon: <IcoFlame color="#F97316" />,  iconBg: 'rgba(249,115,22,0.1)',  iconColor: '#F97316', subtext: daysToNextMilestone === 1 ? `${nextStreakMilestone}-day streak tomorrow` : daysToNextMilestone === 2 ? `${daysToNextMilestone} days to ${nextStreakMilestone}-day streak` : freezeCount > 0 ? `${freezeCount} freeze${freezeCount !== 1 ? 's' : ''} available` : null },
              { label: 'Hours studied', value: weekHours,      unit: 'hrs',                          delta: deltaHours,    positive: deltaHours >= 0,  icon: <IcoClock color={D.blue} />,   iconBg: 'rgba(59,97,196,0.1)',   iconColor: D.blue },
              { label: 'Sessions done', value: weekSessionCount, unit: '',                           delta: deltaSessions, positive: deltaSessions >= 0, icon: <IcoCheck color={D.green} />, iconBg: 'rgba(22,163,74,0.1)',   iconColor: D.green },
            ].map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < 2 ? `1px solid ${D.border}` : 'none' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: stat.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: stat.iconColor }}>
                  {stat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: D.textMuted }}>{stat.label}</div>
                  {stat.subtext && <div style={{ fontSize: 11, color: '#F97316', fontWeight: 600, marginTop: 1 }}>{stat.subtext}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: D.text, letterSpacing: -0.5 }}>{stat.value}</span>
                  {stat.unit && <span style={{ fontSize: 12, color: D.textMuted }}>{stat.unit}</span>}
                </div>
                {stat.delta !== undefined && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    fontSize: 11, fontWeight: 600,
                    color: stat.positive ? D.green : D.red,
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
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: D.textDim, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>Weekly goal</span>
              <span style={{ color: onPace ? D.green : D.amber, fontWeight: 600 }}>{weekHours} of {weeklyGoalHours}h</span>
            </div>
            <div style={{ height: 6, background: '#EEECE8', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${goalPct}%`, height: '100%', borderRadius: 3,
                background: onPace
                  ? `linear-gradient(90deg, #16A34A, #4ade80)`
                  : `linear-gradient(90deg, #D97706, #fbbf24)`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {overallReadiness && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: D.textDim }}>Exam Readiness</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: overallReadiness.color, background: `${overallReadiness.color}12`, padding: '2px 8px', borderRadius: 5 }}>{overallReadiness.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 7, background: '#EEECE8', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${overallReadiness.score}%`, height: '100%', borderRadius: 4,
                    background: `linear-gradient(90deg, ${overallReadiness.color}, ${overallReadiness.color}BB)`,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: overallReadiness.color, minWidth: 38, textAlign: 'right', letterSpacing: -0.3 }}>{overallReadiness.score}%</span>
              </div>
            </div>
          )}
        </Card>

        {/* ── DEADLINE RADAR (span 12) ── */}
        {upcomingDeadlines.length > 0 && (
          <Card glowColor="#DC2626" style={{ gridColumn: 'span 12', padding: 20 }} onClick={onNavigateToCalendar}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Label color="#DC2626">Upcoming deadlines</Label>
                <div style={{ fontSize: 12, color: D.textDim, marginTop: 2 }}>Next 14 days</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: D.textDim }}>
                {[['#DC2626','Urgent'],['#D97706','Soon'],['#9B9B9B','Planned']].map(([col,lbl]) => (
                  <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, animation: col === '#DC2626' ? 'dash-pulse 2s infinite' : undefined }} />{lbl}
                  </span>
                ))}
              </div>
            </div>

            {/* Timeline bar */}
            <div style={{ position: 'relative', height: 24, marginBottom: 16 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1, background: `linear-gradient(90deg, rgba(220,38,38,0.3), ${D.border})` }} />
              {upcomingDeadlines.map((evt, i) => {
                const days = daysBetween(todayStr, evt.date)
                const left = Math.min(98, (days / 14) * 100)
                const uc = urgencyColor(days)
                return (
                  <div key={i} style={{ position: 'absolute', left: `${left}%`, top: 0, transform: 'translateX(-50%)' }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: uc, marginTop: 7,
                      border: `2px solid ${D.bgCard}`,
                      boxShadow: `0 0 6px ${uc}60`,
                    }} />
                  </div>
                )
              })}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: -2, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: D.textDim }}>
                <span>Today</span><span>+7d</span><span>+14d</span>
              </div>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {upcomingDeadlines.map((evt, i) => {
                const days = daysBetween(todayStr, evt.date)
                const uc = urgencyColor(days)
                return (
                  <div key={evt.id ?? i} className="dash-radar-row" style={{ display: 'grid', gridTemplateColumns: '4px 1fr 70px 70px', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i > 0 ? `1px solid ${D.border}` : 'none' }}>
                    <div style={{ width: 4, height: 22, background: evt.color?.dot ?? uc, borderRadius: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(evt.name)}</div>
                      <div style={{ fontSize: 11.5, color: D.textDim, marginTop: 1 }}>{clean(evt.courseName)}</div>
                    </div>
                    <div className="dash-radar-date" style={{ fontSize: 11.5, color: D.textMuted, whiteSpace: 'nowrap' }}>{formatShortDate(evt.date)}</div>
                    <div style={{ fontSize: 11.5, color: uc, fontWeight: 700, whiteSpace: 'nowrap', background: `${uc}10`, padding: '3px 8px', borderRadius: 6 }}>{days}d · {urgencyLabel(days)}</div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

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
