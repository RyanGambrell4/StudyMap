import { useState, useEffect } from 'react'
import { getCachedCoachPlan, saveCoachPlan, getCachedStudyTools } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'

const ACTIVITY_COLORS = {
  'review':           { border: '#3B82F6', bg: '#EFF6FF', label: 'Review' },
  'active-recall':    { border: '#A855F7', bg: '#FAF5FF', label: 'Active Recall' },
  'flashcards':       { border: '#EC4899', bg: '#FDF2F8', label: 'Flashcards' },
  'practice-problems':{ border: '#F97316', bg: '#FFF7ED', label: 'Practice' },
  'summary':          { border: '#14B8A6', bg: '#F0FDFA', label: 'Summary' },
  'break':            { border: '#22C55E', bg: '#F0FDF4', label: 'Break' },
}

function activityColor(activity) {
  return ACTIVITY_COLORS[activity] ?? { border: '#6366F1', bg: '#EEF2FF', label: activity }
}

const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i

const EXAM_SESSION_TYPES = [
  'Content Review',
  'Practice Passage Block',
  'Full Length Exam',
  'FL Review Session',
  'Active Recall Drill',
]

export default function BlueprintScreen({ session, course, onStartSession, onExit, onShowPaywall }) {
  const [focus, setFocus] = useState('')
  const [blueprint, setBlueprint] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [coachBanner, setCoachBanner] = useState(null)

  const isExamMode = EXAM_PATTERN.test(session.courseName ?? '')
  const [sessionType, setSessionType] = useState(
    isExamMode ? EXAM_SESSION_TYPES[0] : (session.sessionType ?? 'Review')
  )

  useEffect(() => {
    if (session.focusArea) {
      const prefill = [session.focusArea, ...(session.keyTopics ?? [])].filter(Boolean).join(', ')
      setFocus(prefill)
      setCoachBanner(`Study Coach plan: ${session.focusArea}`)
      return
    }
    try {
      const courseId = session.courseId
      const saved = getCachedCoachPlan(courseId)
      if (!saved?.plan?.weeklyFocus) return
      const idx = saved.sessionIndex ?? 0
      const allSessions = saved.plan.weeklyFocus.flatMap(w => w.sessions ?? [])
      const nextSession = allSessions[idx]
      if (!nextSession) return
      const prefill = [nextSession.focusArea, ...(nextSession.keyTopics ?? [])].filter(Boolean).join(', ')
      setFocus(prefill)
      setCoachBanner(`Loaded from your Study Coach plan: ${nextSession.focusArea}`)
      const updatedIndex = Math.min(idx + 1, allSessions.length - 1)
      saveCoachPlan(courseId, saved.plan, saved.formData)
    } catch {}
  }, [])

  const dot = session.color?.dot ?? '#6366F1'

  const todayStr = new Date().toISOString().split('T')[0]
  const daysLeft = course?.examDate
    ? Math.max(0, Math.round((new Date(course.examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000))
    : null

  const urgency = daysLeft !== null && daysLeft <= 3 ? 'red' : daysLeft !== null && daysLeft <= 7 ? 'amber' : null

  const studyTools = (() => {
    try {
      const d = getCachedStudyTools()
      return d?.courseIdx === session.courseId ? d : null
    } catch { return null }
  })()

  const handleGenerate = async () => {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setLoading(true)
    setError('')
    setBlueprint(null)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-session-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: session.courseName,
          sessionType,
          durationMinutes: session.duration,
          examDate: course?.examDate ?? null,
          targetGrade: isExamMode ? null : (course?.targetGrade ?? 'B'),
          targetScore: isExamMode ? (course?.targetScore ?? null) : null,
          uploadedTopics: studyTools?.text ? studyTools.text.slice(0, 500) : null,
          studentFocus: focus.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate blueprint')
      setBlueprint(data)
      incrementAIQuery()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const totalDuration = blueprint?.blocks?.reduce((s, b) => s + b.duration, 0) ?? session.duration

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden" style={{ backgroundColor: '#F7F6F3' }}>
      {/* Top accent */}
      <div className="h-0.5 w-full shrink-0" style={{ backgroundColor: dot }} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', backgroundColor: '#FFFFFF' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
          <div className="min-w-0">
            <p className="font-bold text-base truncate" style={{ color: '#1A1A1A' }}>{session.courseName}</p>
            <p className="text-xs font-medium" style={{ color: '#9B9B9B' }}>{sessionType} · {session.duration} min</p>
          </div>
          {daysLeft !== null && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
              style={
                urgency === 'red' ? { backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5' }
                : urgency === 'amber' ? { backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D' }
                : { backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }
              }
            >
              {daysLeft === 0 ? 'Exam today' : `${daysLeft}d to exam`}
            </span>
          )}
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-sm shrink-0 ml-4 transition-colors"
          style={{ color: '#9B9B9B' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-6 pb-10">

          {!blueprint && (
            <div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: '#1A1A1A' }}>Session Blueprint</h1>
              <p className="text-sm mb-6" style={{ color: '#9B9B9B' }}>Your session, mapped out before you start. Tell us what you're working with and we'll build the plan.</p>

              {coachBanner && (
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 mb-4" style={{ backgroundColor: `${dot}12`, border: `1px solid ${dot}30` }}>
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: dot }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-xs leading-relaxed" style={{ color: dot }}>{coachBanner}</p>
                </div>
              )}

              {isExamMode && (
                <div className="mb-5">
                  <label className="block text-xs uppercase tracking-widest font-bold mb-2" style={{ color: '#9B9B9B' }}>Session type</label>
                  <div className="flex flex-wrap gap-2">
                    {EXAM_SESSION_TYPES.map(type => (
                      <button
                        key={type}
                        onClick={() => setSessionType(type)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={sessionType === type
                          ? { backgroundColor: dot, color: '#fff', border: `1px solid ${dot}` }
                          : { backgroundColor: '#FFFFFF', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.12)' }
                        }
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block text-xs uppercase tracking-widest font-bold mb-2" style={{ color: '#9B9B9B' }}>What do you want to focus on today?</label>
              <input
                type="text"
                value={focus}
                onChange={e => setFocus(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleGenerate()}
                placeholder="e.g. 'WACC formula and capital structure' or leave blank to let StudyEdge AI decide"
                className="w-full rounded-xl px-4 py-3 focus:outline-none text-sm mb-4"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.12)', color: '#1A1A1A' }}
              />

              {error && (
                <div className="rounded-xl px-4 py-3 mb-4 text-sm" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}>{error}</div>
              )}

              {loading ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4" style={{ borderColor: 'rgba(0,0,0,0.08)' }} />
                    <div
                      className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-current animate-spin"
                      style={{ color: dot }}
                    />
                  </div>
                  <p className="font-medium" style={{ color: '#1A1A1A' }}>Building your session blueprint…</p>
                  <p className="text-xs text-center max-w-xs" style={{ color: '#9B9B9B' }}>Designing structured intervals for {session.courseName}</p>
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all"
                  style={{ backgroundColor: dot }}
                >
                  Build My Session Plan
                </button>
              )}

              {!loading && (
                <button
                  onClick={() => onStartSession(null)}
                  className="w-full mt-3 py-3 rounded-2xl text-sm font-medium transition-colors"
                  style={{ color: '#9B9B9B' }}
                >
                  Skip and just start the timer
                </button>
              )}
            </div>
          )}

          {blueprint && (
            <div>
              <h2 className="text-2xl font-bold mb-2 leading-tight" style={{ color: '#1A1A1A' }}>{blueprint.sessionTitle}</h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B6B6B' }}>{blueprint.objective}</p>

              {/* Visual session bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden mb-1 gap-px">
                {blueprint.blocks.map((block, i) => {
                  const pct = (block.duration / totalDuration) * 100
                  const ac = activityColor(block.activity)
                  return <div key={i} style={{ width: `${pct}%`, backgroundColor: ac.border }} />
                })}
              </div>
              <div className="flex justify-between text-xs mb-5" style={{ color: '#C0C0C0' }}>
                <span>0 min</span>
                <span>{totalDuration} min</span>
              </div>

              {/* Activity legend */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {[...new Set(blueprint.blocks.map(b => b.activity))].map(act => {
                  const ac = activityColor(act)
                  return (
                    <span key={act} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: ac.bg, color: ac.border }}>
                      {ac.label}
                    </span>
                  )
                })}
              </div>

              {/* Block list */}
              <div className="mb-6" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                {blueprint.blocks.map((block, i) => {
                  const ac = activityColor(block.activity)
                  return (
                    <div
                      key={i}
                      className="py-4"
                      style={{
                        borderBottom: '1px solid rgba(0,0,0,0.07)',
                        borderLeft: `3px solid ${ac.border}`,
                        paddingLeft: 16,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ color: ac.border, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ac.label}</span>
                        <span style={{ color: '#C0C0C0', fontSize: 11 }}>· {block.duration} min</span>
                      </div>
                      <p style={{ fontWeight: 600, color: '#1A1A1A', fontSize: 14, marginBottom: 4 }}>{block.title}</p>
                      <p style={{ color: '#6B6B6B', fontSize: 13, lineHeight: 1.5 }}>{block.instruction}</p>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={() => { setBlueprint(null); setError('') }}
                className="w-full mb-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: '#9B9B9B', border: '1px solid rgba(0,0,0,0.10)', backgroundColor: '#FFFFFF' }}
              >
                Regenerate plan
              </button>

              <button
                onClick={() => onStartSession(blueprint)}
                className="w-full py-4 rounded-2xl font-bold text-white text-base"
                style={{ backgroundColor: dot }}
              >
                Start Session →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
