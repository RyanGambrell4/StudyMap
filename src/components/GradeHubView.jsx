import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getActivePlan, canUseAI, incrementAIQuery } from '../lib/subscription'
import { getAccessToken } from '../lib/supabase'
import { saveCoachPlanStruggles } from '../lib/db'
import {
  TARGET_OPTIONS, letterGrade, gradeStatus, STATUS_COLORS,
  getCurrentGrade, getProjectedGrade, getNeededOnRemaining,
  getDefenseFloor, generateScenarioPaths,
} from '../utils/gradeCalc'

function uid() { return Math.random().toString(36).slice(2, 10) }
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const todayStr = () => new Date().toISOString().split('T')[0]
const daysTo = (dateStr) => dateStr
  ? Math.round((new Date(dateStr + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000)
  : null

// ── Target grade colors (higher grade = cooler / more vibrant) ───────────────
const TARGET_COLORS = {
  'A+':   { color: '#d946ef', gradient: 'linear-gradient(135deg, #e879f9, #a855f7)' }, // fuchsia → purple
  'A':    { color: '#8b5cf6', gradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }, // violet
  'A-':   { color: '#6366f1', gradient: 'linear-gradient(135deg, #818cf8, #4f46e5)' }, // indigo
  'B+':   { color: '#0ea5e9', gradient: 'linear-gradient(135deg, #38bdf8, #0284c7)' }, // sky
  'B':    { color: '#06b6d4', gradient: 'linear-gradient(135deg, #22d3ee, #0891b2)' }, // cyan
  'B-':   { color: '#14b8a6', gradient: 'linear-gradient(135deg, #2dd4bf, #0d9488)' }, // teal
  'C+':   { color: '#f59e0b', gradient: 'linear-gradient(135deg, #fbbf24, #d97706)' }, // amber
  'C':    { color: '#f97316', gradient: 'linear-gradient(135deg, #fb923c, #ea580c)' }, // orange
  'C-':   { color: '#ef4444', gradient: 'linear-gradient(135deg, #f87171, #dc2626)' }, // red
  'D+':   { color: '#e11d48', gradient: 'linear-gradient(135deg, #fb7185, #be123c)' }, // rose
  'D':    { color: '#94a3b8', gradient: 'linear-gradient(135deg, #cbd5e1, #64748b)' }, // slate
}

// ── Score badge color ─────────────────────────────────────────────────────────
function scoreBadgeColor(score) {
  if (score === null || score === undefined) return '#64748b'
  if (score > 100) return '#ef4444'
  if (score >= 96) return '#ef4444'
  if (score >= 85) return '#f59e0b'
  return '#10b981'
}

// ── Locked state ──────────────────────────────────────────────────────────────
function LockedState({ onShowPaywall }) {
  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <div className="relative rounded-2xl overflow-hidden">
        {/* Blurred fake preview */}
        <div className="blur-sm opacity-30 pointer-events-none select-none p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {['Calc 201', 'Physics', 'English'].map(n => (
              <div key={n} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="text-sm font-bold text-slate-800 dark:text-white mb-1">{n}</div>
                <div className="h-5 w-14 rounded-full bg-emerald-400/40" />
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
            <div className="h-8 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="space-y-2">
              {[85, 60, 95].map((w, i) => (
                <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-slate-700/60" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Grade Hub · Pro Feature</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mb-5">
            Advanced grade planning, live tracking, and what-if scenario modeling require a Pro or Unlimited plan.
          </p>
          <button
            onClick={() => onShowPaywall?.('grades')}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Course overview strip ─────────────────────────────────────────────────────
function CourseStrip({ courses, activeCourseIdx, onSelect }) {
  return (
    <div className="flex gap-3 overflow-x-auto pt-2 pb-2 scrollbar-hide mb-5 -mx-4 px-4">
      {courses.map((course, idx) => {
        const dot = course.color?.dot ?? '#6366f1'
        const active = activeCourseIdx === idx
        const comps = course.gradeData?.components ?? []
        const current = getCurrentGrade(comps)
        const target = course.gradeData?.targetGrade ?? null
        const status = current !== null && target ? gradeStatus(current, target) : 'unknown'
        const sc = STATUS_COLORS[status]
        const days = daysTo(course.examDate)

        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`flex-shrink-0 w-44 rounded-2xl p-4 border text-left transition-all ${
              active
                ? 'ring-2 ring-offset-1 ring-offset-slate-50 dark:ring-offset-slate-900'
                : 'hover:scale-[1.02]'
            } bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50`}
            style={active ? { ringColor: dot } : {}}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{course.name}</span>
            </div>
            {current !== null ? (
              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold mb-1.5"
                style={{ backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
              >
                {current.toFixed(1)}% · {letterGrade(current)}
              </div>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500 mb-1.5 block">Set up →</span>
            )}
            {days !== null && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {days > 0 ? `${days}d to exam` : days === 0 ? 'Exam today' : 'Exam passed'}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Plan tab ──────────────────────────────────────────────────────────────────
function PlanTab({ course, gradeData, dot, onSave }) {
  const saved = gradeData ?? {}
  const [rows, setRows] = useState(() =>
    saved.components?.length
      ? saved.components.map(c => ({ ...c, weight: String(c.weight), grade: c.grade !== null ? String(c.grade) : '' }))
      : [{ id: uid(), component: '', weight: '', grade: '', graded: false }]
  )
  const [targetGrade, setTargetGrade] = useState(saved.targetGrade ?? 73)
  const [showPlan, setShowPlan] = useState(!!(saved.components?.length))

  const totalWeight = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0)
  const weightOk = Math.abs(totalWeight - 100) < 0.5
  const canSave = rows.every(r => r.component.trim() && parseFloat(r.weight) > 0) && weightOk

  const addRow = () => setRows(prev => [...prev, { id: uid(), component: '', weight: '', grade: '', graded: false }])
  const removeRow = i => setRows(prev => prev.filter((_, j) => j !== i))
  const setRow = (i, field, val) => setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r))

  const handleSave = () => {
    if (!canSave) return
    const components = rows.map(r => ({
      id: r.id || uid(),
      component: r.component.trim(),
      weight: parseFloat(r.weight),
      grade: r.graded && r.grade !== '' ? parseFloat(r.grade) : null,
      graded: r.graded && r.grade !== '',
    }))
    const newData = { ...(gradeData ?? {}), components, targetGrade, scenarios: gradeData?.scenarios ?? [] }
    onSave(newData)
    setShowPlan(true)
  }

  // Plan-of-attack calculations
  const savedComps = gradeData?.components ?? []
  const neededInfo = showPlan && savedComps.length ? getNeededOnRemaining(savedComps, gradeData?.targetGrade ?? 73) : null
  const scenarioPaths = showPlan && savedComps.length ? generateScenarioPaths(savedComps, gradeData?.targetGrade ?? 73) : []
  const ungraded = savedComps.filter(c => !c.graded || c.grade === null)
  const targetLabel = TARGET_OPTIONS.find(o => o.value === (gradeData?.targetGrade ?? 73))?.label ?? 'B'

  return (
    <div className="space-y-5">
      {/* Setup form */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">Grade Components</h3>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_64px_90px_80px_36px] gap-2 mb-1 px-0.5">
          {['Component', 'Weight', 'Status', 'Grade', ''].map(h => (
            <span key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{h}</span>
          ))}
        </div>

        <div className="space-y-2.5">
          {rows.map((row, i) => (
            <div key={row.id} className="grid grid-cols-[1fr_64px_90px_80px_36px] gap-2 items-center">
              <input
                type="text" placeholder="e.g. Midterm"
                value={row.component}
                onChange={e => setRow(i, 'component', e.target.value)}
                className="min-h-[44px] w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <div className="relative">
                <input
                  type="number" placeholder="25" min="0" max="100"
                  value={row.weight}
                  onChange={e => setRow(i, 'weight', e.target.value)}
                  className="min-h-[44px] w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2.5 pr-5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">%</span>
              </div>
              <button
                onClick={() => setRow(i, 'graded', !row.graded)}
                className="min-h-[44px] rounded-xl text-xs font-semibold border transition-all px-2"
                style={row.graded
                  ? { backgroundColor: `${dot}18`, color: dot, borderColor: `${dot}40` }
                  : { backgroundColor: 'transparent', color: '#64748b', borderColor: 'rgba(148,163,184,0.3)' }}
              >
                {row.graded ? 'Graded' : 'Not yet'}
              </button>
              <input
                type="number" placeholder="-" min="0" max="100" step="0.1"
                value={row.grade}
                disabled={!row.graded}
                onChange={e => setRow(i, 'grade', e.target.value)}
                className="min-h-[44px] w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-30"
              />
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="min-h-[44px] w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button onClick={addRow} className="mt-3 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add component
        </button>

        {/* Weight total */}
        <div className={`mt-3 flex items-center gap-2 text-xs font-semibold ${weightOk ? 'text-emerald-500' : 'text-amber-400'}`}>
          <div className={`w-2 h-2 rounded-full ${weightOk ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          {totalWeight.toFixed(0)}% / 100% {!weightOk && '· weights must sum to 100%'}
        </div>

        {/* Target grade */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Target Grade</label>
          <div className="flex flex-wrap gap-2">
            {TARGET_OPTIONS.map(opt => {
              const c = TARGET_COLORS[opt.label] ?? TARGET_COLORS.B
              const active = targetGrade === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => setTargetGrade(opt.value)}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-bold border transition-all"
                  style={active
                    ? { background: c.gradient, color: '#fff', borderColor: c.color, boxShadow: `0 4px 14px ${c.color}40` }
                    : { backgroundColor: 'transparent', color: c.color, borderColor: `${c.color}55` }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="mt-4 w-full min-h-[48px] rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
          style={{ background: canSave ? `linear-gradient(135deg, ${dot}, ${dot}cc)` : '#475569' }}
        >
          Save & Generate Plan
        </button>
      </div>

      {/* Plan of Attack */}
      {showPlan && savedComps.length > 0 && (
        <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            To hit {targetLabel}, here's what you need:
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {neededInfo?.impossible
              ? 'Target is no longer mathematically achievable. Consider adjusting your target.'
              : neededInfo?.needed !== null
                ? `You need an average of ${neededInfo.needed.toFixed(1)}% on remaining work.`
                : 'All components graded. See your current grade in the Track tab.'}
          </p>

          {/* Per-component target scores */}
          {ungraded.length > 0 && neededInfo && !neededInfo.impossible && (
            <div className="space-y-2 mb-5">
              {ungraded.map(c => {
                const sc = scoreBadgeColor(neededInfo.needed)
                return (
                  <div key={c.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.component}</span>
                    <span
                      className="text-sm font-bold px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${sc}18`, color: sc }}
                    >
                      {neededInfo.impossible ? 'Impossible' : `${neededInfo.needed.toFixed(1)}%`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Buffer bar */}
          {neededInfo && !neededInfo.impossible && neededInfo.bufferPts > 0 && (
            <div className="mb-5 p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 rounded-xl">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
                You have a {neededInfo.bufferPts.toFixed(1)}-point buffer on remaining work. Spend it wisely.
              </p>
              <div className="h-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, neededInfo.bufferPts)}%` }}
                />
              </div>
            </div>
          )}

          {/* Scenario paths */}
          {scenarioPaths.length > 0 && !scenarioPaths[0].possible === false && (
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Three Paths to {targetLabel}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {scenarioPaths.filter(p => p.possible !== false).map(path => (
                  <div key={path.name} className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/40 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{path.icon}</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{path.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-2">{path.description}</p>
                    <div className="space-y-1">
                      {ungraded.map(c => {
                        const score = path.scores[c.id]
                        const sc = scoreBadgeColor(score)
                        return (
                          <div key={c.id} className="flex justify-between text-xs">
                            <span className="text-slate-500 truncate mr-2">{c.component}</span>
                            <span className="font-bold shrink-0" style={{ color: sc }}>{score?.toFixed(0) ?? '-'}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Track tab ─────────────────────────────────────────────────────────────────
function TrackTab({ course, gradeData, dot, onSave }) {
  const components = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 73
  const [defenseMode, setDefenseMode] = useState(false)

  // Local editable grades (mirrors gradeData, auto-saves)
  const [localGrades, setLocalGrades] = useState(() => {
    const m = {}
    components.forEach(c => { m[c.id] = c.grade !== null && c.grade !== undefined ? String(c.grade) : '' })
    return m
  })
  const [localGraded, setLocalGraded] = useState(() => {
    const m = {}
    components.forEach(c => { m[c.id] = c.graded ?? false })
    return m
  })

  // Debounced auto-save
  const saveTimer = useRef(null)
  const autoSave = useCallback((grades, graded) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const updated = components.map(c => ({
        ...c,
        grade: graded[c.id] && grades[c.id] !== '' ? parseFloat(grades[c.id]) : null,
        graded: graded[c.id] && grades[c.id] !== '',
      }))
      onSave({ ...gradeData, components: updated })
    }, 600)
  }, [components, gradeData, onSave])

  const setGrade = (id, val) => {
    const newGrades = { ...localGrades, [id]: val }
    setLocalGrades(newGrades)
    autoSave(newGrades, localGraded)
  }

  const toggleGraded = (id) => {
    const newGraded = { ...localGraded, [id]: !localGraded[id] }
    setLocalGraded(newGraded)
    autoSave(localGrades, newGraded)
  }

  // Derived live components
  const liveComponents = useMemo(() =>
    components.map(c => ({
      ...c,
      grade: localGraded[c.id] && localGrades[c.id] !== '' ? parseFloat(localGrades[c.id]) : null,
      graded: localGraded[c.id] && localGrades[c.id] !== '',
    })),
    [components, localGrades, localGraded]
  )

  const currentGrade = getCurrentGrade(liveComponents)
  const needed = getNeededOnRemaining(liveComponents, targetGrade)
  const defense = defenseMode ? getDefenseFloor(liveComponents, currentGrade) : null
  const gradedWeight = liveComponents.filter(c => c.graded).reduce((s, c) => s + c.weight, 0)
  const totalWeight = liveComponents.reduce((s, c) => s + c.weight, 0)
  const pctGraded = totalWeight > 0 ? gradedWeight / totalWeight : 0
  const targetLabel = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'B'
  const status = currentGrade !== null ? gradeStatus(currentGrade, targetGrade) : 'unknown'
  const sc = STATUS_COLORS[status]

  if (!components.length) {
    return (
      <div className="text-center py-10">
        <p className="text-slate-500 text-sm">Set up your grade components in the Plan tab first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current grade hero */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
        <div className="flex items-end gap-4 mb-4">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Current Grade</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black" style={{ color: sc.color }}>
                {currentGrade !== null ? currentGrade.toFixed(1) : '-'}
              </span>
              <span className="text-2xl font-bold text-slate-400">%</span>
              <span className="text-xl font-bold" style={{ color: sc.color }}>{letterGrade(currentGrade)}</span>
            </div>
          </div>
          <div
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
          >
            {status === 'on-track' ? '✓' : '⚠'} {sc.label}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>{gradedWeight.toFixed(0)}% of grade graded</span>
            <span>{(100 - gradedWeight).toFixed(0)}% remaining</span>
          </div>
          <div className="h-2.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pctGraded * 100}%`, backgroundColor: dot }}
            />
          </div>
        </div>

        {/* Grade defense toggle */}
        <button
          onClick={() => setDefenseMode(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
            defenseMode
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700/50'
              : 'text-slate-500 border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/60'
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          Grade Defense Mode {defenseMode ? 'ON' : 'OFF'}
        </button>

        {defenseMode && defense && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
              To keep your current {currentGrade?.toFixed(1)}%, score at least:
            </p>
            {defense.impossible
              ? <p className="text-xs text-red-400">Score is already locked in. No remaining work can change it.</p>
              : <p className="text-2xl font-black text-amber-500">{defense.floor?.toFixed(1)}% on all remaining work</p>
            }
          </div>
        )}
      </div>

      {/* Component table */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/50">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Grade Breakdown</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/40">
          {liveComponents.map(c => {
            const contribution = c.graded && c.grade !== null ? (c.grade * c.weight / (totalWeight || 100)) : null
            const neededScore = defenseMode
              ? (defense?.floor ?? null)
              : (!c.graded && needed.needed !== null ? needed.needed : null)

            return (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{c.component}</p>
                  <p className="text-xs text-slate-400">{c.weight}% weight
                    {contribution !== null && ` · contributes ${contribution.toFixed(1)}% to final`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Graded toggle */}
                  <button
                    onClick={() => toggleGraded(c.id)}
                    className="text-xs px-2.5 py-1.5 min-h-[36px] rounded-lg font-medium border transition-all"
                    style={localGraded[c.id]
                      ? { backgroundColor: `${dot}15`, color: dot, borderColor: `${dot}40` }
                      : { color: '#94a3b8', borderColor: 'rgba(148,163,184,0.3)' }}
                  >
                    {localGraded[c.id] ? 'Graded' : 'Pending'}
                  </button>
                  {/* Grade input */}
                  <div className="relative w-20">
                    <input
                      type="number"
                      placeholder={neededScore !== null ? `${neededScore.toFixed(0)}` : '-'}
                      value={localGrades[c.id]}
                      min="0" max="100" step="0.1"
                      onChange={e => setGrade(c.id, e.target.value)}
                      className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-sm text-center font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      style={c.graded ? { borderColor: `${dot}50` } : {}}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* What you need on remaining */}
      {needed.needed !== null && !defenseMode && (
        <div className={`rounded-2xl p-4 border ${needed.impossible
          ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40'
          : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/40'}`}
        >
          {needed.impossible ? (
            <>
              <p className="text-sm font-bold text-red-500 mb-1 flex items-center gap-1.5"><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> Target grade no longer achievable</p>
              <p className="text-xs text-red-400">You would need more than 100% on remaining work. Consider adjusting your target in the Plan tab.</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">What You Need on Remaining Work</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black" style={{ color: scoreBadgeColor(needed.needed) }}>
                  {needed.needed.toFixed(1)}%
                </span>
                <span className="text-sm text-slate-500">avg to hit {targetLabel}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sandbox tab ───────────────────────────────────────────────────────────────
function SandboxTab({ course, gradeData, dot, onSave }) {
  const components = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 73
  const scenarios = gradeData?.scenarios ?? []
  const [showCompare, setShowCompare] = useState(false)
  const [editingScenarioName, setEditingScenarioName] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [saveNameInput, setSaveNameInput] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  // Initialize overrides from actuals or needed score
  const initOverrides = useCallback(() => {
    const { needed } = getNeededOnRemaining(components, targetGrade)
    const m = {}
    components.forEach(c => {
      m[c.id] = c.graded && c.grade !== null ? c.grade : Math.round(needed ?? 75)
    })
    return m
  }, [components, targetGrade])

  const [overrides, setOverrides] = useState(initOverrides)

  const projected = getProjectedGrade(components.map(c => ({ ...c, graded: false })), overrides)
  const targetLabel = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'B'
  const gap = projected !== null ? projected - targetGrade : null
  const status = projected !== null ? gradeStatus(projected, targetGrade) : 'unknown'
  const sc = STATUS_COLORS[status]

  const setSlider = (id, val) => setOverrides(prev => ({ ...prev, [id]: parseFloat(val) }))

  const handleReset = () => setOverrides(initOverrides())

  const handleSaveScenario = () => {
    if (!saveNameInput.trim()) return
    const name = saveNameInput.trim()
    const scenarioOverrides = {}
    components.forEach(c => { scenarioOverrides[c.id] = overrides[c.id] })
    const newScenarios = [...scenarios.filter(s => s.name !== name).slice(0, 2), { name, overrides: scenarioOverrides }]
    onSave({ ...gradeData, scenarios: newScenarios })
    setSaveNameInput('')
    setShowSaveInput(false)
  }

  const deleteScenario = (name) => {
    onSave({ ...gradeData, scenarios: scenarios.filter(s => s.name !== name) })
  }

  const renameScenario = (oldName, newName) => {
    if (!newName.trim()) return
    onSave({ ...gradeData, scenarios: scenarios.map(s => s.name === oldName ? { ...s, name: newName.trim() } : s) })
    setEditingScenarioName(null)
  }

  if (!components.length) {
    return (
      <div className="text-center py-10">
        <p className="text-slate-500 text-sm">Set up your grade components in the Plan tab first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Projected grade hero */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Projected Grade</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black transition-all duration-200" style={{ color: sc.color }}>
                {projected !== null ? projected.toFixed(1) : '-'}
              </span>
              <span className="text-2xl font-bold text-slate-400">%</span>
              <span className="text-2xl font-bold" style={{ color: sc.color }}>{letterGrade(projected)}</span>
            </div>
          </div>
          {gap !== null && (
            <div
              className="text-sm font-bold px-3 py-1.5 rounded-full"
              style={{ backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
            >
              {gap >= 0 ? `+${gap.toFixed(1)}%` : `${gap.toFixed(1)}%`} vs target {targetLabel}
            </div>
          )}
        </div>

        {/* Sliders */}
        <div className="space-y-4">
          {components.map(c => {
            const val = overrides[c.id] ?? 0
            const color = val >= 90 ? '#10b981' : val >= 70 ? '#f59e0b' : '#ef4444'
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {c.component}
                    {c.graded && <span className="ml-1.5 text-[10px] text-slate-400">(actual)</span>}
                  </span>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={Math.round(val)}
                    onChange={e => setSlider(c.id, clamp(parseFloat(e.target.value) || 0))}
                    className="w-16 min-h-[36px] text-center text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    style={{ color }}
                    disabled={c.graded}
                  />
                </div>
                <input
                  type="range" min="0" max="100" step="1"
                  value={Math.round(val)}
                  onChange={e => setSlider(c.id, parseFloat(e.target.value))}
                  disabled={c.graded}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-50"
                  style={{
                    background: c.graded
                      ? `${dot}40`
                      : `linear-gradient(to right, ${color} 0%, ${color} ${val}%, #e2e8f0 ${val}%, #e2e8f0 100%)`,
                    touchAction: 'manipulation',
                  }}
                />
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleReset}
            className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            Reset to Actuals
          </button>
          {scenarios.length < 3 && !showSaveInput && (
            <button
              onClick={() => setShowSaveInput(true)}
              className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors text-white"
              style={{ background: `linear-gradient(135deg, ${dot}, ${dot}cc)` }}
            >
              Save Scenario
            </button>
          )}
        </div>

        {showSaveInput && (
          <div className="flex gap-2 mt-2">
            <input
              type="text" placeholder="Scenario name..." value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveScenario()}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              autoFocus
            />
            <button onClick={handleSaveScenario} className="min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Save</button>
            <button onClick={() => setShowSaveInput(false)} className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500">✕</button>
          </div>
        )}
      </div>

      {/* Saved scenarios */}
      {scenarios.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Saved Scenarios</p>
            {scenarios.length >= 2 && (
              <button
                onClick={() => setShowCompare(v => !v)}
                className="text-xs font-semibold text-indigo-500 hover:text-indigo-400 transition-colors"
              >
                {showCompare ? 'Hide compare' : 'Compare →'}
              </button>
            )}
          </div>

          {!showCompare ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {scenarios.map(scenario => {
                const proj = getProjectedGrade(components.map(c => ({ ...c, graded: false })), scenario.overrides)
                const sc2 = STATUS_COLORS[gradeStatus(proj, targetGrade)]
                return (
                  <div key={scenario.name} className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      {editingScenarioName === scenario.name ? (
                        <input
                          autoFocus
                          value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          onBlur={() => renameScenario(scenario.name, nameInput)}
                          onKeyDown={e => e.key === 'Enter' && renameScenario(scenario.name, nameInput)}
                          className="flex-1 mr-2 bg-transparent border-b border-indigo-400 text-sm font-bold text-slate-800 dark:text-slate-200 outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingScenarioName(scenario.name); setNameInput(scenario.name) }}
                          className="text-sm font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-500 transition-colors text-left"
                        >
                          {scenario.name}
                        </button>
                      )}
                      <button onClick={() => deleteScenario(scenario.name)} className="text-slate-300 dark:text-slate-600 hover:text-red-400 transition-colors text-xs ml-2 shrink-0">✕</button>
                    </div>
                    <div className="text-2xl font-black mb-1" style={{ color: sc2.color }}>{proj?.toFixed(1)}%</div>
                    <div className="text-xs font-semibold" style={{ color: sc2.color }}>{letterGrade(proj)} · {sc2.label}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Compare table */
            <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700/50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Component</th>
                      {scenarios.map(s => (
                        <th key={s.name} className="text-center px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {components.map(c => {
                      const scores = scenarios.map(s => s.overrides[c.id] ?? 0)
                      const max = Math.max(...scores)
                      const min = Math.min(...scores)
                      return (
                        <tr key={c.id} className="border-b border-slate-50 dark:border-slate-800/50">
                          <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{c.component}</td>
                          {scenarios.map((s, si) => {
                            const score = s.overrides[c.id]
                            const isMax = score === max && max !== min
                            const isMin = score === min && max !== min
                            return (
                              <td key={s.name} className="px-4 py-2.5 text-center font-bold"
                                style={{ color: isMax ? '#10b981' : isMin ? '#ef4444' : '#64748b' }}
                              >
                                {score?.toFixed(0) ?? '-'}%
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {/* Final projected row */}
                    <tr className="bg-slate-50 dark:bg-slate-900/40">
                      <td className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Projected</td>
                      {scenarios.map(s => {
                        const proj = getProjectedGrade(components.map(c => ({ ...c, graded: false })), s.overrides)
                        return (
                          <td key={s.name} className="px-4 py-3 text-center text-base font-black" style={{ color: dot }}>
                            {proj?.toFixed(1)}% {letterGrade(proj)}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Connection section ────────────────────────────────────────────────────────
function ConnectionSection({ course, gradeData, dot, onShowPaywall, userId }) {
  const [toast, setToast] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPrediction, setAiPrediction] = useState(null)

  const components = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 73
  const currentGrade = getCurrentGrade(components)
  const gap = currentGrade !== null ? currentGrade - targetGrade : null
  const below5 = gap !== null && gap < -2

  const weakComponents = components
    .filter(c => c.graded && c.grade !== null && c.grade < 70)
    .map(c => c.component)

  const handleUpdateStudyPlan = async () => {
    if (!course) return
    const courseId = course.id ?? 0
    const struggles = [
      gap !== null ? `Projected to ${gap >= 0 ? 'meet' : 'miss'} target by ${Math.abs(gap).toFixed(1)}%` : null,
      weakComponents.length ? `Weak components: ${weakComponents.join(', ')}` : null,
    ].filter(Boolean)
    try {
      await saveCoachPlanStruggles(courseId, struggles)
      setToast('Study plan updated with your grade data.')
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleRunPredictor = async () => {
    if (!components.length) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setAiLoading(true)
    setAiPrediction(null)
    try {
      const token = await getAccessToken()
      const targetLabel = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'B'
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'predict-grade',
          courseName: course.name,
          targetGrade: targetLabel,
          components: components.map(c => ({
            name: c.component,
            weight: c.weight,
            type: 'Assignment',
            earnedGrade: c.graded ? c.grade : null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAiPrediction(data.prediction)
      await incrementAIQuery()
    } catch (e) {
      console.error(e)
    } finally {
      setAiLoading(false)
    }
  }

  if (!gradeData?.components?.length) return null

  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5 space-y-4">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Connect to Study Plan</p>

      {below5 && gap !== null && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-xl">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">
            You're {Math.abs(gap).toFixed(1)}% below your target. Update your study plan to close the gap?
          </p>
          <button
            onClick={handleUpdateStudyPlan}
            className="text-xs font-bold px-3 py-2 min-h-[36px] rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors"
          >
            Update Study Plan
          </button>
        </div>
      )}

      {toast && (
        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <span>✓</span> {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleRunPredictor}
          disabled={aiLoading}
          className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {aiLoading ? (
            <><div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-indigo-500 animate-spin" /> Running AI analysis...</>
          ) : (
            <><svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg> Run AI Grade Prediction</>
          )}
        </button>
      </div>

      {aiPrediction && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">AI Prediction</p>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-black text-indigo-600 dark:text-indigo-300">{aiPrediction.predictedGrade?.toFixed(1)}%</span>
            <span className="text-lg font-bold text-indigo-500">{aiPrediction.letterGrade}</span>
          </div>
          {aiPrediction.recommendations?.length > 0 && (
            <ul className="space-y-1">
              {aiPrediction.recommendations.map((r, i) => (
                <li key={i} className="text-xs text-indigo-700 dark:text-indigo-300 flex gap-1.5">
                  <span className="text-emerald-500 shrink-0">→</span> {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GradeHubView({ courses, onEditCourse, userId, onShowPaywall, initialCourseIdx = 0 }) {
  const plan = getActivePlan()
  const hubRef = useRef(null)

  const [activeCourseIdx, setActiveCourseIdx] = useState(() =>
    Math.max(0, Math.min(initialCourseIdx, courses.length - 1))
  )
  const [activeTab, setActiveTab] = useState('plan')

  // When initialCourseIdx changes (from dashboard), update active course
  useEffect(() => {
    const idx = Math.max(0, Math.min(initialCourseIdx, courses.length - 1))
    setActiveCourseIdx(idx)
  }, [initialCourseIdx])

  if (plan === 'free') return <LockedState onShowPaywall={onShowPaywall} />

  if (!courses.length) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-slate-500 text-sm">Add courses to use the Grade Hub.</p>
      </div>
    )
  }

  const course = courses[activeCourseIdx]
  const dot = course?.color?.dot ?? '#6366f1'
  const gradeData = course?.gradeData ?? null

  const handleSelectCourse = (idx) => {
    setActiveCourseIdx(idx)
    setActiveTab('plan')
    setTimeout(() => hubRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleSaveGradeData = useCallback((newData) => {
    onEditCourse(activeCourseIdx, { ...course, gradeData: newData })
  }, [activeCourseIdx, course, onEditCourse])

  const TABS = [
    { id: 'plan',    label: 'Plan',    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
    { id: 'track',   label: 'Track',   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
    { id: 'sandbox', label: 'Sandbox', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg> },
  ]

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Grade Hub</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Plan, track, and model every scenario for your final grade.</p>
      </div>

      {/* Course strip */}
      <CourseStrip courses={courses} activeCourseIdx={activeCourseIdx} onSelect={handleSelectCourse} />

      {/* Hub for active course */}
      <div ref={hubRef}>
        {/* Course label */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">{course?.name}</h2>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 mb-5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-5">
          {activeTab === 'plan' && (
            <PlanTab course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />
          )}
          {activeTab === 'track' && (
            <TrackTab course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />
          )}
          {activeTab === 'sandbox' && (
            <SandboxTab course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />
          )}

          <ConnectionSection
            course={course}
            gradeData={gradeData}
            dot={dot}
            onShowPaywall={onShowPaywall}
            userId={userId}
          />
        </div>
      </div>
    </div>
  )
}
