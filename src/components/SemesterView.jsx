import { useState, useEffect, useCallback } from 'react'
import { getAccessToken } from '../lib/supabase'
import { track } from '../lib/analytics'

const D = {
  bg:     '#F7F6F3',
  bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text:   '#111111',
  muted:  '#6B6B6B',
  dim:    '#9B9B9B',
  blue:   '#3B61C4',
  green:  '#16A34A',
  amber:  '#D97706',
  red:    '#DC2626',
  purple: '#7C3AED',
  pink:   '#EC4899',
  teal:   '#0891B2',
  orange: '#EA580C',
}

const TYPE_META = {
  cheat_sheet:   { label: 'Cheat Sheet',   color: D.blue,   bgAlpha: '12' },
  practice_exam: { label: 'Practice Exam', color: D.amber,  bgAlpha: '12' },
  quiz_burst:    { label: 'Quiz Burst',    color: D.green,  bgAlpha: '12' },
  diagram:       { label: 'Diagram',       color: D.purple, bgAlpha: '12' },
  podcast:       { label: 'Podcast',       color: D.pink,   bgAlpha: '12' },
  brain_dump:    { label: 'Brain Dump',    color: D.red,    bgAlpha: '12' },
  essay_outline: { label: 'Essay Outline', color: D.teal,   bgAlpha: '12' },
  mnemonic:      { label: 'Mnemonic',      color: D.orange, bgAlpha: '12' },
  flashcard_set: { label: 'Flashcards',    color: D.green,  bgAlpha: '12' },
}

const UPLOAD_KIND_LABEL = {
  syllabus: 'Syllabus',
  notes:    'Notes',
  exam:     'Past Exam',
  textbook: 'Textbook',
  other:    'Upload',
}

function typeBadge(type) {
  const m = TYPE_META[type] || { label: type, color: D.muted, bgAlpha: '10' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: `${m.color}${m.bgAlpha}`, color: m.color,
      letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function gradeDelta(delta) {
  if (delta === null || delta === undefined) return null
  const sign = delta >= 0 ? '+' : ''
  const color = delta >= 0 ? D.green : D.red
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{sign}{delta}%</span>
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <svg style={{ animation: 'sem-spin 0.8s linear infinite', width: 22, height: 22, color: D.blue }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
    </div>
  )
}

// SVG icon helpers -- all 20x20, stroke-only, matching app icon language
const Icon = {
  document: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
  ),
  checklist: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
    </svg>
  ),
  questionMark: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
  ),
  layers: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
  presentationChart: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
    </svg>
  ),
  inbox: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
    </svg>
  ),
  paperClip: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
    </svg>
  ),
  academicCap: (
    <svg width="20" height="20" fill="none" stroke={D.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
    </svg>
  ),
}

function EmptyState({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: D.text, marginBottom: 4 }}>{title}</div>
      {body && <div style={{ fontSize: 12, color: D.muted, maxWidth: 280, margin: '0 auto' }}>{body}</div>}
    </div>
  )
}

// ── Practice exam retake (Layer 3, interactive) ───────────────────────────────

