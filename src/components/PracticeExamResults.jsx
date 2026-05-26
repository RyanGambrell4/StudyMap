import { useMemo } from 'react'

function fmtMs(ms) {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function gradeMc(question, given) {
  if (!given) return false
  if (given === question.answer) return true
  // tolerate "A. text" vs "A. Text" minor whitespace variants
  return given.trim().toLowerCase() === question.answer?.trim().toLowerCase()
}

function gradeShort(question, given) {
  if (!given) return false
  // Heuristic: short-answer can't be auto-graded perfectly. We mark as
  // "self-grade" — neither right nor wrong by default. User reads the model
  // answer and learns. We return null to signal "not auto-graded".
  return null
}

export default function PracticeExamResults({ questions, answers, timeMs, courseName, onRetake, onClose }) {
  const graded = useMemo(() => questions.map((q, i) => {
    const given = answers[i] ?? ''
    const correct = q.type === 'multiple_choice' ? gradeMc(q, given) : gradeShort(q, given)
    return { q, given, correct }
  }), [questions, answers])

  const autoGradedCount = graded.filter(g => g.correct !== null).length
  const correctCount = graded.filter(g => g.correct === true).length
  const score = autoGradedCount > 0 ? Math.round((correctCount / autoGradedCount) * 100) : null

  // Weak topics: missed counts grouped by topic, only from auto-graded
  const weakTopics = useMemo(() => {
    const map = new Map()
    for (const { q, correct } of graded) {
      if (correct === null) continue
      const topic = q.topic || 'General'
      if (!map.has(topic)) map.set(topic, { total: 0, missed: 0 })
      const s = map.get(topic)
      s.total += 1
      if (correct === false) s.missed += 1
    }
    return [...map.entries()]
      .filter(([, s]) => s.missed > 0)
      .sort((a, b) => (b[1].missed / b[1].total) - (a[1].missed / a[1].total))
      .slice(0, 5)
  }, [graded])

  const hasShortAnswer = graded.some(g => g.correct === null)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#F7F6F3', overflowY: 'auto' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Results{courseName ? ` · ${courseName}` : ''}</p>
            <h1 style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.01em' }}>Practice exam complete</h1>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', padding: 4 }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Score card */}
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 18, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            {score !== null && (
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Score</p>
                <p style={{ margin: '4px 0 0', fontSize: 38, fontWeight: 800, color: score >= 70 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626', lineHeight: 1, letterSpacing: '-0.02em' }}>{score}<span style={{ fontSize: 18, color: '#6B6B6B', fontWeight: 700 }}>%</span></p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B6B6B' }}>{correctCount} of {autoGradedCount} multiple-choice correct</p>
              </div>
            )}
            {hasShortAnswer && (
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Short answer</p>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: '#1A1A1A', fontWeight: 600 }}>Self-graded</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6B6B6B' }}>Compare your response with the model answer below</p>
              </div>
            )}
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Time</p>
              <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>{fmtMs(timeMs)}</p>
            </div>
          </div>
        </div>

        {/* Weak topics */}
        {weakTopics.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 18 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Weakest topics</p>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weakTopics.map(([topic, s]) => (
                <div key={topic} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ fontSize: 14, color: '#1A1A1A', fontWeight: 600 }}>{topic}</span>
                  <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 700 }}>{s.missed}/{s.total} missed</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-question breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {graded.map(({ q, given, correct }, i) => {
            const colorState = correct === true ? '#16A34A' : correct === false ? '#DC2626' : '#6B6B6B'
            const bgState = correct === true ? 'rgba(22,163,74,0.06)' : correct === false ? 'rgba(220,38,38,0.05)' : '#fff'
            return (
              <div key={i} style={{ background: bgState, border: `1px solid ${correct === true ? 'rgba(22,163,74,0.18)' : correct === false ? 'rgba(220,38,38,0.18)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Q{i + 1} · {q.topic}</p>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colorState, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {correct === true ? '✓ Correct' : correct === false ? '✗ Incorrect' : 'Self-grade'}
                  </span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#1A1A1A', lineHeight: 1.5 }}>{q.question}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your answer </span>
                    <span style={{ fontSize: 14, color: given ? '#1A1A1A' : '#9B9B9B', fontStyle: given ? 'normal' : 'italic' }}>{given || '— skipped —'}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{q.type === 'multiple_choice' ? 'Correct answer ' : 'Model answer '}</span>
                    <span style={{ fontSize: 14, color: '#16A34A', fontWeight: 600 }}>{q.answer}</span>
                  </div>
                  {q.explanation && (
                    <p style={{ margin: '10px 0 0', padding: '10px 12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, fontSize: 13, color: '#1A1A1A', lineHeight: 1.55 }}>
                      <span style={{ fontWeight: 700 }}>Why:</span> {q.explanation}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '12px 18px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, color: '#1A1A1A', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back to course</button>
          <button onClick={onRetake} style={{ padding: '12px 22px', background: '#3B61C4', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Retake</button>
        </div>
      </div>
    </div>
  )
}
