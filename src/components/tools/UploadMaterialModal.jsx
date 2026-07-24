import { useState, useRef, useEffect } from 'react'
import { T, SANS, courseColor } from '../../theme/tokens'
import { getCachedStudyTools, saveStudyTools } from '../../lib/db'
import { getAccessToken } from '../../lib/supabase'
import { extractText } from '../../utils/extractText'
import { canUseAI, incrementAIQuery, getActivePlan } from '../../lib/subscription'
import { sortCardsByDue } from '../../lib/sm2'
import { track } from '../../lib/analytics'
import imageCompression from 'browser-image-compression'
import Spinner from '../ui/spinner'

// Upload Material — the complex-tool variant of ToolModal.
// - Same header + course pill + change link as ToolModal
// - Segmented control (File / Scan / Audio / Paste / YouTube)
// - Exactly ONE input method visible at a time
// - Single action button ("Generate flashcards") with an output selector (Flashcards / Quiz / Timed)
// - "Previously generated" line at the bottom
//
// Props:
//   courses, defaultCourseIdx, onClose, onShowPaywall
//   onGenerated({ flashcards, quiz, mode, courseIdx }) — fired when generation completes
const TABS = ['File', 'Scan', 'Audio', 'Paste', 'YouTube']
const OUTPUT_MODES = ['Flashcards', 'Quiz', 'Timed']

const UPLOAD_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v12m0-12l-4 4m4-4l4 4M4 18v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
  </svg>
)

