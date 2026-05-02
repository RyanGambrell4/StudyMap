import { useMemo, useState, Fragment } from 'react'
import { clean } from '../utils/strings'
import { toDateStr, addDays, daysBetween } from '../utils/dateUtils'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:           '#060614',
  bgCard:       '#0a0a1e',
  border:       'rgba(255,255,255,0.06)',
  text:         '#e8e8f0',
  textMuted:    '#8888a0',
  textDim:      '#55556e',
  accent:       '#6366f1',
  green:        '#4ade80',
  amber:        '#fbbf24',
  pink:         '#f472b6',
  cyan:         '#22d3ee',
  orange:       '#f97316',
  blue:         '#60a5fa',
  purple:       '#a78bfa',
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

// ══════════════════════════════════════════════════════════════════════════════
export default function ProgressView({ courses, allSessions, completedIds, completedSessionLog = [], todayStr }) {
  const [period, setPeriod] = useState('Term')

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
      const m = s.duration ?? 0
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
      ? completedSessions.reduce((s, x) => s + (x.duration ?? 0), 0) / completedSessions.length : 0
    const streakBonus = Math.min(1, streak / 14)
    return Math.min(100, Math.round(compRate * 40 + Math.min(1, avgDur / 60) * 35 + streakBonus * 25))
  }, [allSessions, completedSessions, streak])

  const sessionCount = completedSessions.length
  const avgDuration  = sessionCount
    ? Math.round(completedSessions.reduce((s, x) => s + (x.duration ?? 0), 0) / sessionCount) : 0

  // ── Sparklines (8 weeks) ─────────────────────────────────────────────────────
  const sparklines = useMemo(() => {
    const streakArr = [], hoursArr = [], sessionsArr = [], focusArr = []
    for (let w = 7; w >= 0; w--) {
      const wStart = addDays(getMonWeekStart(todayStr), -w * 7)
      const wEnd   = addDays(wStart, 6)
      const ws = completedSessions.filter(s => s.dateStr >= wStart && s.dateStr <= wEnd)
      const wa = allSessions.filter(s => s.dateStr >= wStart && s.dateStr <= wEnd)
      const wH = ws.reduce((s, x) => s + (x.duration ?? 0), 0) / 60
      const daysWithSessions = new Set(ws.map(s => s.dateStr)).size
      const compRate = wa.length ? ws.length / wa.length : 0
      const avgD = ws.length ? ws.reduce((s, x) => s + (x.duration ?? 0), 0) / ws.length : 0
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
        .reduce((s, x) => s + (x.duration ?? 0), 0) / 60
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
      map.set(s.courseId, (map.get(s.courseId) ?? 0) + (s.duration ?? 0) / 60)
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
      { id: 'streak7',     label: '1-week streak',    sub: 'Days in a row',         type: 'streak',    earned: bestStreak >= 7 },
      { id: 'streak14',    label: '2-week streak',     sub: 'Streak warrior',         type: 'streak',    earned: bestStreak >= 14 },
      { id: 'focus80',     label: 'Top focus score',   sub: focusScore >= 80 ? 'This week' : 'Score 80+', type: 'focus', earned: focusScore >= 80 },
      { id: 'sessions50',  label: '50 sessions',       sub: 'Halfway hero',           type: 'sessions',  earned: sessionCount >= 50 },
      { id: 'sessions100', label: '100 sessions',      sub: 'Century club',           type: 'sessions',  earned: sessionCount >= 100 },
      { id: 'hours50',     label: '50h studied',       sub: 'Half-century',           type: 'hours',     earned: totalHours >= 50 },
      { id: 'hours100',    label: '100h studied',      sub: 'Deep work hero',         type: 'hours',     earned: totalHours >= 100 },
      { id: 'allcourses',  label: 'All courses',       sub: 'Studied every subject',  type: 'diversity', earned: courses.length > 0 && coursesDone >= courses.length },
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
            <span style={{ fontSize: 12, fontWeight: 600, color: D.accent, background: `${D.accent}1a`, border: `1px solid ${D.accent}40`, borderRadius: 6, padding: '3px 10px' }}>{semLabel}</span>
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
          Your study momentum across {courses.length} course{courses.length !== 1 ? 's' : ''}, visualized.
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="pv-stat-grid">
        {[
          {
            label: 'STREAK', value: streak, unit: 'days',
            sub: streak === 0 ? 'Start your streak today'
              : bestStreak > streak ? `${bestStreak - streak} days to personal best`
              : 'At personal best!',
            color: D.amber, delta: streak > 0 ? `+${Math.min(streak, 5)}` : '0',
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
            color: D.cyan, delta: `+${Math.min(sessionCount, 12)}`,
            spark: sparklines.sessionsArr,
          },
          {
            label: 'FOCUS SCORE', value: focusScore, unit: '/100',
            sub: focusScore >= 80 ? 'Top 15% performance' : focusScore >= 60 ? 'Good momentum' : 'Keep building habits',
            color: D.purple, delta: `+${Math.min(focusScore, 8)}`,
            spark: sparklines.focusArr,
          },
        ].map(({ label, value, unit, sub, color, delta, spark }) => (
          <div key={label} style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}18`, borderRadius: 5, padding: '2px 7px' }}>^ {delta}</span>
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
            <span style={{ fontSize: 10, fontWeight: 600, color: D.accent, background: `${D.accent}1a`, border: `1px solid ${D.accent}30`, borderRadius: 5, padding: '3px 9px', whiteSpace: 'nowrap' }}>AI-picked</span>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: thisWeekHours >= lastWeekHours ? D.green : D.amber }}>
                  {thisWeekHours >= lastWeekHours ? '↑' : '↓'} {Math.abs(Math.round((thisWeekHours - lastWeekHours) * 10) / 10)}h vs last week
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
                        ? `rgba(99,102,241,${0.1 + intensity * 0.78})`
                        : 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.04)',
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
              background: m.earned ? `${D.accent}0e` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${m.earned ? `${D.accent}28` : D.border}`,
              borderRadius: 12, padding: '14px 16px',
              opacity: m.earned ? 1 : 0.4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: m.earned ? `${D.accent}20` : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MilestoneIcon type={m.type} earned={m.earned} />
                </div>
                {m.earned && <div style={{ width: 6, height: 6, borderRadius: '50%', background: D.accent, boxShadow: `0 0 7px ${D.accent}` }} />}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.earned ? D.text : D.textMuted }}>{m.label}</div>
              <div style={{ fontSize: 11, color: D.textDim, marginTop: 3 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI Insights ── */}
      {aiInsights.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '22px 26px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>AI INSIGHTS &nbsp;·&nbsp; THIS WEEK</div>
            <div style={{ fontSize: 12.5, color: D.textMuted }}>Patterns detected from your recent study history</div>
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

    </div>
  )
}
