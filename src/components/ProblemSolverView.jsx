import { useState, useRef } from 'react'
import { canUseAI, incrementAIQuery } from '../lib/subscription.js'
import { getAccessToken } from '../lib/supabase.js'
import { track } from '../lib/analytics'

const STORAGE_KEY = 'studyedge_problems'

function loadProblems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveProblems(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
}

const SUBJECTS = ['Auto-detect', 'Math', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Economics', 'Statistics']


function compressImageToBase64(file, maxDim = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve(dataUrl.split(',')[1])
    }
    img.onerror = reject
    img.src = url
  })
}

function SubjectBadge({ subject }) {
  const colors = {
    Math: '#3B61C4', Physics: '#3B61C4', Chemistry: '#059669',
    Biology: '#DC2626', 'Computer Science': '#D97706', Economics: '#0891B2',
    Statistics: '#BE185D'
  }
  const color = colors[subject] || '#6B6B6B'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      backgroundColor: color + '15', color, fontSize: 11, fontWeight: 600
    }}>
      {subject}
    </span>
  )
}

function StepCard({ step }) {
  return (
    <div style={{
      border: '1px solid rgba(0,0,0,0.07)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 12
    }}>
      <div style={{
        background: '#3B61C4', color: '#fff', padding: '8px 16px',
        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0
        }}>
          {step.number}
        </span>
        {step.action}
      </div>
      <div style={{ padding: '12px 16px', background: '#fff' }}>
        <div style={{
          fontFamily: 'monospace', fontSize: 14, color: '#111', lineHeight: 1.6,
          background: '#F7F6F3', borderRadius: 6, padding: '10px 14px', marginBottom: step.note ? 10 : 0
        }}>
          {step.work}
        </div>
        {step.note && (
          <div style={{
            fontSize: 12, color: '#6B6B6B', padding: '6px 10px',
            borderLeft: '3px solid #3B61C4', marginTop: 8, background: '#3B61C415', borderRadius: '0 4px 4px 0'
          }}>
            {step.note}
          </div>
        )}
      </div>
    </div>
  )
}

const DIFFICULTY_COLORS = { Easy: '#059669', Medium: '#D97706', Hard: '#DC2626' }

