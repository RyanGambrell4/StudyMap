import { useState, useEffect } from 'react'
import { getCachedCoachPlan, saveCoachPlan as dbSaveCoachPlan } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getAIQueriesUsed, getAIQueriesLimit } from '../lib/subscription'



function loadCoachPlan(courseId) {
  return getCachedCoachPlan(courseId)
}

function saveCoachPlan(courseId, plan, formData) {
  dbSaveCoachPlan(courseId, plan, formData)
}

export default function StudyCoachView({ courses, userId, onShowPaywall, googleEvents = [], preferredTime = 'Morning', theme = 'dark' }) {
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
    // Load struggles from cached coach plan
    const courseId = courses[courseIdx]?.id ?? courseIdx
    const entry = getCachedCoachPlan(courseId)
    setStruggles(entry?.struggles ?? [])
    setPushed(false)
    setError('')
  }, [courseIdx])

  const course = courses[courseIdx]
  const dot = course?.color?.dot ?? '#6366F1'
  const isDark = theme === 'dark'
  const [struggles, setStruggles] = useState([])
  const inputStyle = isDark
    ? { backgroundColor: '#111827', border: '1px solid #1e293b' }
    : { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
  const inactiveBtnBorder = isDark ? '#1e293b' : '#e2e8f0'

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
      const token = await getAccessToken()
      const res = await fetch('/api/generate-study-coach-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course.name,
          goal: goal.trim(),
          emphasisTopics: emphasisTopics.trim() || null,
          importantDates: validDates.length ? validDates : null,
          daysPerWeek,
          sessionMinutes,
          calendarEvents: googleEvents.length ? googleEvents : null,
          timePreference: preferredTime,
          struggles: struggles.length ? struggles : null,
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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={isDark ? { backgroundColor: '#1e293b', border: '1px dashed #334155' } : { backgroundColor: '#f1f5f9', border: '1px dashed #cbd5e1' }}>
          <svg className="w-8 h-8 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-slate-900 dark:text-white font-bold text-lg mb-2">No courses yet</p>
        <p className="text-slate-500 text-sm">Add your courses in the setup flow to start building a Study Coach plan.</p>
      </div>
    )
  }

  return (
    <div className="px-5 py-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Study Coach</h1>
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
                  : { backgroundColor: 'transparent', color: '#64748b', borderColor: inactiveBtnBorder }
                }
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cdot }} />
                {c.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Struggles banner */}
      {struggles.length > 0 && (
        <div className="mb-5 flex items-start gap-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 rounded-xl px-4 py-3">
          <span className="text-base shrink-0 mt-0.5">📌</span>
          <p className="text-indigo-700 dark:text-indigo-300 text-sm leading-relaxed">
            <span className="font-semibold">Topics flagged from AI Tutor: </span>
            {struggles.join(', ')}
            <span className="text-indigo-500 dark:text-indigo-400"> — these will be emphasized in your new plan.</span>
          </p>
        </div>
      )}

      {/* Show saved plan or form */}
      {plan ? (
        <PlanView
          plan={plan}
          course={course}
          dot={dot}
          pushed={pushed}
          onPush={handlePushToSessions}
          onReset={handleReset}
          theme={theme}
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
              className="w-full rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none text-sm resize-none leading-relaxed"
              style={inputStyle}
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
              className="w-full rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none text-sm resize-none leading-relaxed"
              style={inputStyle}
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
                    className="flex-1 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none text-sm"
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={d.date}
                    onChange={e => updateDateRow(i, 'date', e.target.value)}
                    className="rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-300 focus:outline-none text-sm"
                    style={{ ...inputStyle, colorScheme: isDark ? 'dark' : 'light' }}
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
                      : { backgroundColor: 'transparent', color: '#64748b', borderColor: inactiveBtnBorder }
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
                className="w-full rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none text-sm"
                style={{ ...inputStyle, colorScheme: isDark ? 'dark' : 'light' }}
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
function tv(dark) {
  return dark ? {
    cardBg:        '#0a0f1a',
    cardBorder:    '#1e293b',
    strategyBg:    'linear-gradient(160deg, #0d1420 0%, #0a0f1a 100%)',
    labelColor:    '#4b5563',
    topicText:     '#e2e8f0',
    divider:       '#111827',
    summaryText:   '#cbd5e1',
    weekBgClosed:  '#0a0f1a',
    weekBgOpen:    '#0d1117',
    weekBorderClosed: '#141c2e',
    weekBorderOpen:   '#1e293b',
    weekNumBg:     '#111827',
    weekNumBorder: '#1e293b',
    weekNumText:   '#475569',
    weekTitle:     '#f1f5f9',
    weekTheme:     '#475569',
    sessCountBg:   '#0d1117',
    sessCountBorder: '#1e293b',
    sessCountText: '#2d3d55',
    chevron:       '#2d4a6e',
    sessionBg:     '#080d14',
    sessionBorder: '#141c2e',
    goalText:      '#64748b',
    chipBg:        '#0d1117',
    chipText:      '#3d526e',
    chipBorder:    '#1a2744',
    methodText:    '#475569',
    warningText:   '#94a3b8',
    sectionDivBorder: '1px solid #1e293b',
  } : {
    cardBg:        '#ffffff',
    cardBorder:    '#e2e8f0',
    strategyBg:    'linear-gradient(160deg, #f5f7ff 0%, #f8fafc 100%)',
    labelColor:    '#9ca3af',
    topicText:     '#111827',
    divider:       '#f1f5f9',
    summaryText:   '#374151',
    weekBgClosed:  '#f9fafb',
    weekBgOpen:    '#f0f4ff',
    weekBorderClosed: '#e5e7eb',
    weekBorderOpen:   '#c7d2fe',
    weekNumBg:     '#f1f5f9',
    weekNumBorder: '#e2e8f0',
    weekNumText:   '#9ca3af',
    weekTitle:     '#111827',
    weekTheme:     '#6b7280',
    sessCountBg:   '#f1f5f9',
    sessCountBorder: '#e2e8f0',
    sessCountText: '#9ca3af',
    chevron:       '#9ca3af',
    sessionBg:     '#f8fafc',
    sessionBorder: '#e5e7eb',
    goalText:      '#6b7280',
    chipBg:        '#f1f5f9',
    chipText:      '#6b7280',
    chipBorder:    '#e2e8f0',
    methodText:    '#6b7280',
    warningText:   '#374151',
    sectionDivBorder: '1px solid #e5e7eb',
  }
}

function PlanView({ plan, course, dot, pushed, onPush, onReset, theme = 'dark' }) {
  const [expandedWeek, setExpandedWeek] = useState(0)
  const t = tv(theme === 'dark')

  return (
    <div className="space-y-3">

      {/* Strategy card */}
      <div style={{
        background: t.strategyBg,
        border: `1px solid ${t.cardBorder}`,
        borderTop: `2px solid ${dot}`,
        borderRadius: '0.875rem',
        padding: '1.5rem',
      }}>
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5L10.163 5.88L15 6.573L11.5 9.983L12.326 14.8L8 12.52L3.674 14.8L4.5 9.983L1 6.573L5.837 5.88L8 1.5Z" fill={dot} fillOpacity="0.85" />
          </svg>
          <p style={{ color: dot, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Study Strategy</p>
        </div>
        <p style={{ color: t.summaryText, fontSize: '13.5px', lineHeight: '1.7' }}>{plan.summary}</p>
      </div>

      {/* Priority Topics */}
      {plan.priorityTopics?.length > 0 && (
        <div style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: '0.875rem', padding: '1.5rem' }}>
          <p style={{ color: t.labelColor, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>Priority Topics</p>
          <div>
            {plan.priorityTopics.map((topic, i) => (
              <div key={i} className="flex items-start gap-4" style={{ padding: '0.875rem 0', borderBottom: i < plan.priorityTopics.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, color: `${dot}28`, minWidth: '2.25rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0, paddingTop: '2px' }}>
                  {i + 1}
                </span>
                <p style={{ color: t.topicText, fontSize: '13.5px', lineHeight: '1.55', paddingTop: '3px' }}>{topic}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watch Out For */}
      {plan.warningZones?.length > 0 && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.14)', borderRadius: '0.875rem', padding: '1.5rem' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 6.5V9" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="#ef4444" />
            </svg>
            <p style={{ color: '#ef4444', fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Watch Out For</p>
          </div>
          <div>
            {plan.warningZones.map((w, i) => (
              <div key={i} className="flex items-start gap-3" style={{ padding: '0.75rem 0', borderBottom: i < plan.warningZones.length - 1 ? '1px solid rgba(239,68,68,0.07)' : 'none' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                </div>
                <p style={{ color: t.warningText, fontSize: '13px', lineHeight: '1.65' }}>{w}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week-by-week */}
      <div>
        <p style={{ color: t.labelColor, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Your Week-by-Week Plan</p>
        <div className="space-y-2">
          {plan.weeklyFocus?.map((week, wi) => {
            const isOpen = expandedWeek === wi
            return (
              <div key={wi} className="rounded-xl overflow-hidden" style={{ backgroundColor: isOpen ? t.weekBgOpen : t.weekBgClosed, border: '1px solid', borderColor: isOpen ? t.weekBorderOpen : t.weekBorderClosed, transition: 'background-color 0.15s, border-color 0.15s' }}>
                <button className="w-full flex items-center gap-4 px-4 py-4 text-left" onClick={() => setExpandedWeek(isOpen ? -1 : wi)}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: isOpen ? `${dot}18` : t.weekNumBg, border: `1px solid ${isOpen ? `${dot}35` : t.weekNumBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background-color 0.15s, border-color 0.15s' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: isOpen ? dot : t.weekNumText }}>{wi + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: t.weekTitle, fontWeight: 600, fontSize: '13.5px' }}>{week.week}</p>
                    <p style={{ color: t.weekTheme, fontSize: '12px', marginTop: '1px' }} className="truncate">{week.theme}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span style={{ fontSize: '11px', fontWeight: 600, color: t.sessCountText, backgroundColor: t.sessCountBg, border: `1px solid ${t.sessCountBorder}`, borderRadius: '6px', padding: '2px 8px' }}>
                      {week.sessions?.length}
                    </span>
                    <svg className="w-4 h-4" style={{ color: t.chevron, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${t.divider}` }}>
                    {week.sessions?.map((sess, si) => (
                      <SessionCard key={si} session={sess} dot={dot} t={t} />
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
        <button onClick={onPush} disabled={pushed} className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all disabled:opacity-60" style={{ backgroundColor: pushed ? '#065f46' : dot, boxShadow: pushed ? '0 0 24px #065f4650' : `0 0 28px ${dot}35` }}>
          {pushed ? '✓ Plan saved — sessions will use this as their starting point' : 'Push to Sessions'}
        </button>
        {pushed && (
          <p className="text-center text-xs leading-relaxed" style={{ color: t.weekTheme }}>
            When you start a session for <span className="font-medium" style={{ color: t.weekTitle }}>{course.name}</span>, the Blueprint screen will auto-fill the focus from this plan.
          </p>
        )}
        <button onClick={onReset} className="w-full py-2.5 rounded-xl text-sm transition-colors" style={{ color: t.weekTheme, border: `1px solid ${t.cardBorder}` }}>
          Rebuild plan
        </button>
      </div>

    </div>
  )
}

function SessionCard({ session, dot, t }) {
  return (
    <div style={{ backgroundColor: t.sessionBg, border: `1px solid ${t.sessionBorder}`, borderLeft: `2px solid ${dot}`, borderRadius: '0.625rem', padding: '1rem 1rem 1rem 1.125rem', marginTop: '0.5rem' }}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.1em', backgroundColor: `${dot}15`, color: dot, border: `1px solid ${dot}28`, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {session.sessionLabel}
          </span>
          <p style={{ color: t.weekTitle, fontWeight: 600, fontSize: '13.5px' }} className="truncate">{session.focusArea}</p>
        </div>
        <span style={{ fontSize: '11px', color: t.chevron, fontWeight: 600, flexShrink: 0 }}>{session.duration}m</span>
      </div>
      <p style={{ color: t.goalText, fontSize: '12.5px', lineHeight: '1.6', marginBottom: '0.75rem' }}>{session.goal}</p>
      {session.keyTopics?.length > 0 && (
        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: '0.75rem' }}>
          {session.keyTopics.map((topic, ti) => (
            <span key={ti} style={{ fontSize: '10.5px', padding: '2px 9px', borderRadius: '5px', fontWeight: 500, backgroundColor: t.chipBg, color: t.chipText, border: `1px solid ${t.chipBorder}` }}>
              {topic}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <svg className="w-3 h-3 shrink-0" fill="none" stroke={dot} viewBox="0 0 24 24" strokeOpacity="0.7">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p style={{ fontSize: '11.5px', fontStyle: 'italic', color: t.methodText }}>{session.studyMethod}</p>
      </div>
    </div>
  )
}
