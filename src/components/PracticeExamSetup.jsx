import { useState, useRef } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseFeature, incrementFeatureUsage, getActivePlan } from '../lib/subscription'
import { getCachedCoachPlan, getCachedPracticeExams } from '../lib/db'
import { extractText } from '../utils/extractText'
import Spinner from './ui/spinner'
import { track } from '../lib/analytics'

const D = {
  bg: '#F7F6F3',
  bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)',
  borderFocus: '#3B61C4',
  text: '#1A1A1A',
  muted: '#6B6B6B',
  dim: '#9B9B9B',
  accent: '#3B61C4',
}

const inputStyle = {
  background: '#fff',
  border: `1px solid ${D.border}`,
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  color: D.text,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  colorScheme: 'light',
}

function buildPersonalizationContext(course) {
  if (!course?.id) return null
  const parts = []
  const coach = getCachedCoachPlan(course.id)
  if (coach?.formData?.studyGoal) parts.push(`Study goal: ${coach.formData.studyGoal}`)
  if (coach?.formData?.priority) parts.push(`Priority topics: ${coach.formData.priority}`)
  if (coach?.struggles?.length) parts.push(`Known weak areas: ${coach.struggles.join(', ')}`)
  if (course.targetGrade) parts.push(`Target grade: ${course.targetGrade}%`)
  if (course.assignments?.length) {
    const topics = course.assignments.map(a => a.name || a.title).filter(Boolean).slice(0, 8)
    if (topics.length) parts.push(`Course topics/assignments: ${topics.join(', ')}`)
  }
  const exams = getCachedPracticeExams(course.id)
  if (exams.length) {
    const scores = exams.slice(0, 5).map(e => e.score).filter(s => s !== null && s !== undefined)
    if (scores.length) parts.push(`Past practice exam scores (recent first): ${scores.join('%, ')}%`)
    // Aggregate weak topics from recent exams
    const weakTopics = new Map()
    for (const exam of exams.slice(0, 3)) {
      if (!Array.isArray(exam.questions) || !Array.isArray(exam.answers)) continue
      exam.questions.forEach((q, i) => {
        if (q.type !== 'multiple_choice') return
        if (exam.answers[i] !== q.answer) {
          const t = q.topic || 'General'
          weakTopics.set(t, (weakTopics.get(t) ?? 0) + 1)
        }
      })
    }
    const sorted = [...weakTopics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (sorted.length) parts.push(`Most missed topics in past exams: ${sorted.map(([t]) => t).join(', ')}`)
  }
  return parts.length ? parts.join('\n') : null
}

const LENGTHS = [30, 45, 60]
const MINS_PER_Q = 1.5

export default function PracticeExamSetup({ courses, onBack, onStart, onShowPaywall }) {
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? null)
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'paste' | 'describe'
  const [file, setFile] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [pastedText, setPastedText] = useState('')
  const [description, setDescription] = useState('')
  const [length, setLength] = useState(30)
  const [customLength, setCustomLength] = useState('')
  const [timerOn, setTimerOn] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(null) // null = using suggestion
  const [timerOverride, setTimerOverride] = useState('')
  const [generating, setGenerating] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? courses[0] ?? null
  const effectiveLength = length === 'custom' ? (parseInt(customLength) || 30) : length
  const suggestedMinutes = Math.round(effectiveLength * MINS_PER_Q)
  const effectiveTimerMinutes = timerOverride ? (parseInt(timerOverride) || suggestedMinutes) : suggestedMinutes

  const sourceText = activeTab === 'upload' ? extractedText : activeTab === 'paste' ? pastedText : ''
  const descriptionText = activeTab === 'describe' ? description : description
  const hasSource = sourceText.trim().length >= 50 || descriptionText.trim().length >= 30

  async function handleFile(f) {
    if (!f) return
    setFile(f); setError(''); setExtracting(true)
    try {
      const text = await extractText(f)
      if (!text || text.trim().length < 50) {
        setError('Could not extract enough text. Try a different file or paste your notes.')
        setExtractedText(''); return
      }
      setExtractedText(text)
    } catch (e) {
      setError(e.message ?? 'Failed to read file.')
      setExtractedText('')
    } finally { setExtracting(false) }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  async function handleGenerate() {
    setError('')
    if (!selectedCourse) { setError('Select a course first.'); return }
    if (!hasSource) { setError('Add source material first: upload a file, paste notes, or describe your exam.'); return }

    // Paywall check for free users
    const plan = getActivePlan()
    if (plan === 'free') {
      const { allowed } = canUseFeature('practiceExam')
      if (!allowed) { onShowPaywall?.('practice_exam'); return }
    }

    setGenerating(true)
    try {
      setLoadingMsg('Extracting questions from your materials…')
      const token = await getAccessToken()

      const personalizationContext = buildPersonalizationContext(selectedCourse)

      const body = {
        text: sourceText || null,
        description: descriptionText.trim() || null,
        courseName: selectedCourse.name,
        examLength: effectiveLength,
        personalization: personalizationContext,
      }

      setLoadingMsg('Building your practice exam…')
      const res = await fetch('/api/generate-practice-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })

      setLoadingMsg('Personalizing questions for your course…')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `API returned ${res.status}`)
      if (!data.questions?.length) throw new Error('No questions returned. Try different source material.')

      if (plan === 'free') incrementFeatureUsage('practiceExam')

      track('practice_exam_started', { questionCount: data.questions.length, courseName: selectedCourse.name, timed: timerOn, plan })

      onStart({
        questions: data.questions,
        course: selectedCourse,
        courseName: selectedCourse.name,
        courseId: selectedCourse.id,
        timerMinutes: timerOn ? effectiveTimerMinutes : null,
      })
    } catch (e) {
      setError(e.message ?? 'Failed to generate exam. Please try again.')
    } finally {
      setGenerating(false)
      setLoadingMsg('')
    }
  }

  const tabBtn = (tab, label) => (
    <button
      key={tab}
      onClick={() => { setActiveTab(tab); setError('') }}
      disabled={generating}
      style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? D.text : D.dim, boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s', fontFamily: 'inherit' }}
    >{label}</button>
  )

  return (
    <div style={{ minHeight: '100%', background: D.bg, padding: '32px 24px 80px', animation: 'pes-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{`@keyframes pes-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ maxWidth: 660, margin: '0 auto' }}>

        {/* Back nav */}
        <button
          onClick={onBack}
          disabled={generating}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', color: D.muted, fontSize: 13, fontWeight: 600, padding: '4px 0', marginBottom: 28, fontFamily: 'inherit' }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Practice Exams
        </button>

        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>Set up your exam</h1>
        <p style={{ margin: '0 0 32px', fontSize: 14, color: D.muted }}>Set your options below, then generate.</p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>
        )}

        {/* ── Step 1: Course ─────────────────────────────────────────────── */}
        <Section label="1. Choose a course">
          <select
            value={selectedCourseId ?? ''}
            onChange={e => setSelectedCourseId(e.target.value)}
            disabled={generating}
            style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%239B9B9B' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36, cursor: generating ? 'not-allowed' : 'pointer' }}
          >
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedCourse && buildPersonalizationContext(selectedCourse) && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: D.accent, fontWeight: 500 }}>
              ✦ Using your grades, coach plan, and exam history for this course
            </p>
          )}
        </Section>

        {/* ── Step 2: Source material ────────────────────────────────────── */}
        <Section label="2. Add your source material">
          <div style={{ display: 'flex', gap: 4, background: D.bg, border: `1px solid ${D.border}`, borderRadius: 12, padding: 4, marginBottom: 16 }}>
            {tabBtn('upload', 'Upload file')}
            {tabBtn('paste', 'Paste text')}
            {tabBtn('describe', 'Describe it')}
          </div>

          {activeTab === 'upload' && (
            <>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.pptx" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onClick={() => !generating && fileRef.current?.click()}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '36px 24px', borderRadius: 14, border: `2px dashed ${dragging ? D.accent : 'rgba(0,0,0,0.12)'}`, background: dragging ? 'rgba(59,97,196,0.04)' : '#FAFAF8', cursor: generating ? 'not-allowed' : 'pointer', userSelect: 'none', transition: 'all 0.15s' }}
              >
                {extracting ? (
                  <><Spinner /><p style={{ margin: 0, color: D.muted, fontSize: 13 }}>Reading {file?.name}…</p></>
                ) : extractedText ? (
                  <>
                    <svg width="28" height="28" fill="none" stroke="#16A34A" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p style={{ margin: 0, color: D.text, fontWeight: 600, fontSize: 13 }}>{file?.name}</p>
                    <p style={{ margin: 0, color: D.muted, fontSize: 12 }}>{extractedText.length.toLocaleString()} characters. Click to replace.</p>
                  </>
                ) : (
                  <>
                    <svg width="28" height="28" fill="none" stroke={D.dim} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <p style={{ margin: 0, color: D.text, fontWeight: 600, fontSize: 13 }}>Drop your past exam, notes, or slides</p>
                    <p style={{ margin: 0, color: D.dim, fontSize: 12 }}>PDF, DOCX, PPTX, or TXT</p>
                  </>
                )}
              </div>
              {error && !extractedText && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#DC2626' }}>{error}</p>
              )}
            </>
          )}

          {activeTab === 'paste' && (
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              disabled={generating}
              placeholder="Paste your notes, past exam questions, or slide content here…"
              style={{ ...inputStyle, minHeight: 200, resize: 'vertical', lineHeight: 1.55 }}
            />
          )}

          {activeTab === 'describe' && (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={generating}
              placeholder={`Describe your exam and make sure to include the topics it covers.\n\ne.g. "50 multiple choice on chapters 4–7. Topics include: cell division, protein synthesis, enzyme kinetics. Prof usually focuses on diagram interpretation and definitions."`}
              style={{ ...inputStyle, minHeight: 200, resize: 'vertical', lineHeight: 1.55 }}
            />
          )}

          {/* Allow additional description alongside upload/paste */}
          {activeTab !== 'describe' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                Additional context <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={generating}
                placeholder='e.g. "focus on chapters 5–8, lots of definitions, prof likes case studies"'
                style={inputStyle}
              />
            </div>
          )}
        </Section>

        {/* ── Step 3: Length ─────────────────────────────────────────────── */}
        <Section label="3. Exam length">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LENGTHS.map(n => (
              <button
                key={n}
                onClick={() => { setLength(n); setCustomLength('') }}
                disabled={generating}
                style={{ flex: 1, minWidth: 80, padding: '13px 8px', borderRadius: 12, border: length === n ? `2px solid ${D.accent}` : `1px solid ${D.border}`, background: length === n ? 'rgba(59,97,196,0.06)' : '#fff', color: length === n ? D.accent : D.text, cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, transition: 'all 0.15s', fontFamily: 'inherit' }}
              >
                {n} <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>Qs</span>
              </button>
            ))}
            <div style={{ flex: 1, minWidth: 80, position: 'relative' }}>
              <input
                type="number"
                value={customLength}
                onChange={e => { setCustomLength(e.target.value); setLength('custom') }}
                onFocus={() => setLength('custom')}
                disabled={generating}
                placeholder="Custom"
                min={5} max={100}
                style={{ ...inputStyle, padding: '13px 8px', textAlign: 'center', fontWeight: 700, fontSize: 15, border: length === 'custom' ? `2px solid ${D.accent}` : `1px solid ${D.border}`, background: length === 'custom' ? 'rgba(59,97,196,0.06)' : '#fff', color: length === 'custom' ? D.accent : D.text, borderRadius: 12 }}
              />
            </div>
          </div>
        </Section>

        {/* ── Step 4: Timer ──────────────────────────────────────────────── */}
        <Section label="4. Timer (optional)">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: generating ? 'not-allowed' : 'pointer', marginBottom: timerOn ? 14 : 0 }}>
            <input
              type="checkbox"
              checked={timerOn}
              onChange={e => setTimerOn(e.target.checked)}
              disabled={generating}
              style={{ width: 17, height: 17, accentColor: D.accent, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, color: D.text, fontWeight: 600 }}>Time this exam</span>
          </label>

          {timerOn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ padding: '10px 16px', background: 'rgba(59,97,196,0.06)', border: `1px solid rgba(59,97,196,0.18)`, borderRadius: 10, fontSize: 13, color: D.accent, fontWeight: 600 }}>
                Suggested: {suggestedMinutes} min ({MINS_PER_Q} min/question)
              </div>
              {!timerOverride ? (
                <button
                  onClick={() => setTimerOverride(String(suggestedMinutes))}
                  style={{ padding: '10px 14px', background: '#fff', border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, color: D.muted, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Change
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={timerOverride}
                    onChange={e => setTimerOverride(e.target.value)}
                    min={1} max={300}
                    style={{ ...inputStyle, width: 72, padding: '9px 10px', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 13, color: D.muted }}>min</span>
                  <button onClick={() => setTimerOverride('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.dim, fontSize: 12 }}>Use suggested</button>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Generate ───────────────────────────────────────────────────── */}
        {generating && (
          <div style={{ marginBottom: 16, padding: '14px 18px', background: 'rgba(59,97,196,0.06)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Spinner />
            <span style={{ color: D.text, fontSize: 13.5, fontWeight: 500 }}>{loadingMsg || 'Working…'}</span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating || !hasSource || !selectedCourse}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 24px', background: hasSource && selectedCourse && !generating ? D.accent : '#C4C4C4', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: hasSource && selectedCourse && !generating ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'opacity 0.15s, background 0.15s' }}
          onMouseEnter={e => { if (hasSource && !generating) e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {generating ? 'Generating…' : `Generate ${effectiveLength}-question Exam`}
          {!generating && (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          )}
        </button>

      </div>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
