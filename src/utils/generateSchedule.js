/**
 * Generates a day-by-day study schedule based on courses, weekly hours, learning style, and year level.
 */

const DIFFICULTY_WEIGHTS = { Easy: 1, Medium: 1.6, Hard: 2.4 }

// Target grade multiplies the raw session count
const GRADE_MULTIPLIERS = { 'A': 1.6, 'B': 1.2, 'C': 1.0, 'Pass/Fail': 0.85 }

// Session type banks split by year level and learning style
const SESSION_TYPES_JUNIOR = {
  // 1st / 2nd year
  visual:   ['Lecture Review', 'Diagram Notes', 'Concept Map', 'Colour-Code Review', 'Visual Summary'],
  reader:   ['Textbook Reading', 'Lecture Notes', 'Summary Writing', 'Re-read & Highlight', 'Chapter Outline'],
  practice: ['Practice Quiz', 'Flashcard Drill', 'Problem Set', 'Self-Test', 'Worked Examples'],
}
const SESSION_TYPES_SENIOR = {
  // 3rd / 4th year+
  visual:   ['Critical Analysis', 'Framework Diagram', 'Concept Synthesis', 'Annotated Review', 'Visual Argument Map'],
  reader:   ['Essay Outline', 'Critical Reading', 'Argument Summary', 'Literature Review', 'Thesis Notes'],
  practice: ['Past Exam Paper', 'Case Study', 'Essay Draft', 'Timed Practice', 'Peer Review Prep'],
}

