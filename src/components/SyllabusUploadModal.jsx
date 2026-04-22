import { useState, useRef } from 'react'
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
  const { useEffect } = React
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
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Import Syllabus</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Course selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Which course is this syllabus for?</label>
            <div className="relative">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none"
                style={{ backgroundColor: selectedColor.dot }}
              />
              <select
                value={selectedCourseIdx ?? 'all'}
                onChange={e => setSelectedCourseIdx(e.target.value === 'all' ? null : parseInt(e.target.value))}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-8 pr-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all">All Courses / General</option>
                {courses.map((c, i) => (
                  <option key={i} value={i}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Input step */}
          {step === 'input' && (
            <div className="p-6">
              {error && (
                <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">{error}</div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 mb-5 bg-slate-900/50 rounded-xl p-1">
                {[['pdf', 'Upload PDF'], ['paste', 'Paste Text']].map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setError('') }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* PDF tab */}
              {activeTab === 'pdf' && (
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileRef.current?.click()}
                  className={`flex flex-col items-center gap-4 py-20 px-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none ${
                    dragging
                      ? 'border-indigo-400 bg-indigo-500/10'
                      : 'border-slate-600 hover:border-indigo-500/70 hover:bg-indigo-500/5'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                    dragging ? 'bg-indigo-500/20' : 'bg-slate-700/60'
                  }`}>
                    <svg className={`w-7 h-7 transition-colors ${dragging ? 'text-indigo-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className={`font-semibold text-base transition-colors ${dragging ? 'text-indigo-300' : 'text-slate-200'}`}>
                      {dragging ? 'Drop to upload' : 'Drop your PDF here'}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">or click to browse. PDF files only.</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput} />
                </div>
              )}

              {/* Paste tab */}
              {activeTab === 'paste' && (
                <div>
                  <p className="text-slate-400 text-sm mb-3">Paste the section of your syllabus with assignment dates, exams, and deadlines.</p>
                  <textarea
                    value={pastedText}
                    onChange={e => { setPastedText(e.target.value); setError('') }}
                    placeholder="Paste syllabus text here..."
                    autoFocus
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                    style={{ minHeight: 320 }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-indigo-300 font-semibold text-sm">AI is reading your syllabus…</p>
                <p className="text-slate-500 text-xs mt-1">Extracting deadlines, exams, and assignments</p>
              </div>
            </div>
          )}

          {/* Review */}
          {step === 'review' && (
            <div className="p-6">
              <div className="mb-5">
                <p className="text-white font-semibold text-base">
                  We found{' '}
                  <span className="text-indigo-400">{items.length}</span>{' '}
                  event{items.length !== 1 ? 's' : ''} in your syllabus.
                </p>
                <p className="text-slate-400 text-sm mt-1">Review and edit before adding to your calendar.</p>
                <button
                  onClick={() => { setStep('input'); setItems([]); setError('') }}
                  className="text-xs text-slate-500 hover:text-slate-300 underline mt-2 block"
                >
                  Start over
                </button>
              </div>

              {items.length === 0 && (
                <p className="text-center py-10 text-slate-600 text-sm">All items removed.</p>
              )}

              <div className="space-y-3">
                {items.map(item => (
                  <div
                    key={item.id}
                    className="bg-slate-700/40 border border-slate-600/60 rounded-xl p-4 flex gap-3"
                    style={{ borderLeftWidth: 3, borderLeftColor: selectedColor.dot }}
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => update(item.id, 'name', e.target.value)}
                          className="flex-1 bg-slate-800/60 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {item.weight != null && (
                          <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-700/40">
                            {item.weight}%
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="date"
                          value={item.date}
                          onChange={e => update(item.id, 'date', e.target.value)}
                          className="flex-1 min-w-[130px] bg-slate-800/60 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          style={{ colorScheme: 'dark' }}
                        />
                        <select
                          value={item.type}
                          onChange={e => update(item.id, 'type', e.target.value)}
                          className="flex-1 min-w-[130px] bg-slate-800/60 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          style={{ colorScheme: 'dark' }}
                        >
                          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      {item.notes && (
                        <p className="text-slate-500 text-xs px-1">{item.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setItems(prev => prev.filter(it => it.id !== item.id))}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1 self-start mt-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-700 px-6 py-4 flex gap-3 shrink-0">
          {(step === 'input' || step === 'loading') && (
            <>
              {step === 'input' && activeTab === 'paste' ? (
                <>
                  <button onClick={onClose} className="px-4 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl text-sm transition-colors">
                    Cancel
                  </button>
                  <button onClick={handlePasteConfirm} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                    Extract Events
                  </button>
                </>
              ) : (
                <button onClick={onClose} className="flex-1 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              )}
            </>
          )}
          {step === 'review' && (
            <>
              <button onClick={onClose} className="px-4 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl text-sm transition-colors">
                Cancel
              </button>
              <button
                onClick={() => onConfirm(items, selectedCourseIdx)}
                disabled={items.length === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
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