export default function UploadMaterialModal({ courses, defaultCourseIdx = 0, onClose, onShowPaywall, onGenerated }) {
  const [courseIdx, setCourseIdx] = useState(defaultCourseIdx)
  const [showPicker, setShowPicker] = useState(false)
  const [tab, setTab] = useState('File')
  const [outputMode, setOutputMode] = useState('Flashcards')

  const [file, setFile] = useState(null)
  const [pastedText, setPastedText] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false)
  const [extractBusy, setExtractBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const fileInput = useRef(null)
  const scanInput = useRef(null)
  const audioInput = useRef(null)

  useEffect(() => setCourseIdx(defaultCourseIdx), [defaultCourseIdx])

  const course = courses?.[courseIdx] ?? null
  const c = course?.color ?? courseColor(courseIdx)
  const cached = getCachedStudyTools()
  const hasCached = !!cached?.flashcards?.length
  const cachedCount = cached?.flashcards?.length ?? 0

  const activeText = extractedText || pastedText
  const canGenerate = activeText.length > 50 || file || pastedText.length > 50 || youtubeUrl.trim()

  async function handleFile(f) {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'pptx'].includes(ext)) {
      setError('Please upload a PDF, .docx, or .pptx file.')
      return
    }
    setFile(f); setError(''); setExtractBusy(true); setExtractedText('')
    try {
      const text = await extractText(f)
      setExtractedText(text)
    } catch (err) {
      setError(err.message ?? 'Failed to extract text from file.')
      setFile(null)
    } finally {
      setExtractBusy(false)
    }
  }

  async function handleScan(f) {
    if (!f) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setScanBusy(true); setError('')
    try {
      const compressed = await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true })
      const mediaType = compressed.type || 'image/jpeg'
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result.split(',')[1])
        r.onerror = reject
        r.readAsDataURL(compressed)
      })
      const token = await getAccessToken()
      const res = await fetch('/api/scan-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to scan notes')
      setPastedText(data.text); setFile(null); setExtractedText('')
      incrementAIQuery()
    } catch (e) {
      setError(e.message)
    } finally {
      setScanBusy(false)
      if (scanInput.current) scanInput.current.value = ''
    }
  }

  async function handleAudio(f) {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    const allowed = ['mp3', 'm4a', 'mp4', 'wav', 'webm', 'ogg', 'oga', 'aac', 'flac']
    if (!allowed.includes(ext)) { setError('Please upload an audio file (mp3, m4a, wav, webm, ogg, aac, flac)'); return }
    if (f.size > 50 * 1024 * 1024) { setError('File too large. Max 50 MB.'); return }
    setError(''); setAudioBusy(true); setFile(null); setExtractedText('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/transcribe-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'x-file-ext': ext, Authorization: `Bearer ${token}` },
        body: f,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Transcription failed')
      setPastedText(data.transcript)
    } catch (err) {
      setError(err.message ?? 'Could not transcribe this audio file')
    } finally {
      setAudioBusy(false)
    }
  }

  async function handleYouTube() {
    if (!youtubeUrl.trim()) return
    setError(''); setImportBusy(true)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/youtube-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch transcript')
      setPastedText(data.transcript); setFile(null); setExtractedText('')
      setYoutubeUrl('')
    } catch (err) {
      setError(err.message ?? 'Could not import this video')
    } finally {
      setImportBusy(false)
    }
  }

  async function handleGenerate() {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    if (!activeText || activeText.length < 50) { setError('Not enough content to generate from.'); return }
    setGenerating(true); setError('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: activeText,
          courseName: course?.name ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `API returned ${res.status}`)
      const cards = sortCardsByDue(data.flashcards ?? [])
      const q = data.quiz ?? []
      saveStudyTools({
        flashcards: cards, quiz: q, text: activeText, courseIdx,
        fileLabel: file?.name ?? (pastedText ? 'Pasted notes' : ''),
      })
      track('flashcards_generated', { cardCount: cards.length, quizCount: q.length, plan: getActivePlan(), source: 'upload_v2' })
      await incrementAIQuery()
      onGenerated?.({ flashcards: cards, quiz: q, mode: outputMode, courseIdx })
    } catch (err) {
      setError(err.message ?? 'Failed to generate study materials. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload Material"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(28,27,24,0.42)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: SANS,
        animation: 'um-fade 180ms ease both',
      }}
    >
      <style>{`
        @keyframes um-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes um-in { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
        .um-primary { transition: background 0.15s, transform 0.1s }
        .um-primary:hover { background: ${T.blueHov} !important }
        .um-primary:active { transform: scale(0.98) }
        .um-link { color: ${T.blue}; font-weight: 600 }
        .um-link:hover { text-decoration: underline }
      `}</style>

      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 600, background: T.card,
        borderRadius: 20, border: `1px solid ${T.border}`,
        boxShadow: '0 32px 80px rgba(28,27,24,0.18)',
        padding: 24, animation: 'um-in 240ms cubic-bezier(0.16,1,0.3,1) both',
        maxHeight: '92vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: T.blueBg, color: T.blue,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{UPLOAD_ICON}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Upload Material</h2>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: T.muted, lineHeight: 1.4 }}>Turn anything into study material.</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'transparent', cursor: 'pointer', color: T.dim,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Course pill + change */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '5px 12px', borderRadius: 999,
            background: c.halo, color: c.dot,
            fontSize: 13, fontWeight: 700,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot }} />
            {course?.name ?? 'No course'}
          </div>
          {courses?.length > 1 && (
            <button onClick={() => setShowPicker(v => !v)} className="um-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>change</button>
          )}
        </div>

        {showPicker && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {courses.map((cc, i) => {
              const active = i === courseIdx
              const cc2 = cc.color ?? courseColor(i)
              return (
                <button key={i} onClick={() => { setCourseIdx(i); setShowPicker(false) }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 999,
                  background: active ? cc2.halo : T.card,
                  color: active ? cc2.dot : T.muted,
                  border: `1px solid ${active ? cc2.dot + '40' : T.border}`,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: cc2.dot }} />
                  {cc.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Segmented control */}
        <div style={{
          display: 'flex', background: T.neutralBg, borderRadius: 12,
          padding: 4, marginBottom: 16,
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '9px 12px', borderRadius: 8,
              background: tab === t ? T.card : 'transparent',
              color: tab === t ? T.text : T.muted,
              border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t ? 700 : 600, fontFamily: 'inherit',
              boxShadow: tab === t ? '0 1px 3px rgba(28,27,24,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>{t}</button>
          ))}
        </div>

        {/* Input pane */}
        <div style={{ marginBottom: 20, minHeight: 140 }}>
          {tab === 'File' && (
            <div>
              <input ref={fileInput} type="file" accept=".pdf,.docx,.pptx" className="hidden" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])} />
              <button onClick={() => fileInput.current?.click()} style={{
                width: '100%', padding: '32px 16px', borderRadius: 12,
                border: `1.5px dashed ${T.border}`, background: T.card,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>
                {extractBusy ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Spinner size="sm" />
                    <span style={{ fontSize: 14, color: T.muted }}>Extracting text…</span>
                  </div>
                ) : file ? (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{file.name}</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>Click to replace</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Drop a file here, or click to browse</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>PDF, slides, docs, images — up to 50 MB</div>
                  </div>
                )}
              </button>
            </div>
          )}

          {tab === 'Scan' && (
            <div>
              <input ref={scanInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => handleScan(e.target.files?.[0])} />
              <button onClick={() => scanInput.current?.click()} disabled={scanBusy} style={{
                width: '100%', padding: '32px 16px', borderRadius: 12,
                border: `1.5px dashed ${T.border}`, background: T.card,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>
                {scanBusy ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Spinner size="sm" />
                    <span style={{ fontSize: 14, color: T.muted }}>Reading your notes…</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Snap your notes with your phone</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>Or upload an image of handwritten notes</div>
                  </div>
                )}
              </button>
            </div>
          )}

          {tab === 'Audio' && (
            <div>
              <input ref={audioInput} type="file" accept=".mp3,.m4a,.mp4,.wav,.webm,.ogg,.oga,.aac,.flac" style={{ display: 'none' }}
                onChange={e => handleAudio(e.target.files?.[0])} />
              <button onClick={() => audioInput.current?.click()} disabled={audioBusy} style={{
                width: '100%', padding: '32px 16px', borderRadius: 12,
                border: `1.5px dashed ${T.border}`, background: T.card,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>
                {audioBusy ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Spinner size="sm" />
                    <span style={{ fontSize: 14, color: T.muted }}>Transcribing audio…</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Record or upload a lecture</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>MP3, M4A, or record right here — up to 2 hours</div>
                  </div>
                )}
              </button>
            </div>
          )}

          {tab === 'Paste' && (
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="Paste your notes, a syllabus, or any text…"
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '14px 16px',
                borderRadius: 12, border: `1px solid ${T.border}`,
                fontSize: 14, color: T.text, background: T.card, outline: 'none',
                fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
              }}
            />
          )}

          {tab === 'YouTube' && (
            <div>
              <input
                type="url"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !importBusy && handleYouTube()}
                placeholder="Paste a YouTube link…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '14px 16px',
                  borderRadius: 12, border: `1px solid ${T.border}`,
                  fontSize: 14, color: T.text, background: T.card, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              {youtubeUrl.trim() && !importBusy && (
                <button onClick={handleYouTube} style={{
                  marginTop: 10, padding: '10px 16px', borderRadius: 10,
                  background: T.card, border: `1px solid ${T.border}`,
                  color: T.text, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>Import transcript</button>
              )}
              {importBusy && <p style={{ marginTop: 10, fontSize: 13, color: T.muted }}>Importing transcript…</p>}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: T.redBg, color: T.red, fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Action + output selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button
            className="um-primary"
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            style={{
              padding: '13px 22px', borderRadius: 12,
              background: canGenerate && !generating ? T.blue : T.neutral,
              color: '#FFFFFF', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: canGenerate && !generating ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              boxShadow: canGenerate && !generating ? '0 6px 18px rgba(52,82,217,0.28)' : 'none',
              opacity: canGenerate && !generating ? 1 : 0.65,
            }}
          >
            {generating ? 'Generating…' : `Generate ${outputMode.toLowerCase()}`}
          </button>
          <div style={{ display: 'flex', background: T.neutralBg, borderRadius: 10, padding: 3 }}>
            {OUTPUT_MODES.map(m => (
              <button key={m} onClick={() => setOutputMode(m)} style={{
                padding: '7px 12px', borderRadius: 7,
                background: outputMode === m ? T.card : 'transparent',
                color: outputMode === m ? T.text : T.muted,
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: outputMode === m ? 700 : 600, fontFamily: 'inherit',
                boxShadow: outputMode === m ? '0 1px 2px rgba(28,27,24,0.08)' : 'none',
              }}>{m}</button>
            ))}
          </div>
        </div>

        {/* Previously generated */}
        {hasCached && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
              Previously generated:{' '}
              <button
                onClick={() => onGenerated?.({ flashcards: cached.flashcards, quiz: cached.quiz ?? [], mode: outputMode, courseIdx, fromCache: true })}
                className="um-link"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
              >
                {cachedCount} cards ready
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