function getSessionBank(learningStyle, yearLevel) {
  const senior = yearLevel === '3rd Year' || yearLevel === '4th Year+'
  const bank = senior ? SESSION_TYPES_SENIOR : SESSION_TYPES_JUNIOR
  return bank[learningStyle] ?? (senior
    ? ['Critical Analysis', 'Case Study', 'Past Exam Paper', 'Essay Outline', 'Deep Review']
    : ['Lecture Review', 'Textbook Reading', 'Practice Quiz', 'Review', 'Self-Test'])
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function dateStr(date) {
  return date.toISOString().split('T')[0]
}

function parseDateLocal(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

const TIME_SLOTS = {
  Morning:   [8 * 60, 10 * 60 + 30],
  Afternoon: [13 * 60, 15 * 60 + 30],
  Evening:   [18 * 60, 20 * 60],
}

function minutesToTime(mins) {
  const h24 = Math.floor(mins / 60)
  const m   = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12  = h24 % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function timeStrToMins(str) {
  if (!str) return 0
  const [h, m] = str.split(':').map(Number)
  return h * 60 + (m || 0)
}

function getClassBlocksForDate(courses, targetDateStr) {
  const dow = new Date(targetDateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
  const blocks = []
  courses.forEach(c => {
    const cs = c.classSchedule
    if (!cs?.days?.length || !cs.semesterStart || !cs.semesterEnd) return
    if (targetDateStr < cs.semesterStart || targetDateStr > cs.semesterEnd) return
    if (!cs.days.includes(dow)) return
    blocks.push({ startMin: timeStrToMins(cs.startTime), endMin: timeStrToMins(cs.endTime) })
  })
  return blocks
}

function sessionTimes(preferredTime, slotIndex, durationMinutes, classBlocks = []) {
  const slots = TIME_SLOTS[preferredTime] ?? TIME_SLOTS.Morning
  let startMin
  if (slotIndex < slots.length) {
    startMin = slots[slotIndex]
  } else {
    const last = slots[slots.length - 1]
    startMin = last + (slotIndex - slots.length + 1) * (durationMinutes + 30)
  }
  // Shift start time past any overlapping class block
  const sorted = [...classBlocks].sort((a, b) => a.startMin - b.startMin)
  for (const block of sorted) {
    if (startMin < block.endMin && startMin + durationMinutes > block.startMin) {
      startMin = block.endMin + 15
    }
  }
  return { startTime: minutesToTime(startMin), endTime: minutesToTime(startMin + durationMinutes) }
}

export function generateSchedule(courses, schedule, learningStyle, yearLevel = '1st Year') {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { hoursPerWeek, preferredTime = 'Morning' } = schedule
  const sessionMinutes = Math.round(45 + ((hoursPerWeek - 5) / 35) * 45)

  const parsedCourses = courses.map(c => ({
    ...c,
    examDateObj: parseDateLocal(c.examDate),
  }))

  const lastExam = parsedCourses.reduce((max, c) => c.examDateObj > max ? c.examDateObj : max, today)
  const lastExamPlus2Weeks = addDays(lastExam, 14)
  const nineMonthsOut = addDays(today, 274)
  const scheduleEnd = lastExamPlus2Weeks > nineMonthsOut ? lastExamPlus2Weeks : nineMonthsOut

  // Any two exams within CLUSTER_WINDOW_DAYS of each other would otherwise have
  // their final-week prep collide. Front-load both courses instead so the crunch
  // never forms, rather than scheduling it and warning about it afterwards.
  const CLUSTER_WINDOW_DAYS = 7
  const isClustered = parsedCourses.map((course, i) =>
    parsedCourses.some((other, j) =>
      j !== i && Math.abs(daysBetween(course.examDateObj, other.examDateObj)) <= CLUSTER_WINDOW_DAYS
    )
  )

  // Sessions are collected unplaced first: a session's start time depends on how
  // many sessions share its day, so times can only be assigned after the daily
  // load has been balanced.
  const placements = []

  parsedCourses.forEach((course, courseIdx) => {
    const daysUntilExam = daysBetween(today, course.examDateObj)
    if (daysUntilExam <= 0) return

    const diffWeight  = DIFFICULTY_WEIGHTS[course.difficulty] || 1.6
    const gradeMulti  = GRADE_MULTIPLIERS[course.targetGrade] ?? 1.0

    const rawSessions = Math.max(3, Math.round(
      (daysUntilExam / 7) * (hoursPerWeek / (60 / sessionMinutes))
      * (diffWeight / getTotalWeight(parsedCourses))
      * gradeMulti
    ))

    const sessionDates = planSessions(today, course.examDateObj, rawSessions, isClustered[courseIdx])

    sessionDates.forEach((date, idx) => {
      placements.push({
        courseIdx,
        course,
        date,
        sessionIdx: idx,
        totalSessions: sessionDates.length,
        duration: sessionMinutes,
        anchored: false,
        idSuffix: String(idx),
      })
    })

    const twoBefore = addDays(course.examDateObj, -2)
    const oneBefore = addDays(course.examDateObj, -1)

    if (twoBefore >= today) {
      placements.push({
        courseIdx,
        course,
        date: twoBefore,
        sessionType: 'Final Review',
        duration: Math.round(sessionMinutes * 1.2),
        anchored: true,
        idSuffix: 'finalreview',
      })
    }
    if (oneBefore >= today) {
      placements.push({
        courseIdx,
        course,
        date: oneBefore,
        sessionType: 'Exam Cram',
        duration: Math.round(sessionMinutes * 1.5),
        anchored: true,
        idSuffix: 'examcram',
      })
    }
  })

  balanceDailyLoad(placements, today, maxSessionsPerDay(hoursPerWeek, sessionMinutes))

  const scheduleMap = {}
  placements
    .sort((a, b) => (a.date - b.date) || (a.courseIdx - b.courseIdx))
    .forEach(p => {
      const key      = dateStr(p.date)
      const daysLeft = daysBetween(p.date, p.course.examDateObj)
      const sessionType = p.anchored
        ? p.sessionType
        : getSessionType(p.sessionIdx, p.totalSessions, daysLeft, learningStyle, yearLevel)

      if (!scheduleMap[key]) scheduleMap[key] = []
      if (p.anchored && scheduleMap[key].some(s => s.courseId === p.courseIdx && s.sessionType === sessionType)) return

      const times = sessionTimes(preferredTime, scheduleMap[key].length, p.duration, getClassBlocksForDate(parsedCourses, key))

      scheduleMap[key].push({
        id: `${p.courseIdx}-${key}-${p.idSuffix}`,
        dateStr: key,
        courseId: p.courseIdx,
        courseName: p.course.name,
        color: p.course.color,
        sessionType,
        duration: p.duration,
        daysUntilExam: daysLeft,
        ...times,
      })
    })

  // Build weekly structure
  const weeks = []
  let current = new Date(today)
  const dow = current.getDay()
  current = addDays(current, dow === 0 ? -6 : -(dow - 1))

  while (current < scheduleEnd) {
    const week = { startDate: new Date(current), days: [] }
    for (let d = 0; d < 7; d++) {
      const date    = addDays(current, d)
      const key     = dateStr(date)
      const isSunday = date.getDay() === 0
      week.days.push({
        date: new Date(date),
        dateStr: key,
        dayName:   date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum:    date.getDate(),
        monthName: date.toLocaleDateString('en-US', { month: 'short' }),
        isSunday,
        isToday: key === dateStr(today),
        isPast:  date < today,
        sessions: isSunday ? [] : (scheduleMap[key] || []),
      })
    }
    weeks.push(week)
    current = addDays(current, 7)
  }

  let totalSessions = 0, totalMinutes = 0
  Object.values(scheduleMap).forEach(sessions => {
    totalSessions += sessions.length
    sessions.forEach(s => totalMinutes += s.duration)
  })

  const nearestExam = parsedCourses
    .filter(c => c.examDateObj >= today)
    .sort((a, b) => a.examDateObj - b.examDateObj)[0]

  return {
    weeks,
    stats: {
      totalCourses: courses.length,
      totalSessions,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      nearestExam: nearestExam
        ? { name: nearestExam.name, days: daysBetween(today, nearestExam.examDateObj) }
        : null,
    },
    sessionMinutes,
  }
}

// A day this full is a crunch. Derived from the user's weekly hours spread over
// the six non-Sunday study days, clamped so it is never absurdly tight or loose.
function maxSessionsPerDay(hoursPerWeek, sessionMinutes) {
  const weeklySessions = (hoursPerWeek * 60) / sessionMinutes
  return Math.min(4, Math.max(2, Math.ceil(weeklySessions / 6)))
}

// Moves overflow sessions off crunch days onto the nearest earlier open day.
// Sessions only ever move earlier — never closer to an exam — and the anchored
// Final Review / Exam Cram sessions never move at all.
function balanceDailyLoad(placements, today, maxPerDay) {
  const byDay = new Map()
  placements.forEach(p => {
    const key = dateStr(p.date)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(p)
  })

  const days = [...byDay.keys()].sort()

  for (let i = days.length - 1; i >= 0; i--) {
    const key = days[i]
    let overflow = byDay.get(key).length - maxPerDay
    if (overflow <= 0) continue

    // Move the sessions with the most slack first: the ones whose exam is furthest away.
    const movable = byDay.get(key)
      .filter(p => !p.anchored)
      .sort((a, b) => b.course.examDateObj - a.course.examDateObj)

    for (const p of movable) {
      if (overflow <= 0) break
      const target = findEarlierOpenDay(p, byDay, today, maxPerDay)
      if (!target) continue

      byDay.set(key, byDay.get(key).filter(x => x !== p))
      p.date = target
      const targetKey = dateStr(target)
      if (!byDay.has(targetKey)) byDay.set(targetKey, [])
      byDay.get(targetKey).push(p)
      overflow--
    }
  }
}

function findEarlierOpenDay(placement, byDay, today, maxPerDay) {
  for (let back = 1; back <= 60; back++) {
    const candidate = addDays(placement.date, -back)
    if (daysBetween(today, candidate) < 1) return null   // never today or in the past
    if (candidate.getDay() === 0) continue               // Sundays stay free
    const existing = byDay.get(dateStr(candidate)) || []
    if (existing.length >= maxPerDay) continue
    if (existing.some(p => p.courseIdx === placement.courseIdx)) continue  // one course per day
    return candidate
  }
  return null
}

function getTotalWeight(courses) {
  return courses.reduce((sum, c) => sum + (DIFFICULTY_WEIGHTS[c.difficulty] || 1.6), 0)
}

function planSessions(startDate, examDate, targetCount, frontLoad = false) {
  const daysUntilExam = daysBetween(startDate, examDate)
  if (daysUntilExam <= 0) return []

  const dates = []

  if (daysUntilExam <= 7) {
    for (let d = 1; d <= daysUntilExam - 1 && dates.length < targetCount; d++) {
      const date = addDays(startDate, d)
      if (date.getDay() !== 0) dates.push(date)
    }
  } else {
    const earlyEnd   = daysUntilExam - 7
    // Clustered exams get a heavier early share so the overlapping final weeks
    // stay light instead of stacking two courses' worth of cramming together.
    const earlyRatio = frontLoad ? 0.85 : 0.6
    const earlyCount = Math.max(1, Math.round(targetCount * earlyRatio))
    const lateCount  = targetCount - earlyCount

    if (earlyEnd > 0 && earlyCount > 0) {
      const spacing = Math.max(2, Math.round(earlyEnd / (earlyCount + 1)))
      for (let i = 1; i <= earlyCount; i++) {
        const offset = Math.min(Math.round(spacing * i), earlyEnd - 1)
        const date   = addDays(startDate, offset)
        dates.push(date.getDay() !== 0 ? date : addDays(date, 1))
      }
    }

    const lateStart = daysUntilExam - 7
    if (lateCount > 0) {
      const spacing = Math.max(1, Math.round(6 / (lateCount + 1)))
      for (let i = 1; i <= lateCount; i++) {
        const offset = lateStart + Math.round(spacing * i)
        if (offset < daysUntilExam) {
          const date = addDays(startDate, offset)
          dates.push(date.getDay() !== 0 ? date : addDays(date, 1))
        }
      }
    }
  }

  const seen = new Set()
  return dates.filter(d => {
    const k = dateStr(d)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).sort((a, b) => a - b)
}

function getSessionType(sessionIdx, totalSessions, daysLeft, learningStyle, yearLevel) {
  const senior = yearLevel === '3rd Year' || yearLevel === '4th Year+'

  if (daysLeft <= 3) return 'Final Review'
  if (daysLeft <= 7) {
    if (senior) {
      return learningStyle === 'practice'
        ? ['Past Exam Paper', 'Timed Practice', 'Case Study'][sessionIdx % 3]
        : ['Critical Analysis', 'Intensive Review', 'Essay Outline'][sessionIdx % 3]
    }
    return learningStyle === 'practice'
      ? ['Practice Quiz', 'Flashcard Drill', 'Self-Test'][sessionIdx % 3]
      : ['Deep Review', 'Intensive Review', 'Chapter Review'][sessionIdx % 3]
  }

  const progress   = sessionIdx / Math.max(totalSessions - 1, 1)
  const styleBank  = getSessionBank(learningStyle, yearLevel)

  if (progress < 0.2) return senior ? 'Initial Reading'  : 'Lecture Review'
  if (progress < 0.5) return styleBank[0]
  if (progress < 0.75) return styleBank[1] ?? 'Review'
  return styleBank[2] ?? 'Deep Review'
}
