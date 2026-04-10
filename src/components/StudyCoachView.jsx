import { useState, useEffect } from 'react'
import { getCachedCoachPlan, saveCoachPlan as dbSaveCoachPlan } from '../lib/db'
import { canUseAI, incrementAIQuery, getAIQueriesUsed, getAIQueriesLimit } from '../lib/subscription'

function loadCoachPlan(courseId) {
  return getCachedCoachPlan(courseId)
}

function saveCoachPlan(courseId, plan, formData) {
  dbSaveCoachPlan(courseId, plan, formData)
}

export default function StudyCoachView({ courses, userId, onShowPaywall, googleEvents = [], preferredTime = 'Morning' }) {
  // ── Form state ──
  const [courseIdx, setCourseIdx] = useState(courses.length > 0 ? 0 : -1)
  const [goal, setGoal] = useState('')
  const [emphasisTopics, setEmphasisTopics] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [sessionMinutes, setSessionMinutes] = useState(60)
  const [importantDates, setImportantDates] = useState([{ label: '', date: '' }])

  // ── Plan state ──
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pushed, setPushed] = useState(false)

  // ── Load saved plan when course changes ──
  useEffect(() => {
    if (courseIdx < 0 || !courses[courseIdx]) return
    const saved = loadCoachPlan(courses[courseIdx].id ?? courseIdx)
    if (saved) {
      setPlan(saved.plan)
      if (saved.formData) {
        setGoal(saved.formData.goal ?? '')
        setEmphasisTopics(saved.formData.emphasisTopics ?? '')
        setDaysPerWeek(saved.formData.daysPerWeek ?? 3)
        setSessionMinutes(saved.formData.sessionMinutes ?? 60)
        setImportantDates(saved.formData.importantDates?.length ? saved.formData.importantDates : [{ label: '', date: '' }])
      }
    } else {
      setPlan(null)
      setGoal('')
      setEmphasisTopics('')
      setDaysPerWeek(3)
      setSessionMinutes(60)
      setImportantDates([{ label: '', date: '' }])
    }
    setPushed(false)
    setError('')
  }, [courseIdx])

  const course = courses[courseIdx]
  const dot = course?.color?.dot ?? '#6366F1'

  const validDates = importantDates.filter(d => d.label.trim() && d.date)

  const handleGenerate = async () => {
    if (!course || !goal.trim()) return

    // Check AI query limit before calling
    if (!canUseAI()) {
      onShowPaywall?.('ai')
      return
    }

    setLoading(true)
    setError('')
    setPlan(null)
    setPushed(false)
    try {
      const res = await fetch('/api/generate-study-coach-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseName: course.name,
          goal: goal.trim(),
          emphasisTopics: emphasisTopics.trim() || null,
          importantDates: validDates.length ? validDates : null,
          daysPerWeek,
          sessionMinutes,
          calendarEvents: googleEvents.length ? googleEvents : null,
          timePreference,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate plan')
      setPlan(data)
      const courseId = course.id ?? courseIdx
      saveCoachPlan(courseId, data, { goal, emphasisTopics, daysPerWeek, sessionMinutes, importantDates })
      // Track AI query usage
      await incrementAIQuery()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePushToSessions = () => {
    if (!plan || !course) return
    const courseId = course.id ?? courseIdx
    saveCoachPlan(courseId, plan, { goal, emphasisTopics, daysPerWeek, sessionMinutes, importantDates })
    setPushed(true)
  }

  const handleReset = () => {
    setPlan(null)
    setError('')
    setPushed(false)
  }

  const addDateRow = () => setImportantDates(prev => [...prev, { label: '', date: '' }])
  const removeDateRow = i => setImportantDates(prev => prev.filter((_, j) => j !== i))
  const updateDateRow = (i, field, val) => setImportantDates(prev => prev.map((d, j) => j === i ? { ...d, [field]: val } : d))

  // ── Render: no courses ──
  if (courses.length === 0) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: '#1e293b', border: '1px dashed #334155' }}>
          <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-white font-bold text-lg mb-2">No courses yet</p>
        <p className="text-slate-500 text-sm">Add your courses in the setup flow to start building a Study Coach plan.</p>
      </div>
    )
  }

  return (
    <div className="px-5 py-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Study Coach</h1>
        <p className="text-slate-500 text-sm">Tell us about your course and goals — we'll map out a week-by-week study plan designed for how you work.</p>
      </div>

      {/* Course selector */}
      <div className="mb-5">
        <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Course</label>
        <div className="flex flex-wrap gap-2">
          {courses.map((c, i) => {
            const cdot = c.color?.dot ?? '#6366F1'
            const active = courseIdx === i
            return (
              <button
                key={i}
                onClick={() => setCourseIdx(i)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all border"
                style={active
                  ? { backgroundColor: `${cdot}20`, color: cdot, borderColor: `${cdot}50` }
                  : { backgroundColor: 'transparent', color: '#64748b', borderColor: '#1e293b' }
                }
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cdot }} />
                {c.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Show saved plan or form */}
      {plan ? (
        <PlanView
          plan={plan}
          course={course}
          dot={dot}
          pushed={pushed}
          onPush={handlePushToSessions}
          onReset={handleReset}
        />
      ) : (
        <div className="space-y-5">
          {/* Goal */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">What's your goal for this course?</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g. 'Ace the final', 'Understand derivatives deeply', 'Pass with a B+'"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none text-sm resize-none leading-relaxed"
              style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
            />
          </div>

          {/* Emphasis topics */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">What topics does your professor emphasize most?</label>
            <textarea
              value={emphasisTopics}
              onChange={e => setEmphasisTopics(e.target.value)}
              placeholder="e.g. 'Limit theorems, integration by parts, related rates' or 'Chapter 4-7 heavily tested'"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none text-sm resize-none leading-relaxed"
              style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
            />
          </div>

          {/* Important dates */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Important upcoming dates</label>
            <div className="space-y-2">
              {importantDates.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={d.label}
                    onChange={e => updateDateRow(i, 'label', e.target.value)}
                    placeholder="e.g. Midterm Exam"
                    className="flex-1 rounded-xl px-3 py-2.5 text-slate-200 placeholder-slate-700 focus:outline-none text-sm"
                    style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
                  />
                  <input
                    type="date"
                    value={d.date}
                    onChange={e => updateDateRow(i, 'date', e.target.value)}
                    className="rounded-xl px-3 py-2.5 text-slate-300 focus:outline-none text-sm"
                    style={{ backgroundColor: '#111827', border: '1px solid #1e293b', colorScheme: 'dark' }}
                  />
                  {importantDates.length > 1 && (
                    <button
                      onClick={() => removeDateRow(i)}
                      className="text-slate-700 hover:text-red-400 transition-colors shrink-0 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addDateRow}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5 pt-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add another date
              </button>
            </div>
          </div>

          {/* Days + session length */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Study days per week</label>
              <div className="flex gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <button
                    key={n}
                    onClick={() => setDaysPerWeek(n)}
                    className="w-9 h-9 rounded-xl text-sm font-bold transition-all border"
                    style={daysPerWeek === n
                      ? { backgroundColor: `${dot}25`, color: dot, borderColor: `${dot}50` }
                      : { backgroundColor: 'transparent', color: '#64748b', borderColor: '#1e293b' }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Session length</label>
              <select
                value={sessionMinutes}
                onChange={e => setSessionMinutes(Number(e.target.value))}
                className="w-full rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none text-sm"
                style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
              >
                {[30, 45, 60, 90].map(m => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
          )}

          {/* Generate button */}
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-slate-800" />
                <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-current animate-spin" style={{ color: dot }} />
              </div>
              <p className="text-slate-300 font-medium">Building your study plan…</p>
              <p className="text-slate-600 text-xs text-center max-w-xs">Mapping out your weeks based on your goal and dates</p>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!goal.trim()}
              className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all disabled:opacity-40"
              style={{ backgroundColor: dot, boxShadow: goal.trim() ? `0 0 28px ${dot}35` : 'none' }}
            >
              Generate My Study Plan
            </button>
          )}
        </div>
      )}

    </div>
  )
}

// ── Plan display ──────────────────────────────────────────────────────────────
function PlanView({ plan, course, dot, pushed, onPush, onReset }) {
  const [expandedWeek, setExpandedWeek] = useState(0)

  return (
    <div className="space-y-3">

      {/* Summary */}
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '1.25rem' }}>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#4b5563' }}>Study Strategy</p>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed">{plan.summary}</p>
      </div>

      {/* Priority Topics + Watch Out For — side by side if both exist, else full width */}
      {(plan.priorityTopics?.length > 0 || plan.warningZones?.length > 0) && (
        <div className={`grid gap-3 ${plan.priorityTopics?.length > 0 && plan.warningZones?.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>

          {plan.priorityTopics?.length > 0 && (
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '1.125rem' }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#4b5563' }}>Priority Topics</p>
              <ol className="space-y-2">
                {plan.priorityTopics.map((topic, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-[10px] font-bold tabular-nums mt-0.5 shrink-0" style={{ color: '#374151' }}>{String(i + 1).padStart(2, '0')}</span>
                    <p className="text-xs text-slate-300 leading-snug">{topic}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {plan.warningZones?.length > 0 && (
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '1.125rem' }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#4b5563' }}>Watch Out For</p>
              <ul className="space-y-2">
                {plan.warningZones.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#ef4444' }} />
                    <p className="text-xs text-slate-400 leading-snug">{w}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}

      {/* Week-by-week */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-3">Your Week-by-Week Plan</p>
        <div className="space-y-2">
          {plan.weeklyFocus?.map((week, wi) => {
            const weekAccent = ['#6366f1', '#14b8a6', '#8b5cf6', '#f59e0b'][wi % 4]
            return (
            <div key={wi} className="rounded-xl overflow-hidden" style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderLeft: `2px solid ${weekAccent}` }}>
              {/* Week header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors"
                style={{ backgroundColor: expandedWeek === wi ? '#111827' : 'transparent' }}
                onClick={() => setExpandedWeek(expandedWeek === wi ? -1 : wi)}
              >
                <div className="min-w-0">
                  <p className="text-slate-100 font-semibold text-sm">{week.week}</p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{week.theme}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-[11px] text-slate-600 font-medium">{week.sessions?.length} sessions</span>
                  <svg
                    className="w-3.5 h-3.5 text-slate-600 transition-transform"
                    style={{ transform: expandedWeek === wi ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Session cards */}
              {expandedWeek === wi && (
                <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid #1e293b' }}>
                  {week.sessions?.map((sess, si) => (
                    <SessionCard key={si} session={sess} dot={dot} />
                  ))}
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <button
          onClick={onPush}
          disabled={pushed}
          className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all disabled:opacity-60"
          style={{ backgroundColor: pushed ? '#065f46' : dot, boxShadow: pushed ? '0 0 24px #065f4650' : `0 0 28px ${dot}35` }}
        >
          {pushed ? '✓ Plan saved — sessions will use this as their starting point' : 'Push to Sessions'}
        </button>
        {pushed && (
          <p className="text-center text-xs text-slate-600 leading-relaxed">
            When you start a session for <span className="text-slate-400 font-medium">{course.name}</span>, the Blueprint screen will auto-fill the focus from this plan.
          </p>
        )}
        <button
          onClick={onReset}
          className="w-full py-2.5 rounded-xl text-sm text-slate-600 hover:text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
        >
          Rebuild plan
        </button>
      </div>

    </div>
  )
}

function SessionCard({ session, dot }) {
  return (
    <div
      className="rounded-lg p-3.5 mt-2"
      style={{ backgroundColor: '#141b2d', borderLeft: `2.5px solid ${dot}`, border: `1px solid #1e293b`, borderLeftColor: dot }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
            style={{ backgroundColor: `${dot}18`, color: dot, border: `1px solid ${dot}30` }}
          >
            {session.sessionLabel}
          </span>
          <p className="text-slate-100 font-semibold text-sm truncate">{session.focusArea}</p>
        </div>
        <span className="text-[11px] text-slate-600 shrink-0 font-medium">{session.duration}m</span>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed mb-2.5">{session.goal}</p>
      {session.keyTopics?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {session.keyTopics.map((topic, ti) => (
            <span key={ti} className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ backgroundColor: '#1e293b', color: '#475569', border: '1px solid #334155' }}>
              {topic}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <svg className="w-3 h-3 shrink-0" fill="none" stroke={dot} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p className="text-[11px] italic" style={{ color: '#94a3b8' }}>{session.studyMethod}</p>
      </div>
    </div>
  )
}
