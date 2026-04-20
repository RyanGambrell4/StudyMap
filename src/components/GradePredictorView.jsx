import { useState } from 'react'
import { getAccessToken } from '../lib/supabase'
import { clean } from '../utils/strings'
import { canUseAI, incrementAIQuery } from '../lib/subscription'

const COMPONENT_TYPES = ['Exam', 'Quiz', 'Homework', 'Project', 'Lab', 'Participation', 'Other']
const TARGET_GRADES = ['A', 'B', 'C', 'Pass/Fail']

const STATUS_CONFIG = {
  'on-track':        { label: 'On Track',        color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)'  },
  'at-risk':         { label: 'At Risk',          color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  'needs-recovery':  { label: 'Needs Recovery',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
}

function emptyComponent() {
  return { name: '', weight: '', type: 'Exam', earnedGrade: '' }
}

export default function GradePredictorView({ courses, onEditCourse, userId, onShowPaywall, initialCourseIdx = 0 }) {
  const [courseIdx, setCourseIdx] = useState(Math.min(initialCourseIdx, Math.max(0, courses.length - 1)))
  const course = courses[courseIdx] ?? null
  const dot = course?.color?.dot ?? '#6366f1'

  // Per-course form state derived from saved gradeData
  const saved = course?.gradeData ?? null

  const [components, setComponents] = useState(() => {
    if (saved?.components?.length) return saved.components.map(c => ({ ...c, earnedGrade: c.earnedGrade ?? '' }))
    return [emptyComponent()]
  })
  const [targetGrade, setTargetGrade] = useState(saved?.targetGrade ?? course?.targetGrade ?? 'B')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [prediction, setPrediction] = useState(saved?.lastPrediction ?? null)
  const [view, setView] = useState(saved?.lastPrediction ? 'results' : 'form')

  // Reset when course changes
  const handleCourseChange = (idx) => {
    setCourseIdx(idx)
    const c = courses[idx]
    const g = c?.gradeData ?? null
    if (g?.components?.length) {
      setComponents(g.components.map(c => ({ ...c, earnedGrade: c.earnedGrade ?? '' })))
    } else {
      setComponents([emptyComponent()])
    }
    setTargetGrade(g?.targetGrade ?? c?.targetGrade ?? 'B')
    setPrediction(g?.lastPrediction ?? null)
    setView(g?.lastPrediction ? 'results' : 'form')
    setError('')
  }

  const addComponent = () => setComponents(prev => [...prev, emptyComponent()])
  const removeComponent = (i) => setComponents(prev => prev.filter((_, j) => j !== i))
  const updateComponent = (i, field, val) => setComponents(prev => prev.map((c, j) => j === i ? { ...c, [field]: val } : c))

  const totalWeight = components.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0)
  const isValid = components.length > 0 && components.every(c => c.name.trim() && parseFloat(c.weight) > 0) && Math.abs(totalWeight - 100) < 0.1

  const handlePredict = async () => {
    if (!isValid || !course) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }

    setLoading(true)
    setError('')
    try {
      const token = await getAccessToken()
      const payload = {
        mode: 'predict-grade',
        courseName: course.name,
        targetGrade,
        components: components.map(c => ({
          name: c.name.trim(),
          weight: parseFloat(c.weight) || 0,
          type: c.type,
          earnedGrade: c.earnedGrade !== '' && c.earnedGrade !== null ? parseFloat(c.earnedGrade) : null,
        })),
      }
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to predict grade')
      const pred = data.prediction
      setPrediction(pred)
      setView('results')
      await incrementAIQuery()

      // Persist to course
      const gradeData = {
        components: components.map(c => ({
          name: c.name.trim(),
          weight: parseFloat(c.weight) || 0,
          type: c.type,
          earnedGrade: c.earnedGrade !== '' && c.earnedGrade !== null ? parseFloat(c.earnedGrade) : null,
        })),
        targetGrade,
        lastPrediction: pred,
      }
      onEditCourse(courseIdx, { ...course, gradeData })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditGrades = () => setView('form')

  if (!course) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-slate-500 text-sm">Add courses to use the Grade Predictor.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Grade Predictor</h1>
        <p className="text-slate-500 text-sm">Enter your grades to predict your final score and get targeted recommendations.</p>
      </div>

      {/* Course selector */}
      {courses.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {courses.map((c, i) => {
            const cdot = c.color?.dot ?? '#6366f1'
            const active = courseIdx === i
            return (
              <button
                key={i}
                onClick={() => handleCourseChange(i)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all border"
                style={active
                  ? { backgroundColor: `${cdot}20`, color: cdot, borderColor: `${cdot}50` }
                  : { backgroundColor: 'transparent', color: '#64748b', borderColor: 'rgba(148,163,184,0.3)' }
                }
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cdot }} />
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {view === 'form' ? (
        <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
          {/* Target Grade */}
          <div className="mb-5">
            <label className="block text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold mb-2">Target Grade</label>
            <div className="flex gap-2">
              {TARGET_GRADES.map(g => (
                <button
                  key={g}
                  onClick={() => setTargetGrade(g)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                  style={targetGrade === g
                    ? { backgroundColor: `${dot}20`, color: dot, borderColor: `${dot}50` }
                    : { backgroundColor: 'transparent', color: '#64748b', borderColor: 'rgba(148,163,184,0.3)' }
                  }
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Components */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Grade Components</label>
              <span className={`text-xs font-semibold ${Math.abs(totalWeight - 100) < 0.1 ? 'text-emerald-500' : 'text-amber-400'}`}>
                {totalWeight.toFixed(0)}% / 100%
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_90px_80px_28px] gap-2 mb-1 px-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Component</span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Weight</span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Type</span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Grade %</span>
              <span />
            </div>

            <div className="space-y-2">
              {components.map((comp, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_90px_80px_28px] gap-2 items-center">
                  <input
                    type="text"
                    placeholder="e.g. Midterm"
                    value={comp.name}
                    onChange={e => updateComponent(i, 'name', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="25"
                      value={comp.weight}
                      min="0" max="100" step="1"
                      onChange={e => updateComponent(i, 'weight', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 pr-5"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">%</span>
                  </div>
                  <select
                    value={comp.type}
                    onChange={e => updateComponent(i, 'type', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  >
                    {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="-"
                    value={comp.earnedGrade}
                    min="0" max="100" step="0.1"
                    onChange={e => updateComponent(i, 'earnedGrade', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                  <button
                    onClick={() => removeComponent(i)}
                    disabled={components.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addComponent}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add component
            </button>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          {!isValid && totalWeight > 0 && Math.abs(totalWeight - 100) >= 0.1 && (
            <p className="text-amber-400 text-xs mb-3">Weights must sum to 100% before predicting.</p>
          )}

          <button
            onClick={handlePredict}
            disabled={!isValid || loading}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white"
            style={{ background: isValid && !loading ? `linear-gradient(135deg, ${dot}, ${dot}cc)` : undefined, backgroundColor: !isValid || loading ? '#475569' : undefined }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Predicting...
              </span>
            ) : 'Predict My Grade'}
          </button>
        </div>
      ) : (
        prediction && <ResultsCard prediction={prediction} course={course} dot={dot} targetGrade={targetGrade} onEdit={handleEditGrades} />
      )}
    </div>
  )
}

function ResultsCard({ prediction, course, dot, targetGrade, onEdit }) {
  const status = STATUS_CONFIG[prediction.status] ?? STATUS_CONFIG['at-risk']
  const gap = prediction.gapToTarget ?? 0
  const gapAbs = Math.abs(gap).toFixed(1)

  return (
    <div className="space-y-4">
      {/* Main prediction card */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-5">
        <div className="flex items-center gap-4 mb-5">
          {/* Grade circle */}
          <div
            className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-lg"
            style={{ backgroundColor: `${dot}20`, border: `2px solid ${dot}50` }}
          >
            <span className="text-3xl font-black" style={{ color: dot }}>{prediction.letterGrade}</span>
            <span className="text-xs font-semibold text-slate-500">{prediction.predictedGrade?.toFixed(0)}%</span>
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-white mb-1">{clean(course.name)}</p>
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: status.bg, color: status.color, border: `1px solid ${status.border}` }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />
              {status.label}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              {gap >= 0
                ? `${gapAbs} points above target grade ${targetGrade}`
                : `${gapAbs} points below target grade ${targetGrade}`
              }
            </p>
          </div>
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Predicted Final</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{prediction.predictedGrade?.toFixed(1)}%</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Needed on Remaining</p>
            <p className={`text-lg font-bold ${(prediction.gradeNeededOnRemaining ?? 0) > 100 ? 'text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {prediction.gradeNeededOnRemaining !== null && prediction.gradeNeededOnRemaining !== undefined
                ? prediction.gradeNeededOnRemaining > 100 ? '100%+' : `${prediction.gradeNeededOnRemaining.toFixed(1)}%`
                : '-'
              }
            </p>
          </div>
        </div>

        {/* Key factors */}
        {prediction.keyFactors?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Key Factors</p>
            <ul className="space-y-1.5">
              {prediction.keyFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dot }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {prediction.recommendations?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Recommendations</p>
            <ul className="space-y-1.5">
              {prediction.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {prediction.weakAreas?.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2.5 mb-4">
            <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest mb-1">Areas Needing Attention</p>
            <p className="text-sm text-amber-700 dark:text-amber-300">{prediction.weakAreas.join(', ')}</p>
          </div>
        )}

        <button
          onClick={onEdit}
          className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          Update Grades
        </button>
      </div>
    </div>
  )
}