function SolutionView({ solution, onBack }) {
  const [revealMode, setRevealMode] = useState(false)
  const [revealedCount, setRevealedCount] = useState(0)
  const [copyState, setCopyState] = useState('idle') // idle | copied | error
  const allRevealed = !revealMode || revealedCount >= (solution.steps?.length || 0)

  const copyAll = () => {
    const text = [
      `Subject: ${solution.subject}`,
      `Problem: ${solution.restatedProblem}`,
      `Approach: ${solution.approach}`,
      '',
      'Steps:',
      ...solution.steps.map(s => `${s.number}. ${s.action}\n   ${s.work}${s.note ? '\n   Note: ' + s.note : ''}`),
      '',
      `Final Answer: ${solution.finalAnswer}`,
      solution.keyFormulas?.length ? `\nKey Formulas:\n${solution.keyFormulas.join('\n')}` : '',
      solution.commonMistake ? `\nCommon Mistake: ${solution.commonMistake}` : ''
    ].join('\n')
    navigator.clipboard.writeText(text)
      .then(() => { setCopyState('copied'); setTimeout(() => setCopyState('idle'), 2000) })
      .catch(() => { setCopyState('error'); setTimeout(() => setCopyState('idle'), 3000) })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#6B6B6B'
        }}>
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111', flex: 1 }}>Solution</h2>
        <button onClick={copyAll} style={{
          background: copyState === 'copied' ? '#059669' : copyState === 'error' ? 'rgba(220,38,38,0.08)' : 'none',
          border: copyState === 'idle' ? '1px solid rgba(0,0,0,0.12)' : copyState === 'error' ? '1px solid rgba(220,38,38,0.25)' : 'none',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
          color: copyState === 'copied' ? '#fff' : copyState === 'error' ? '#DC2626' : '#3B61C4', fontWeight: 600, transition: 'all 0.2s'
        }}>
          {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <SubjectBadge subject={solution.subject} />
        {solution.difficulty && (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: (DIFFICULTY_COLORS[solution.difficulty] || '#6B6B6B') + '15',
            color: DIFFICULTY_COLORS[solution.difficulty] || '#6B6B6B'
          }}>
            {solution.difficulty}
          </span>
        )}
      </div>

      <div style={{
        background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 16, marginBottom: 16
      }}>
        <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Problem</div>
        <div style={{ fontSize: 14, color: '#111', lineHeight: 1.5 }}>{solution.restatedProblem}</div>
      </div>

      <div style={{
        background: '#3B61C408', border: '1px solid #3B61C420', borderRadius: 12, padding: 16, marginBottom: 20
      }}>
        <div style={{ fontSize: 12, color: '#3B61C4', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Approach</div>
        <div style={{ fontSize: 14, color: '#111', lineHeight: 1.5 }}>{solution.approach}</div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Step-by-Step Solution</div>
          <button
            onClick={() => { setRevealMode(r => !r); setRevealedCount(0) }}
            style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid rgba(0,0,0,0.12)', background: revealMode ? '#3B61C4' : '#fff',
              color: revealMode ? '#fff' : '#6B6B6B'
            }}
          >
            {revealMode ? 'Step mode on' : 'Step mode'}
          </button>
        </div>
        {solution.steps?.map((step, i) => {
          const hidden = revealMode && i >= revealedCount
          return (
            <div key={step.number}>
              {hidden ? (
                <div
                  onClick={() => setRevealedCount(c => c + 1)}
                  style={{
                    border: '2px dashed rgba(0,0,0,0.1)', borderRadius: 10, padding: '12px 16px',
                    marginBottom: 12, cursor: 'pointer', color: '#6B6B6B', fontSize: 13,
                    textAlign: 'center', userSelect: 'none'
                  }}
                >
                  Step {step.number}: {step.action} - tap to reveal
                </div>
              ) : (
                <StepCard step={step} />
              )}
            </div>
          )
        })}
        {revealMode && !allRevealed && (
          <button
            onClick={() => setRevealedCount(c => c + 1)}
            style={{
              width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #3B61C4',
              background: 'none', color: '#3B61C4', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8
            }}
          >
            Reveal next step
          </button>
        )}
      </div>

      <div style={{
        background: '#059669', borderRadius: 12, padding: 16, marginBottom: 16, color: '#fff'
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Answer</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{solution.finalAnswer}</div>
      </div>

      {solution.keyFormulas?.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 16, marginBottom: 16
        }}>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Formulas Used</div>
          {solution.keyFormulas.map((f, i) => (
            <div key={i} style={{
              fontFamily: 'monospace', fontSize: 13, color: '#3B61C4', background: '#F7F6F3',
              borderRadius: 6, padding: '6px 10px', marginBottom: 6
            }}>
              {f}
            </div>
          ))}
        </div>
      )}

      {solution.commonMistake && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B30', borderRadius: 12, padding: 16
        }}>
          <div style={{ fontSize: 12, color: '#92400E', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Watch Out</div>
          <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>{solution.commonMistake}</div>
        </div>
      )}
    </div>
  )
}

function ProblemCard({ item, onClick, onDelete }) {
  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={onClick}
        style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12,
          padding: 16, cursor: 'pointer', transition: 'box-shadow 0.15s'
        }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <SubjectBadge subject={item.solution.subject} />
          {item.solution.difficulty && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: (DIFFICULTY_COLORS[item.solution.difficulty] || '#6B6B6B') + '15',
              color: DIFFICULTY_COLORS[item.solution.difficulty] || '#6B6B6B'
            }}>
              {item.solution.difficulty}
            </span>
          )}
          <div style={{ fontSize: 11, color: '#6B6B6B', marginLeft: 'auto', paddingRight: 20 }}>
            {new Date(item.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#111', lineHeight: 1.4, marginBottom: 8, fontWeight: 500 }}>
          {item.solution.restatedProblem}
        </div>
        <div style={{
          fontSize: 12, color: '#059669', fontWeight: 600,
          background: '#05966915', borderRadius: 6, padding: '4px 8px', display: 'inline-block'
        }}>
          {item.solution.finalAnswer}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(item.id) }}
        style={{
          position: 'absolute', top: 10, right: 10, background: 'none', border: 'none',
          cursor: 'pointer', color: '#9B9B9B', fontSize: 14, padding: '2px 6px', lineHeight: 1,
          borderRadius: 4
        }}
        title="Delete"
      >
        x
      </button>
    </div>
  )
}