function PracticeExamRetake({ artifact }) {
  const { payload, course_id: courseId, course_name: courseName } = artifact
  const questions = Array.isArray(payload?.questions) ? payload.questions : []

  const [selected, setSelected] = useState({})   // questionIdx -> selectedOptionText
  const [graded, setGraded]     = useState(null) // null until submitted
  const [submitted, setSubmitted] = useState(false)

  const mcQuestions = questions.filter(q => Array.isArray(q.options) && q.options.length > 0)
  const hasAny      = mcQuestions.length > 0

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)

    const results = questions.map((q, i) => {
      const isMc = Array.isArray(q.options) && q.options.length > 0
      if (!isMc) return { q, correct: null }
      const given  = selected[i] ?? null
      const correct = given !== null && given === q.answer
      return { q, given, correct }
    })
    setGraded(results)

    // Write fresh topic_signals -- same format as PracticeExamResults
    const signals = results
      .map(({ q, correct }) => {
        if (correct === null) return null
        const topic = typeof q.topic === 'string' ? q.topic.trim() : ''
        if (!topic) return null
        return {
          signalType: 'practice_exam_answer',
          courseId,
          courseName,
          topic,
          rawScore: correct ? 1 : 0,
          metadata: { question_type: q.type || null, source_type: q.sourceType || null },
        }
      })
      .filter(Boolean)
      .slice(0, 50)

    if (signals.length && typeof courseId === 'string' && courseId) {
      try {
        const token = await getAccessToken()
        fetch('/api/record-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ signals }),
        }).catch(() => {})
      } catch (_) {}
    }

    track('semester_practice_exam_retake', { questionCount: questions.length, signalCount: signals.length })
  }, [questions, selected, submitted, courseId, courseName])

  const handleReset = () => {
    setSelected({})
    setGraded(null)
    setSubmitted(false)
  }

  if (!hasAny) {
    return <EmptyState icon={Icon.questionMark} title="No gradable questions" body="This exam has only short-answer questions and cannot be auto-graded here." />
  }

  const score = graded
    ? Math.round((graded.filter(g => g.correct === true).length / graded.filter(g => g.correct !== null).length) * 100)
    : null

  return (
    <div>
      {payload.focus && (
        <div style={{ fontSize: 12, color: D.muted, marginBottom: 16, fontStyle: 'italic' }}>Focus: {payload.focus}</div>
      )}

      {graded && (
        <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: score >= 70 ? `${D.green}08` : `${D.amber}08`, border: `1px solid ${score >= 70 ? D.green : D.amber}25`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: score >= 70 ? D.green : D.amber }}>{score}%</div>
            <div style={{ fontSize: 11, color: D.muted }}>
              {graded.filter(g => g.correct === true).length} of {graded.filter(g => g.correct !== null).length} correct
            </div>
          </div>
          <button
            onClick={handleReset}
            style={{ fontSize: 12, fontWeight: 600, color: D.blue, padding: '6px 12px', borderRadius: 7, border: `1px solid ${D.blue}30`, background: `${D.blue}06`, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Retake
          </button>
        </div>
      )}

      {questions.map((q, i) => {
        const isMc      = Array.isArray(q.options) && q.options.length > 0
        const result    = graded ? graded[i] : null
        const isCorrect = result?.correct === true
        const isWrong   = result?.correct === false

        return (
          <div key={i} style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: D.bgCard, border: `1px solid ${graded ? (isCorrect ? D.green : isWrong ? D.red : D.border) : D.border}30` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginBottom: 10, lineHeight: 1.5 }}>
              <span style={{ color: D.dim, marginRight: 6 }}>Q{i + 1}.</span>{q.question}
            </div>

            {isMc && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {q.options.map((opt, oi) => {
                  const isSelected = selected[i] === opt
                  const isAnswer   = opt === q.answer
                  let bg     = '#F7F6F3'
                  let border = D.border
                  let color  = D.muted
                  if (graded) {
                    if (isAnswer)   { bg = `${D.green}10`; border = `${D.green}40`; color = D.green }
                    else if (isSelected && !isAnswer) { bg = `${D.red}08`; border = `${D.red}30`; color = D.red }
                  } else if (isSelected) {
                    bg = `${D.blue}08`; border = `${D.blue}30`; color = D.blue
                  }
                  return (
                    <button
                      key={oi}
                      disabled={!!graded}
                      onClick={() => setSelected(prev => ({ ...prev, [i]: opt }))}
                      style={{
                        fontSize: 13, color, padding: '8px 12px', borderRadius: 7,
                        background: bg, border: `1px solid ${border}`,
                        cursor: graded ? 'default' : 'pointer', textAlign: 'left',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${isSelected && !graded ? D.blue : D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isSelected && !graded ? D.blue : 'transparent' }}>
                        {isSelected && !graded && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        {graded && isAnswer && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={D.green} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        {graded && isSelected && !isAnswer && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={D.red} strokeWidth="3"><path d="M6 18L18 6M6 6l12 12"/></svg>}
                      </span>
                      {String.fromCharCode(65 + oi)}. {opt}
                    </button>
                  )
                })}
              </div>
            )}

            {!isMc && (
              <div style={{ fontSize: 12, color: D.dim, fontStyle: 'italic', marginBottom: 8 }}>Short answer</div>
            )}

            {(graded || !isMc) && q.answer && (
              <div style={{ fontSize: 12, color: D.green, fontWeight: 600, marginBottom: 4 }}>Answer: {q.answer}</div>
            )}
            {q.explanation && graded && (
              <div style={{ fontSize: 12, color: D.muted, lineHeight: 1.5 }}>{q.explanation}</div>
            )}
          </div>
        )
      })}

      {!graded && (
        <button
          onClick={handleSubmit}
          disabled={Object.keys(selected).length === 0}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: Object.keys(selected).length > 0 ? D.blue : D.border,
            color: Object.keys(selected).length > 0 ? '#fff' : D.muted,
            border: 'none', cursor: Object.keys(selected).length > 0 ? 'pointer' : 'default',
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}
        >
          Grade My Answers
        </button>
      )}
    </div>
  )
}

