import { useMemo, useState, useEffect, Fragment } from 'react'
import { clean } from '../utils/strings'
import { toDateStr, addDays, daysBetween } from '../utils/dateUtils'
import { getCachedPracticeScores, savePracticeScores, getCachedSessionRecalls, getCachedStudyTools } from '../lib/db'
import { getDueCards } from '../lib/sm2'
import { getActivePlan, hasUsedTrial } from '../lib/subscription'
import { getAllMastery, getMasteryLevel, getMasteryColor, getReviewStats } from '../lib/masteryStore'
import { computeConfidenceGap } from '../lib/confidenceStore'
import { computeMomentumHistory, momentumColor } from '../lib/momentum'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:           '#F7F6F3',
  bgCard:       '#FFFFFF',
  border:       'rgba(0,0,0,0.07)',
  text:         '#111111',
  textMuted:    '#6B6B6B',
  textDim:      '#9B9B9B',
  accent:       '#E8531A',
  green:        '#16A34A',
  amber:        '#D97706',
  pink:         '#DC2626',
  cyan:         '#0891B2',
  orange:       '#E8531A',
  blue:         '#2563EB',
  purple:       '#3B61C4',
}

const COURSE_PALETTE = ['#6366f1','#f472b6','#22d3ee','#fbbf24','#4ade80','#f97316']
const cc = (idx) => COURSE_PALETTE[idx % COURSE_PALETTE.length]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMonWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return toDateStr(d)
}
function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function getSemesterLabel() {
  const m = new Date().getMonth()
  const y = new Date().getFullYear()
  if (m <= 4) return `Spring ${y}`
  if (m <= 7) return `Summer ${y}`
  return `Fall ${y}`
}

