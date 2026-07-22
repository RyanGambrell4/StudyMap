import { useState } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { clean } from '../utils/strings'
import { canUseAI, incrementAIQuery } from '../lib/subscription'
import { track } from '../lib/analytics'

const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const BORDER = 'rgba(0,0,0,0.08)'
const BG = '#F7F6F3'

const COMPONENT_TYPES = ['Exam', 'Quiz', 'Homework', 'Project', 'Lab', 'Participation', 'Other']
const TARGET_GRADES = ['A', 'B', 'C', 'Pass/Fail']

const STATUS_CONFIG = {
  'on-track':       { label: 'On Track',      color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)'  },
  'at-risk':        { label: 'At Risk',        color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  'needs-recovery': { label: 'Needs Recovery', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
}

const fieldStyle = {
  width: '100%', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: 8, padding: '8px 10px', fontSize: 13, color: TEXT,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

function emptyComponent() {
  return { name: '', weight: '', type: 'Exam', earnedGrade: '' }
}

export default function GradePredictorView({ courses, onEditCourse, userId, onShowPaywall, initialCourseIdx = 0 }) {
  const [courseIdx, setCourseIdx] = useState(Math.min(initialCourseIdx, Math.max(0, courses.length - 1)))
  const course = courses[courseIdx] ?? null
  const dot = course?.color?.dot ?? '#3B61C4'
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

  const handleCourseChange = (idx) => {
    setCourseIdx(idx)
    const c = courses[idx]
    const g = c?.gradeData ?? null
    setComponents(g?.components?.length ? g.components.map(c => ({ ...c, earnedGrade: c.earnedGrade ?? '' })) : [emptyComponent()])
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
      track('grade_predicted', { predictedGrade: pred?.predictedGrade ?? null })
      await incrementAIQuery()
      const gradeData = {
        components: components.map(c => ({ name: c.name.trim(), weight: parseFloat(c.weight) || 0, type: c.type, earnedGrade: c.earnedGrade !== '' && c.earnedGrade !== null ? parseFloat(c.earnedGrade) : null })),
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

  if (!course) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: DIM }}>Add courses to use the Grade Predictor.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: 672, margin: '0 auto', animation: 'gp-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{`
        @keyframes gp-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .gp-course-btn { transition: border-color 0.12s, background 0.12s, transform 0.1s !important; }
        .gp-course-btn:active { transform: scale(0.96) !important; }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.4px' }}>Grade Predictor</h1>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Enter your grades to predict your final score and get targeted recommendations.</p>
      </div>

      {/* Course selector */}
      {courses.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {courses.map((c, i) => {
            const cdot = c.color?.dot ?? '#3B61C4'
            const active = courseIdx === i
            return (
              <button
                key={i}
                onClick={() => handleCourseChange(i)}
                className="gp-course-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10,
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  background: active ? `${cdot}18` : 'transparent',
                  color: active ? cdot : MUTED,
                  border: `1px solid ${active ? `${cdot}50` : BORDER}`,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: cdot }} />
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {view === 'form' ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px' }}>
          {/* Target Grade */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Target Grade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TARGET_GRADES.map(g => (
                <button
                  key={g}
                  onClick={() => setTargetGrade(g)}
                  style={{
                    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: targetGrade === g ? `${dot}18` : 'transparent',
                    color: targetGrade === g ? dot : MUTED,
                    border: `1px solid ${targetGrade === g ? `${dot}50` : BORDER}`,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Components */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Grade Components</label>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: Math.abs(totalWeight - 100) < 0.1 ? '#10b981' : '#f59e0b' }}>
                {totalWeight.toFixed(0)}% / 100%
              </span>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 80px 28px', gap: 8, marginBottom: 4, padding: '0 2px' }}>
              {['Component', 'Weight', 'Type', 'Grade %', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {components.map((comp, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 80px 28px', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="e.g. Midterm"
                    value={comp.name}
                    onChange={e => updateComponent(i, 'name', e.target.value)}
                    style={fieldStyle}
                    onFocus={e => e.target.style.borderColor = dot}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.10)'}
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      placeholder="25"
                      value={comp.weight}
                      min="0" max="100" step="1"
                      onChange={e => updateComponent(i, 'weight', e.target.value)}
                      style={{ ...fieldStyle, paddingRight: 18 }}
                      onFocus={e => e.target.style.borderColor = dot}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.10)'}
                    />
                    <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: DIM, pointerEvents: 'none' }}>%</span>
                  </div>
                  <select
                    value={comp.type}
                    onChange={e => updateComponent(i, 'type', e.target.value)}
                    style={{ ...fieldStyle, colorScheme: 'light' }}
                    onFocus={e => e.target.style.borderColor = dot}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.10)'}
                  >
                    {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="-"
                    value={comp.earnedGrade}
                    min="0" max="100" step="0.1"
                    onChange={e => updateComponent(i, 'earnedGrade', e.target.value)}
                    style={fieldStyle}
                    onFocus={e => e.target.style.borderColor = dot}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.10)'}
                  />
                  <button
                    onClick={() => removeComponent(i)}
                    disabled={components.length === 1}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 8, background: 'none', border: 'none', cursor: components.length === 1 ? 'not-allowed' : 'pointer',
                      color: DIM, opacity: components.length === 1 ? 0.3 : 1,
                    }}
                    onMouseEnter={e => { if (components.length > 1) e.currentTarget.style.color = '#EF4444' }}
                    onMouseLeave={e => e.currentTarget.style.color = DIM}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addComponent}
              style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit' }}
              onMouseEnter={e => e.currentTarget.style.color = dot}
              onMouseLeave={e => e.currentTarget.style.color = MUTED}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v16m8-8H4" />
              </svg>
              Add component
            </button>
          </div>

          {error && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{error}</p>}
          {!isValid && totalWeight > 0 && Math.abs(totalWeight - 100) >= 0.1 && (
            <p style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12 }}>Weights must sum to 100% before predicting.</p>
          )}

          <button
            onClick={handlePredict}
            disabled={!isValid || loading}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              color: '#fff', border: 'none', fontFamily: 'inherit', opacity: !isValid || loading ? 0.5 : 1,
              background: isValid && !loading ? `linear-gradient(135deg, ${dot}, ${dot}cc)` : '#9B9B9B',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <><Spinner size="xs" color="#fff" track="rgba(255,255,255,0.3)" /> Predicting...</>
            ) : 'Predict My Grade'}
          </button>
        </div>
      ) : (
        prediction && <ResultsCard prediction={prediction} course={course} dot={dot} targetGrade={targetGrade} onEdit={() => setView('form')} />
      )}
    </div>
  )
}

