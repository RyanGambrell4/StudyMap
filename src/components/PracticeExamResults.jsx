import { useMemo, useEffect, useRef, useState } from 'react'
import { getActivePlan } from '../lib/subscription'
import { getCachedPracticeExams } from '../lib/db'
import { useCelebration } from '../utils/useCelebration'

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

function fmtMs2(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`
}

// Linear extrapolation from a series of scores → predicted next score.
// Uses simple least-squares regression on (index, score) pairs. Clamped 0–100.
function predictNextScore(scores) {
  if (!scores || scores.length < 2) return null
  const n = scores.length
  const xs = scores.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = scores.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (scores[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  const projected = intercept + slope * n
  return Math.max(0, Math.min(100, Math.round(projected)))
}

function ScoreTrendChart({ scores, currentScore }) {
  // Inline SVG line chart. Scores: array of numbers 0-100, oldest first.
  // The newest dot is highlighted in brand color.
  const W = 520, H = 140, PAD = 24
  const n = scores.length
  if (n < 1) return null
  const minY = 0, maxY = 100
  const x = (i) => PAD + (n === 1 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (n - 1))
  const y = (v) => H - PAD - ((v - minY) / (maxY - minY)) * (H - 2 * PAD)
  const points = scores.map((s, i) => `${x(i)},${y(s)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} aria-label="Score trend">
      {[0, 50, 100].map(v => (
        <line key={v} x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="rgba(0,0,0,0.07)" strokeDasharray="3 3" />
      ))}
      {[0, 50, 100].map(v => (
        <text key={`l-${v}`} x={4} y={y(v) + 4} fontSize="10" fill="#9B9B9B" fontWeight="600">{v}</text>
      ))}
      {n > 1 && (
        <polyline points={points} fill="none" stroke="#3B61C4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {scores.map((s, i) => {
        const isLast = i === n - 1
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(s)} r={isLast ? 5 : 3.5} fill={isLast ? '#3B61C4' : '#fff'} stroke="#3B61C4" strokeWidth="2" />
            {isLast && (
              <text x={x(i)} y={y(s) - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A1A">
                {currentScore}%
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function PracticeExamResults({ questions, answers, timeMs, questionTimings = [], courseId, courseName, onRetake, onClose }) {
  const graded = useMemo(() => questions.map((q, i) => {
    const given = answers[i] ?? ''
    const correct = q.type === 'multiple_choice' ? gradeMc(q, given) : gradeShort(q, given)
    return { q, given, correct }
  }), [questions, answers])

  const autoGradedCount = graded.filter(g => g.correct !== null).length
  const correctCount = graded.filter(g => g.correct === true).length
  const score = autoGradedCount > 0 ? Math.round((correctCount / autoGradedCount) * 100) : null

  const celebrate = useCelebration()
  const celebratedRef = useRef(false)
  const [displayScore, setDisplayScore] = useState(0)

  // Animate score counter from 0 → actual score
  useEffect(() => {
    if (score === null) return
    const target = score
    const steps = 28
    const delay = 600 // start after brief pause
    let step = 0
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        step++
        const eased = Math.round(target * (1 - Math.pow(1 - step / steps, 3)))
        setDisplayScore(Math.min(target, eased))
        if (step >= steps) clearInterval(interval)
      }, 30)
    }, delay)
    return () => clearTimeout(timer)
  }, [score])

  // Fire confetti when score is good
  useEffect(() => {
    if (score === null || celebratedRef.current) return
    celebratedRef.current = true
    if (score >= 70) {
      const timer = setTimeout(() => {
        celebrate(score >= 90 ? 'big' : 'medium')
      }, 900)
      return () => clearTimeout(timer)
    }
  }, [])

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

  const plan = getActivePlan()
  const isUnlimited = plan === 'unlimited'

  // Pull cached score history for this course (Unlimited only — gated below).
  // savePracticeExam saves before the results view renders, so the newest exam
  // is already at index 0. We reverse for oldest→newest chart order.
  const scoreHistory = useMemo(() => {
    if (!isUnlimited || !courseId) return []
    const exams = getCachedPracticeExams(courseId) ?? []
    return [...exams]
      .filter(e => typeof e?.score === 'number')
      .sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0))
      .map(e => e.score)
  }, [isUnlimited, courseId])

  const predictedScore = useMemo(() => {
    if (!isUnlimited || scoreHistory.length < 2) return null
    return predictNextScore(scoreHistory)
  }, [isUnlimited, scoreHistory])

  const trendDelta = useMemo(() => {
    if (scoreHistory.length < 2) return null
    return scoreHistory[scoreHistory.length - 1] - scoreHistory[0]
  }, [scoreHistory])

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
                <p style={{ margin: '4px 0 0', fontSize: 38, fontWeight: 800, color: score >= 70 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626', lineHeight: 1, letterSpacing: '-0.02em' }}>{displayScore}<span style={{ fontSize: 18, color: '#6B6B6B', fontWeight: 700 }}>%</span></p>
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

        {/* Advanced analytics (Unlimited only) */}
        {isUnlimited && scoreHistory.length >= 2 && (
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 18, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Score trend · last {scoreHistory.length} exams</p>
                {trendDelta !== null && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: trendDelta >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                    {trendDelta >= 0 ? '+' : ''}{trendDelta} pts since your first exam
                  </p>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#7C5CFA', background: 'rgba(124,92,250,0.08)', border: '1px solid rgba(124,92,250,0.20)', borderRadius: 999, padding: '3px 9px', letterSpacing: '0.5px' }}>
                UNLIMITED
              </span>
            </div>
            <ScoreTrendChart scores={scoreHistory} currentScore={score} />
            {predictedScore !== null && (
              <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(124,92,250,0.06)', border: '1px solid rgba(124,92,250,0.18)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#7C5CFA', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Predicted real exam score</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B6B6B' }}>Based on your trend across {scoreHistory.length} practice exams</p>
                </div>
                <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: '#7C5CFA', letterSpacing: '-0.02em' }}>{predictedScore}%</p>
              </div>
            )}
          </div>
        )}

        {/* Upsell card for Pro/Free */}
        {!isUnlimited && (
          <div style={{ background: 'linear-gradient(135deg, rgba(124,92,250,0.06), rgba(99,102,241,0.06))', border: '1px solid rgba(124,92,250,0.22)', borderRadius: 18, padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 240 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(124,92,250,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C5CFA" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>Unlock advanced exam analytics</p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#6B6B6B', lineHeight: 1.5 }}>
                  See your score trend across every practice exam and get an AI-predicted real exam score. Available on Unlimited.
                </p>
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'practiceExamAnalytics' } }))}
              style={{ padding: '10px 16px', background: '#7C5CFA', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              See plans →
            </button>
          </div>
        )}

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

        {/* Time breakdown */}
        {questionTimings.length > 0 && (() => {
          const sorted = [...questionTimings].sort((a, b) => b.timeMs - a.timeMs)
          const slowest = sorted.slice(0, 3).filter(t => t.timeMs > 0)
          const avg = questionTimings.length ? Math.round(questionTimings.reduce((s, t) => s + t.timeMs, 0) / questionTimings.length) : 0
          if (!slowest.length) return null
          return (
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Time breakdown</p>
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>Avg {fmtMs2(avg)} per question</span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9B9B9B' }}>Slowest questions: likely areas of uncertainty</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {slowest.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#FAFAF8', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', minWidth: 28 }}>#{sorted.indexOf(t) + 1}</span>
                    <span style={{ fontSize: 13, color: '#1A1A1A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topic}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#D97706', flexShrink: 0 }}>{fmtMs2(t.timeMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

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
                    <span style={{ fontSize: 14, color: given ? '#1A1A1A' : '#9B9B9B', fontStyle: given ? 'normal' : 'italic' }}>{given || 'skipped'}</span>
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
          <button onClick={onClose} style={{ padding: '12px 18px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, color: '#1A1A1A', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back to Practice Exams</button>
          <button onClick={onRetake} style={{ padding: '12px 22px', background: '#3B61C4', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Retake</button>
        </div>
      </div>
    </div>
  )
}