// ── Artifact content renderers ──────────────────────────────────────────────

function ArtifactRenderer({ artifact }) {
  const { artifact_type: type, payload } = artifact
  if (!payload) return <EmptyState icon={Icon.document} title="No content stored" />

  if (type === 'practice_exam') {
    return <PracticeExamRetake artifact={artifact} />
  }

  if (type === 'cheat_sheet') {
    const topics = Array.isArray(payload.planTopics) ? payload.planTopics : []
    return (
      <div>
        {payload.topPickReason && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: `${D.blue}08`, border: `1px solid ${D.blue}20`, fontSize: 13, color: D.blue }}>
            <strong>Highest ROI:</strong> {payload.topPickReason}
          </div>
        )}
        {topics.length === 0 && <EmptyState icon={Icon.checklist} title="No topics found" />}
        {topics.map((t, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${D.border}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{t.name || t.topic}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {t.examLikelihood && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: `${D.amber}12`, color: D.amber }}>{t.examLikelihood}</span>
                )}
                {t.readiness && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: `${D.green}12`, color: D.green }}>{t.readiness}</span>
                )}
              </div>
            </div>
            {t.whyLikely && <p style={{ margin: '0 0 4px', fontSize: 13, color: D.muted, lineHeight: 1.5 }}>{t.whyLikely}</p>}
            {t.priorityAction && (
              <div style={{ fontSize: 12.5, color: D.text, padding: '6px 10px', borderRadius: 6, background: `${D.blue}06`, borderLeft: `3px solid ${D.blue}` }}>
                {t.priorityAction}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === 'quiz_burst') {
    const questions = Array.isArray(payload.questions) ? payload.questions : []
    return (
      <div>
        {payload.focus && (
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 16, fontStyle: 'italic' }}>Focus: {payload.focus}</div>
        )}
        {questions.length === 0 && <EmptyState icon={Icon.questionMark} title="No questions found" />}
        {questions.map((q, i) => (
          <div key={i} style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginBottom: 10, lineHeight: 1.5 }}>
              <span style={{ color: D.dim, marginRight: 6 }}>Q{i + 1}.</span>{q.question}
            </div>
            {Array.isArray(q.options) && q.options.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {q.options.map((opt, oi) => (
                  <div key={oi} style={{ fontSize: 13, color: D.muted, padding: '6px 10px', borderRadius: 6, background: '#F7F6F3', border: `1px solid ${D.border}` }}>
                    {String.fromCharCode(65 + oi)}. {opt}
                  </div>
                ))}
              </div>
            )}
            {q.answer && (
              <div style={{ fontSize: 12, color: D.green, fontWeight: 600, marginBottom: 4 }}>Answer: {q.answer}</div>
            )}
            {q.explanation && (
              <div style={{ fontSize: 12, color: D.muted, lineHeight: 1.5 }}>{q.explanation}</div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === 'flashcard_set') {
    const flashcards = Array.isArray(payload.flashcards) ? payload.flashcards : []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {flashcards.length === 0 && <EmptyState icon={Icon.layers} title="No flashcards stored" />}
        {flashcards.map((fc, i) => (
          <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginBottom: 6 }}>{fc.front}</div>
            <div style={{ fontSize: 13, color: D.muted, borderTop: `1px solid ${D.border}`, paddingTop: 6 }}>{fc.back}</div>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'mnemonic') {
    return (
      <div>
        <div style={{ padding: '14px 16px', borderRadius: 10, background: `${D.orange}08`, border: `1px solid ${D.orange}25`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: D.orange, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mnemonic{payload.type ? ` (${payload.type})` : ''}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D.text, lineHeight: 1.6 }}>{payload.mnemonic}</div>
        </div>
        {payload.concept && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Concept</span>
            <div style={{ fontSize: 13, color: D.text, marginTop: 4 }}>{payload.concept}</div>
          </div>
        )}
        {payload.answer && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Answer</span>
            <div style={{ fontSize: 13, color: D.muted, marginTop: 4 }}>{payload.answer}</div>
          </div>
        )}
      </div>
    )
  }

  if (type === 'essay_outline') {
    return (
      <div>
        {payload.essayType && (
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 12 }}>
            {payload.essayType}{payload.wordCount ? ` · ~${payload.wordCount} words` : ''}
          </div>
        )}
        <div style={{ fontSize: 13, color: D.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {typeof payload.outline === 'string' ? payload.outline : JSON.stringify(payload.outline, null, 2)}
        </div>
      </div>
    )
  }

  if (type === 'podcast') {
    return (
      <div>
        {payload.audioUrl && (
          <div style={{ marginBottom: 20 }}>
            <audio controls style={{ width: '100%', borderRadius: 8 }} src={payload.audioUrl} />
          </div>
        )}
        {payload.script && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Script</div>
            <div style={{ fontSize: 13, color: D.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{payload.script}</div>
          </div>
        )}
      </div>
    )
  }

  if (type === 'brain_dump') {
    const cats = Array.isArray(payload.categories) ? payload.categories : []
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          {payload.score !== undefined && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: D.blue }}>{payload.score}%</div>
              <div style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>Knowledge Score</div>
            </div>
          )}
          {payload.gradeProjection != null && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: D.green }}>{payload.gradeProjection}%</div>
              <div style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>Grade Projection</div>
            </div>
          )}
        </div>
        {cats.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Categories</div>
            {cats.map((cat, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: D.bgCard, border: `1px solid ${D.border}`, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: D.text }}>{cat.name || cat.category}</span>
                {cat.score !== undefined && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: cat.score >= 70 ? D.green : cat.score >= 40 ? D.amber : D.red }}>{cat.score}%</span>
                )}
              </div>
            ))}
          </div>
        )}
        {Array.isArray(payload.possibleGaps) && payload.possibleGaps.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Possible Gaps</div>
            {payload.possibleGaps.map((gap, i) => (
              <div key={i} style={{ fontSize: 13, color: D.muted, padding: '6px 10px', borderRadius: 6, background: `${D.red}06`, borderLeft: `3px solid ${D.red}30`, marginBottom: 6 }}>{gap}</div>
            ))}
          </div>
        )}
        {payload.text_excerpt && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Your Brain Dump</div>
            <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.6, fontStyle: 'italic' }}>{payload.text_excerpt}</div>
          </div>
        )}
      </div>
    )
  }

  if (type === 'diagram') {
    const d = payload.diagram
    if (!d) return <EmptyState icon={Icon.presentationChart} title="Diagram not available" />
    const dtype = d.type || payload.diagramType || 'diagram'
    return (
      <div>
        <div style={{ fontSize: 12, color: D.muted, marginBottom: 16, textTransform: 'capitalize' }}>Type: {dtype}</div>
        {dtype === 'mindmap' && d.center && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: `${D.purple}10`, border: `1px solid ${D.purple}25`, display: 'inline-block' }}>{d.center}</div>
            {Array.isArray(d.branches) && d.branches.map((b, i) => (
              <div key={i} style={{ marginBottom: 10, paddingLeft: 16, borderLeft: `3px solid ${D.purple}40` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: D.text, marginBottom: 4 }}>{b.label}</div>
                {Array.isArray(b.children) && b.children.map((c, ci) => (
                  <div key={ci} style={{ fontSize: 12, color: D.muted, paddingLeft: 12, marginBottom: 2 }}>{typeof c === 'string' ? c : c.label}</div>
                ))}
              </div>
            ))}
          </div>
        )}
        {dtype === 'flowchart' && Array.isArray(d.steps) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: `${D.purple}12`, border: `1px solid ${D.purple}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: D.purple, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: D.text, lineHeight: 1.5, paddingTop: 4 }}>{s.label || s.text || JSON.stringify(s)}</div>
              </div>
            ))}
          </div>
        )}
        {dtype === 'timeline' && Array.isArray(d.events) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {d.events.map((ev, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.purple, minWidth: 56, textAlign: 'right', paddingTop: 2 }}>{ev.date || ev.year || String(i + 1)}</div>
                <div style={{ flex: 1, borderLeft: `2px solid ${D.purple}30`, paddingLeft: 12, paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{ev.event || ev.label}</div>
                  {ev.detail && <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>{ev.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {dtype === 'comparison' && Array.isArray(d.attributes) && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: D.muted, fontWeight: 600, borderBottom: `1px solid ${D.border}` }}>Attribute</th>
                  {Array.isArray(d.items) && d.items.map((item, ii) => (
                    <th key={ii} style={{ textAlign: 'left', padding: '6px 10px', color: D.text, fontWeight: 700, borderBottom: `1px solid ${D.border}` }}>{item}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.attributes.map((attr, ai) => (
                  <tr key={ai}>
                    <td style={{ padding: '6px 10px', color: D.muted, borderBottom: `1px solid ${D.border}` }}>{attr.name}</td>
                    {Array.isArray(attr.values) && attr.values.map((v, vi) => (
                      <td key={vi} style={{ padding: '6px 10px', color: D.text, borderBottom: `1px solid ${D.border}` }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!['mindmap','flowchart','timeline','comparison','hierarchy'].includes(dtype) && (
          <pre style={{ fontSize: 12, color: D.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(d, null, 2)}</pre>
        )}
      </div>
    )
  }

  return (
    <pre style={{ fontSize: 12, color: D.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {JSON.stringify(payload, null, 2)}
    </pre>
  )
}

// ── Layer 3: Artifact detail ─────────────────────────────────────────────────

function ArtifactView({ artifactId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        const res = await fetch(`/api/semester-artifact?id=${encodeURIComponent(artifactId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(json.error || 'Failed to load artifact')
          else setData(json.artifact)
        }
      } catch (e) {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
  }, [artifactId])

  return (
    <div style={{ padding: '0 0 80px' }}>
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: D.blue, fontSize: 13, fontWeight: 600, padding: '16px 16px 12px', fontFamily: 'inherit' }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        Back to course
      </button>

      {loading && <Spinner />}
      {error && <div style={{ padding: '16px', color: D.red, fontSize: 13 }}>{error}</div>}
      {data && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ marginBottom: 16 }}>
            {typeBadge(data.artifact_type)}
            <h2 style={{ margin: '8px 0 4px', fontSize: 20, fontWeight: 800, color: D.text, lineHeight: 1.3 }}>{data.title}</h2>
            <div style={{ fontSize: 12, color: D.muted }}>{formatDate(data.created_at)}{data.topic ? ` · ${data.topic}` : ''}</div>
          </div>
          <div style={{ padding: '16px', borderRadius: 12, background: D.bgCard, border: `1px solid ${D.border}` }}>
            <ArtifactRenderer artifact={data} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Layer 2: Course detail ───────────────────────────────────────────────────

