import { useState } from 'react'
import { canUseAI, incrementAIQuery } from '../lib/subscription.js'
import { getAccessToken } from '../lib/supabase.js'
import { hydrateCourseContext } from '../lib/courseContext'
import { track } from '../lib/analytics'

const STORAGE_KEY = 'studyedge_outlines'

function loadOutlines() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveOutlines(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
}

const ESSAY_TYPES = [
  { value: 'argumentative', label: 'Argumentative' },
  { value: 'analytical', label: 'Analytical' },
  { value: 'expository', label: 'Expository' },
  { value: 'compare', label: 'Compare & Contrast' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'research', label: 'Research Paper' }
]

const WORD_COUNTS = [500, 750, 1000, 1500, 2000, 3000, 5000]

// SectionDraftView — the drafting partner. Student writes their draft of one
// section on the left; on submit, AI review renders on the right with hits,
// misses, evidence gaps, concrete edits, and rubric-aligned scoring.
function SectionDraftView({ section, sectionIdx, outline, onBack, buildContext, courseName, requirements }) {
  const [draft, setDraft] = useState('')
  const [review, setReview] = useState(null)
  const [wordCount, setWordCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const targetWords = section?.wordAllocation ?? null

  // Live word count while typing.
  const updateDraft = (v) => {
    setDraft(v)
    setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0)
  }

  const requestReview = async () => {
    if (!draft.trim()) return
    setLoading(true)
    setError('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/essay-review-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sectionName: section?.name,
          sectionPurpose: section?.purpose,
          sectionPoints: section?.points ?? [],
          draft,
          thesis: outline?.thesis,
          essayType: outline?.essayType,
          wordAllocation: targetWords,
          requirements,
          courseContext: buildContext(courseName),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to review')
      incrementAIQuery()
      setReview(json.review)
      track('essay_section_reviewed', { section: section?.name, wordCount: json.wordCount })
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const copyDraft = () => {
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const wcColor = targetWords == null ? '#6B6B6B'
    : Math.abs(wordCount - targetWords) <= targetWords * 0.15 ? '#16A34A'
    : Math.abs(wordCount - targetWords) <= targetWords * 0.30 ? '#D97706'
    : '#DC2626'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#6B6B6B' }}>Back to outline</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>Drafting {section?.name}</h2>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>{section?.purpose}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: review ? '1fr 1fr' : '1fr', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Your draft</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: wcColor }}>
              {wordCount}{targetWords ? ` / ~${targetWords} w` : ' w'}
            </div>
          </div>
          <textarea
            value={draft}
            onChange={e => updateDraft(e.target.value)}
            placeholder={`Start with your topic sentence. Aim for roughly ${targetWords ?? 200} words.`}
            style={{
              width: '100%', boxSizing: 'border-box',
              minHeight: 320, padding: 14, borderRadius: 12,
              border: '1.5px solid rgba(0,0,0,0.12)',
              fontSize: 14, color: '#111', background: '#fff',
              fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none',
            }}
          />
          {section?.points?.length > 0 && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#F7F6F3', borderRadius: 8, fontSize: 11.5, color: '#6B6B6B', lineHeight: 1.6 }}>
              <strong style={{ color: '#111' }}>Outline points to hit:</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                {section.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12.5, color: '#DC2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={requestReview}
              disabled={loading || wordCount < 30}
              style={{ flex: 1, padding: '12px', background: loading || wordCount < 30 ? '#9B9B9B' : '#3B61C4', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: loading || wordCount < 30 ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              {loading ? 'Reading your draft…' : review ? 'Re-review after edits' : 'Get feedback'}
            </button>
            <button
              onClick={copyDraft}
              disabled={!draft.trim()}
              style={{ padding: '12px 16px', background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, color: '#6B6B6B', fontSize: 13, fontWeight: 600, cursor: draft.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {wordCount < 30 && !loading && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#9B9B9B', textAlign: 'center' }}>
              Write at least 30 words to get feedback.
            </div>
          )}
        </div>

        {review && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Review</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: review.overallScore >= 75 ? '#16A34A' : review.overallScore >= 55 ? '#D97706' : '#DC2626' }}>
                {review.overallScore}
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: '#3B61C40A', border: '1px solid #3B61C422', borderRadius: 10, fontSize: 12.5, color: '#111', marginBottom: 12, lineHeight: 1.5 }}>
              <strong style={{ color: '#3B61C4' }}>Next step: </strong>{review.nextStep}
            </div>

            {review.hits?.length > 0 && (
              <div style={{ padding: 12, background: 'rgba(22,163,74,0.04)', border: '1px solid rgba(22,163,74,0.18)', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#16A34A', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>What's working</div>
                {review.hits.map((h, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: '#111', marginBottom: 4, lineHeight: 1.45 }}>· {h}</div>
                ))}
              </div>
            )}

            {review.misses?.length > 0 && (
              <div style={{ padding: 12, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#DC2626', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>Gaps</div>
                {review.misses.map((m, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: '#111', marginBottom: 4, lineHeight: 1.45 }}>· {m}</div>
                ))}
              </div>
            )}

            {review.evidenceGaps?.length > 0 && (
              <div style={{ padding: 12, background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.22)', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#D97706', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>Claims needing sources</div>
                {review.evidenceGaps.map((g, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: '#111', marginBottom: 6, lineHeight: 1.45 }}>
                    <div style={{ fontStyle: 'italic', color: '#6B6B6B' }}>"{g.claim}"</div>
                    <div style={{ marginTop: 2 }}>→ needs <strong>{g.needsSource}</strong></div>
                  </div>
                ))}
              </div>
            )}

            {review.concreteEdits?.length > 0 && (
              <div style={{ padding: 12, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B61C4', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Suggested edits</div>
                {review.concreteEdits.map((e, i) => (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: i < review.concreteEdits.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                    <div style={{ fontSize: 12, color: '#DC2626', textDecoration: 'line-through', lineHeight: 1.5 }}>{e.original}</div>
                    <div style={{ fontSize: 12.5, color: '#16A34A', fontWeight: 600, marginTop: 3, lineHeight: 1.5 }}>{e.revised}</div>
                    <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 3, fontStyle: 'italic' }}>{e.why}</div>
                  </div>
                ))}
              </div>
            )}

            {review.rubricAlignment?.length > 0 && (
              <div style={{ padding: 12, background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.22)', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7C3AED', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Rubric alignment</div>
                {review.rubricAlignment.map((r, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, color: '#111' }}>{r.criterion}</span>
                      <span style={{ fontWeight: 700, color: r.score >= 75 ? '#16A34A' : r.score >= 55 ? '#D97706' : '#DC2626' }}>{r.score}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#6B6B6B', lineHeight: 1.4 }}>{r.assessment}</div>
                  </div>
                ))}
              </div>
            )}

            {review.wordCountAdvice && (
              <div style={{ padding: '10px 12px', background: '#F7F6F3', borderRadius: 8, fontSize: 12, color: '#6B6B6B', lineHeight: 1.4 }}>
                <strong>Word count:</strong> {review.wordCountAdvice}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OutlineView({ outline, onBack, onDraftSection }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const copyAll = () => {
    const lines = [
      outline.title,
      '',
      `Thesis: ${outline.thesis}`,
      '',
      'OUTLINE:',
      ...outline.sections.flatMap(s => [
        `\n${s.name} (~${s.wordAllocation} words)`,
        `Purpose: ${s.purpose}`,
        ...s.points.map(p => `  - ${p}`)
      ]),
      '',
      outline.keyArguments?.length ? `Key Arguments:\n${outline.keyArguments.map(a => `- ${a}`).join('\n')}` : '',
      outline.writingTips?.length ? `\nWriting Tips:\n${outline.writingTips.map(t => `- ${t}`).join('\n')}` : '',
      outline.commonPitfalls?.length ? `\nWatch Out For:\n${outline.commonPitfalls.map(p => `- ${p}`).join('\n')}` : ''
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 3000)
    })
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
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111', flex: 1 }}>Essay Outline</h2>
        <button onClick={copyAll} style={{
          background: copied ? '#059669' : copyError ? 'rgba(220,38,38,0.08)' : 'none',
          border: copied ? 'none' : copyError ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(0,0,0,0.12)',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
          color: copied ? '#fff' : copyError ? '#DC2626' : '#3B61C4', fontWeight: 600, transition: 'all 0.2s'
        }}>
          {copied ? 'Copied' : copyError ? 'Copy failed' : 'Copy'}
        </button>
      </div>

      <div style={{
        background: '#3B61C4', borderRadius: 12, padding: 20, marginBottom: 16, color: '#fff'
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {outline.essayType} Essay - ~{outline.estimatedWordCount} words
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{outline.title}</div>
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>Thesis:</span> {outline.thesis}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Structure
        </div>
        {outline.sections?.map((section, i) => (
          <div
            key={i}
            style={{
              background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12,
              marginBottom: 10, overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{section.name}</div>
                <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{section.purpose}</div>
              </div>
              <div style={{
                fontSize: 11, color: '#3B61C4', fontWeight: 600,
                background: '#3B61C410', borderRadius: 6, padding: '3px 8px'
              }}>
                ~{section.wordAllocation}w
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {section.points?.map((point, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, marginBottom: j < section.points.length - 1 ? 6 : 0 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B61C4', marginTop: 7, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: '#111', lineHeight: 1.5 }}>{point}</div>
                </div>
              ))}
              {onDraftSection && (
                <button
                  onClick={() => onDraftSection(section, i)}
                  style={{
                    marginTop: 12, padding: '8px 14px', borderRadius: 8,
                    background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.22)',
                    color: '#3B61C4', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Draft this section →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {outline.keyArguments?.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 16, marginBottom: 14
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Key Arguments</div>
          {outline.keyArguments.map((arg, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#3B61C4',
                color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 13, color: '#111', lineHeight: 1.5 }}>{arg}</div>
            </div>
          ))}
        </div>
      )}

      {outline.suggestedSources?.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 16, marginBottom: 14
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suggested Source Types</div>
          {outline.suggestedSources.map((s, i) => (
            <div key={i} style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 4 }}>- {s}</div>
          ))}
        </div>
      )}

      {outline.writingTips?.length > 0 && (
        <div style={{
          background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.15)', borderRadius: 12, padding: 16, marginBottom: 14
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3B61C4', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Writing Tips</div>
          {outline.writingTips.map((tip, i) => (
            <div key={i} style={{ fontSize: 13, color: '#3B61C4', marginBottom: 6, lineHeight: 1.4 }}>- {tip}</div>
          ))}
        </div>
      )}

      {outline.commonPitfalls?.length > 0 && (
        <div style={{
          background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: 16, marginBottom: 14
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Watch Out For</div>
          {outline.commonPitfalls.map((p, i) => (
            <div key={i} style={{ fontSize: 13, color: '#92400E', marginBottom: 6, lineHeight: 1.4 }}>- {p}</div>
          ))}
        </div>
      )}

      {outline.gapsToFillBeforeWriting?.length > 0 && (
        <div style={{
          background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.2)', borderRadius: 12, padding: 16
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3B61C4', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Look These Up Before Drafting</div>
          {outline.gapsToFillBeforeWriting.map((g, i) => (
            <div key={i} style={{ fontSize: 13, color: '#3B61C4', marginBottom: 6, lineHeight: 1.4 }}>- {g}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function OutlineCard({ item, onClick, onDelete }) {
  const typeLabel = ESSAY_TYPES.find(t => t.value === item.outline.essayType)?.label || item.outline.essayType
  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={onClick}
        className="ea-card"
        style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12,
          padding: 16, cursor: 'pointer',
          transition: 'box-shadow 0.15s, transform 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: '#3B61C415', color: '#3B61C4'
          }}>{typeLabel}</span>
          <span style={{ fontSize: 11, color: '#6B6B6B', marginLeft: 'auto', paddingRight: 20 }}>
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4, lineHeight: 1.3 }}>
          {item.outline.title}
        </div>
        <div style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.4 }}>
          {item.outline.thesis}
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

export default function EssayArchitectView({ userId, onShowPaywall, courses = [], learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [] }) {
  // If the user's typed courseName matches one of their real courses, pull
  // the full context from it. Otherwise send a minimal context so the API
  // still gets student profile info like learning style + year level.
  const buildContext = (name) => {
    const matched = name?.trim()
      ? courses.find(c => c.name?.trim().toLowerCase() === name.trim().toLowerCase())
      : null
    return hydrateCourseContext(matched, { firstName, yearLevel, learningStyle, schoolType, assignments })
  }
  const [mode, setMode] = useState('hub')
  const [outlines, setOutlines] = useState(loadOutlines)
  const [activeOutline, setActiveOutline] = useState(null)
  const [draftingSection, setDraftingSection] = useState(null) // { section, index }
  const [topic, setTopic] = useState('')
  const [essayType, setEssayType] = useState('argumentative')
  const [wordCount, setWordCount] = useState(1000)
  const [requirements, setRequirements] = useState('')
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingTheses, setLoadingTheses] = useState(false)
  const [thesisOptions, setThesisOptions] = useState(null)
  const [selectedThesis, setSelectedThesis] = useState(null)
  const [error, setError] = useState('')

  const handleTheses = async () => {
    if (!topic.trim()) { setError('Enter an essay topic.'); return }
    setLoadingTheses(true)
    setError('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/essay-thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic, essayType, wordCount, requirements, courseName, thesis: selectedThesis, courseContext: buildContext(courseName) })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')
      setThesisOptions(json.theses)
      setSelectedThesis(json.theses[0])
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoadingTheses(false)
    }
  }

  const handleGenerate = async () => {
    if (!canUseAI()) { onShowPaywall?.('pro'); return }
    if (!topic.trim()) { setError('Enter an essay topic.'); return }
    setLoading(true)
    setError('')
    track('essay_outline_started', { essayType, wordCount, hasThesis: !!selectedThesis })

    try {
      const token = await getAccessToken()

      const res = await fetch('/api/essay-outline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ topic, essayType, wordCount, requirements, courseName, thesis: selectedThesis, courseContext: buildContext(courseName) })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate outline')
      if (json.needsMoreContext) {
        setError(json.message || 'Add your assignment prompt so the outline matches your professor\'s actual ask.')
        return
      }

      incrementAIQuery()
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'essayArchitect' } }))
      track('essay_outline_generated', { topic: topic || null })
      const entry = {
        id: Date.now().toString(),
        topic,
        outline: json.outline,
        createdAt: new Date().toISOString()
      }
      const updated = [entry, ...outlines]
      setOutlines(updated)
      saveOutlines(updated)
      setActiveOutline(entry)
      setMode('result')
    } catch (err) {
      track('essay_outline_error', { error: err.message ?? 'unknown' })
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'drafting' && activeOutline && draftingSection) {
    return (
      <div style={{ maxWidth: 1024, margin: '0 auto', padding: 12 }}>
        <SectionDraftView
          section={draftingSection.section}
          sectionIdx={draftingSection.index}
          outline={activeOutline.outline}
          buildContext={buildContext}
          courseName={courseName || activeOutline.outline?.courseName}
          requirements={requirements}
          onBack={() => { setDraftingSection(null); setMode('result') }}
        />
      </div>
    )
  }

  if (mode === 'result' && activeOutline) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px', animation: 'ea-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{`@keyframes ea-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <OutlineView
          outline={activeOutline.outline}
          onBack={() => { setMode('hub'); setActiveOutline(null) }}
          onDraftSection={(section, index) => { setDraftingSection({ section, index }); setMode('drafting') }}
        />
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px', animation: 'ea-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{`@keyframes ea-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setMode('hub')} style={{
            background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
            padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#6B6B6B'
          }}>
            Back
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>New Essay Outline</h2>
        </div>

        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, padding: 20, marginBottom: 16
        }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
            Essay Type
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {ESSAY_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setEssayType(t.value)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: essayType === t.value ? '2px solid #3B61C4' : '1px solid rgba(0,0,0,0.12)',
                  background: essayType === t.value ? '#3B61C4' : '#fff',
                  color: essayType === t.value ? '#fff' : '#6B6B6B',
                  fontWeight: essayType === t.value ? 600 : 400
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
            Topic or Prompt
          </label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. The impact of social media on mental health"
            style={{
              width: '100%', minHeight: 90, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)',
              padding: '12px 14px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit',
              color: '#111', background: '#F7F6F3', boxSizing: 'border-box', outline: 'none',
              marginBottom: 16
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
                Word Count
              </label>
              <select
                value={wordCount}
                onChange={e => setWordCount(Number(e.target.value))}
                style={{
                  width: '100%', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)',
                  padding: '10px 12px', fontSize: 13, color: '#111', background: '#fff', outline: 'none'
                }}
              >
                {WORD_COUNTS.map(w => <option key={w} value={w}>{w.toLocaleString()} words</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
                Course (optional)
              </label>
              <input
                value={courseName}
                onChange={e => setCourseName(e.target.value)}
                placeholder="e.g. PSYC 101"
                style={{
                  width: '100%', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)',
                  padding: '10px 12px', fontSize: 13, color: '#111', background: '#fff',
                  outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: '#111', display: 'block', marginBottom: 8 }}>
            Special Requirements (optional)
          </label>
          <input
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            placeholder="e.g. Must include 3 peer-reviewed sources, APA format"
            style={{
              width: '100%', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)',
              padding: '10px 12px', fontSize: 13, color: '#111', background: '#fff',
              outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        {error && (
          <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {!thesisOptions && (
          <button
            onClick={handleTheses}
            disabled={loadingTheses}
            style={{
              width: '100%', background: loadingTheses ? '#6B6B6B' : '#3B61C4', color: '#fff',
              border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 600,
              cursor: loadingTheses ? 'not-allowed' : 'pointer', marginBottom: 0
            }}
          >
            {loadingTheses ? 'Generating thesis options...' : 'Continue'}
          </button>
        )}

        {thesisOptions && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 10 }}>Pick a thesis</div>
            {thesisOptions.map((t, i) => (
              <div
                key={i}
                onClick={() => setSelectedThesis(t)}
                style={{
                  border: selectedThesis === t ? '2px solid #3B61C4' : '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                  background: selectedThesis === t ? '#EEF2FF' : '#fff', fontSize: 13, color: '#111', lineHeight: 1.5
                }}
              >
                {t}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => { setThesisOptions(null); setSelectedThesis(null) }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)',
                  background: '#fff', color: '#6B6B6B', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || !selectedThesis}
                style={{
                  flex: 2, background: loading ? '#6B6B6B' : '#3B61C4', color: '#fff',
                  border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Building outline...' : 'Build outline'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px', animation: 'ea-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{`
        @keyframes ea-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .ea-create-btn { transition: filter 0.12s, transform 0.1s !important; }
        .ea-create-btn:hover { filter: brightness(1.06) !important; }
        .ea-create-btn:active { transform: scale(0.99) !important; }
        .ea-card:active { transform: scale(0.99) !important; }
      `}</style>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111', margin: '0 0 6px' }}>Essay Architect</h1>
        <p style={{ fontSize: 14, color: '#6B6B6B', margin: 0 }}>
          Generate a structured outline for any essay or paper in seconds.
        </p>
      </div>

      <button
        onClick={() => { setMode('create'); setTopic(''); setRequirements(''); setCourseName(''); setError(''); setThesisOptions(null); setSelectedThesis(null) }}
        className="ea-create-btn"
        style={{
          width: '100%', background: '#3B61C4', color: '#fff', border: 'none',
          borderRadius: 12, padding: '16px', fontSize: 15, fontWeight: 600,
          cursor: 'pointer', marginBottom: 28, textAlign: 'left'
        }}
      >
        Create new outline
        <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Argumentative, analytical, research, and more</div>
      </button>

      {outlines.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#6B6B6B', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Saved Outlines
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {outlines.map(item => (
              <OutlineCard
                key={item.id}
                item={item}
                onClick={() => { setActiveOutline(item); setMode('result') }}
                onDelete={id => { const updated = outlines.filter(o => o.id !== id); setOutlines(updated); saveOutlines(updated) }}
              />
            ))}
          </div>
        </div>
      )}

      {outlines.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px', color: '#6B6B6B',
          border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 14
        }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: '#C0C0C0' }}>A</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No outlines yet</div>
          <div style={{ fontSize: 13 }}>Create your first essay outline above</div>
        </div>
      )}
    </div>
  )
}
