import { useState, useRef } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'
import Spinner from './ui/spinner'
import { extractText } from '../utils/extractText'

// onClose(): cancel
// onStart({ questions, courseName, timerMinutes }): launch exam screen
export default function PracticeExamModal({ course, onStart, onClose, onShowPaywall }) {
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'paste'
  const [file, setFile] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [contextNote, setContextNote] = useState('')
  const [length, setLength] = useState(20)
  const [timerOn, setTimerOn] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(30)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const sourceText = activeTab === 'upload' ? extractedText : pastedText
  const hasEnoughText = sourceText.trim().length >= 50

  async function handleFile(f) {
    if (!f) return
    setFile(f)
    setError('')
    setExtracting(true)
    try {
      const text = await extractText(f)
      if (!text || text.trim().length < 50) {
        setError('Could not extract enough text from this file. Try a different file or paste your notes.')
        setExtractedText('')
        return
      }
      setExtractedText(text)
    } catch (e) {
      setError(e.message ?? 'Failed to read file.')
      setExtractedText('')
    } finally {
      setExtracting(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  async function handleGenerate() {
    setError('')
    if (!hasEnoughText) {
      setError('Add at least a few paragraphs of notes, past exam text, or slides first.')
      return
    }
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setGenerating(true)
    try {
      setLoadingMsg('Extracting questions from your materials…')
      const token = await getAccessToken()
      const res = await fetch('/api/generate-practice-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: sourceText,
          courseName: course?.name ?? null,
          examLength: length,
          context: contextNote.trim() || null,
        }),
      })
      setLoadingMsg('Generating additional questions…')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `API returned ${res.status}`)
      if (!data.questions?.length) throw new Error('No questions returned. Try a different source.')
      await incrementAIQuery()
      onStart({
        questions: data.questions,
        courseName: course?.name ?? null,
        courseId: course?.id ?? null,
        timerMinutes: timerOn ? timerMinutes : null,
        sourceLabel: file?.name ?? (activeTab === 'paste' ? 'Pasted notes' : 'Source'),
      })
    } catch (e) {
      setError(e.message ?? 'Failed to generate exam.')
      setLoadingMsg('')
    } finally {
      setGenerating(false)
    }
  }

  const inputStyle = { background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#1A1A1A', outline: 'none', width: '100%', boxSizing: 'border-box', colorScheme: 'light' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ color: '#1A1A1A', fontWeight: 700, fontSize: 18, margin: 0 }}>Take Practice Exam</h2>
              {course?.name && <p style={{ margin: '4px 0 0', color: '#6B6B6B', fontSize: 13 }}>{course.name}</p>}
            </div>
            <button onClick={onClose} disabled={generating} style={{ background: 'none', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', color: '#9B9B9B', padding: 4 }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>{error}</div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 4 }}>
            {[['upload', 'Upload past exam / notes'], ['paste', 'Paste text']].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setError('') }}
                disabled={generating}
                style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#1A1A1A' : '#9B9B9B', boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'upload' && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.pptx" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onClick={() => !generating && fileRef.current?.click()}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 24px', borderRadius: 16, border: `2px dashed ${dragging ? '#3B61C4' : 'rgba(0,0,0,0.12)'}`, background: dragging ? 'rgba(59,97,196,0.04)' : '#FAFAF8', cursor: generating ? 'not-allowed' : 'pointer', userSelect: 'none' }}
              >
                {extracting ? (
                  <><Spinner /><p style={{ margin: 0, color: '#6B6B6B', fontSize: 14 }}>Reading {file?.name}…</p></>
                ) : extractedText ? (
                  <>
                    <svg width="32" height="32" fill="none" stroke="#16A34A" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p style={{ margin: 0, color: '#1A1A1A', fontWeight: 600, fontSize: 14 }}>{file?.name}</p>
                    <p style={{ margin: 0, color: '#6B6B6B', fontSize: 12 }}>{extractedText.length.toLocaleString()} characters extracted. Click to replace.</p>
                  </>
                ) : (
                  <>
                    <svg width="32" height="32" fill="none" stroke="#9B9B9B" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <p style={{ margin: 0, color: '#1A1A1A', fontWeight: 600, fontSize: 14 }}>Drop your past exam, notes, or slides</p>
                    <p style={{ margin: 0, color: '#6B6B6B', fontSize: 12 }}>PDF, DOCX, PPTX, or TXT</p>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'paste' && (
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              disabled={generating}
              placeholder="Paste your notes, past exam questions, or slide content here…"
              style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          )}

          {/* Optional context */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Optional context</label>
            <input
              value={contextNote}
              onChange={e => setContextNote(e.target.value)}
              disabled={generating}
              placeholder='e.g. "this exam is 50 multiple choice, no short answer"'
              style={inputStyle}
            />
          </div>

          {/* Length picker */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Exam length</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[10, 20, 30].map(n => (
                <button
                  key={n}
                  onClick={() => setLength(n)}
                  disabled={generating}
                  style={{ flex: 1, padding: '14px', borderRadius: 12, border: length === n ? '2px solid #3B61C4' : '1px solid rgba(0,0,0,0.12)', background: length === n ? 'rgba(59,97,196,0.06)' : '#fff', color: length === n ? '#3B61C4' : '#1A1A1A', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, transition: 'all 0.15s' }}
                >
                  {n} questions
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: generating ? 'not-allowed' : 'pointer' }}>
              <input type="checkbox" checked={timerOn} onChange={e => setTimerOn(e.target.checked)} disabled={generating} style={{ width: 16, height: 16, accentColor: '#3B61C4' }} />
              <span style={{ fontSize: 14, color: '#1A1A1A', fontWeight: 600 }}>Time the exam</span>
              {timerOn && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                  <input type="number" value={timerMinutes} onChange={e => setTimerMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))} disabled={generating} style={{ ...inputStyle, width: 70, padding: '6px 8px', textAlign: 'center' }} />
                  <span style={{ color: '#6B6B6B', fontSize: 13 }}>minutes</span>
                </div>
              )}
            </label>
          </div>

          {generating && (
            <div style={{ marginTop: 24, padding: 16, background: 'rgba(59,97,196,0.06)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Spinner />
              <span style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 500 }}>{loadingMsg || 'Working…'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} disabled={generating} style={{ padding: '10px 16px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, color: '#6B6B6B', fontWeight: 600, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button onClick={handleGenerate} disabled={generating || !hasEnoughText} style={{ padding: '10px 20px', background: hasEnoughText && !generating ? '#3B61C4' : '#9B9B9B', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: hasEnoughText && !generating ? 'pointer' : 'not-allowed' }}>
            {generating ? 'Generating…' : `Generate ${length}-question exam`}
          </button>
        </div>
      </div>
    </div>
  )
}