const UPLOAD_ICON = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
  </svg>
)

function CourseView({ courseId, courses, onBack, onOpenArtifact }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('artifacts')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        const res = await fetch(`/api/semester-course?courseId=${encodeURIComponent(courseId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(json.error || 'Failed to load course')
          else setData(json)
        }
      } catch (e) {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    track('semester_course_opened', { courseId })
  }, [courseId])

  const course   = data?.course
  const artifacts = data?.artifacts ?? []
  const uploads   = data?.uploads ?? []
  const mastery   = data?.mastery ?? []

  const typesPresent = [...new Set(artifacts.map(a => a.artifact_type))]
  const filtered     = typeFilter === 'all' ? artifacts : artifacts.filter(a => a.artifact_type === typeFilter)

  const masteryColor = (score) => score >= 80 ? D.green : score >= 50 ? D.amber : D.red

  return (
    <div style={{ paddingBottom: 80 }}>
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: D.blue, fontSize: 13, fontWeight: 600, padding: '16px 16px 12px', fontFamily: 'inherit' }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        My Semester
      </button>

      {loading && <Spinner />}
      {error && <div style={{ padding: '16px', color: D.red, fontSize: 13 }}>{error}</div>}

      {course && (
        <>
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              {course.color && (
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: course.color, flexShrink: 0 }} />
              )}
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: D.text }}>{course.name}</h2>
            </div>
            {course.code && <div style={{ fontSize: 12, color: D.muted, marginBottom: 10 }}>{course.code}</div>}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {course.currentGrade !== null && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, minWidth: 80, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: D.text }}>{course.currentGrade}%</div>
                  <div style={{ fontSize: 10, color: D.muted }}>Current Grade</div>
                  {course.delta !== null && <div style={{ marginTop: 2 }}>{gradeDelta(course.delta)}</div>}
                </div>
              )}
              {course.targetGrade && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, minWidth: 80, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: D.blue }}>{course.targetGrade}%</div>
                  <div style={{ fontSize: 10, color: D.muted }}>Target</div>
                </div>
              )}
              <div style={{ padding: '8px 12px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, minWidth: 64, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: D.text }}>{data?.stats?.assetCount ?? 0}</div>
                <div style={{ fontSize: 10, color: D.muted }}>Assets</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, minWidth: 64, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: D.text }}>{data?.stats?.sessionCount ?? 0}</div>
                <div style={{ fontSize: 10, color: D.muted }}>Sessions</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', padding: '0 16px 12px', gap: 6, borderBottom: `1px solid ${D.border}`, marginBottom: 16 }}>
            {[
              { id: 'artifacts', label: 'Made for You' },
              { id: 'uploads',   label: 'From You' },
              { id: 'mastery',   label: 'What You Know' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
                  background: activeTab === tab.id ? D.blue : 'transparent',
                  color: activeTab === tab.id ? '#fff' : D.muted,
                  border: activeTab === tab.id ? 'none' : `1px solid ${D.border}`,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'artifacts' && (
            <div style={{ padding: '0 16px' }}>
              {typesPresent.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  <button
                    onClick={() => setTypeFilter('all')}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', background: typeFilter === 'all' ? D.blue : `${D.blue}10`, color: typeFilter === 'all' ? '#fff' : D.blue, fontFamily: 'inherit' }}
                  >
                    All
                  </button>
                  {typesPresent.map(t => {
                    const m = TYPE_META[t] || { label: t, color: D.muted }
                    const active = typeFilter === t
                    return (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', background: active ? m.color : `${m.color}12`, color: active ? '#fff' : m.color, fontFamily: 'inherit' }}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              )}
              {filtered.length === 0 && (
                <EmptyState icon={Icon.inbox} title="Nothing yet" body="AI-generated study assets will appear here as you use StudyEdge AI." />
              )}
              {filtered.map(a => (
                <button
                  key={a.id}
                  onClick={() => onOpenArtifact(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8,
                    borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {typeBadge(a.artifact_type)}
                      <span style={{ fontSize: 11, color: D.dim }}>{formatDate(a.created_at)}</span>
                    </div>
                  </div>
                  <svg width="14" height="14" fill="none" stroke={D.dim} strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'uploads' && (
            <div style={{ padding: '0 16px' }}>
              {uploads.length === 0 && (
                <EmptyState icon={Icon.paperClip} title="No uploads" body="Files you share with StudyEdge AI will appear here." />
              )}
              {uploads.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 8, borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}` }}>
                  <span style={{ color: D.muted }}>{UPLOAD_ICON}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.filename}</div>
                    <div style={{ fontSize: 11, color: D.dim, marginTop: 2 }}>
                      {UPLOAD_KIND_LABEL[u.kind] || 'Upload'}{u.char_count ? ` · ${Math.round(u.char_count / 1000)}k chars` : ''} · {formatDate(u.uploaded_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'mastery' && (
            <div style={{ padding: '0 16px' }}>
              {mastery.length === 0 && (
                <EmptyState icon={Icon.academicCap} title="No mastery data yet" body="Complete quizzes and brain dumps to build your knowledge map." />
              )}
              {mastery.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 6, borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: masteryColor(m.score ?? 0), flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.topic}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: masteryColor(m.score ?? 0), flexShrink: 0 }}>{m.score ?? 0}%</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Layer 1: Semester overview ───────────────────────────────────────────────

function colorDot(color) {
  if (!color) return null
  return <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6, flexShrink: 0 }} />
}