function ResultsCard({ prediction, course, dot, targetGrade, onEdit }) {
  const status = STATUS_CONFIG[prediction.status] ?? STATUS_CONFIG['at-risk']
  const gap = prediction.gapToTarget ?? 0
  const gapAbs = Math.abs(gap).toFixed(1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'gp-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{`@keyframes gp-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: `${dot}18`, border: `2px solid ${dot}50`,
            boxShadow: `0 4px 16px ${dot}25`,
          }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: dot, lineHeight: 1 }}>{prediction.letterGrade}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B' }}>{prediction.predictedGrade?.toFixed(0)}%</span>
          </div>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: TEXT }}>{clean(course.name)}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
              {status.label}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9B9B9B' }}>
              {gap >= 0 ? `${gapAbs} pts above target grade ${targetGrade}` : `${gapAbs} pts below target grade ${targetGrade}`}
            </p>
          </div>
        </div>

        {/* Metric grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#F7F6F3', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Predicted Final</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>{prediction.predictedGrade?.toFixed(1)}%</p>
          </div>
          <div style={{ background: '#F7F6F3', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Needed on Remaining</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: (prediction.gradeNeededOnRemaining ?? 0) > 100 ? '#EF4444' : TEXT }}>
              {prediction.gradeNeededOnRemaining !== null && prediction.gradeNeededOnRemaining !== undefined
                ? prediction.gradeNeededOnRemaining > 100 ? '100%+' : `${prediction.gradeNeededOnRemaining.toFixed(1)}%`
                : '-'}
            </p>
          </div>
        </div>

        {/* Key factors */}
        {prediction.keyFactors?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Key Factors</p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prediction.keyFactors.map((f, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#6B6B6B' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, marginTop: 6, flexShrink: 0 }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {prediction.recommendations?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recommendations</p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prediction.recommendations.map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#6B6B6B' }}>
                  <svg width="14" height="14" fill="none" stroke="#10b981" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {prediction.weakAreas?.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Areas Needing Attention</p>
            <p style={{ margin: 0, fontSize: 13, color: '#92400E' }}>{prediction.weakAreas.join(', ')}</p>
          </div>
        )}

        <button
          onClick={onEdit}
          style={{ width: '100%', padding: '11px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'none', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}
          onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          Update Grades
        </button>
      </div>
    </div>
  )
}
