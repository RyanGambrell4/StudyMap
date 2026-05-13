import { useState, useRef, useEffect } from 'react'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'

const EVENT_TYPES = ['Exam', 'Quiz', 'Midterm', 'Final Exam', 'Assignment', 'Project', 'Lab', 'Reading', 'Other']
const NEUTRAL_COLOR = { dot: '#64748b' }

async function extractEventsFromAPI(text) {
  const token = await getAccessToken()
  const res = await fetch('/api/extract-syllabus-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `API error ${res.status}`)
  }
  const data = await res.json()
  return data.events ?? []
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text
}

// ─── Props ────────────────────────────────────────────────────────────────────
// courses: array of course objects
// initialCourseIdx: number | null  (null = "All Courses / General")
// onConfirm(items, selectedCourseIdx): called on confirm
// onClose(): called on cancel/close
export default function SyllabusUploadModal({ courses, initialCourseIdx, initialFile, onConfirm, onClose, onShowPaywall }) {
  const [selectedCourseIdx, setSelectedCourseIdx] = useState(initialCourseIdx ?? null)
  const [activeTab, setActiveTab] = useState('pdf')
  const [step, setStep] = useState('input')   // 'input' | 'loading' | 'review'
  const [pastedText, setPastedText] = useState('')
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  // Auto-process a file dropped on the import band before the modal opened
  useEffect(() => {
    if (initialFile) processFile(initialFile)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedColor =
    selectedCourseIdx !== null ? (courses[selectedCourseIdx]?.color ?? NEUTRAL_COLOR) : NEUTRAL_COLOR

  // ── AI extraction ──
  const runAIExtraction = async (text) => {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setStep('loading')
    setError('')
    try {
      const events = await extractEventsFromAPI(text)
      incrementAIQuery()
      if (!events.length) {
        setError('No events found. Make sure the text contains dates and deadlines.')
        setStep('input')
        return
      }
      const mapped = events.map((e, i) => ({
        id: `ai-${Date.now()}-${i}`,
        name: e.name ?? 'Untitled',
        date: e.date ?? '',
        type: EVENT_TYPES.includes(e.type) ? e.type : 'Other',
        weight: e.weight ?? null,
        notes: e.notes ?? null,
      }))
      setItems(mapped)
      setStep('review')
    } catch (err) {
      setError(`Failed to extract events: ${err.message}`)
      setStep('input')
    }
  }

  const processFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }
    setError('')
    setStep('loading')
    try {
      const text = await extractPdfText(file)
      await runAIExtraction(text)
    } catch (err) {
      setError(`PDF error: ${err.message}`)
      setStep('input')
    }
  }

  const handleFileInput = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
    else setError('Please drop a PDF file.')
  }

  const handlePasteConfirm = () => {
    if (!pastedText.trim()) { setError('Paste some text first.'); return }
    runAIExtraction(pastedText)
  }

  const update = (id, field, value) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))

  // ── render ──
  const inputStyle = { background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#1A1A1A', outline: 'none', width: '100%', boxSizing: 'border-box', colorScheme: 'light' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ color: '#1A1A1A', fontWeight: 700, fontSize: 17, margin: 0 }}>Import Syllabus</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', padding: 4 }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Which course is this syllabus for?</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', backgroundColor: selectedColor.dot, pointerEvents: 'none' }} />
              <select
                value={selectedCourseIdx ?? 'all'}
                onChange={e => setSelectedCourseIdx(e.target.value === 'all' ? null : parseInt(e.target.value))}
                style={{ ...inputStyle, paddingLeft: 30, colorScheme: 'light' }}
              >
                <option value="all">All Courses / General</option>
                {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {step === 'input' && (
            <div style={{ padding: 24 }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>{error}</div>
              )}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 4 }}>
                {[['pdf', 'Upload PDF'], ['paste', 'Paste Text']].map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setError('') }}
                    style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#1A1A1A' : '#9B9B9B', boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'pdf' && (
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileRef.current?.click()}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '64px 32px', borderRadius: 16, border: `2px dashed ${dragging ? '#3B61C4' : 'rgba(0,0,0,0.12)'}`, background: dragging ? 'rgba(59,97,196,0.04)' : '#FAFAF8', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dragging ? 'rgba(59,97,196,0.1)' : 'rgba(0,0,0,0.05)' }}>
                    <svg width="28" height="28" fill="none" stroke={dragging ? '#3B61C4' : '#9B9B9B'} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 600, fontSize: 15, color: dragging ? '#3B61C4' : '#1A1A1A', margin: '0 0 4px' }}>{dragging ? 'Drop to upload' : 'Drop your PDF here'}</p>
                    <p style={{ color: '#9B9B9B', fontSize: 13, margin: 0 }}>or click to browse. PDF files only.</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={handleFileInput} />
                </div>
              )}

              {activeTab === 'paste' && (
                <div>
                  <p style={{ color: '#6B6B6B', fontSize: 13, margin: '0 0 12px' }}>Paste the section of your syllabus with assignment dates, exams, and deadlines.</p>
                  <textarea
                    value={pastedText}
                    onChange={e => { setPastedText(e.target.value); setError('') }}
                    placeholder="Paste syllabus text here..."
                    autoFocus
                    style={{ ...inputStyle, minHeight: 320, resize: 'none', padding: '12px 14px' }}
                  />
                </div>
              )}
            </div>
          )}

          {step === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(59,97,196,0.2)', borderTopColor: '#3B61C4', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#3B61C4', fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>AI is reading your syllabus…</p>
                <p style={{ color: '#9B9B9B', fontSize: 12, margin: 0 }}>Extracting deadlines, exams, and assignments</p>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ color: '#1A1A1A', fontWeight: 600, fontSize: 15, margin: '0 0 4px' }}>
                  We found <span style={{ color: '#3B61C4' }}>{items.length}</span> event{items.length !== 1 ? 's' : ''} in your syllabus.
                </p>
                <p style={{ color: '#6B6B6B', fontSize: 13, margin: '0 0 6px' }}>Review and edit before adding to your calendar.</p>
                <button onClick={() => { setStep('input'); setItems([]); setError('') }} style={{ background: 'none', border: 'none', color: '#9B9B9B', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Start over</button>
              </div>

              {items.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#9B9B9B', fontSize: 14 }}>All items removed.</p>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.map(item => (
                  <div key={item.id} style={{ background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.07)', borderLeft: `3px solid ${selectedColor.dot}`, borderRadius: 12, padding: 16, display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="text" value={item.name} onChange={e => update(item.id, 'name', e.target.value)} style={inputStyle} />
                        {item.weight != null && (
                          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(59,97,196,0.1)', color: '#3B61C4', border: '1px solid rgba(59,97,196,0.2)' }}>{item.weight}%</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input type="date" value={item.date} onChange={e => update(item.id, 'date', e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
                        <select value={item.type} onChange={e => update(item.id, 'type', e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 130 }}>
                          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      {item.notes && <p style={{ color: '#9B9B9B', fontSize: 11, margin: 0 }}>{item.notes}</p>}
                    </div>
                    <button onClick={() => setItems(prev => prev.filter(it => it.id !== item.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0C0C0', padding: 4, alignSelf: 'flex-start', marginTop: 2, flexShrink: 0 }}>
                      <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', padding: '16px 24px', display: 'flex', gap: 12, flexShrink: 0 }}>
          {(step === 'input' || step === 'loading') && (
            <>
              {step === 'input' && activeTab === 'paste' ? (
                <>
                  <button onClick={onClose} style={{ padding: '10px 16px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, color: '#6B6B6B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handlePasteConfirm} style={{ flex: 1, padding: '10px', background: '#3B61C4', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Extract Events</button>
                </>
              ) : (
                <button onClick={onClose} style={{ flex: 1, padding: '10px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, color: '#6B6B6B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              )}
            </>
          )}
          {step === 'review' && (
            <>
              <button onClick={onClose} style={{ padding: '10px 16px', background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, color: '#6B6B6B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => onConfirm(items, selectedCourseIdx)}
                disabled={items.length === 0}
                style={{ flex: 1, padding: '10px', background: '#3B61C4', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: items.length === 0 ? 0.4 : 1 }}
              >
                Add {items.length} Event{items.length !== 1 ? 's' : ''} to Calendar
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