function SemesterStartState() {
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ padding: '28px 24px', borderRadius: 14, background: D.bgCard, border: `1px solid ${D.border}`, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `${D.blue}10`, border: `1px solid ${D.blue}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" fill="none" stroke={D.blue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: D.text, marginBottom: 8 }}>Your record starts here</div>
        <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.6, maxWidth: 300, margin: '0 auto', marginBottom: 20 }}>
          Every cheat sheet, practice exam, and brain dump you generate gets saved here. Add courses to your plan and start studying to build your semester record.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', maxWidth: 280, margin: '0 auto' }}>
          {[
            { path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Generate a cheat sheet before your next exam' },
            { path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', label: 'Take a practice exam and see what you actually know' },
            { path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Brain dump before a study session to close gaps' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${D.blue}08`, border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" fill="none" stroke={D.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={step.path}/></svg>
              </div>
              <span style={{ fontSize: 12, color: D.muted, lineHeight: 1.4 }}>{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SemesterView({ courses: localCourses, userId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeCourseId, setActiveCourseId]     = useState(null)
  const [activeArtifactId, setActiveArtifactId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/semester', { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(json.error || 'Failed to load semester data')
          else setData(json)
        }
      } catch (e) {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    track('semester_view_opened')
  }, [])

  const openCourse   = useCallback((courseId) => { setActiveCourseId(courseId); setActiveArtifactId(null) }, [])
  const openArtifact = useCallback((artifactId) => { setActiveArtifactId(artifactId) }, [])
  const backToSemester = useCallback(() => { setActiveCourseId(null); setActiveArtifactId(null) }, [])
  const backToCourse   = useCallback(() => { setActiveArtifactId(null) }, [])

  if (activeArtifactId) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <style>{`@keyframes sem-spin{to{transform:rotate(360deg)}}`}</style>
        <ArtifactView artifactId={activeArtifactId} onBack={backToCourse} />
      </div>
    )
  }

  if (activeCourseId) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <style>{`@keyframes sem-spin{to{transform:rotate(360deg)}}`}</style>
        <CourseView
          courseId={activeCourseId}
          courses={localCourses}
          onBack={backToSemester}
          onOpenArtifact={openArtifact}
        />
      </div>
    )
  }

  const semesterCourses = data?.courses ?? []
  const totals = data?.totals ?? {}

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 0 80px' }}>
      <style>{`@keyframes sem-spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ padding: '24px 16px 16px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: D.text }}>My Semester</h1>
        <p style={{ margin: 0, fontSize: 13, color: D.muted }}>Everything StudyEdge AI has learned and built for you this semester</p>
      </div>

      {!loading && !error && totals.assets > 0 && (
        <div style={{ display: 'flex', gap: 10, padding: '0 16px 20px', flexWrap: 'wrap' }}>
          {[
            { label: 'Assets Created', value: totals.assets ?? 0,   color: D.blue },
            { label: 'Study Sessions',  value: totals.sessions ?? 0, color: D.green },
            { label: 'Weeks In',        value: totals.weeksIn ?? 0,  color: D.amber },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1, minWidth: 90, padding: '10px 12px', borderRadius: 10, background: D.bgCard, border: `1px solid ${D.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: D.muted, marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <Spinner />}
      {error && <div style={{ padding: '16px', color: D.red, fontSize: 13 }}>{error}</div>}

      {!loading && !error && semesterCourses.length === 0 && <SemesterStartState />}

      {semesterCourses.map(course => (
        <button
          key={course.id}
          onClick={() => openCourse(course.id)}
          style={{
            display: 'block', textAlign: 'left',
            margin: '0 16px 12px', width: 'calc(100% - 32px)',
            padding: '16px', borderRadius: 12, background: D.bgCard,
            border: `1px solid ${D.border}`, cursor: 'pointer',
            fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            {colorDot(course.color)}
            <span style={{ fontSize: 15, fontWeight: 700, color: D.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.name}</span>
            {course.code && <span style={{ fontSize: 11, color: D.dim, marginLeft: 8, flexShrink: 0 }}>{course.code}</span>}
            <svg width="14" height="14" fill="none" stroke={D.dim} strokeWidth="2" viewBox="0 0 24 24" style={{ marginLeft: 8, flexShrink: 0 }}><path d="M9 5l7 7-7 7"/></svg>
          </div>

          {course.currentGrade !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>{course.currentGrade}%</span>
              {course.targetGrade && <span style={{ fontSize: 11, color: D.dim }}>/ {course.targetGrade}% target</span>}
              {course.delta !== null && gradeDelta(course.delta)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, color: D.muted }}>{course.assetCount} asset{course.assetCount !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: D.muted }}>{course.sessionCount} session{course.sessionCount !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: D.muted }}>{course.topicCount} topic{course.topicCount !== 1 ? 's' : ''}</span>
          </div>

          {course.nextDeadline && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, background: `${D.amber}08`, border: `1px solid ${D.amber}20` }}>
              <svg width="11" height="11" fill="none" stroke={D.amber} strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span style={{ fontSize: 11, color: D.amber, fontWeight: 600 }}>
                {course.nextDeadline.title} · {course.nextDeadline.daysUntil === 0 ? 'Today' : course.nextDeadline.daysUntil === 1 ? 'Tomorrow' : `${course.nextDeadline.daysUntil}d`}
              </span>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