// Use actual elapsed minutes when available, otherwise fall back to planned duration (minutes)
function sessionMinutes(s) {
  if (s.elapsedSeconds != null && s.elapsedSeconds > 0) return s.elapsedSeconds / 60
  return s.duration ?? 0
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color, w = 100, h = 38 }) {
  if (!data || data.length < 2) return <svg width={w} height={h} />
  const max = Math.max(...data, 0.001)
  const pts = data.map((v, i) => [
    1 + (i / (data.length - 1)) * (w - 2),
    h - 3 - ((v / max) * (h - 10)),
  ])
  const poly = pts.map(([x,y]) => `${x},${y}`).join(' ')
  const area = `M${pts[0][0]},${h} ` + pts.map(([x,y]) => `L${x},${y}`).join(' ') + ` L${pts[pts.length-1][0]},${h}Z`
  const id = `sg${color.replace('#','').slice(0,6)}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Radar (Bloom's) ──────────────────────────────────────────────────────────
function RadarChart({ values, labels, size = 210 }) {
  const pad = 44 // padding for labels
  const total = size + pad * 2
  const cx = total / 2, cy = total / 2, r = size * 0.34
  const n = labels.length
  const angle = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2
  const pt = (i, radius) => [cx + Math.cos(angle(i)) * radius, cy + Math.sin(angle(i)) * radius]
  const rings = [0.25, 0.5, 0.75, 1.0]
  const dataPath = values.map((v, i) => {
    const [x, y] = pt(i, r * Math.min(1, Math.max(0.05, v / 100)))
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ') + 'Z'
  return (
    <svg width={total} height={total} viewBox={`0 0 ${total} ${total}`} overflow="visible">
      {rings.map((ring, ri) => {
        const d = Array.from({ length: n }, (_, i) => {
          const [x, y] = pt(i, r * ring)
          return `${i === 0 ? 'M' : 'L'}${x},${y}`
        }).join(' ') + 'Z'
        return <path key={ri} d={d} fill="none" stroke={D.border} strokeWidth={ring === 1 ? 1 : 0.5} />
      })}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = pt(i, r)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={D.border} strokeWidth="1" />
      })}
      <path d={dataPath} fill={`${D.accent}22`} stroke={D.accent} strokeWidth="1.5" />
      {values.map((v, i) => {
        const [x, y] = pt(i, r * Math.min(1, Math.max(0.05, v / 100)))
        return <circle key={i} cx={x} cy={y} r="3.5" fill={D.accent} />
      })}
      {labels.map((lbl, i) => {
        const [x, y] = pt(i, r + 22)
        const anchor = Math.abs(x - cx) < 5 ? 'middle' : x < cx ? 'end' : 'start'
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle"
            style={{ fontSize: 10, fill: D.textMuted, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500 }}>
            {lbl}
          </text>
        )
      })}
    </svg>
  )
}

// ── Area chart ────────────────────────────────────────────────────────────────
function AreaChart({ data, labels, color, goalLine }) {
  if (!data || data.length < 2) return (
    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: D.textDim }}>Not enough data yet.</span>
    </div>
  )
  const W = 480, H = 130
  const padL = 28, padR = 14, padT = 10, padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(...data, goalLine ?? 0, 0.001) * 1.25
  const xS = (i) => padL + (i / (data.length - 1)) * innerW
  const yS = (v) => padT + innerH - (v / max) * innerH
  const pts = data.map((v, i) => [xS(i), yS(v)])
  const poly = pts.map(([x,y]) => `${x},${y}`).join(' ')
  const area = `M${xS(0)},${H - padB} ` + pts.map(([x,y]) => `L${x},${y}`).join(' ') + ` L${xS(data.length-1)},${H - padB}Z`
  const goalY = goalLine != null ? yS(goalLine) : null
  const skip = Math.ceil(labels.length / 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130, overflow: 'visible' }}>
      <defs>
        <linearGradient id="acGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {goalY != null && (
        <line x1={padL} y1={goalY} x2={W - padR} y2={goalY}
          stroke={D.textDim} strokeWidth="1" strokeDasharray="4 3" />
      )}
      <path d={area} fill="url(#acGrad)" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {labels.map((lbl, i) => (
        i % skip === 0 && (
          <text key={i} x={xS(i)} y={H - 5} textAnchor="middle"
            style={{ fontSize: 9, fill: D.textDim }}>
            {lbl}
          </text>
        )
      ))}
    </svg>
  )
}

// ── Milestone icon ─────────────────────────────────────────────────────────────
function MilestoneIcon({ type, earned }) {
  const col = earned ? D.accent : D.textDim
  const icons = {
    streak:    <svg width="16" height="16" viewBox="0 0 24 24" fill={col}><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>,
    sessions:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round"><path d="M6 4l14 8-14 8V4z"/></svg>,
    hours:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
    focus:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>,
    diversity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>,
    award:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>,
  }
  return icons[type] ?? icons.sessions
}

const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i

// ── Score projection helper ───────────────────────────────────────────────────
function getProjection(entries, target, examDate, todayStr) {
  if (!entries || entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0], last = sorted[sorted.length - 1]
  const span = Math.max(1, (new Date(last.date + 'T12:00') - new Date(first.date + 'T12:00')) / 86400000)
  const slopePerDay = (last.score - first.score) / span
  const weeklyRate = +(slopePerDay * 7).toFixed(1)
  const gap = (target && target > last.score) ? target - last.score : null
  let projectedAtExam = null, onTrack = null
  if (examDate && examDate > todayStr) {
    const daysLeft = Math.round((new Date(examDate + 'T12:00') - new Date(todayStr + 'T12:00')) / 86400000)
    projectedAtExam = Math.round(last.score + slopePerDay * daysLeft)
    if (target) onTrack = projectedAtExam >= target
  }
  return { weeklyRate, latest: last.score, gap, projectedAtExam, onTrack, improving: slopePerDay > 0.01, flat: Math.abs(slopePerDay) <= 0.01 }
}

// ── Score line chart ──────────────────────────────────────────────────────────
function ScoreLineChart({ entries, color }) {
  if (!entries || entries.length < 2) return (
    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: D.textDim }}>Log at least 2 scores to see your trend.</span>
    </div>
  )
  const W = 480, H = 110
  const padL = 36, padR = 14, padT = 10, padB = 24
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const vals = entries.map(e => e.score)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const range = maxV - minV || 1
  const xS = i => padL + (i / (entries.length - 1)) * innerW
  const yS = v => padT + innerH - ((v - minV) / range) * innerH
  const pts = entries.map((e, i) => [xS(i), yS(e.score)])
  const poly = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M${xS(0)},${H - padB} ` + pts.map(([x, y]) => `L${x},${y}`).join(' ') + ` L${xS(entries.length - 1)},${H - padB}Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 110, overflow: 'visible' }}>
      <defs>
        <linearGradient id="slGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#slGrad)" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={color} />
          <text x={x} y={y - 8} textAnchor="middle" style={{ fontSize: 9, fill: color, fontWeight: 700 }}>{entries[i].score}</text>
          <text x={x} y={H - 5} textAnchor="middle" style={{ fontSize: 8.5, fill: D.textDim }}>{entries[i].date.slice(5)}</text>
        </g>
      ))}
      <text x={padL - 4} y={padT + 4} textAnchor="end" style={{ fontSize: 9, fill: D.textDim }}>{maxV}</text>
      <text x={padL - 4} y={H - padB + 4} textAnchor="end" style={{ fontSize: 9, fill: D.textDim }}>{minV}</text>
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ProgressView({ courses, allSessions, completedIds, completedSessionLog = [], todayStr, onShowPaywall, onOpenReviewQueue, onOpenBrainDump }) {
  const [period, setPeriod] = useState('Term')
  const isFree = getActivePlan() === 'free'
  const trialUsed = hasUsedTrial()

  const isExamMode = courses.some(c => EXAM_PATTERN.test(c.name))

  // ── Practice scores (exam mode) ──────────────────────────────────────────────
  const [practiceScores, setPracticeScores] = useState(() => getCachedPracticeScores())
  const [showScoreForm, setShowScoreForm] = useState(false)
  const [scoreForm, setScoreForm] = useState({ date: todayStr, sectionName: '', score: '', notes: '', isOfficial: false })
  const [scoreFormErr, setScoreFormErr] = useState('')

  useEffect(() => { savePracticeScores(practiceScores) }, [practiceScores])

  const examSections = useMemo(() => courses.filter(c => EXAM_PATTERN.test(c.name)).map(c => c.name), [courses])

  const scoresBySectionSorted = useMemo(() => {
    const map = {}
    practiceScores.forEach(e => {
      if (!map[e.sectionName]) map[e.sectionName] = []
      map[e.sectionName].push(e)
    })
    Object.keys(map).forEach(k => map[k].sort((a, b) => a.date.localeCompare(b.date)))
    return map
  }, [practiceScores])

  function submitScore() {
    setScoreFormErr('')
    if (!scoreForm.sectionName) return setScoreFormErr('Select a section.')
    const s = parseFloat(scoreForm.score)
    if (isNaN(s)) return setScoreFormErr('Enter a valid score.')
    const entry = { id: Date.now().toString(), date: scoreForm.date, sectionName: scoreForm.sectionName, score: s, notes: scoreForm.notes, isOfficial: scoreForm.isOfficial }
    setPracticeScores(prev => [...prev, entry])
    setScoreForm({ date: todayStr, sectionName: '', score: '', notes: '', isOfficial: false })
    setShowScoreForm(false)
  }

  // ── Completed sessions ──────────────────────────────────────────────────────
  // Use persistent log as source of truth; merge in any schedule sessions that
  // are completed but not yet in the log (handles existing users / edge cases).
  const completedSessions = useMemo(() => {
    const logIds = new Set(completedSessionLog.map(s => s.id))
    const fromSchedule = allSessions.filter(s => completedIds.has(s.id) && !logIds.has(s.id))
    return [...completedSessionLog, ...fromSchedule]
  }, [completedSessionLog, allSessions, completedIds])

  // ── Period cutoff ────────────────────────────────────────────────────────────
  const periodStart = useMemo(() => {
    if (period === '1w')  return addDays(todayStr, -7)
    if (period === '4w')  return addDays(todayStr, -28)
    if (period === '12w') return addDays(todayStr, -84)
    return '0000-00-00'
  }, [period, todayStr])

  const periodSessions = useMemo(() =>
    completedSessions.filter(s => s.dateStr >= periodStart),
    [completedSessions, periodStart]
  )

  // ── Streak + best streak ─────────────────────────────────────────────────────
  const { streak, bestStreak } = useMemo(() => {
    const datesSet = new Set(completedSessions.map(s => s.dateStr))

    // Current streak
    let count = 0
    const d = new Date(todayStr + 'T12:00:00')
    if (!datesSet.has(todayStr)) d.setDate(d.getDate() - 1)
    while (count < 999) {
      const k = toDateStr(d)
      if (!datesSet.has(k)) break
      count++
      d.setDate(d.getDate() - 1)
    }

    // Best streak
    const sorted = [...datesSet].sort()
    let best = count, cur = 0, prev = null
    for (const ds of sorted) {
      if (prev && daysBetween(prev, ds) === 1) { cur++ } else { cur = 1 }
      if (cur > best) best = cur
      prev = ds
    }
    return { streak: count, bestStreak: best }
  }, [completedSessions, todayStr])

  // ── Hours ────────────────────────────────────────────────────────────────────
  const { totalHours, thisWeekHours, lastWeekHours } = useMemo(() => {
    const ws  = getMonWeekStart(todayStr)
    const lws = addDays(ws, -7)
    const lwe = addDays(ws, -1)
    let total = 0, thisW = 0, lastW = 0
    completedSessions.forEach(s => {
      const m = sessionMinutes(s)
      total += m
      if (s.dateStr >= ws  && s.dateStr <= todayStr) thisW += m
      if (s.dateStr >= lws && s.dateStr <= lwe)       lastW += m
    })
    return { totalHours: total / 60, thisWeekHours: thisW / 60, lastWeekHours: lastW / 60 }
  }, [completedSessions, todayStr])

  // ── Focus score ──────────────────────────────────────────────────────────────
  const focusScore = useMemo(() => {
    const total = allSessions.length || 1
    const compRate = completedSessions.length / total
    const avgDur = completedSessions.length
      ? completedSessions.reduce((s, x) => s + sessionMinutes(x), 0) / completedSessions.length : 0
    const streakBonus = Math.min(1, streak / 14)
    return Math.min(100, Math.round(compRate * 40 + Math.min(1, avgDur / 60) * 35 + streakBonus * 25))
  }, [allSessions, completedSessions, streak])

  const sessionCount = completedSessions.length
  const avgDuration  = sessionCount
    ? Math.round(completedSessions.reduce((s, x) => s + sessionMinutes(x), 0) / sessionCount) : 0

  // ── Sparklines (8 weeks) ─────────────────────────────────────────────────────
  const sparklines = useMemo(() => {
    const streakArr = [], hoursArr = [], sessionsArr = [], focusArr = []
    for (let w = 7; w >= 0; w--) {
      const wStart = addDays(getMonWeekStart(todayStr), -w * 7)
      const wEnd   = addDays(wStart, 6)
      const ws = completedSessions.filter(s => s.dateStr >= wStart && s.dateStr <= wEnd)
      const wa = allSessions.filter(s => s.dateStr >= wStart && s.dateStr <= wEnd)
      const wH = ws.reduce((s, x) => s + sessionMinutes(x), 0) / 60
      const daysWithSessions = new Set(ws.map(s => s.dateStr)).size
      const compRate = wa.length ? ws.length / wa.length : 0
      const avgD = ws.length ? ws.reduce((s, x) => s + sessionMinutes(x), 0) / ws.length : 0
      hoursArr.push(wH)
      sessionsArr.push(ws.length)
      streakArr.push(daysWithSessions)
      focusArr.push(Math.round(compRate * 40 + Math.min(1, avgD / 60) * 35 + (daysWithSessions / 7) * 25))
    }
    return { streakArr, hoursArr, sessionsArr, focusArr }
  }, [completedSessions, allSessions, todayStr])

  // ── Weekly chart data ─────────────────────────────────────────────────────────
  const weeklyChart = useMemo(() => {
    const allDates = allSessions.map(s => s.dateStr).sort()
    if (!allDates.length) return { data: [], labels: [] }
    const semStart = getMonWeekStart(allDates[0])
    const weeks = []
    let cur = semStart, wIdx = 1
    while (cur <= todayStr && wIdx <= 26) {
      const wEnd = addDays(cur, 6)
      const h = completedSessions
        .filter(s => s.dateStr >= cur && s.dateStr <= wEnd)
        .reduce((s, x) => s + sessionMinutes(x), 0) / 60
      weeks.push({ label: `W${wIdx}`, hours: h })
      cur = addDays(cur, 7)
      wIdx++
    }
    const filtered = period === '1w'  ? weeks.slice(-2)
      : period === '4w'  ? weeks.slice(-4)
      : period === '12w' ? weeks.slice(-12)
      : weeks
    return { data: filtered.map(w => w.hours), labels: filtered.map(w => w.label) }
  }, [allSessions, completedSessions, todayStr, period])

  // ── Per-course hours ──────────────────────────────────────────────────────────
  const courseHours = useMemo(() => {
    const map = new Map()
    periodSessions.forEach(s => {
      map.set(s.courseId, (map.get(s.courseId) ?? 0) + sessionMinutes(s) / 60)
    })
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1
    return courses
      .map((course, idx) => ({
        course, idx,
        hours: map.get(idx) ?? 0,
        pct:   Math.round(((map.get(idx) ?? 0) / total) * 100),
      }))
      .filter(x => x.hours > 0)
      .sort((a, b) => b.hours - a.hours)
  }, [courses, periodSessions])

  const totalPeriodHours = courseHours.reduce((s, x) => s + x.hours, 0)

  // ── Bloom's radar ─────────────────────────────────────────────────────────────
  const bloomValues = useMemo(() => {
    const total = allSessions.length || 1
    const done  = completedSessions.length
    const compRate = done / total
    // Recall: recent 7-day completion
    const r7a = allSessions.filter(s => s.dateStr >= addDays(todayStr, -7))
    const r7d = r7a.filter(s => completedIds.has(s.id))
    const recall = r7a.length ? r7d.length / r7a.length : compRate
    // Apply: overall completion
    const apply = compRate
    // Analyze: % sessions >= 45 min
    const longSess = completedSessions.filter(s => (s.duration ?? 0) >= 45)
    const analyze  = done ? longSess.length / done : 0.4
    // Create: course diversity last 2 weeks
    const r14 = completedSessions.filter(s => s.dateStr >= addDays(todayStr, -14))
    const uniq = new Set(r14.map(s => s.courseId)).size
    const create = courses.length ? uniq / courses.length : 0.4
    // Evaluate: capped completion bonus
    const evaluate = Math.min(1, compRate * 1.15)
    // Understand: breadth (courses with at least 1 session done)
    const breadth = courses.length
      ? new Set(completedSessions.map(s => s.courseId)).size / courses.length : 0
    return [recall, apply, analyze, create, evaluate, breadth].map(v => Math.round(v * 100))
  }, [allSessions, completedSessions, completedIds, courses, todayStr])

  const bloomAvg = Math.round(bloomValues.reduce((a, b) => a + b, 0) / bloomValues.length)

  // ── Recall scores over time ───────────────────────────────────────────────────
  const sessionRecalls = useMemo(() => getCachedSessionRecalls(), [])

  const recallChartData = useMemo(() => {
    if (sessionRecalls.length < 2) return null
    const sorted = [...sessionRecalls]
      .filter(r => r.score != null)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .slice(-20) // last 20 entries
    if (sorted.length < 2) return null
    return {
      scores: sorted.map(r => Math.round(r.score * 100)),
      labels: sorted.map(r => r.date ? r.date.slice(5) : ''),
      avg: Math.round(sorted.reduce((s, r) => s + r.score * 100, 0) / sorted.length),
      latest: Math.round(sorted[sorted.length - 1].score * 100),
      trend: sorted.length >= 2
        ? sorted[sorted.length - 1].score - sorted[sorted.length - 2].score
        : 0,
    }
  }, [sessionRecalls])

  // ── SM-2 flashcard stats ──────────────────────────────────────────────────────
  const flashcardStats = useMemo(() => {
    const tools = getCachedStudyTools()
    const cards = tools?.flashcards ?? []
    if (!cards.length) return null
    const due = getDueCards(cards).length
    const mastered = cards.filter(c => (c.easeFactor ?? 2.5) >= 2.8 && (c.repetitions ?? 0) >= 3).length
    const struggling = cards.filter(c => (c.easeFactor ?? 2.5) < 2.0).length
    return { total: cards.length, due, mastered, struggling }
  }, [])

  // ── Standout moments ──────────────────────────────────────────────────────────
  const standoutMoments = useMemo(() => {
    const ws = getMonWeekStart(todayStr)
    const we = addDays(ws, 6)
    const thisWeek = completedSessions.filter(s => s.dateStr >= ws && s.dateStr <= we)
    const pool = thisWeek.length >= 2
      ? thisWeek
      : completedSessions.filter(s => s.dateStr >= addDays(todayStr, -14))
    return pool
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
      .slice(0, 4)
  }, [completedSessions, todayStr])

  // ── Focus heatmap ─────────────────────────────────────────────────────────────
  const { heatGrid, heatMax, peakSlot } = useMemo(() => {
    const TIME_SLOTS = [6, 9, 12, 15, 18, 21]
    const grid = Array.from({ length: 7 }, () => new Array(6).fill(0))
    completedSessions.forEach(s => {
      const dow = new Date(s.dateStr + 'T12:00:00').getDay() // 0=Sun
      const dayIdx = dow === 0 ? 6 : dow - 1               // Mon=0
      if (s.startTime) {
        const h = parseInt(s.startTime.split(':')[0], 10)
        const slotIdx = TIME_SLOTS.findIndex((sl, i) =>
          h >= sl && (i === TIME_SLOTS.length - 1 || h < TIME_SLOTS[i + 1])
        )
        if (slotIdx >= 0) grid[dayIdx][slotIdx]++
      } else {
        grid[dayIdx][2]++ // default midday
      }
    })
    const maxVal = Math.max(...grid.flat(), 1)
    // Find peak
    let pDay = 0, pSlot = 2, pVal = 0
    grid.forEach((row, d) => row.forEach((v, s) => { if (v > pVal) { pVal = v; pDay = d; pSlot = s } }))
    const DAY_NAMES  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    const SLOT_NAMES = ['6-9am','9am-12p','12-3pm','3-6pm','6-9pm','9pm+']
    const peak = pVal > 0 ? `${DAY_NAMES[pDay]} / ${SLOT_NAMES[pSlot]}` : 'Not enough data'
    return { heatGrid: grid, heatMax: maxVal, peakSlot: peak }
  }, [completedSessions])

  // ── Streak dots (21 days) ────────────────────────────────────────────────────
  const streakDots = useMemo(() => {
    const datesSet = new Set(completedSessions.map(s => s.dateStr))
    return Array.from({ length: 21 }, (_, i) => datesSet.has(addDays(todayStr, -(20 - i))))
  }, [completedSessions, todayStr])

  // ── Milestones ────────────────────────────────────────────────────────────────
  const milestones = useMemo(() => {
    const coursesDone = new Set(completedSessions.map(s => s.courseId)).size
    return [
      { id: 'sessions1',   label: 'First session',     sub: 'The journey starts',    type: 'sessions',  earned: sessionCount >= 1,   progress: Math.min(1, sessionCount / 1) },
      { id: 'sessions5',   label: '5 sessions',        sub: 'Building momentum',     type: 'sessions',  earned: sessionCount >= 5,   progress: Math.min(1, sessionCount / 5) },
      { id: 'streak3',     label: '3-day streak',      sub: 'Habit forming',         type: 'streak',    earned: bestStreak >= 3,     progress: Math.min(1, bestStreak / 3) },
      { id: 'streak7',     label: '1-week streak',     sub: 'Days in a row',         type: 'streak',    earned: bestStreak >= 7,     progress: Math.min(1, bestStreak / 7) },
      { id: 'streak14',    label: '2-week streak',     sub: 'Streak warrior',        type: 'streak',    earned: bestStreak >= 14,    progress: Math.min(1, bestStreak / 14) },
      { id: 'focus80',     label: 'Top focus score',   sub: focusScore >= 80 ? 'This week' : 'Score 80+', type: 'focus', earned: focusScore >= 80, progress: Math.min(1, focusScore / 80) },
      { id: 'sessions50',  label: '50 sessions',       sub: 'Halfway hero',          type: 'sessions',  earned: sessionCount >= 50,  progress: Math.min(1, sessionCount / 50) },
      { id: 'sessions100', label: '100 sessions',      sub: 'Century club',          type: 'sessions',  earned: sessionCount >= 100, progress: Math.min(1, sessionCount / 100) },
      { id: 'hours10',     label: '10h studied',       sub: 'Getting serious',       type: 'hours',     earned: totalHours >= 10,    progress: Math.min(1, totalHours / 10) },
      { id: 'hours50',     label: '50h studied',       sub: 'Half-century',          type: 'hours',     earned: totalHours >= 50,    progress: Math.min(1, totalHours / 50) },
      { id: 'hours100',    label: '100h studied',      sub: 'Deep work hero',        type: 'hours',     earned: totalHours >= 100,   progress: Math.min(1, totalHours / 100) },
      { id: 'allcourses',  label: 'All courses',       sub: 'Studied every subject', type: 'diversity', earned: courses.length > 0 && coursesDone >= courses.length, progress: courses.length > 0 ? coursesDone / courses.length : 0 },
    ]
  }, [bestStreak, focusScore, sessionCount, totalHours, completedSessions, courses])

  const earnedCount = milestones.filter(m => m.earned).length

  // ── AI Insights ───────────────────────────────────────────────────────────────
  const aiInsights = useMemo(() => {
    const insights = []

    // Momentum vs last week
    if (thisWeekHours > 0 || lastWeekHours > 0) {
      const diff = thisWeekHours - lastWeekHours
      const pct  = lastWeekHours > 0 ? Math.round(Math.abs(diff / lastWeekHours) * 100) : 100
      insights.push({
        tag:   diff >= 0 ? 'MOMENTUM' : 'ATTENTION',
        color: diff >= 0 ? D.cyan : D.amber,
        title: diff >= 0
          ? `You studied ${pct}% more than last week`
          : `Study hours are down ${pct}% this week`,
        body:  `${thisWeekHours.toFixed(1)}h this week vs ${lastWeekHours.toFixed(1)}h last week`,
      })
    }

    // Struggling courses
    for (const [idx, course] of courses.entries()) {
      const cs     = allSessions.filter(s => s.courseId === idx)
      const recent = cs.filter(s => s.dateStr >= addDays(todayStr, -14))
      const done   = recent.filter(s => completedIds.has(s.id))
      if (recent.length >= 2 && done.length / recent.length < 0.4) {
        insights.push({
          tag:   'ATTENTION',
          color: D.orange,
          title: `${clean(course.name)} needs attention`,
          body:  `Only ${done.length}/${recent.length} sessions done in the last 2 weeks`,
        })
        break // one attention per render
      }
    }

    // Peak study pattern
    if (peakSlot !== 'Not enough data') {
      const day = peakSlot.split(' / ')[0]
      insights.push({
        tag:   'PATTERN',
        color: D.cyan,
        title: `${day} is your power window`,
        body:  `You complete more sessions during ${peakSlot} than any other time`,
      })
    }

    // Deep work ratio
    const longCount = completedSessions.filter(s => (s.duration ?? 0) >= 45).length
    const longPct   = sessionCount ? Math.round((longCount / sessionCount) * 100) : 0
    if (longPct > 0) {
      insights.push({
        tag:   'FOCUS',
        color: D.accent,
        title: `Deep work ratio at ${longPct}%`,
        body:  `${longCount} of your ${sessionCount} sessions were 45+ minutes`,
      })
    }

    return insights.slice(0, 4)
  }, [thisWeekHours, lastWeekHours, courses, allSessions, completedSessions, completedIds, todayStr, peakSlot, sessionCount])

  // ── Header strings ────────────────────────────────────────────────────────────
  const semLabel = getSemesterLabel()
  const weekStr  = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const hoursDelta = lastWeekHours > 0
    ? `${thisWeekHours >= lastWeekHours ? '+' : ''}${Math.round(((thisWeekHours - lastWeekHours) / lastWeekHours) * 100)}%`
    : '+0%'

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="pv-outer" style={{ background: D.bg, minHeight: '100%', color: D.text, fontFamily: "'Inter', system-ui, sans-serif", padding: '28px 32px' }}>
      <style>{`
        .pv-stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px; }
        .pv-milestone-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .pv-2col { display:grid; gap:14px; margin-bottom:16px; }
        @media (max-width:640px) {
          .pv-outer { padding:18px 14px !important; }
          .pv-stat-grid { grid-template-columns:1fr 1fr !important; }
          .pv-milestone-grid { grid-template-columns:1fr 1fr !important; }
          .pv-2col { grid-template-columns:1fr !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
          PERSONAL ANALYTICS &nbsp;·&nbsp; Week of {weekStr}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>Progress</h1>
            <span style={{ fontSize: 12, fontWeight: 600, color: D.accent, background: `${D.accent}1a`, border: `1px solid ${D.accent}40`, borderRadius: 6, padding: '3px 10px' }}>{isExamMode ? 'Exam Prep' : semLabel}</span>
          </div>
          {/* Period toggle */}
          <div style={{ display: 'flex', gap: 2, background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 10, padding: 3 }}>
            {['1w','4w','12w','Term'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: period === p ? D.accent : 'transparent',
                color: period === p ? '#fff' : D.textMuted,
                border: 'none', cursor: 'pointer', transition: 'background 0.15s',
              }}>{p}</button>
            ))}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: D.textMuted }}>
          {isExamMode
            ? `Your prep momentum across ${courses.length} section${courses.length !== 1 ? 's' : ''}, visualized.`
            : `Your study momentum across ${courses.length} course${courses.length !== 1 ? 's' : ''}, visualized.`}
        </p>
      </div>

      {/* ── Practice Score Tracker (exam mode only) ── */}
      {isExamMode && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>PRACTICE SCORE TRACKER</div>
              <div style={{ fontSize: 12.5, color: D.textMuted }}>Log your full-length and section scores over time</div>
            </div>
            <button
              onClick={() => setShowScoreForm(v => !v)}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: `${D.accent}18`, color: D.accent, border: `1px solid ${D.accent}30`, cursor: 'pointer' }}
            >
              + Log Score
            </button>
          </div>

          {showScoreForm && (
            <div style={{ background: 'rgba(232,83,26,0.04)', border: '1px solid rgba(232,83,26,0.15)', borderRadius: 12, padding: '16px 20px', marginBottom: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: D.textMuted, display: 'block', marginBottom: 5 }}>Section</label>
                  <select
                    value={scoreForm.sectionName}
                    onChange={e => setScoreForm(f => ({ ...f, sectionName: e.target.value }))}
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: D.text, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
                  >
                    <option value="">Select section…</option>
                    {examSections.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: D.textMuted, display: 'block', marginBottom: 5 }}>Score</label>
                  <input
                    type="number"
                    placeholder="e.g. 512"
                    value={scoreForm.score}
                    onChange={e => setScoreForm(f => ({ ...f, score: e.target.value }))}
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: D.text, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: D.textMuted, display: 'block', marginBottom: 5 }}>Date</label>
                  <input
                    type="date"
                    value={scoreForm.date}
                    onChange={e => setScoreForm(f => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: D.text, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'light', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: D.textMuted, display: 'block', marginBottom: 5 }}>Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. felt strong on gen chem"
                    value={scoreForm.notes}
                    onChange={e => setScoreForm(f => ({ ...f, notes: e.target.value }))}
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: D.text, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: D.textMuted, display: 'block', marginBottom: 6 }}>Source</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ label: 'Official (AAMC / Bar / AICPA)', val: true }, { label: 'Third-party (Kaplan, Blueprint, etc.)', val: false }].map(opt => (
                    <button
                      key={String(opt.val)}
                      onClick={() => setScoreForm(f => ({ ...f, isOfficial: opt.val }))}
                      style={{
                        padding: '6px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                        background: scoreForm.isOfficial === opt.val ? `${D.accent}22` : 'transparent',
                        color: scoreForm.isOfficial === opt.val ? D.accent : D.textMuted,
                        border: `1px solid ${scoreForm.isOfficial === opt.val ? `${D.accent}50` : D.border}`,
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              {scoreFormErr && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#f87171' }}>{scoreFormErr}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={submitScore} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: D.accent, color: '#fff', border: 'none', cursor: 'pointer' }}>Save Score</button>
                <button onClick={() => setShowScoreForm(false)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', color: D.textMuted, border: `1px solid ${D.border}`, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {practiceScores.length === 0 ? (
            <p style={{ color: D.textDim, fontSize: 13, margin: 0 }}>No scores logged yet. Log your first practice test score above.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(scoresBySectionSorted).map(([section, entries], si) => {
                const color = cc(si)
                const latest = entries[entries.length - 1]
                const first = entries[0]
                const delta = entries.length > 1 ? latest.score - first.score : null
                const target = courses.find(c => c.name === section)?.targetScore
                const examDate = courses.find(c => c.name === section)?.examDate
                const proj = getProjection(entries, target, examDate, todayStr)
                return (
                  <div key={section}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginBottom: 2 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>{section}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{latest.score}</span>
                      {delta !== null && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: delta >= 0 ? D.green : D.amber }}>
                          {delta >= 0 ? '+' : ''}{delta} from FL1
                        </span>
                      )}
                      {target && (
                        <span style={{ fontSize: 11, color: D.textDim, marginLeft: 'auto' }}>Target: <span style={{ color: D.textMuted, fontWeight: 600 }}>{target}</span></span>
                      )}
                    </div>
                    <ScoreLineChart entries={entries} color={color} />
                    {proj && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: proj.flat ? 'rgba(0,0,0,0.04)' : proj.improving ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${proj.flat ? D.border : proj.improving ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)'}`, color: proj.flat ? D.textMuted : proj.improving ? '#34d399' : '#fbbf24' }}>
                          {proj.flat ? 'No change yet' : proj.improving ? `+${proj.weeklyRate} pts/wk` : `${proj.weeklyRate} pts/wk`}
                        </div>
                        {proj.projectedAtExam !== null && (
                          <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: proj.onTrack ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${proj.onTrack ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)'}`, color: proj.onTrack ? '#34d399' : '#fbbf24' }}>
                            Projected at exam: <span style={{ fontWeight: 800 }}>{proj.projectedAtExam}</span>
                            {target && <span style={{ opacity: 0.7 }}>{proj.onTrack ? ' ✓ on track' : ` (need ${target})`}</span>}
                          </div>
                        )}
                        {proj.gap !== null && proj.projectedAtExam === null && (
                          <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, color: D.textMuted }}>
                            Gap to target: <span style={{ color: D.text, fontWeight: 700 }}>+{proj.gap}</span> pts
                          </div>
                        )}
                      </div>
                    )}
                    {entries.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {entries.map((e, i) => (
                          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: D.textMuted, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, borderRadius: 6, padding: '4px 9px' }}>
                            <span style={{ color: D.textDim }}>FL{i + 1}</span>
                            <span style={{ color: D.text, fontWeight: 700 }}>{e.score}</span>
                            {e.isOfficial && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em' }}>OFFICIAL</span>
                            )}
                            {e.notes && <span style={{ color: D.textDim }}>· {e.notes}</span>}
                          </div>
                        ))}
                        <button
                          onClick={() => setPracticeScores(prev => prev.filter(s => s.id !== entries[entries.length - 1].id))}
                          style={{ fontSize: 10, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
                          title="Remove last entry"
                        >Remove last</button>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Projected MCAT composite */}
              {(() => {
                const mcatSections = ['C/P', 'CARS', 'B/B', 'P/S']
                const latestPerSection = mcatSections.map(s => {
                  const key = Object.keys(scoresBySectionSorted).find(k => k.includes(s))
                  if (!key) return null
                  const arr = scoresBySectionSorted[key]
                  return arr[arr.length - 1]?.score ?? null
                })
                if (latestPerSection.every(v => v !== null)) {
                  const total = latestPerSection.reduce((a, b) => a + b, 0)
                  return (
                    <div style={{ marginTop: 8, padding: '12px 16px', borderRadius: 10, background: 'rgba(232,83,26,0.06)', border: '1px solid rgba(232,83,26,0.18)', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 2 }}>Projected MCAT Composite</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 26, fontWeight: 900, color: D.accent, letterSpacing: '-0.03em' }}>{total}</span>
                          <span style={{ fontSize: 12, color: D.textMuted }}>/ 528</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${((total - 472) / 56) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)', borderRadius: 3 }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          {mcatSections.map((s, i) => (
                            <span key={s} style={{ fontSize: 10, color: D.textDim }}>{s}: <span style={{ color: D.textMuted, fontWeight: 600 }}>{latestPerSection[i]}</span></span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="pv-stat-grid">
        {[
          {
            label: 'STREAK', value: streak, unit: 'days',
            sub: streak === 0 ? 'Start your streak today'
              : bestStreak > streak ? `${bestStreak - streak} days to personal best`
              : 'At personal best!',
            color: D.amber, delta: null,
            spark: sparklines.streakArr,
          },
          {
            label: 'HOURS STUDIED', value: totalHours.toFixed(1), unit: 'hrs',
            sub: `${thisWeekHours.toFixed(1)}h this week`,
            color: D.blue, delta: hoursDelta,
            spark: sparklines.hoursArr,
          },
          {
            label: 'SESSIONS', value: sessionCount, unit: '',
            sub: avgDuration > 0 ? `Avg ${avgDuration}m per session` : 'No sessions yet',
            color: D.cyan, delta: null,
            spark: sparklines.sessionsArr,
          },
          {
            label: 'FOCUS SCORE', value: focusScore, unit: '/100',
            sub: focusScore >= 80 ? 'Strong momentum this week' : focusScore >= 60 ? 'Good momentum' : 'Keep building habits',
            color: D.purple, delta: null,
            spark: sparklines.focusArr,
          },
        ].map(({ label, value, unit, sub, color, delta, spark }) => (
          <div key={label} style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase' }}>{label}</span>
              {delta && <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}18`, borderRadius: 5, padding: '2px 7px' }}>^ {delta}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: D.text, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</span>
              {unit && <span style={{ fontSize: 13, color: D.textMuted, fontWeight: 500 }}>{unit}</span>}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 11.5, color: D.textMuted }}>{sub}</p>
            <Sparkline data={spark} color={color} w={110} h={36} />
          </div>
        ))}
      </div>

      {/* ── Skill Mastery + Standout Moments ── */}
      <div className="pv-2col" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* Skill Mastery */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>SKILL MASTERY</div>
            <div style={{ fontSize: 13, color: D.textMuted }}>
              Bloom's taxonomy &nbsp;·&nbsp; <span style={{ color: D.text, fontWeight: 700 }}>{bloomAvg}%</span> avg
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RadarChart
              values={bloomValues}
              labels={['Recall','Apply','Analyze','Create','Evaluate','Understand']}
              size={210}
            />
          </div>
        </div>

        {/* Standout Moments */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>STANDOUT MOMENTS</div>
              <div style={{ fontSize: 13, color: D.textMuted }}>Your best sessions this week</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: D.accent, background: `${D.accent}1a`, border: `1px solid ${D.accent}30`, borderRadius: 5, padding: '3px 9px', whiteSpace: 'nowrap' }}>This week</span>
          </div>
          {standoutMoments.length === 0 ? (
            <p style={{ color: D.textDim, fontSize: 13, margin: 0 }}>Complete sessions this week to see standout moments.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {standoutMoments.map((s, i) => {
                const d     = new Date(s.dateStr + 'T12:00:00')
                const day   = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]
                const time  = formatTime(s.startTime)
                const course = courses[s.courseId]
                const color  = course?.color?.dot ?? cc(s.courseId)
                const titles = ['Longest focus session','Deep work block','Consistent effort','Solid session']
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ textAlign: 'center', minWidth: 40 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: D.textMuted }}>{day}</div>
                      {time && <div style={{ fontSize: 10, color: D.textDim, marginTop: 1 }}>{time}</div>}
                    </div>
                    <div style={{ flex: 1, borderLeft: `2px solid ${color}`, paddingLeft: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>
                        {s.sessionType ?? titles[i] ?? 'Study session'}
                      </div>
                      <div style={{ fontSize: 11.5, color: D.textMuted, marginTop: 2 }}>
                        {s.duration}m &nbsp;·&nbsp;
                        <span style={{ color, fontWeight: 600 }}>{clean(course?.name ?? 'Course')}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Weekly Hours + Time by Course ── */}
      <div className="pv-2col" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* Weekly hours */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>WEEKLY STUDY HOURS</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>{thisWeekHours.toFixed(1)}h</span>
              {lastWeekHours > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: thisWeekHours >= lastWeekHours ? D.green : D.amber, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {thisWeekHours >= lastWeekHours
                      ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
                      : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                  </svg>
                  {Math.abs(Math.round((thisWeekHours - lastWeekHours) * 10) / 10)}h vs last week
                </span>
              )}
            </div>
          </div>
          <AreaChart data={weeklyChart.data} labels={weeklyChart.labels} color={D.accent} />
        </div>

        {/* Time by course */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>TIME BY COURSE</div>
            <div style={{ fontSize: 12.5, color: D.textMuted }}>
              <span style={{ color: D.text, fontWeight: 600 }}>{totalPeriodHours.toFixed(1)}h</span> total &nbsp;·&nbsp; {period === 'Term' ? 'all time' : `last ${period}`}
            </div>
          </div>
          {courseHours.length === 0 ? (
            <p style={{ color: D.textDim, fontSize: 13, margin: 0 }}>No sessions logged yet.</p>
          ) : (
            <>
              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 16, gap: 1 }}>
                {courseHours.map(({ course, pct, idx }) => (
                  <div key={idx} style={{ flex: pct, background: course.color?.dot ?? cc(idx), minWidth: 2 }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {courseHours.map(({ course, hours, pct, idx }) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: course.color?.dot ?? cc(idx), flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: D.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(course.name)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: D.text }}>{hours.toFixed(1)}h</span>
                      <span style={{ fontSize: 11, color: D.textDim, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Current Streak + Focus Heatmap ── */}
      <div className="pv-2col" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* Current streak */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${D.amber}18`, border: `1px solid ${D.amber}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={D.amber}><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase' }}>CURRENT STREAK</div>
              <div style={{ fontSize: 12, color: D.textMuted, marginTop: 2 }}>
                Your best is <span style={{ color: D.amber, fontWeight: 700 }}>{bestStreak} days</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 52, fontWeight: 900, color: D.amber, letterSpacing: '-0.03em', lineHeight: 1 }}>{streak}</span>
            <span style={{ fontSize: 16, color: D.textMuted, fontWeight: 500 }}>days in a row</span>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
            {streakDots.map((filled, i) => (
              <div key={i} style={{
                width: 20, height: 20, borderRadius: 5,
                background: filled ? D.amber : `${D.amber}15`,
                border: `1px solid ${filled ? 'transparent' : `${D.amber}18`}`,
              }} />
            ))}
          </div>
          {bestStreak > streak && streak >= 0 && (
            <p style={{ fontSize: 12.5, color: D.textMuted, margin: 0 }}>
              <span style={{ color: D.text, fontWeight: 600 }}>{bestStreak - streak} more days</span> to beat your personal record
            </p>
          )}
          {streak > 0 && streak >= bestStreak && (
            <p style={{ fontSize: 12.5, color: D.green, fontWeight: 600, margin: 0 }}>You are at your personal best!</p>
          )}
        </div>

        {/* Focus heatmap */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>WHEN YOU FOCUS BEST</div>
            <div style={{ fontSize: 12.5, color: D.textMuted }}>
              Peak window &nbsp;·&nbsp; <span style={{ color: D.accent, fontWeight: 600 }}>{peakSlot}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '32px repeat(6,1fr)', gap: 3 }}>
            <div />
            {['6a','9a','12p','3p','6p','9p'].map(lbl => (
              <div key={lbl} style={{ fontSize: 9, color: D.textDim, textAlign: 'center', paddingBottom: 4 }}>{lbl}</div>
            ))}
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, d) => (
              <Fragment key={d}>
                <div style={{ fontSize: 10, color: D.textDim, display: 'flex', alignItems: 'center' }}>{day}</div>
                {heatGrid[d].map((val, s) => {
                  const intensity = val / heatMax
                  return (
                    <div key={s} style={{
                      height: 22, borderRadius: 4,
                      background: intensity > 0
                        ? `rgba(232,83,26,${0.1 + intensity * 0.75})`
                        : 'rgba(0,0,0,0.04)',
                      border: '1px solid rgba(0,0,0,0.04)',
                    }} />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ── Milestones ── */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px', marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>MILESTONES</div>
          <div style={{ fontSize: 12.5, color: D.textMuted }}>
            <span style={{ color: D.text, fontWeight: 600 }}>{earnedCount} earned</span>
            {earnedCount > 0 && ` · ${milestones.length - earnedCount} remaining`}
          </div>
        </div>
        <div className="pv-milestone-grid">
          {milestones.map(m => (
            <div key={m.id} style={{
              background: m.earned ? `${D.accent}0e` : 'rgba(0,0,0,0.03)',
              border: `1px solid ${m.earned ? `${D.accent}28` : D.border}`,
              borderRadius: 12, padding: '14px 16px',
              opacity: m.earned ? 1 : m.progress > 0 ? 0.75 : 0.4,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Background progress fill for in-progress badges */}
              {!m.earned && m.progress > 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, width: `${m.progress * 100}%`, background: `linear-gradient(90deg, ${D.accent}80, ${D.accent})`, transition: 'width 0.5s ease' }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: m.earned ? `${D.accent}20` : 'rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MilestoneIcon type={m.type} earned={m.earned} />
                </div>
                {m.earned && <div style={{ width: 6, height: 6, borderRadius: '50%', background: D.accent, boxShadow: `0 0 7px ${D.accent}` }} />}
                {!m.earned && m.progress > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: D.accent, background: `${D.accent}12`, border: `1px solid ${D.accent}25`, borderRadius: 999, padding: '1px 7px' }}>
                    {Math.round(m.progress * 100)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.earned ? D.text : D.textMuted }}>{m.label}</div>
              <div style={{ fontSize: 11, color: D.textDim, marginTop: 3 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recall Score Over Time ── */}
      {(recallChartData || flashcardStats) && (
        <div className="pv-2col" style={{ gridTemplateColumns: recallChartData && flashcardStats ? '3fr 2fr' : '1fr', marginTop: 0 }}>

          {recallChartData && (
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>RECALL SCORE OVER TIME</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: D.purple, letterSpacing: '-0.02em' }}>{recallChartData.latest}%</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: recallChartData.trend >= 0 ? D.green : D.amber, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {recallChartData.trend >= 0
                        ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
                        : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
                    </svg>
                    {Math.round(Math.abs(recallChartData.trend * 100))}% vs prev
                  </span>
                  <span style={{ fontSize: 12, color: D.textDim, marginLeft: 4 }}>avg {recallChartData.avg}%</span>
                </div>
              </div>
              {/* Mini bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, paddingBottom: 18, position: 'relative' }}>
                {recallChartData.scores.map((score, i) => {
                  const h = Math.max(4, (score / 100) * 62)
                  const isLast = i === recallChartData.scores.length - 1
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{
                        width: '100%', height: h, borderRadius: 3,
                        background: isLast
                          ? D.purple
                          : score >= 80 ? `${D.green}60` : score >= 60 ? `${D.amber}60` : `${D.pink}50`,
                      }} />
                      {(i === 0 || isLast || i % 4 === 0) && (
                        <span style={{ fontSize: 8, color: D.textDim, position: 'absolute', bottom: 0, whiteSpace: 'nowrap' }}>
                          {recallChartData.labels[i]}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {[['>=80%', 'Solid', D.green], ['60-79%', 'OK', D.amber], ['<60%', 'Needs work', D.pink]].map(([range, label, color]) => (
                  <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: D.textDim }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: `${color}70` }} />
                    {range}: {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {flashcardStats && (
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 16 }}>FLASHCARD MASTERY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Due today', value: flashcardStats.due, color: flashcardStats.due > 0 ? '#EF4444' : D.green, sub: flashcardStats.due > 0 ? 'Review now' : 'All caught up!' },
                  { label: 'Mastered', value: flashcardStats.mastered, color: D.green, sub: `of ${flashcardStats.total} total` },
                  { label: 'Struggling', value: flashcardStats.struggling, color: flashcardStats.struggling > 0 ? D.amber : D.green, sub: 'Low ease factor' },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: `${color}08`, border: `1px solid ${color}20` }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: D.text }}>{label}</div>
                      <div style={{ fontSize: 11, color: D.textDim, marginTop: 1 }}>{sub}</div>
                    </div>
                    <span style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Mastery bar */}
              {flashcardStats.total > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: D.textMuted }}>Mastery progress</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: D.green }}>{Math.round((flashcardStats.mastered / flashcardStats.total) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(flashcardStats.mastered / flashcardStats.total) * 100}%`, background: `linear-gradient(90deg, ${D.green}, #4ade80)`, borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AI Insights ── */}
      {aiInsights.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>INSIGHTS &nbsp;·&nbsp; THIS WEEK</div>
            <div style={{ fontSize: 12.5, color: D.textMuted }}>Based on your sessions this week</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            {aiInsights.map((ins, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${ins.color}`, paddingLeft: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: ins.color, marginBottom: 5, textTransform: 'uppercase' }}>{ins.tag}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: D.text, marginBottom: 5 }}>{ins.title}</div>
                <div style={{ fontSize: 12, color: D.textMuted, lineHeight: 1.55 }}>{ins.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Mastery + Consistency section ── */}
      {(() => {
        const allMastery = getAllMastery()
        const reviewStats = getReviewStats()
        if (!allMastery.length) return null

        // Consistency: session density in past 14 days
        const now = new Date()
        const past14 = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(now); d.setDate(d.getDate() - i)
          return toDateStr(d)
        })
        const completedSet = new Set(completedSessionLog?.map(s => s.date) ?? [])
        const activeDays = past14.filter(d => completedSet.has(d)).length
        const consistencyScore = Math.round((activeDays / 14) * 100)
        const consistencyColor = consistencyScore >= 70 ? D.green : consistencyScore >= 40 ? D.amber : D.pink
        const consistencyLabel = consistencyScore >= 70 ? 'Excellent' : consistencyScore >= 40 ? 'Building' : 'Getting started'

        // Streak within window (consecutive most-recent days with a session)
        let currentStreak = 0
        for (let i = 0; i < past14.length; i++) {
          if (completedSet.has(past14[i])) currentStreak++
          else break
        }

        // Best streak in window
        let bestStreak = 0, run = 0
        past14.slice().reverse().forEach(d => {
          if (completedSet.has(d)) { run++; if (run > bestStreak) bestStreak = run }
          else run = 0
        })

        // Mastery distribution
        const strong = allMastery.filter(m => m.score >= 70)
        const developing = allMastery.filter(m => m.score >= 40 && m.score < 70)
        const weak = allMastery.filter(m => m.score < 40)
        const avgScore = Math.round(allMastery.reduce((s, m) => s + m.score, 0) / allMastery.length)

        const topTopics = [...allMastery].sort((a, b) => b.score - a.score).slice(0, 5)
        const worstTopics = [...allMastery].sort((a, b) => a.score - b.score).slice(0, 5)

        return (
          <>
            <style>{`
              @keyframes pv-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
              .pv-row { transition: background 150ms cubic-bezier(0.4,0,0.2,1); border-radius: 8px; }
              .pv-row:hover { background: rgba(0,0,0,0.025); }
              .pv-drill { transition: all 150ms cubic-bezier(0.4,0,0.2,1); opacity: 0; }
              .pv-row:hover .pv-drill, .pv-row:focus-within .pv-drill { opacity: 1; }
              .pv-drill:hover { transform: translateX(2px); }
              .pv-drill:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(220,38,38,0.3); opacity: 1; }
              .pv-heatdot { transition: transform 150ms cubic-bezier(0.4,0,0.2,1); cursor: default; }
              .pv-heatdot:hover { transform: scale(1.15); z-index: 1; }
              .pv-cta { transition: all 150ms cubic-bezier(0.4,0,0.2,1); }
              .pv-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(220,38,38,0.25); }
              .pv-cta:active { transform: scale(0.97); }
              .pv-cta:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(220,38,38,0.35); }
            `}</style>

            {/* Mastery overview card */}
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '24px 26px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)', animation: 'pv-fade-in 300ms cubic-bezier(0.16,1,0.3,1) both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Knowledge Mastery</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {avgScore}<span style={{ fontSize: 14, color: D.textMuted, fontWeight: 700, marginLeft: 3 }}>% avg</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: D.textMuted, marginTop: 2 }}>{allMastery.length} topics tracked</div>
                </div>
                {reviewStats.dueCount > 0 && onOpenReviewQueue && (
                  <button
                    onClick={onOpenReviewQueue}
                    className="pv-cta"
                    style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#DC2626', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, boxShadow: '0 2px 6px rgba(220,38,38,0.3)' }}
                  >
                    {reviewStats.dueCount} due for review
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                )}
              </div>

              {/* Stacked bar with proper labeled legend */}
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, marginBottom: 12, background: 'rgba(0,0,0,0.04)' }}>
                {strong.length > 0 && <div style={{ flex: strong.length, background: D.green, borderRadius: 5 }} title={`${strong.length} strong`} />}
                {developing.length > 0 && <div style={{ flex: developing.length, background: D.amber, borderRadius: 5 }} title={`${developing.length} developing`} />}
                {weak.length > 0 && <div style={{ flex: weak.length, background: D.pink, borderRadius: 5 }} title={`${weak.length} weak`} />}
              </div>

              <div style={{ display: 'flex', gap: 20, marginBottom: 22, flexWrap: 'wrap' }}>
                {[
                  { label: 'Strong', hint: '70+', items: strong, color: D.green },
                  { label: 'Developing', hint: '40–69', items: developing, color: D.amber },
                  { label: 'Weak', hint: '<40', items: weak, color: D.pink },
                ].map(({ label, hint, items, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>
                        <span style={{ color, fontWeight: 800 }}>{items.length}</span> {label}
                      </span>
                      <span style={{ fontSize: 10.5, color: D.textDim, fontWeight: 500, letterSpacing: '-0.005em' }}>{hint}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Two-column topic lists */}
              <div className="pv-2col" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0, gap: 20 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: D.green, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    Strongest Topics
                  </div>
                  {topTopics.map((t, i) => (
                    <div key={i} className="pv-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}>
                      <div style={{ width: 38, height: 22, borderRadius: 6, background: getMasteryColor(t.score) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: getMasteryColor(t.score), fontVariantNumeric: 'tabular-nums' }}>{t.score}</span>
                      </div>
                      <span style={{ fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>{t.topic}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: D.pink, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v3.5m0 3v.5m-9 2h18L12 3 3 18z"/></svg>
                    Needs Work
                  </div>
                  {worstTopics.map((t, i) => {
                    const courseIdx = Math.max(0, (courses ?? []).findIndex(c => String(c.id) === String(t.courseId)))
                    return (
                      <div key={i} className="pv-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}>
                        <div style={{ width: 38, height: 22, borderRadius: 6, background: getMasteryColor(t.score) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: getMasteryColor(t.score), fontVariantNumeric: 'tabular-nums' }}>{t.score}</span>
                        </div>
                        <span style={{ fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>{t.topic}</span>
                        {onOpenBrainDump && (
                          <button
                            className="pv-drill"
                            onClick={onOpenBrainDump}
                            title={`Drill "${t.topic}" with Brain Dump`}
                            style={{ fontSize: 10.5, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: 'none', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}
                          >
                            Drill
                            <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Consistency score card */}
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '24px 26px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)', animation: 'pv-fade-in 300ms cubic-bezier(0.16,1,0.3,1) both', animationDelay: '60ms' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Study Consistency</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: consistencyColor, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{consistencyScore}%</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: '-0.005em' }}>{consistencyLabel}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: D.textMuted, marginTop: 6 }}>
                    {activeDays} of the last 14 days had at least one completed session
                  </div>

                  {/* Streak indicators */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: currentStreak > 0 ? 'rgba(217,119,6,0.08)' : 'rgba(0,0,0,0.03)', border: `1px solid ${currentStreak > 0 ? 'rgba(217,119,6,0.2)' : D.border}` }}>
                      <svg width="12" height="12" fill={currentStreak > 0 ? D.amber : D.textDim} stroke="none" viewBox="0 0 24 24">
                        <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: currentStreak > 0 ? '#92400E' : D.textMuted }}>
                        {currentStreak}-day streak
                      </span>
                    </div>
                    {bestStreak > currentStreak && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}` }}>
                        <svg width="12" height="12" fill="none" stroke={D.textMuted} strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: 12, fontWeight: 600, color: D.textMuted }}>Best in window: {bestStreak}d</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 14-day heatmap with rich tooltips */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase' }}>Last 14 days</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 5 }}>
                    {past14.slice().reverse().map((d) => {
                      const done = completedSet.has(d)
                      const dt = new Date(d + 'T12:00:00')
                      const isToday = d === todayStr
                      const label = dt.toLocaleDateString('en-US', { weekday: 'short' })[0]
                      const fullDate = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                      const tooltip = `${fullDate}: ${done ? 'Completed a session' : 'No session'}${isToday ? ' (today)' : ''}`
                      return (
                        <div
                          key={d}
                          className="pv-heatdot"
                          title={tooltip}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: done ? consistencyColor : 'rgba(0,0,0,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: isToday ? `0 0 0 2px ${D.bgCard}, 0 0 0 3px ${consistencyColor}` : 'none',
                          }}
                        >
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: done ? '#fff' : D.textDim, fontVariantNumeric: 'tabular-nums' }}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Confidence Gap card */}
            {(() => {
              const gap = computeConfidenceGap(allMastery)
              const total = gap.calibrated + gap.overconfident + gap.underconfident
              if (total < 3) return null

              const overTopics  = gap.topics.filter(t => t.status === 'overconfident').sort((a, b) => b.gap - a.gap).slice(0, 4)
              const underTopics = gap.topics.filter(t => t.status === 'underconfident').sort((a, b) => a.gap - b.gap).slice(0, 4)
              const calibratedPct = Math.round((gap.calibrated / total) * 100)

              return (
                <div style={{
                  background: D.bgCard,
                  border: `1px solid ${D.border}`,
                  borderRadius: 16,
                  padding: '24px 26px',
                  marginBottom: 16,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
                  animation: 'pv-fade-in 300ms cubic-bezier(0.16,1,0.3,1) both',
                  animationDelay: '120ms',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>
                        Confidence vs. Reality
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                        {calibratedPct}<span style={{ fontSize: 14, color: D.textMuted, fontWeight: 700, marginLeft: 3 }}>% calibrated</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: D.textMuted, marginTop: 2, maxWidth: 460, lineHeight: 1.5 }}>
                        How your gut feeling matches your actual scores. Closing this gap is one of the fastest ways to improve real test performance.
                      </div>
                    </div>
                  </div>

                  {/* Distribution bar */}
                  <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, marginBottom: 12, background: 'rgba(0,0,0,0.04)' }}>
                    {gap.overconfident > 0  && <div style={{ flex: gap.overconfident,  background: '#DC2626', borderRadius: 5 }} title={`${gap.overconfident} overconfident`} />}
                    {gap.calibrated > 0     && <div style={{ flex: gap.calibrated,     background: '#16A34A', borderRadius: 5 }} title={`${gap.calibrated} calibrated`} />}
                    {gap.underconfident > 0 && <div style={{ flex: gap.underconfident, background: '#3B61C4', borderRadius: 5 }} title={`${gap.underconfident} underconfident`} />}
                  </div>

                  <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Overconfident', hint: 'feels solid, isn\'t', count: gap.overconfident,  color: '#DC2626' },
                      { label: 'Calibrated',    hint: 'feels right',        count: gap.calibrated,     color: '#16A34A' },
                      { label: 'Underconfident', hint: 'know it, doubt it', count: gap.underconfident, color: '#3B61C4' },
                    ].map(({ label, hint, count, color }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>
                            <span style={{ color, fontWeight: 800 }}>{count}</span> {label}
                          </span>
                          <span style={{ fontSize: 10.5, color: D.textDim, fontWeight: 500 }}>{hint}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(overTopics.length > 0 || underTopics.length > 0) && (
                    <div className="pv-2col" style={{ gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 0 }}>
                      {overTopics.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                            Traps · You think you know these
                          </div>
                          {overTopics.map((t, i) => (
                            <div key={i} className="pv-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}>
                              <div style={{ minWidth: 46, textAlign: 'right' }}>
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>+{Math.round(t.gap)}</span>
                              </div>
                              <span style={{ fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>{t.topic}</span>
                              <span style={{ fontSize: 10.5, color: D.textDim, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                felt {Math.round(t.perceived)} · scored {Math.round(t.actual)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {underTopics.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B61C4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                            Wins · Better than you think
                          </div>
                          {underTopics.map((t, i) => (
                            <div key={i} className="pv-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}>
                              <div style={{ minWidth: 46, textAlign: 'right' }}>
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#3B61C4', fontVariantNumeric: 'tabular-nums' }}>{Math.round(t.gap)}</span>
                              </div>
                              <span style={{ fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>{t.topic}</span>
                              <span style={{ fontSize: 10.5, color: D.textDim, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                felt {Math.round(t.perceived)} · scored {Math.round(t.actual)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )
      })()}

      {/* ── Momentum history: 8-week trend of the composite score ── */}
      {(() => {
        const history = computeMomentumHistory({
          completedSessionLog,
          allSessions,
          completedIds,
          weeks: 8,
        })
        const nonZeroWeeks = history.filter(h => h.sessions > 0).length
        if (nonZeroWeeks < 2) return null
        const W = 640, H = 160, PAD_L = 32, PAD_R = 16, PAD_T = 18, PAD_B = 28
        const innerW = W - PAD_L - PAD_R
        const innerH = H - PAD_T - PAD_B
        const n = history.length
        const x = (i) => PAD_L + (i * innerW) / (n - 1)
        const y = (v) => PAD_T + innerH - (v / 100) * innerH
        const points = history.map((h, i) => `${x(i)},${y(h.score)}`).join(' ')
        const areaPoints = `${PAD_L},${PAD_T + innerH} ${points} ${PAD_L + innerW},${PAD_T + innerH}`
        const current = history[n - 1]
        const first = history[0]
        const trendDelta = current.score - first.score
        const trendColor = trendDelta > 4 ? '#16A34A' : trendDelta < -4 ? '#DC2626' : '#6B6B6B'
        const monthShort = (dateStr) => {
          const d = new Date(dateStr + 'T12:00:00')
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
        const currentColor = momentumColor(current.score)
        return (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 16, padding: '20px 22px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            marginTop: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>
                  Momentum history · {history.length} weeks
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#111111', letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {current.score}
                  <span style={{ fontSize: 13, color: '#6B6B6B', fontWeight: 700, marginLeft: 6 }}>momentum</span>
                </div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: trendColor, background: `${trendColor}12`, padding: '4px 10px', borderRadius: 8, fontVariantNumeric: 'tabular-nums' }}>
                {trendDelta > 0 ? '+' : ''}{trendDelta} vs 8 weeks ago
              </div>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#6B6B6B', lineHeight: 1.5, maxWidth: 500 }}>
              Consistency, mastery velocity, and completion rate blended into one score, computed weekly.
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} aria-label="Momentum trend">
              <defs>
                <linearGradient id="mh-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentColor} stopOpacity="0.28"/>
                  <stop offset="100%" stopColor={currentColor} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[0, 25, 50, 75, 100].map(v => (
                <g key={v}>
                  <line x1={PAD_L} x2={PAD_L + innerW} y1={y(v)} y2={y(v)} stroke="rgba(0,0,0,0.05)" strokeDasharray={v === 50 ? '0' : '3 4'} strokeWidth={v === 50 ? 1 : 1}/>
                  {(v === 0 || v === 50 || v === 100) && (
                    <text x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="#9B9B9B" fontWeight="600">{v}</text>
                  )}
                </g>
              ))}
              <polygon points={areaPoints} fill="url(#mh-fill)"/>
              <polyline points={points} fill="none" stroke={currentColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
              {history.map((h, i) => {
                const isLast = i === n - 1
                const dim = h.sessions === 0
                return (
                  <g key={i}>
                    <circle cx={x(i)} cy={y(h.score)} r={isLast ? 5 : 3.5}
                      fill={isLast ? currentColor : dim ? '#F7F6F3' : '#fff'}
                      stroke={dim ? '#D4D4D4' : currentColor} strokeWidth="2"/>
                    {(i === 0 || isLast || i === Math.floor(n / 2)) && (
                      <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#9B9B9B" fontWeight="600">
                        {monthShort(h.weekEnd)}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: '#9B9B9B', fontWeight: 600, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F7F6F3', border: '1px solid #D4D4D4' }}/>
                Week without sessions
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: currentColor }}/>
                This week
              </span>
            </div>
          </div>
        )
      })()}

      {/* ── Pro upgrade nudge for free users ── */}
      {isFree && (
        <button
          onClick={() => onShowPaywall?.('study-hacks')}
          style={{ width: '100%', background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.16)', borderRadius: 14, padding: '18px 22px', cursor: 'pointer', textAlign: 'left', marginTop: 2, fontFamily: 'inherit' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', marginBottom: 4 }}>
                {trialUsed ? 'Upgrade to Pro' : 'Start your 7-day free trial'}
              </div>
              <div style={{ fontSize: 12.5, color: D.textMuted, lineHeight: 1.55 }}>
                Unlock unlimited Brain Dumps, Practice Exams, AI Tutor, and more so every score shows up here.
              </div>
            </div>
            <svg width="16" height="16" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 16 }}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      )}

    </div>
  )
}
