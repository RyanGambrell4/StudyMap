import { describe, it, expect } from 'vitest'
import { generateSchedule } from './generateSchedule'

function dateInDays(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const schedule = { hoursPerWeek: 10, preferredTime: 'Morning' }

// The screenshot case: three courses whose exams land on the same day, which is
// what used to produce the "Exam Cluster Detected" banner and a stack of
// same-day sessions.
const clusteredCourses = [
  { name: 'Introduction to Psychology', examDate: dateInDays(45), difficulty: 'Medium', targetGrade: 'A', color: '#3452D9' },
  { name: 'Introduction to Psychology', examDate: dateInDays(45), difficulty: 'Medium', targetGrade: 'A', color: '#2FA36B' },
  { name: 'Phyc',                       examDate: dateInDays(45), difficulty: 'Medium', targetGrade: 'A', color: '#D97706' },
]

function allDays(result) {
  return result.weeks.flatMap(w => w.days)
}

describe('generateSchedule', () => {
  it('no longer reports exam conflicts to the UI', () => {
    const result = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')
    expect(result.examConflicts).toBeUndefined()
  })

  it('never stacks a crunch day when exams cluster', () => {
    const result = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')

    // Anchored Final Review / Exam Cram sessions are allowed to share the two
    // days before an exam; everything else must respect the daily cap.
    const overloaded = allDays(result).filter(d => {
      const flexible = d.sessions.filter(s => s.sessionType !== 'Final Review' && s.sessionType !== 'Exam Cram')
      return flexible.length > 4
    })

    expect(overloaded.map(d => d.dateStr)).toEqual([])
  })

  it('spreads clustered courses across days instead of piling them on one', () => {
    const result = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')
    const busy = allDays(result).filter(d => d.sessions.length > 0)

    expect(busy.length).toBeGreaterThan(6)

    // Same course twice in one day was the visible symptom of the pile-up.
    const doubledUp = busy.filter(d => {
      const ids = d.sessions.filter(s => s.sessionType !== 'Final Review' && s.sessionType !== 'Exam Cram').map(s => s.courseId)
      return new Set(ids).size !== ids.length
    })
    expect(doubledUp.map(d => d.dateStr)).toEqual([])
  })

  it('front-loads clustered exams so the final week stays lighter', () => {
    const clustered = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')
    const spaced = generateSchedule(
      [
        { name: 'Introduction to Psychology', examDate: dateInDays(45), difficulty: 'Medium', targetGrade: 'A', color: '#3452D9' },
        { name: 'Biology',                    examDate: dateInDays(90), difficulty: 'Medium', targetGrade: 'A', color: '#2FA36B' },
        { name: 'Statistics',                 examDate: dateInDays(135), difficulty: 'Medium', targetGrade: 'A', color: '#D97706' },
      ],
      schedule, 'reader', '1st Year',
    )

    const finalWeekLoad = (result, courseId) => {
      const examDay = dateInDays(45)
      return allDays(result)
        .filter(d => d.dateStr <= examDay && d.dateStr > dateInDays(38))
        .flatMap(d => d.sessions)
        .filter(s => s.courseId === courseId && s.sessionType !== 'Final Review' && s.sessionType !== 'Exam Cram')
        .length
    }

    expect(finalWeekLoad(clustered, 0)).toBeLessThanOrEqual(finalWeekLoad(spaced, 0))
  })

  it('never schedules a session in the past, today, or on a Sunday', () => {
    const result = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')
    const today = dateInDays(0)

    allDays(result).forEach(d => {
      if (!d.sessions.length) return
      expect(d.dateStr > today).toBe(true)
      expect(new Date(d.dateStr + 'T12:00:00').getDay()).not.toBe(0)
    })
  })

  it('still schedules every course', () => {
    const result = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')
    const courseIds = new Set(allDays(result).flatMap(d => d.sessions).map(s => s.courseId))
    expect([...courseIds].sort()).toEqual([0, 1, 2])
  })

  it('gives every session a unique id', () => {
    const result = generateSchedule(clusteredCourses, schedule, 'reader', '1st Year')
    const ids = allDays(result).flatMap(d => d.sessions).map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