export default function ProblemSolverView({ userId, onShowPaywall }) {
  const [mode, setMode] = useState('hub')
  const [problems, setProblems] = useState(loadProblems)
  const [activeProblem, setActiveProblem] = useState(null)
  const [problemText, setProblemText] = useState('')
  const [subject, setSubject] = useState('Auto-detect')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSolve = async () => {
    if (!canUseAI()) { onShowPaywall?.('pro'); return }
    if (!problemText.trim() && !imageFile) { setError('Enter a problem or upload an image.'); return }
    setLoading(true)
    setError('')
    track('problem_solver_started', { subject, hasImage: !!imageFile, hasText: !!problemText.trim() })

    try {
      let imageBase64 = null
      let mediaType = 'image/jpeg'
      if (imageFile) {
        imageBase64 = await compressImageToBase64(imageFile)
      }

      const token = await getAccessToken()

      const res = await fetch('/api/solve-problem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          problem: problemText,
          imageBase64,
          mediaType,
          subject: subject === 'Auto-detect' ? '' : subject
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to solve problem')

      incrementAIQuery()
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'problemSolver' } }))
      track('problem_solver_used')
      const entry = {
        id: Date.now().toString(),
        problem: problemText,
        hasImage: !!imageFile,
        solution: json.solution,
        createdAt: new Date().toISOString()
      }
      const updated = [entry, ...problems]
      setProblems(updated)
      saveProblems(updated)
      setActiveProblem(entry)
      setMode('result')
    } catch (err) {
      track('problem_solver_error', { error: err.message ?? 'unknown' })
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'result' && activeProblem) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px' }}>
        <SolutionView solution={activeProblem.solution} onBack={() => { setMode('hub'); setActiveProblem(null) }} />
      </div>
    )
  }

  if (mode === 'solve') {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setMode('hub')} style={{
            background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
            padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#6B6B6B'
          }}>
            Back
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>Solve a Problem</h2>
        </div>

        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, padding: 20, marginBottom: 16
        }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
            Subject
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {SUBJECTS.map(s => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: subject === s ? '2px solid #3B61C4' : '1px solid rgba(0,0,0,0.12)',
                  background: subject === s ? '#3B61C4' : '#fff',
                  color: subject === s ? '#fff' : '#6B6B6B',
                  fontWeight: subject === s ? 600 : 400
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
            Problem
          </label>
          <textarea
            value={problemText}
            onChange={e => setProblemText(e.target.value)}
            placeholder="Type or paste your problem here..."
            style={{
              width: '100%', minHeight: 120, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)',
              padding: '12px 14px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit',
              color: '#111', background: '#F7F6F3', boxSizing: 'border-box', outline: 'none'
            }}
          />

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
              Upload Image (optional)
            </label>
            {imagePreview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={imagePreview} alt="" style={{ maxWidth: 280, maxHeight: 180, borderRadius: 8, display: 'block', border: '1px solid rgba(0,0,0,0.1)' }} />
                <button
                  onClick={clearImage}
                  style={{
                    position: 'absolute', top: -8, right: -8, width: 22, height: 22,
                    borderRadius: '50%', background: '#111', color: '#fff', border: 'none',
                    cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  x
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed rgba(0,0,0,0.12)', borderRadius: 10, padding: '20px',
                  textAlign: 'center', cursor: 'pointer', color: '#6B6B6B', fontSize: 13
                }}
              >
                Tap or drag a photo of your problem here
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSolve}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#6B6B6B' : '#3B61C4', color: '#fff',
            border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Solving...' : 'Solve Problem'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111', margin: '0 0 6px' }}>STEM Problem Solver</h1>
        <p style={{ fontSize: 14, color: '#6B6B6B', margin: 0 }}>
          Get step-by-step solutions with full explanations. Type a problem or upload a photo.
        </p>
      </div>

      <button
        onClick={() => { setMode('solve'); setProblemText(''); setSubject('Auto-detect'); clearImage(); setError('') }}
        style={{
          width: '100%', background: '#3B61C4', color: '#fff', border: 'none',
          borderRadius: 12, padding: '16px', fontSize: 15, fontWeight: 600,
          cursor: 'pointer', marginBottom: 28, textAlign: 'left'
        }}
      >
        Solve a new problem
        <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Math, Physics, Chemistry, Biology and more</div>
      </button>

      {problems.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#6B6B6B', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Problems
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {problems.map(item => (
              <ProblemCard
                key={item.id}
                item={item}
                onClick={() => { setActiveProblem(item); setMode('result') }}
                onDelete={id => { const updated = problems.filter(p => p.id !== id); setProblems(updated); saveProblems(updated) }}
              />
            ))}
          </div>
        </div>
      )}

      {problems.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px', color: '#6B6B6B',
          border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 14
        }}>
          <div style={{ marginBottom: 12 }}>
            <svg width="36" height="36" fill="none" stroke="rgba(0,0,0,0.20)" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M9 12h6m-3-3v6M16 3l5 5-5 5M21 8H11" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#111111' }}>Paste, type, or snap a photo</div>
          <div style={{ fontSize: 13 }}>Breaks down the solution step by step</div>
        </div>
      )}
    </div>
  )
}
