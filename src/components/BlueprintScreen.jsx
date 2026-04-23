import { useState, useEffect } from 'react'
import { getCachedCoachPlan, saveCoachPlan, getCachedStudyTools } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'

const ACTIVITY_COLORS = {
  'review':           { border: '#3B82F6', bg: '#1e3a5f', label: 'Review' },
  'active-recall':    { border: '#A855F7', bg: '#3b1f5e', label: 'Active Recall' },
  'flashcards':       { border: '#EC4899', bg: '#4a1230', label: 'Flashcards' },
  'practice-problems':{ border: '#F97316', bg: '#4a2210', label: 'Practice' },
  'summary':          { border: '#14B8A6', bg: '#0f3530', label: 'Summary' },
  'break':            { border: '#22C55E', bg: '#0f2e1a', label: 'Break' },
}

function activityColor(activity) {
  return ACTIVITY_COLORS[activity] ?? { border: '#6366F1', bg: '#1e1b4b', label: activity }
}

export default function BlueprintScreen({ session, course, onStartSession, onExit, onShowPaywall }) {
  const [focus, setFocus] = useState('')
  const [blueprint, setBlueprint] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hoveredBlock, setHoveredBlock] = useState(null)
  const [coachBanner, setCoachBanner] = useState(null) // { text } if pre-filled from coach plan

  // Pre-fill focus from Study Coach plan if available
  useEffect(() => {
    // If the session already carries coach plan context (e.g. launched from
    // "Start first session" button), use it directly — no lookup needed.
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
          sessionType: session.sessionType,
          durationMinutes: session.duration,
          examDate: course?.examDate ?? null,
          targetGrade: course?.targetGrade ?? 'B',
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
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden" style={{ backgroundColor: '#070D1A' }}>
      {/* Top accent */}
      <div className="h-0.5 w-full shrink-0" style={{ backgroundColor: dot }} />

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 70% 35% at 50% 0%, ${dot}10 0%, transparent 65%)` }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot, boxShadow: `0 0 8px ${dot}80` }} />
          <div className="min-w-0">
            <p className="text-white font-bold text-base truncate">{session.courseName}</p>
            <p className="text-slate-500 text-xs font-medium">{session.sessionType} · {session.duration} min</p>
          </div>
          {daysLeft !== null && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              style={
                urgency === 'red' ? { backgroundColor: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d' }
                : urgency === 'amber' ? { backgroundColor: '#451a03', color: '#fb923c', border: '1px solid #7c2d12' }
                : { backgroundColor: '#0f172a', color: '#64748b', border: '1px solid #1e293b' }
              }
            >
              {daysLeft === 0 ? 'Exam today' : `${daysLeft}d to exam`}
            </span>
          )}
        </div>
        <button onClick={onExit} className="text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1.5 text-sm shrink-0 ml-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-xl mx-auto px-5 py-4 pb-10">

          {/* Focus input always shown */}
          {!blueprint && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-1">Session Blueprint</h1>
              <p className="text-slate-500 text-sm mb-6">Your session, mapped out before you start. Tell us what you're working with and we'll build the plan.</p>

              {coachBanner && (
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 mb-4" style={{ backgroundColor: `${dot}12`, border: `1px solid ${dot}30` }}>
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: dot }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-xs leading-relaxed" style={{ color: dot }}>{coachBanner}</p>
                </div>
              )}

              <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">What do you want to focus on today?</label>
              <input
                type="text"
                value={focus}
                onChange={e => setFocus(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleGenerate()}
                placeholder="e.g. 'WACC formula and capital structure' or leave blank to let StudyEdge decide"
                className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none text-sm mb-4"
                style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
              />

              {error && (
                <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">{error}</div>
              )}

              {loading ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-slate-800" />
                    <div
                      className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-current animate-spin"
                      style={{ color: dot }}
                    />
                  </div>
                  <p className="text-slate-300 font-medium">Building your session blueprint…</p>
                  <p className="text-slate-600 text-xs text-center max-w-xs">Designing structured intervals for {session.courseName}</p>
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all"
                  style={{ backgroundColor: dot, boxShadow: `0 0 24px ${dot}35` }}
                >
                  Build My Session Plan
                </button>
              )}

              {!loading && (
                <button
                  onClick={() => onStartSession(null)}
                  className="w-full mt-3 py-3 rounded-2xl text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Skip and just start the timer
                </button>
              )}
            </div>
          )}

          {/* Blueprint result */}
          {blueprint && (
            <div>
              {/* Title + objective */}
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: dot }}>Session Plan Ready</p>
                <h2 className="text-2xl font-bold text-white mb-2 leading-tight">{blueprint.sessionTitle}</h2>
                <p className="text-slate-400 text-sm leading-relaxed">{blueprint.objective}</p>
              </div>

              {/* Visual session bar */}
              <div className="flex h-3 rounded-full overflow-hidden mb-2 gap-px">
                {blueprint.blocks.map((block, i) => {
                  const pct = (block.duration / totalDuration) * 100
                  const ac = activityColor(block.activity)
                  return (
                    <div
                      key={i}
                      style={{ width: `${pct}%`, backgroundColor: hoveredBlock === i ? ac.border : ac.border + '80', transition: 'background-color 0.15s' }}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredBlock(i)}
                      onMouseLeave={() => setHoveredBlock(null)}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between text-xs text-slate-700 mb-6">
                <span>0 min</span>
                <span>{totalDuration} min</span>
              </div>

              {/* Activity legend */}
              <div className="flex flex-wrap gap-2 mb-5">
                {[...new Set(blueprint.blocks.map(b => b.activity))].map(act => {
                  const ac = activityColor(act)
                  return (
                    <span key={act} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: ac.bg, color: ac.border, border: `1px solid ${ac.border}40` }}>
                      {ac.label}
                    </span>
                  )
                })}
              </div>

              {/* Block list */}
              <div className="space-y-3 mb-6">
                {blueprint.blocks.map((block, i) => {
                  const ac = activityColor(block.activity)
                  const isHovered = hoveredBlock === i
                  return (
                    <div
                      key={i}
                      className="rounded-2xl p-4 transition-all cursor-default"
                      style={{
                        borderLeft: `4px solid ${ac.border}`,
                        backgroundColor: isHovered ? ac.bg : '#0d1424',
                        border: `1px solid ${isHovered ? ac.border + '50' : '#1e293b'}`,
                        borderLeftColor: ac.border,
                        borderLeftWidth: '4px',
                      }}
                      onMouseEnter={() => setHoveredBlock(i)}
                      onMouseLeave={() => setHoveredBlock(null)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                          style={{ backgroundColor: ac.bg, color: ac.border, border: `1px solid ${ac.border}40` }}
                        >
                          {block.duration} min
                        </span>
                        <p className="text-white font-semibold text-sm">{block.title}</p>
                        <span className="ml-auto text-xs text-slate-700 shrink-0">#{block.blockNumber}</span>
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed mb-1.5">{block.instruction}</p>
                      <p className="text-slate-600 text-xs italic leading-relaxed">{block.why}</p>
                    </div>
                  )
                })}
              </div>

              {/* Regenerate option */}
              <button
                onClick={() => { setBlueprint(null); setError('') }}
                className="w-full mb-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                Regenerate plan
              </button>

              {/* Start button */}
              <button
                onClick={() => onStartSession(blueprint)}
                className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all"
                style={{ backgroundColor: dot, boxShadow: `0 0 28px ${dot}40` }}
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
