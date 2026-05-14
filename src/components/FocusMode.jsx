import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCachedStudyTools,
  getCachedNotes,
  getCachedCoachPlan,
  saveNotes as dbSaveNotes,
  appendSessionRecall,
} from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'
import { useCelebration } from '../utils/useCelebration'
import { extractText } from '../utils/extractText'
import AIChatView from './AIChatView'

function fmt(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function loadStudyTools(courseId) {
  const data = getCachedStudyTools()
  return data?.courseIdx === courseId ? data : null
}

function saveNotes(courseId, dateStr, notes) {
  dbSaveNotes(courseId, dateStr, notes)
}

function loadNotes(courseId, dateStr) {
  return getCachedNotes(courseId, dateStr)
}

function appendRecall(courseId, courseName, sessionType, text) {
  appendSessionRecall({ courseId, courseName, sessionType, text, timestamp: Date.now() })
}

function generatePDF({ courseName, dateStr, sessionType, recallText, concepts, main, summary }) {
  // ── Helpers ────────────────────────────────────────────────────────────────
  const esc = (t) => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  // ── Content parser ─────────────────────────────────────────────────────────
  function parseBlocks(text) {
    if (!text?.trim()) return []
    const lines = text.split('\n')
    const out = []
    let tableRows = []

    const flushTable = () => {
      if (tableRows.length > 0) { out.push({ type: 'table', rows: [...tableRows] }); tableRows = [] }
    }

    for (const raw of lines) {
      const line = raw.trim()
      if (!line) { flushTable(); continue }

      // Table row
      if (line.split('|').length >= 3 && line.includes('|')) {
        if (/^[\|\-\s:]+$/.test(line)) continue // separator
        tableRows.push(line.split('|').map(c => c.trim()).filter(Boolean))
        continue
      }
      flushTable()

      // Bullet
      if (/^[-•*·]\s+/.test(line)) { out.push({ type: 'bullet', text: line.replace(/^[-•*·]\s+/, '') }); continue }
      // Numbered list
      if (/^\d+[\.\)]\s+/.test(line)) { out.push({ type: 'bullet', text: line.replace(/^\d+[\.\)]\s+/, '') }); continue }
      // Markdown heading
      if (/^#{1,3}\s/.test(line)) { out.push({ type: 'heading', text: line.replace(/^#+\s+/, '') }); continue }
      // Section heading: short, ends in colon, no sentence structure
      if (line.endsWith(':') && line.length < 70 && !line.slice(0,-1).includes('.') && !line.includes('(')) {
        out.push({ type: 'heading', text: line.slice(0,-1) }); continue
      }
      // ALL CAPS heading
      if (line === line.toUpperCase() && /[A-Z]{2}/.test(line) && line.length > 2 && line.length < 60 && !/\d/.test(line)) {
        out.push({ type: 'heading', text: line }); continue
      }
      // Formula / equation
      if (/[=÷×±√∑∫∂∆→⟶]/.test(line) || (/\s=\s/.test(line) && line.length < 120)) {
        out.push({ type: 'formula', text: line }); continue
      }
      // Key term definition: "Term: definition" with short term (≤6 words)
      const defMatch = line.match(/^([A-Z][^:\.]{1,45}):\s+(.{8,})$/)
      if (defMatch && defMatch[1].split(' ').length <= 6) {
        out.push({ type: 'definition', term: defMatch[1], def: defMatch[2] }); continue
      }
      out.push({ type: 'para', text: line })
    }
    flushTable()
    return out
  }

  function renderTable(rows) {
    if (!rows.length) return ''
    const [header, ...body] = rows
    return `<div class="tbl-wrap"><table>
      <thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${body.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`
  }

  function renderBlocks(blocks) {
    let html = '', inList = false
    for (const b of blocks) {
      if (b.type === 'bullet') {
        if (!inList) { html += '<ul class="blist">'; inList = true }
        html += `<li><span class="bdot"></span><span>${esc(b.text)}</span></li>`
      } else {
        if (inList) { html += '</ul>'; inList = false }
        if      (b.type === 'heading')    html += `<div class="nh"><div class="nhbar"></div><span>${esc(b.text)}</span></div>`
        else if (b.type === 'definition') html += `<div class="defrow"><span class="deft">${esc(b.term)}</span><span class="defb">${esc(b.def)}</span></div>`
        else if (b.type === 'formula')    html += `<div class="formula">${esc(b.text)}</div>`
        else if (b.type === 'table')      html += renderTable(b.rows)
        else                              html += `<p class="np">${esc(b.text)}</p>`
      }
    }
    if (inList) html += '</ul>'
    return html
  }

  function parseConcepts(text) {
    if (!text?.trim()) return []
    return text.split('\n').map(l => l.trim().replace(/^[-•*\d\.\)]+\s*/, '')).filter(l => l.length > 2).slice(0, 12)
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  const mainBlocks    = parseBlocks(main)
  const recallBlocks  = parseBlocks(recallText)
  const summaryBlocks = parseBlocks(summary)
  const conceptList   = parseConcepts(concepts)

  const prettyDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── HTML ───────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>StudyEdge AI · ${esc(courseName)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F6F3;color:#1A1A1A;-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* Header */
.hdr{background:linear-gradient(135deg,#162d6b 0%,#3B61C4 55%,#4f7cd4 100%);color:#fff;padding:40px 52px 36px;position:relative;overflow:hidden}
.hdr::before{content:'';position:absolute;right:-80px;top:-80px;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,0.05)}
.hdr::after{content:'';position:absolute;left:40%;bottom:-100px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,0.04)}
.brand{font-size:10px;letter-spacing:3.5px;text-transform:uppercase;opacity:.6;margin-bottom:14px;font-weight:600}
.course{font-size:40px;font-weight:800;letter-spacing:-1.5px;line-height:1.05;margin-bottom:6px}
.sub{font-size:15px;opacity:.7;margin-bottom:20px;font-weight:400}
.badges{display:flex;gap:8px;flex-wrap:wrap}
.badge{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);padding:5px 14px;border-radius:20px;font-size:11.5px;font-weight:500}
.badge.orange{background:rgba(232,83,26,0.75);border-color:rgba(232,83,26,0.4)}

/* Layout */
.body{max-width:800px;margin:0 auto;padding:40px 52px 56px}

/* Section wrapper */
.sec{margin-bottom:36px}
.sec-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.sec-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.sec-label{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
.sec-rule{flex:1;height:1px;opacity:.18}

/* Recall */
.recall-card{background:linear-gradient(135deg,#fff8f2,#fffaf6);border:1.5px solid #fcd4b0;border-radius:14px;padding:24px 28px}

/* Concept grid */
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.ccard{background:#fff;border:1px solid rgba(59,97,196,0.14);border-top:3px solid #3B61C4;border-radius:10px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.cnum{font-size:9.5px;font-weight:700;color:#3B61C4;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px}
.ctxt{font-size:13px;line-height:1.55;color:#2d2d2d}

/* Notes card */
.ncard{background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:14px;padding:28px 32px;box-shadow:0 2px 14px rgba(0,0,0,0.04)}
.np{font-size:14px;line-height:1.85;color:#2d2d2d;margin-bottom:12px}
.nh{display:flex;align-items:center;gap:10px;margin:22px 0 10px}
.nhbar{width:4px;height:18px;background:#3B61C4;border-radius:2px;flex-shrink:0}
.nh span{font-size:15px;font-weight:700;color:#1a1a1a}
.blist{list-style:none;margin:8px 0 14px;padding:0}
.blist li{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;font-size:14px;line-height:1.65;color:#2d2d2d}
.bdot{width:7px;height:7px;border-radius:50%;background:#3B61C4;flex-shrink:0;margin-top:8px}
.defrow{display:flex;gap:14px;padding:10px 14px;background:#eef2ff;border-radius:8px;margin:6px 0;align-items:flex-start}
.deft{font-weight:700;font-size:13px;color:#3B61C4;white-space:nowrap;min-width:110px;flex-shrink:0;padding-top:1px}
.defb{font-size:13px;color:#374151;line-height:1.55}
.formula{font-family:'Courier New',monospace;font-size:14px;background:#1e293b;color:#7dd3fc;padding:13px 20px;border-radius:9px;margin:12px 0;letter-spacing:.5px;word-break:break-all}

/* Table */
.tbl-wrap{border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,0.09);margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#3B61C4;color:#fff;padding:11px 16px;text-align:left;font-weight:600;font-size:12px;letter-spacing:.3px}
td{padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#374151}
tr:last-child td{border-bottom:none}
tr:nth-child(even) td{background:#f9fafb}

/* Summary */
.sum-card{background:linear-gradient(135deg,#eef2ff,#e8eeff);border:1.5px solid rgba(59,97,196,0.22);border-radius:14px;padding:24px 28px}

/* Tips */
.tips{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}
.tip{background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:10px;padding:15px 16px}
.tipn{font-size:9.5px;font-weight:700;color:#E8531A;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px}
.tipt{font-size:12px;line-height:1.55;color:#4b5563}

/* Footer */
.footer{text-align:center;padding:28px 52px;border-top:1px solid rgba(0,0,0,0.07);margin-top:8px}
.ftop{font-size:13.5px;font-weight:700;color:#3B61C4;margin-bottom:4px}
.fsub{font-size:11px;color:#9B9B9B}

@page{margin:0;size:A4}
@media print{
  body{background:#fff}
  .hdr,.recall-card,.sum-card,.formula,th,.nhbar,.bdot,.badge.orange,.ccard{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .sec{break-inside:avoid}
  .cgrid,.tips{break-inside:avoid}
  .ncard,.ccard,.tip{box-shadow:none!important}
}
</style>
</head>
<body>

<div class="hdr">
  <div class="brand">StudyEdge AI &nbsp;·&nbsp; Session Notes</div>
  <div class="course">${esc(courseName)}</div>
  <div class="sub">${esc(sessionType || 'Study Session')}</div>
  <div class="badges">
    <span class="badge">${esc(prettyDate)}</span>
    <span class="badge orange">${esc(sessionType || 'Study Session')}</span>
    ${conceptList.length ? `<span class="badge">${conceptList.length} concept${conceptList.length !== 1 ? 's' : ''} covered</span>` : ''}
  </div>
</div>

<div class="body">

${recallText?.trim() ? `
<div class="sec">
  <div class="sec-hdr">
    <div class="sec-icon" style="background:rgba(232,83,26,0.1)">✍️</div>
    <div class="sec-label" style="color:#E8531A">Active Recall</div>
    <div class="sec-rule" style="background:#E8531A"></div>
  </div>
  <div class="recall-card">
    ${renderBlocks(recallBlocks) || `<p class="np">${esc(recallText.trim())}</p>`}
  </div>
</div>` : ''}

${conceptList.length ? `
<div class="sec">
  <div class="sec-hdr">
    <div class="sec-icon" style="background:rgba(59,97,196,0.1);color:#3B61C4;font-size:16px">◈</div>
    <div class="sec-label" style="color:#3B61C4">Key Concepts</div>
    <div class="sec-rule" style="background:#3B61C4"></div>
  </div>
  <div class="cgrid">
    ${conceptList.map((c, i) => `
      <div class="ccard">
        <div class="cnum">Concept ${String(i+1).padStart(2,'0')}</div>
        <div class="ctxt">${esc(c)}</div>
      </div>`).join('')}
  </div>
</div>` : ''}

${main?.trim() ? `
<div class="sec">
  <div class="sec-hdr">
    <div class="sec-icon" style="background:rgba(0,0,0,0.06);font-size:16px">≡</div>
    <div class="sec-label" style="color:#6B6B6B">Session Notes</div>
    <div class="sec-rule" style="background:#1A1A1A"></div>
  </div>
  <div class="ncard">
    ${renderBlocks(mainBlocks)}
  </div>
</div>` : ''}

${summary?.trim() ? `
<div class="sec">
  <div class="sec-hdr">
    <div class="sec-icon" style="background:rgba(59,97,196,0.1);color:#3B61C4">★</div>
    <div class="sec-label" style="color:#3B61C4">Summary &amp; Takeaways</div>
    <div class="sec-rule" style="background:#3B61C4"></div>
  </div>
  <div class="sum-card">
    ${renderBlocks(summaryBlocks) || `<p class="np">${esc(summary.trim())}</p>`}
  </div>
</div>` : ''}

<div class="tips">
  <div class="tip">
    <div class="tipn">Tip 01 · Spaced Repetition</div>
    <div class="tipt">Review these notes again in 24 hours, then 3 days, then 1 week to move them into long-term memory.</div>
  </div>
  <div class="tip">
    <div class="tipn">Tip 02 · Active Recall</div>
    <div class="tipt">Cover your notes and try to retrieve the key points from scratch — struggling is how memory forms.</div>
  </div>
  <div class="tip">
    <div class="tipn">Tip 03 · Teach It</div>
    <div class="tipt">Explain these concepts aloud as if teaching someone. If you can't explain it simply, study it again.</div>
  </div>
</div>

</div>

<div class="footer">
  <div class="ftop">StudyEdge AI</div>
  <div class="fsub">getstudyedge.com &nbsp;·&nbsp; Generated ${esc(prettyDate)}</div>
</div>

<script>window.onload=function(){setTimeout(function(){window.print()},700)}</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=960,height=800')
  if (!win) {
    alert('Allow pop-ups for StudyEdge AI to export your notes.')
    return
  }
  win.document.write(html)
  win.document.close()
}

const ENCOURAGE = [
  'Great session! Every minute you put in compounds into exam-day confidence.',
  'Solid work. Consistent sessions like this are what separate top performers.',
  "You showed up and did the work. That's what matters most.",
  'Another session in the books. Your future self thanks you.',
]

const ACTIVITY_COLORS = {
  'review':            '#3B82F6',
  'active-recall':     '#A855F7',
  'flashcards':        '#EC4899',
  'practice-problems': '#F97316',
  'summary':           '#14B8A6',
  'break':             '#22C55E',
}

const TAB_COLORS = {
  recall:     '#A855F7',
  flashcards: '#EC4899',
  quiz:       '#F97316',
  notes:      '#14B8A6',
  ai:         '#3B82F6',
}

export default function FocusMode({ session, blueprint, onComplete, onExit, nextSession, onStartNext, onGoToTools, course, onShowPaywall, userId, learningStyle }) {
  const totalSec = session.duration * 60
  const isLongSession = session.duration > 45
  const todayStr = new Date().toISOString().split('T')[0]

  // ── Blueprint blocks ──
  const blocks = blueprint?.blocks ?? null
  const [blockIdx, setBlockIdx] = useState(0)
  const [blockRemaining, setBlockRemaining] = useState(() => blocks ? blocks[0].duration * 60 : totalSec)
  const [completedBlocks, setCompletedBlocks] = useState(new Set())
  const [blockTransition, setBlockTransition] = useState(null) // { title, nextTitle, nextInstruction }
  const blockAdvanceRef = useRef(null)

  const currentBlock = blocks ? blocks[blockIdx] : null
  const nextBlock = blocks ? blocks[blockIdx + 1] : null
  const blockColor = currentBlock ? (ACTIVITY_COLORS[currentBlock.activity] ?? session.color.dot) : session.color.dot
  const blockPct = currentBlock ? (1 - blockRemaining / (currentBlock.duration * 60)) : 0

  // ── Timer ──
  const [remaining, setRemaining] = useState(totalSec)
  const [running, setRunning] = useState(true)
  const [finished, setFinished] = useState(false)
  const intervalRef = useRef(null)

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState('recall')
  const [tabsVisited, setTabsVisited] = useState(new Set(['recall']))

  // ── Completion ──
  const [showComplete, setShowComplete] = useState(false)
  const [encourageMsg] = useState(() => blueprint?.successNote ?? ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)])
  const celebrate = useCelebration()
  const celebratedRef = useRef(false)
  useEffect(() => {
    if (showComplete && !celebratedRef.current) {
      celebratedRef.current = true
      celebrate('big')
    }
  }, [showComplete])
  const [pdfDownloading, setPdfDownloading] = useState(false)

  // ── Pomodoro ──
  const BREAK_INTERVAL = 25 * 60
  const BREAK_DURATION = 5 * 60
  const [breakBanner, setBreakBanner] = useState(false)
  const [breakOverlay, setBreakOverlay] = useState(false)
  const [breakRemaining, setBreakRemaining] = useState(BREAK_DURATION)
  const lastBreakCount = useRef(0)

  // ── Study tools ──
  const [studyTools] = useState(() => loadStudyTools(session.courseId))
  const [inSessionFlashcards, setInSessionFlashcards] = useState(null)
  const [fcGenerating, setFcGenerating] = useState(false)
  const [fcGenerateError, setFcGenerateError] = useState('')
  const flashcards = inSessionFlashcards ?? []

  // ── Active Recall ──
  const [recallText, setRecallText] = useState('')
  const [recallSaved, setRecallSaved] = useState(false)
  const [showRecallCards, setShowRecallCards] = useState(false)
  const [rcIdx, setRcIdx] = useState(0)
  const [rcFlipped, setRcFlipped] = useState(false)
  const [recallWritingTimer, setRecallWritingTimer] = useState(0)
  const recallTimerRef = useRef(null)
  const recallStartedRef = useRef(false)
  const lastTypedRef = useRef(0)
  const [checkPulse, setCheckPulse] = useState(false)

  // ── Flashcards ──
  const [fcIdx, setFcIdx] = useState(0)
  const [fcFlipped, setFcFlipped] = useState(false)
  const [fcKnown, setFcKnown] = useState(new Set())
  const [fcAnswerState, setFcAnswerState] = useState(null) // 'correct' | 'wrong' | null

  // ── Quick Quiz ──
  const [quizQuestions, setQuizQuestions] = useState(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState([])
  const [quizSelected, setQuizSelected] = useState(null)
  const [quizConfirmed, setQuizConfirmed] = useState(false)
  const [quizDone, setQuizDone] = useState(false)
  const [quizAnswerFlash, setQuizAnswerFlash] = useState(null) // 'correct' | 'wrong'

  // ── Quiz/Flashcard custom source (topic + uploaded files/images) ──
  const [quizTopic, setQuizTopic] = useState(() => {
    const parts = [session.focusArea, ...(session.keyTopics ?? [])].filter(Boolean)
    return parts.length ? parts.slice(0, 3).join(', ') : ''
  })
  const [quizSourceText, setQuizSourceText] = useState('')
  const [quizSourceImages, setQuizSourceImages] = useState([]) // { name, dataUrl, media_type, data }
  const [quizSourceFiles, setQuizSourceFiles] = useState([])   // [{ name }]
  const [quizSourceLoading, setQuizSourceLoading] = useState(false)

  const [fcTopic, setFcTopic] = useState(() => {
    const parts = [session.focusArea, ...(session.keyTopics ?? [])].filter(Boolean)
    return parts.length ? parts.slice(0, 3).join(', ') : ''
  })
  const [fcSourceText, setFcSourceText] = useState('')
  const [fcSourceImages, setFcSourceImages] = useState([])
  const [fcSourceFiles, setFcSourceFiles] = useState([])
  const [fcSourceLoading, setFcSourceLoading] = useState(false)

  // ── Notes ──
  const [notesConcepts, setNotesConcepts] = useState('')
  const [notesMain, setNotesMain] = useState('')
  const [notesSummary, setNotesSummary] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [notesAutoSaved, setNotesAutoSaved] = useState(false)
  const notesSaveRef = useRef(null)
  const conceptsRef = useRef(null)
  const mainRef = useRef(null)
  const summaryRef = useRef(null)

  // ── Load saved notes ──
  useEffect(() => {
    const saved = loadNotes(session.courseId, todayStr)
    if (saved) {
      setNotesConcepts(saved.concepts ?? '')
      setNotesMain(saved.main ?? '')
      setNotesSummary(saved.summary ?? '')
    }
  }, [])

  // ── Auto-resize textareas after load ──
  useEffect(() => {
    [conceptsRef, mainRef, summaryRef].forEach(r => {
      if (r.current) { r.current.style.height = 'auto'; r.current.style.height = r.current.scrollHeight + 'px' }
    })
  }, [notesConcepts, notesMain, notesSummary])

  // ── Timer countdown ──
  useEffect(() => {
    if (!running || finished) return
    intervalRef.current = setInterval(() => {
      // Overall timer
      setRemaining(r => {
        if (r <= 1) { clearInterval(intervalRef.current); setRunning(false); setFinished(true); return 0 }
        return r - 1
      })
      // Block timer
      if (blocks) {
        setBlockRemaining(r => {
          if (r <= 1) return 0
          return r - 1
        })
      }
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, finished, blocks])

  // ── Block advance when block timer hits 0 ──
  useEffect(() => {
    if (!blocks || blockRemaining > 0 || finished) return
    const current = blocks[blockIdx]
    const next = blocks[blockIdx + 1]
    // Mark block complete
    setCompletedBlocks(prev => new Set([...prev, blockIdx]))
    if (!next) return // last block; overall timer will handle finish

    // Show transition banner
    setBlockTransition({ title: current.title, nextTitle: next.title, nextInstruction: next.instruction })
    setRunning(false)

    blockAdvanceRef.current = setTimeout(() => {
      setBlockIdx(i => i + 1)
      setBlockRemaining(next.duration * 60)
      setBlockTransition(null)
      setRunning(true)
    }, 4000)

    return () => clearTimeout(blockAdvanceRef.current)
  }, [blockRemaining])

  // ── Auto-show complete ──
  useEffect(() => {
    if (finished) { const t = setTimeout(() => setShowComplete(true), 1200); return () => clearTimeout(t) }
  }, [finished])

  // ── Pomodoro banner ──
  useEffect(() => {
    if (!isLongSession || !running || finished) return
    const elapsed = totalSec - remaining
    const count = Math.floor(elapsed / BREAK_INTERVAL)
    if (count > lastBreakCount.current) { lastBreakCount.current = count; setBreakBanner(true) }
  }, [remaining])

  // ── Break countdown ──
  useEffect(() => {
    if (!breakOverlay) return
    setBreakRemaining(BREAK_DURATION)
    const t = setInterval(() => {
      setBreakRemaining(r => {
        if (r <= 1) { clearInterval(t); setBreakOverlay(false); setBreakBanner(false); return BREAK_DURATION }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [breakOverlay])

  // ── Recall writing timer ──
  useEffect(() => {
    if (recallText && !recallStartedRef.current) {
      recallStartedRef.current = true
      recallTimerRef.current = setInterval(() => setRecallWritingTimer(t => t + 1), 1000)
    }
    if (recallText) lastTypedRef.current = Date.now()
    return () => {}
  }, [recallText])

  useEffect(() => () => clearInterval(recallTimerRef.current), [])

  // ── Check Yourself pulse after 3 min inactivity ──
  useEffect(() => {
    if (!recallText || showRecallCards) return
    const check = setInterval(() => {
      if (Date.now() - lastTypedRef.current > 180000) setCheckPulse(true)
      else setCheckPulse(false)
    }, 10000)
    return () => clearInterval(check)
  }, [recallText, showRecallCards])

  // ── Notes auto-save ──
  useEffect(() => {
    clearTimeout(notesSaveRef.current)
    if (!notesConcepts && !notesMain && !notesSummary) return
    notesSaveRef.current = setTimeout(() => {
      saveNotes(session.courseId, todayStr, { concepts: notesConcepts, main: notesMain, summary: notesSummary })
      setNotesAutoSaved(true)
      setTimeout(() => setNotesAutoSaved(false), 2000)
    }, 2000)
    return () => clearTimeout(notesSaveRef.current)
  }, [notesConcepts, notesMain, notesSummary])

  // ── Escape key ──
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape' && !showComplete) onExit() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onExit, showComplete])

  // ── Derived ──
  const elapsed = totalSec - remaining
  const pct = blocks ? blockPct : (totalSec > 0 ? elapsed / totalSec : 0)
  const strokeColor = finished ? '#10B981' : (blocks ? blockColor : session.color.dot)
  const R = 78
  const CIRC = 2 * Math.PI * R
  const dot = session.color.dot
  const hasNotes = !!(notesConcepts.trim() || notesMain.trim() || notesSummary.trim() || recallText.trim())

  // ── Handlers ──
  const visitTab = tab => { setActiveTab(tab); setTabsVisited(prev => new Set([...prev, tab])) }
  const handleMarkComplete = () => { if (running) setRunning(false); setShowComplete(true) }

  const handleSkipBlock = () => {
    if (!blocks || !nextBlock) return
    clearTimeout(blockAdvanceRef.current)
    setCompletedBlocks(prev => new Set([...prev, blockIdx]))
    setBlockTransition(null)
    setBlockIdx(i => i + 1)
    setBlockRemaining(nextBlock.duration * 60)
    setRunning(true)
  }
  const handleBackToDashboard = () => onComplete(session.id, elapsed)
  const handleStartNext = () => { if (nextSession && onStartNext) onStartNext(session.id, elapsed, nextSession); else onComplete(session.id, elapsed) }

  const handleCheckYourself = () => {
    if (recallText.trim()) appendRecall(session.courseId, session.courseName, session.sessionType, recallText)
    setRecallSaved(true); setShowRecallCards(true); setRcIdx(0); setRcFlipped(false)
  }

  const handleGenerateQuiz = async () => {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setQuizLoading(true); setQuizError(''); setQuizQuestions(null)
    setQuizAnswers([]); setQuizIdx(0); setQuizSelected(null); setQuizConfirmed(false); setQuizDone(false)
    const savedPlan = getCachedCoachPlan(session.courseId)
    const professorEmphasis = savedPlan?.formData?.emphasisTopics ?? savedPlan?.formData?.topics?.join(', ') ?? null
    const planStruggles = savedPlan?.struggles ?? []
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'quick-quiz',
          courseName: session.courseName,
          sessionType: session.sessionType,
          topic: quizTopic.trim(),
          text: [
            quizSourceText && `Uploaded materials:\n${quizSourceText.slice(0, 6000)}`,
            notesConcepts && `Key concepts:\n${notesConcepts}`,
            notesMain && `Notes:\n${notesMain}`,
            notesSummary && `Summary:\n${notesSummary}`,
            studyTools?.text?.slice(0, 3000),
          ].filter(Boolean).join('\n\n') || '',
          images: quizSourceImages.map(img => ({ media_type: img.media_type, data: img.data })),
          professorEmphasis: professorEmphasis || null,
          struggles: planStruggles.length ? planStruggles : null,
          learningStyle: learningStyle ?? null,
        }),
      })
      if (!res.ok) {
        let errMsg = 'Quiz generation failed'
        try { const d = await res.json(); errMsg = d.error ?? errMsg } catch {}
        throw new Error(errMsg)
      }
      const data = await res.json()
      setQuizQuestions(data.questions)
      incrementAIQuery()
    } catch (e) { setQuizError(e.message) }
    finally { setQuizLoading(false) }
  }

  const handleConfirmAnswer = () => {
    if (quizSelected === null) return
    const q = quizQuestions[quizIdx]
    const correct = quizSelected === q.answer
    setQuizAnswers(prev => [...prev, { selected: quizSelected, correct, question: q }])
    setQuizConfirmed(true)
    setQuizAnswerFlash(correct ? 'correct' : 'wrong')
    setTimeout(() => setQuizAnswerFlash(null), 600)
  }

  const handleNextQuestion = () => {
    if (quizIdx + 1 >= quizQuestions.length) setQuizDone(true)
    else { setQuizIdx(i => i + 1); setQuizSelected(null); setQuizConfirmed(false) }
  }

  const resetQuiz = () => { setQuizQuestions(null); setQuizDone(false); setQuizAnswers([]); setQuizIdx(0); setQuizSelected(null); setQuizConfirmed(false) }

  const handleGenerateFlashcards = async () => {
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    const sessionNotes = [
      notesConcepts && `Key concepts:\n${notesConcepts}`,
      notesMain && `Notes:\n${notesMain}`,
      notesSummary && `Summary:\n${notesSummary}`,
    ].filter(Boolean).join('\n\n')
    const text = [
      fcSourceText && `Uploaded materials:\n${fcSourceText.slice(0, 6000)}`,
      sessionNotes,
      studyTools?.text?.slice(0, 4000),
    ].filter(Boolean).join('\n\n')
    const topic = fcTopic.trim()
    const hasImages = fcSourceImages.length > 0

    if (!topic && !hasImages && text.length < 50) {
      setFcGenerateError('Tell it what to study, upload a file, or add some notes first.')
      return
    }
    setFcGenerating(true); setFcGenerateError('')
    const savedPlanFc = getCachedCoachPlan(session.courseId)
    const fcProfessorEmphasis = savedPlanFc?.formData?.emphasisTopics ?? savedPlanFc?.formData?.topics?.join(', ') ?? null
    const fcStruggles = savedPlanFc?.struggles ?? []
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text,
          topic,
          images: fcSourceImages.map(img => ({ media_type: img.media_type, data: img.data })),
          creative: true,
          professorEmphasis: fcProfessorEmphasis || null,
          struggles: fcStruggles.length ? fcStruggles : null,
          learningStyle: learningStyle ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate flashcards')
      setInSessionFlashcards(data.flashcards ?? [])
      incrementAIQuery()
      setFcIdx(0); setFcFlipped(false); setFcKnown(new Set())
    } catch (e) { setFcGenerateError(e.message) }
    finally { setFcGenerating(false) }
  }

  // ── File/image upload for quiz & flashcard generators ─────────────────────────
  const resizeImageToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = e => { img.src = e.target.result }
    reader.onerror = reject
    img.onload = () => {
      const MAX_W = 1400
      const scale = Math.min(1, MAX_W / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
      const base64 = dataUrl.split(',')[1]
      resolve({ data: base64, media_type: 'image/jpeg' })
    }
    img.onerror = reject
    reader.readAsDataURL(file)
  })

  const handleUploadSource = async (mode, fileList) => {
    const setLoading = mode === 'quiz' ? setQuizSourceLoading : setFcSourceLoading
    const setText = mode === 'quiz' ? setQuizSourceText : setFcSourceText
    const setImages = mode === 'quiz' ? setQuizSourceImages : setFcSourceImages
    const setFiles = mode === 'quiz' ? setQuizSourceFiles : setFcSourceFiles
    const setError = mode === 'quiz' ? setQuizError : setFcGenerateError

    setLoading(true); setError('')
    try {
      for (const file of fileList) {
        const ext = file.name.split('.').pop().toLowerCase()
        if (['pdf', 'docx', 'pptx'].includes(ext)) {
          const text = await extractText(file)
          setText(prev => (prev ? prev + '\n\n' : '') + text)
          setFiles(prev => [...prev, { name: file.name }])
        } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
          const img = await resizeImageToBase64(file)
          setImages(prev => [...prev, { name: file.name, ...img }])
          setFiles(prev => [...prev, { name: file.name }])
        } else {
          throw new Error(`Unsupported file: ${file.name}. Upload PDF, DOCX, PPTX, or an image.`)
        }
      }
    } catch (e) {
      setError(e.message ?? 'Failed to read file')
    } finally {
      setLoading(false)
    }
  }

  const clearQuizSource = () => {
    setQuizSourceText(''); setQuizSourceImages([]); setQuizSourceFiles([])
  }
  const clearFcSource = () => {
    setFcSourceText(''); setFcSourceImages([]); setFcSourceFiles([])
  }

  const handleSaveNotes = () => {
    saveNotes(session.courseId, todayStr, { concepts: notesConcepts, main: notesMain, summary: notesSummary })
    setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000)
  }

  const handleDownloadPDF = async () => {
    setPdfDownloading(true)
    try {
      await generatePDF({
        courseName: session.courseName, dateStr: todayStr, sessionType: session.sessionType,
        recallText, concepts: notesConcepts, main: notesMain, summary: notesSummary,
      })
    } catch { /* PDF generation failed — ignore */ }
    finally { setPdfDownloading(false) }
  }

  const autoGrow = e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); setRunning(r => !r) }
      if (e.key === 'Enter') { e.preventDefault(); handleMarkComplete() }
      if (e.key === 'Escape') { e.preventDefault(); setActiveTab(null) }
      if (e.key === '1') visitTab('recall')
      if (e.key === '2') visitTab('flashcards')
      if (e.key === '3') visitTab('quiz')
      if (e.key === '4') visitTab('notes')
      if (e.key === '5') visitTab('ai')
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const SESSION_TABS = [
    { id: 'recall',     label: 'Active Recall', num: 1 },
    { id: 'flashcards', label: 'Flashcards',    num: 2 },
    { id: 'quiz',       label: 'Quick Quiz',    num: 3 },
    { id: 'notes',      label: 'Notes',         num: 4 },
    { id: 'ai',         label: 'Ask AI',        num: 5 },
  ]

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden" style={{ background: `linear-gradient(180deg, ${dot}0d 0%, #F7F6F3 28%)` }}>
      {/* Top accent line */}
      <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg, ${dot}, ${dot}88)` }} />

      {/* ── Pomodoro break banner ── */}
      {breakBanner && !breakOverlay && (
        <div className="relative z-10 flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ backgroundColor: `${dot}18`, borderBottom: `1px solid ${dot}28` }}>
          <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: dot }} />
          <span className="text-xs" style={{ color: '#4B4B4B' }}>5-minute break recommended. You've been studying for 25 minutes</span>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button onClick={() => setBreakOverlay(true)} className="text-xs px-3 py-1 rounded-lg font-medium text-white" style={{ backgroundColor: dot }}>Take Break</button>
            <button onClick={() => setBreakBanner(false)} className="text-xs transition-colors" style={{ color: '#9B9B9B' }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Break overlay ── */}
      {breakOverlay && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center" style={{ backgroundColor: '#F7F6F3', isolation: 'isolate' }}>
          <div className="text-center">
            <div className="relative flex items-center justify-center mb-10">
              <div className="w-36 h-36 rounded-full" style={{ backgroundColor: dot, opacity: 0.08, animation: 'breathe 4s ease-in-out infinite' }} />
              <div className="absolute w-24 h-24 rounded-full" style={{ backgroundColor: dot, opacity: 0.15, animation: 'breathe 4s ease-in-out infinite 0.8s' }} />
              <div className="absolute w-12 h-12 rounded-full" style={{ backgroundColor: dot }} />
            </div>
            <h2 className="text-3xl font-bold mb-2" style={{ color: '#1A1A1A' }}>Take a breath</h2>
            <p className="text-sm mb-3" style={{ color: '#6B6B6B' }}>Inhale 4s &nbsp;·&nbsp; Hold 4s &nbsp;·&nbsp; Exhale 4s</p>
            <p className="text-5xl font-mono font-bold mb-8" style={{ color: dot }}>{fmt(breakRemaining)}</p>
            <button onClick={() => { setBreakOverlay(false); setBreakBanner(false) }} className="text-sm transition-colors" style={{ color: '#9B9B9B' }}>Skip break, keep studying</button>
          </div>
        </div>
      )}

      {/* ── Session complete screen ── */}
      {showComplete && (
        <div className="absolute inset-0 z-[105] flex flex-col overflow-y-auto" style={{ backgroundColor: '#F7F6F3' }}>
          {/* Tinted gradient overlay — separate element so base bg stays fully opaque */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(160deg, ${dot}28 0%, transparent 55%)` }} />
          {/* Hero header */}
          <div className="flex flex-col items-center pt-14 pb-10 px-6 shrink-0">
            {/* Glowing check circle */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full" style={{ backgroundColor: dot, opacity: 0.2, transform: 'scale(2)', filter: 'blur(16px)' }} />
              <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${dot}, ${dot}bb)`, boxShadow: `0 8px 32px ${dot}55` }}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-center mb-2" style={{ color: '#1A1A1A' }}>Session Complete</h2>
            <p className="text-center text-sm leading-relaxed max-w-xs" style={{ color: '#6B6B6B' }}>{encourageMsg}</p>
          </div>

          <div className="px-6 pb-12 max-w-sm w-full mx-auto">
            {/* Colored stat cards */}
            <div className="flex gap-3 mb-5">
              <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: `linear-gradient(135deg, ${dot}22, ${dot}08)`, border: `1px solid ${dot}35` }}>
                <p className="text-2xl font-bold font-mono" style={{ color: dot }}>{fmt(Math.max(elapsed, 1))}</p>
                <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Time studied</p>
              </div>
              <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.05))', border: '1px solid rgba(99,102,241,0.28)' }}>
                <p className="text-2xl font-bold font-mono" style={{ color: '#6366f1' }}>{tabsVisited.size}</p>
                <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Activities used</p>
              </div>
            </div>

            {/* Activity chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { id: 'recall',     label: 'Active Recall', color: '#A855F7' },
                { id: 'flashcards', label: 'Flashcards',    color: '#EC4899' },
                { id: 'quiz',       label: 'Quick Quiz',    color: '#F97316' },
                { id: 'notes',      label: 'Notes',         color: '#14B8A6' },
              ].map(({ id, label, color }) => {
                const done = tabsVisited.has(id)
                return (
                  <div key={id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={done
                      ? { backgroundColor: `${color}18`, border: `1px solid ${color}45`, color }
                      : { backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', color: '#C0C0C0' }}>
                    {done && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {label}
                  </div>
                )
              })}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2.5">
              <button onClick={handleBackToDashboard} className="w-full py-3.5 rounded-2xl font-bold text-white text-sm"
                style={{ background: `linear-gradient(135deg, ${dot}, ${dot}bb)`, boxShadow: `0 4px 18px ${dot}45` }}>
                Back to Dashboard
              </button>
              {nextSession && (
                <button onClick={handleStartNext} className="w-full py-3 rounded-2xl font-semibold text-sm"
                  style={{ backgroundColor: `${dot}14`, border: `1px solid ${dot}35`, color: dot }}>
                  Start Next: {nextSession.courseName} →
                </button>
              )}
              {hasNotes && (
                <button
                  onClick={handleDownloadPDF}
                  disabled={pdfDownloading}
                  className="w-full py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {pdfDownloading ? 'Generating PDF…' : 'Download Session Notes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main session layout ── */}
      <div className="relative flex flex-col h-full overflow-hidden">

        {/* ── Top bar ── */}
        <div className="relative flex items-center px-5 py-3 shrink-0" style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          {/* Left: course info */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: dot }} />
            <span className="font-semibold text-sm truncate" style={{ color: '#1A1A1A' }}>{session.courseName}</span>
            <span className="shrink-0" style={{ color: 'rgba(0,0,0,0.18)', fontSize: 12 }}>·</span>
            <span className="text-xs shrink-0" style={{ color: '#9B9B9B' }}>{session.sessionType}</span>
          </div>
          {/* Center: label */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C0C0C0' }}>Focus Session</span>
          </div>
          {/* Right: elapsed + exit */}
          <div className="flex items-center gap-4 shrink-0">
            <span style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'ui-monospace, monospace' }}>
              {fmt(elapsed)} <span style={{ color: '#C0C0C0' }}>/ {String(session.duration).padStart(2,'0')}:00</span>
            </span>
            <button onClick={onExit} className="text-xs transition-colors" style={{ color: '#9B9B9B' }}>Exit</button>
          </div>
        </div>

        {/* ── Block info + segmented progress bar ── */}
        {blocks && (
          <div className="shrink-0 px-6 pt-3 pb-2" style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
            {currentBlock && !finished && (
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: blockColor }}>
                  Block {String(blockIdx + 1).padStart(2, '0')}/{String(blocks.length).padStart(2, '0')}
                </span>
                <span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 10 }}>·</span>
                <span style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 500 }}>{currentBlock.title}</span>
                {currentBlock.activity && (
                  <>
                    <span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 10 }}>·</span>
                    <span style={{ fontSize: 11, color: '#9B9B9B', fontStyle: 'italic' }}>{currentBlock.activity}</span>
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 3 }}>
              {blocks.map((b, i) => {
                const ac = ACTIVITY_COLORS[b.activity] ?? dot
                const isDone = completedBlocks.has(i)
                const isCurrent = i === blockIdx
                return (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: isDone ? ac : isCurrent ? ac : ac + '28', transition: 'background-color 0.4s' }} />
                )
              })}
            </div>
          </div>
        )}

        {/* ── Timer + controls (hero section) ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0" style={{ minHeight: 160, overflow: 'hidden', background: `radial-gradient(ellipse at 50% 40%, ${dot}0e 0%, transparent 68%)` }}>
          {finished ? (
            <div className="flex flex-col items-center gap-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              <p style={{ fontSize: 14, color: '#9B9B9B' }}>Session complete</p>
            </div>
          ) : (
            <>
              {/* Huge timer */}
              <div
                style={{
                  fontSize: 'clamp(4.5rem, 14vw, 8.5rem)',
                  fontWeight: 800,
                  fontFamily: '"SF Mono", "Fira Code", ui-monospace, monospace',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: running ? '#1A1A1A' : '#C0C0C0',
                  textShadow: running ? `0 0 80px ${dot}35` : 'none',
                  transition: 'color 0.3s, text-shadow 0.3s',
                  userSelect: 'none',
                  tabularNums: true,
                }}
              >
                {fmt(blocks ? blockRemaining : remaining)}
              </div>

              {/* Sub-label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#9B9B9B' }}>
                <span>{blocks ? 'remaining this block' : 'remaining'}</span>
                <span style={{ opacity: 0.35 }}>·</span>
                <span>{session.duration} min total</span>
              </div>

              {/* Block instruction */}
              {blocks && currentBlock && !blockTransition && (
                <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 18, textAlign: 'center', maxWidth: 420, lineHeight: 1.65 }}>
                  {currentBlock.instruction}
                </p>
              )}

              {/* Block transition */}
              {blockTransition && (
                <div style={{ marginTop: 16, padding: '10px 18px', borderRadius: 10, backgroundColor: `${blockColor}10`, border: `1px solid ${blockColor}28`, textAlign: 'center', maxWidth: 380 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: blockColor }}>Block complete ✓ &nbsp;·&nbsp; Next: {blockTransition.nextTitle}</p>
                  <p style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>{blockTransition.nextInstruction}</p>
                </div>
              )}

              {/* ── Control buttons ── */}
              <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Pause / Resume */}
                <button
                  onClick={() => setRunning(r => !r)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B', fontSize: 13, fontWeight: 500, cursor: 'pointer', lineHeight: 1 }}
                >
                  {running ? (
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                  )}
                  <span>{running ? 'Pause' : 'Resume'}</span>
                  <span style={{ fontSize: 10, color: '#C0C0C0' }}>[Space]</span>
                </button>

                {/* Skip block */}
                {blocks && nextBlock && (
                  <button
                    onClick={handleSkipBlock}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#9B9B9B', fontSize: 13, fontWeight: 500, cursor: 'pointer', lineHeight: 1 }}
                  >
                    <span>Skip block</span>
                    <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}

                {/* Finish / Mark complete */}
                <button
                  onClick={handleMarkComplete}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: `linear-gradient(135deg, ${dot}, ${dot}bb)`, color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1, boxShadow: `0 2px 14px ${dot}45` }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                  <span>{elapsed > 0 ? `Finish (${fmt(elapsed)})` : 'Finish block'}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>[↵]</span>
                </button>
              </div>

              {/* Keyboard hint */}
              <p style={{ fontSize: 11, color: '#C0C0C0', marginTop: 16 }}>
                [Space] pause &nbsp;·&nbsp; [↵] finish &nbsp;·&nbsp; [1–5] tools &nbsp;·&nbsp; [Esc] close panel
              </p>
            </>
          )}
        </div>

        {/* ── Tab panel (slides up from bottom) ── */}
        {activeTab && (
          <div
            className={activeTab === 'ai' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}
            style={{ height: '40vh', borderTop: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}
          >
            {/* AIChatView stays mounted */}
            <div className={activeTab === 'ai' ? 'flex-1 flex flex-col overflow-hidden h-full' : 'hidden'}>
              <AIChatView
                courseId={session.courseId}
                courseName={session.courseName}
                examDate={course?.examDate ?? null}
                targetGrade={course?.targetGrade ?? null}
                userId={userId}
                onShowPaywall={onShowPaywall}
              />
            </div>
            <div className={activeTab === 'ai' ? 'hidden' : 'px-5 py-4'}>

            {/* ── Active Recall ── */}
            {activeTab === 'recall' && (
              <div className="space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug" style={{ color: '#1A1A1A' }}>
                      Without looking at your notes, write down everything you know about{' '}
                      <span style={{ color: dot }}>{session.courseName}</span>.
                    </p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: '#9B9B9B' }}>The act of retrieving information is what builds memory. Aim for five minutes of free recall.</p>
                  </div>
                  <div className="shrink-0 text-right" style={{ fontSize: 12, color: '#C0C0C0', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
                    {wordCount(recallText)} words
                    {recallWritingTimer > 0 && <span> · {fmt(recallWritingTimer)} elapsed</span>}
                  </div>
                </div>

                <textarea
                  value={recallText}
                  onChange={e => { setRecallText(e.target.value); setRecallSaved(false) }}
                  placeholder={`Start writing everything you remember about ${session.courseName}…`}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none text-sm resize-none leading-relaxed"
                  style={{
                    minHeight: 120,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid rgba(0,0,0,0.10)',
                    color: '#1A1A1A',
                  }}
                />

                {!showRecallCards ? (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { /* save for later — keep recallText, close panel */ setActiveTab(null) }}
                      className="text-sm transition-colors"
                      style={{ color: '#9B9B9B' }}
                    >
                      Save and continue later
                    </button>
                    <button
                      onClick={handleCheckYourself}
                      className="px-5 py-2 rounded-full font-semibold text-sm transition-all"
                      style={{
                        backgroundColor: dot,
                        color: '#FFFFFF',
                        animation: checkPulse ? 'checkPulse 2s ease-in-out infinite' : 'none',
                      }}
                    >
                      Check yourself
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {flashcards.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: dot }}>Quick check</p>
                          <span className="text-xs text-slate-500">Card {rcIdx + 1} of {flashcards.length}</span>
                        </div>
                        <div className="relative cursor-pointer select-none" style={{ perspective: '1200px', height: '150px' }} onClick={() => setRcFlipped(f => !f)}>
                          <div className="absolute inset-0 rounded-2xl" style={{ transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d', transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1)', transform: rcFlipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                            <div className="absolute inset-0 rounded-2xl flex items-center justify-center p-5 text-center" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)' }}>
                              <p className="font-medium text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{flashcards[rcIdx]?.front}</p>
                            </div>
                            <div className="absolute inset-0 rounded-2xl flex items-center justify-center p-5 text-center" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', backgroundColor: `${dot}10`, border: `1px solid ${dot}30`, transform: 'rotateY(180deg)', WebkitTransform: 'rotateY(180deg)' }}>
                              <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{flashcards[rcIdx]?.back}</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-center text-xs" style={{ color: '#C0C0C0' }}>Tap to flip</p>
                        <div className="flex gap-2">
                          <button onClick={() => { setRcIdx(i => Math.max(0, i - 1)); setRcFlipped(false) }} disabled={rcIdx === 0} className="flex-1 py-2 rounded-xl text-sm transition-colors disabled:opacity-30" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}>← Prev</button>
                          <button onClick={() => { setRcIdx(i => Math.min(flashcards.length - 1, i + 1)); setRcFlipped(false) }} disabled={rcIdx === flashcards.length - 1} className="flex-1 py-2 rounded-xl text-sm transition-colors disabled:opacity-30" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}>Next →</button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)' }}>
                        <p className="text-sm" style={{ color: '#9B9B9B' }}>Upload course notes in <span className="font-medium" style={{ color: dot }}>Study Tools</span> to unlock personalized recall checks.</p>
                      </div>
                    )}
                  </div>
                )}

                {recallSaved && (
                  <p className="text-xs text-emerald-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Recall entry saved
                  </p>
                )}
              </div>
            )}

            {/* ── Flashcards ── */}
            {activeTab === 'flashcards' && (
              <>
                {flashcards.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs uppercase tracking-widest font-medium" style={{ color: dot }}>
                        Card {fcIdx + 1} of {flashcards.length}
                        {fcKnown.size > 0 && <span className="text-slate-600"> · {fcKnown.size} mastered</span>}
                      </p>
                      <div className="flex gap-1">
                        {flashcards.map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full transition-colors" style={{ backgroundColor: fcKnown.has(i) ? '#10B981' : i === fcIdx ? dot : 'rgba(0,0,0,0.12)' }} />
                        ))}
                      </div>
                    </div>

                    {/* Swipe indicators + card */}
                    <div className="relative flex items-center gap-2 mb-3">
                      <button
                        onClick={() => { setFcIdx(i => Math.max(0, i - 1)); setFcFlipped(false) }}
                        disabled={fcIdx === 0}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-20 transition-colors"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#9B9B9B' }}
                      >
                        ‹
                      </button>

                      <div
                        className="flex-1 relative cursor-pointer select-none rounded-2xl transition-all duration-200"
                        style={{
                          minHeight: '210px',
                          backgroundColor: fcFlipped ? `${dot}08` : '#FFFFFF',
                          border: fcFlipped ? `1px solid ${dot}40` : '1px solid rgba(0,0,0,0.10)',
                        }}
                        onClick={() => setFcFlipped(f => !f)}
                      >
                        {!fcFlipped ? (
                          <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                            {flashcards[fcIdx]?.topic && (
                              <span className="text-xs mb-3 px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide" style={{ color: dot, borderColor: `${dot}40`, backgroundColor: `${dot}15` }}>{flashcards[fcIdx].topic}</span>
                            )}
                            <p className="font-semibold leading-relaxed text-base" style={{ color: '#1A1A1A' }}>{flashcards[fcIdx]?.front}</p>
                            <p className="text-xs mt-4" style={{ color: '#C0C0C0' }}>Tap card to reveal answer</p>
                          </div>
                        ) : (
                          <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                            <span className="text-[10px] mb-3 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest" style={{ color: dot, backgroundColor: `${dot}15`, border: `1px solid ${dot}40` }}>Answer</span>
                            <p className="font-semibold leading-relaxed text-base" style={{ color: dot }}>{flashcards[fcIdx]?.back}</p>
                            <p className="text-xs mt-4" style={{ color: '#C0C0C0' }}>Tap card to flip back</p>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => { setFcIdx(i => Math.min(flashcards.length - 1, i + 1)); setFcFlipped(false) }}
                        disabled={fcIdx === flashcards.length - 1}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-20 transition-colors"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#9B9B9B' }}
                      >
                        ›
                      </button>
                    </div>

                    <p className="text-center text-xs mb-3" style={{ color: '#C0C0C0' }}>← → or tap arrows to navigate · tap card to flip</p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setFcKnown(prev => { const n = new Set(prev); n.has(fcIdx) ? n.delete(fcIdx) : n.add(fcIdx); return n }) }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border"
                        style={fcKnown.has(fcIdx)
                          ? { backgroundColor: '#F0FDF4', borderColor: '#86EFAC', color: '#16A34A' }
                          : { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', color: '#6B6B6B' }
                        }
                      >
                        {fcKnown.has(fcIdx) ? '✓ Mastered' : 'Mark as Mastered'}
                      </button>
                      <button
                        onClick={() => setFcKnown(prev => { const n = new Set(prev); n.delete(fcIdx); return n })}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}
                      >
                        Still Learning
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>Build flashcards on demand</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#9B9B9B' }}>Describe what to drill on, attach a PDF or slides, and StudyEdge will generate cards on exactly what you asked for. Nothing more.</p>
                    </div>

                    <div className="flex gap-2 items-start">
                      <input
                        value={fcTopic}
                        onChange={e => setFcTopic(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !fcGenerating && handleGenerateFlashcards()}
                        placeholder={`e.g. Memory systems: encoding, storage, retrieval, sensory and working memory`}
                        className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#1A1A1A' }}
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm transition-colors" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#9B9B9B' }} title="Attach PDF or slides">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          {fcSourceFiles.length > 0 && <span style={{ fontSize: 11, color: dot }}>{fcSourceFiles.length}</span>}
                          <input type="file" className="hidden" multiple accept=".pdf,.docx,.pptx,image/*" onChange={async e => { if (e.target.files?.length) await handleUploadSource('fc', Array.from(e.target.files)); e.target.value = '' }} />
                        </label>
                        <button
                          onClick={handleGenerateFlashcards}
                          disabled={fcGenerating}
                          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                          style={{ backgroundColor: dot, color: '#FFFFFF' }}
                        >
                          {fcGenerating ? 'Generating…' : 'Generate'}
                        </button>
                      </div>
                    </div>

                    {fcSourceFiles.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {fcSourceFiles.map((f, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: `${dot}10`, color: dot }}>📎 {f.name}</span>
                        ))}
                        <button onClick={clearFcSource} className="text-xs" style={{ color: '#C0C0C0' }}>Clear</button>
                      </div>
                    )}

                    {fcGenerateError && (
                      <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}>{fcGenerateError}</div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Quick Quiz ── */}
            {activeTab === 'quiz' && (
              <>
                {quizLoading ? (
                  <div className="flex flex-col items-center gap-3 py-14">
                    <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${dot}20`, borderTopColor: dot }} />
                    <p className="text-sm" style={{ color: '#9B9B9B' }}>Generating your quiz…</p>
                  </div>
                ) : quizError ? (
                  <div className="space-y-3">
                    <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}>{quizError}</div>
                    <button onClick={handleGenerateQuiz} className="w-full py-3 rounded-xl text-sm font-medium transition-colors" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}>Try Again</button>
                  </div>
                ) : !quizQuestions ? (
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>Test yourself, your way</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#9B9B9B' }}>Describe exactly what to quiz you on, attach source material, or both. The quiz will only cover what you asked for.</p>
                    </div>

                    <div className="flex gap-2 items-start">
                      <input
                        value={quizTopic}
                        onChange={e => setQuizTopic(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !quizLoading && handleGenerateQuiz()}
                        placeholder={`e.g. Three types of market structures from Chapter 6`}
                        className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#1A1A1A' }}
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm transition-colors" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#9B9B9B' }} title="Attach PDF or slides">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          {quizSourceFiles.length > 0 && <span style={{ fontSize: 11, color: dot }}>{quizSourceFiles.length}</span>}
                          <input type="file" className="hidden" multiple accept=".pdf,.docx,.pptx,image/*" onChange={async e => { if (e.target.files?.length) await handleUploadSource('quiz', Array.from(e.target.files)); e.target.value = '' }} />
                        </label>
                        <button
                          onClick={handleGenerateQuiz}
                          disabled={quizLoading}
                          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                          style={{ backgroundColor: dot, color: '#FFFFFF' }}
                        >
                          {quizLoading ? 'Generating…' : 'Generate'}
                        </button>
                      </div>
                    </div>

                    {quizSourceFiles.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {quizSourceFiles.map((f, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: `${dot}10`, color: dot }}>📎 {f.name}</span>
                        ))}
                        <button onClick={clearQuizSource} className="text-xs" style={{ color: '#C0C0C0' }}>Clear</button>
                      </div>
                    )}
                  </div>
                ) : quizDone ? (
                  <div>
                    <div className="text-center mb-6">
                      <p className="text-5xl font-bold mb-1 font-mono" style={{ color: '#1A1A1A' }}>
                        {quizAnswers.filter(a => a.correct).length}<span className="text-3xl" style={{ color: '#C0C0C0' }}>/{quizQuestions.length}</span>
                      </p>
                      <p className="font-semibold" style={{ color: dot }}>
                        {quizAnswers.filter(a => a.correct).length === quizQuestions.length ? 'Perfect score!'
                          : quizAnswers.filter(a => a.correct).length >= quizQuestions.length * 0.8 ? 'Great work!'
                          : 'Keep reviewing!'}
                      </p>
                    </div>
                    <div className="space-y-2.5 mb-5">
                      {quizAnswers.map((a, i) => (
                        <div key={i} className="rounded-xl p-3.5 border" style={a.correct ? { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' } : { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }}>
                          <div className="flex items-start gap-2 mb-1">
                            <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color: a.correct ? '#16A34A' : '#DC2626' }}>{a.correct ? '✓' : '✗'}</span>
                            <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{a.question.question}</p>
                          </div>
                          {!a.correct && <p className="text-xs ml-4 mt-1" style={{ color: '#6B6B6B' }}>Correct: {a.question.answer}</p>}
                          {a.question.explanation && <p className="text-xs ml-4 mt-0.5 italic" style={{ color: '#9B9B9B' }}>{a.question.explanation}</p>}
                        </div>
                      ))}
                    </div>
                    <button onClick={resetQuiz} className="w-full py-3 rounded-xl text-sm font-medium transition-colors" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#6B6B6B' }}>New Quiz</button>
                  </div>
                ) : (
                  <div style={{ animation: quizAnswerFlash === 'correct' ? 'flashGreen 0.5s ease' : quizAnswerFlash === 'wrong' ? 'shakeRed 0.5s ease' : 'none' }}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs uppercase tracking-widest font-medium" style={{ color: dot }}>Question {quizIdx + 1} of {quizQuestions.length}</p>
                      <div className="flex gap-1.5">
                        {quizQuestions.map((_, i) => (
                          <div key={i} className="w-2 h-2 rounded-full transition-colors" style={{ backgroundColor: i < quizIdx ? (quizAnswers[i]?.correct ? '#10B981' : '#ef4444') : i === quizIdx ? dot : 'rgba(0,0,0,0.12)' }} />
                        ))}
                      </div>
                    </div>
                    <p className="font-semibold mb-5 leading-relaxed text-base" style={{ color: '#1A1A1A' }}>{quizQuestions[quizIdx]?.question}</p>
                    <div className="space-y-2.5 mb-4">
                      {quizQuestions[quizIdx]?.options.map((opt, i) => {
                        const isSelected = quizSelected === opt
                        const isCorrect = quizConfirmed && opt === quizQuestions[quizIdx].answer
                        const isWrong = quizConfirmed && isSelected && !isCorrect
                        return (
                          <button
                            key={i}
                            onClick={() => !quizConfirmed && setQuizSelected(opt)}
                            className="w-full text-left px-4 py-3.5 rounded-xl border text-sm transition-all font-medium"
                            style={
                              isCorrect ? { backgroundColor: '#F0FDF4', borderColor: '#86EFAC', color: '#16A34A' }
                              : isWrong ? { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', color: '#DC2626' }
                              : isSelected ? { borderColor: dot, backgroundColor: `${dot}12`, color: '#1A1A1A' }
                              : { borderColor: 'rgba(0,0,0,0.10)', color: '#6B6B6B', backgroundColor: '#FFFFFF' }
                            }
                          >
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                    {quizConfirmed && quizQuestions[quizIdx]?.explanation && (
                      <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: `${dot}08`, border: `1px solid ${dot}20` }}>
                        <p className="text-xs leading-relaxed italic" style={{ color: '#9B9B9B' }}>{quizQuestions[quizIdx].explanation}</p>
                      </div>
                    )}
                    <button
                      onClick={quizConfirmed ? handleNextQuestion : handleConfirmAnswer}
                      disabled={!quizConfirmed && quizSelected === null}
                      className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-30 transition-all"
                      style={{ backgroundColor: quizConfirmed || quizSelected ? dot : 'rgba(0,0,0,0.08)' }}
                    >
                      {quizConfirmed ? (quizIdx + 1 >= quizQuestions.length ? 'See Results' : 'Next Question →') : 'Check Answer'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Notes ── */}
            {activeTab === 'notes' && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>Today's notes</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#9B9B9B' }}>
                      Capture key concepts, definitions, and a short summary. Saved to{' '}
                      <strong style={{ color: '#6B6B6B', fontWeight: 600 }}>{session.courseName} · {session.sessionType}</strong> automatically.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {notesAutoSaved && (
                      <span className="text-xs flex items-center gap-1" style={{ color: '#10B981' }}>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        Saved
                      </span>
                    )}
                    <button
                      onClick={handleDownloadPDF}
                      disabled={pdfDownloading || !hasNotes}
                      className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
                      style={{ color: '#9B9B9B' }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {pdfDownloading ? 'Generating…' : 'Export PDF'}
                    </button>
                  </div>
                </div>

                <textarea
                  ref={mainRef}
                  value={notesMain}
                  onChange={e => { setNotesMain(e.target.value); autoGrow(e) }}
                  placeholder={'• concept\n• term = ...\n• key idea'}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none text-sm resize-none leading-relaxed"
                  style={{
                    minHeight: 120,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid rgba(0,0,0,0.10)',
                    color: '#1A1A1A',
                  }}
                />
              </div>
            )}

            </div>
          </div>
        )}

        {/* ── Bottom tab bar ── */}
        <div className="shrink-0 overflow-x-auto" style={{ backgroundColor: '#FFFFFF', borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <div style={{ display: 'flex', minWidth: 'fit-content' }}>
            {SESSION_TABS.map(({ id, label, num }) => {
              const isActive = activeTab === id
              const wasVisited = tabsVisited.has(id)
              const tabColor = TAB_COLORS[id] ?? dot
              return (
                <button
                  key={id}
                  onClick={() => isActive ? setActiveTab(null) : visitTab(id)}
                  style={{
                    flex: '1 1 0',
                    minWidth: 80,
                    padding: '10px 8px 8px',
                    border: 'none',
                    borderTop: isActive ? `2px solid ${tabColor}` : '2px solid transparent',
                    backgroundColor: isActive ? `${tabColor}12` : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    transition: 'all 0.15s',
                    color: isActive ? tabColor : wasVisited && !isActive ? '#6B6B6B' : '#C0C0C0',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {label}
                    {wasVisited && !isActive && (
                      <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', backgroundColor: tabColor, marginLeft: 4, verticalAlign: 'middle', marginBottom: 1, opacity: 0.7 }} />
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: isActive ? tabColor : '#C0C0C0', fontFamily: 'ui-monospace, monospace' }}>
                    {isActive ? '▲ hide' : num}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
        @keyframes ringPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.78; }
        }
        @keyframes checkPulse {
          0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
          50% { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
        }
        @keyframes flashGreen {
          0%, 100% { background-color: transparent; }
          30% { background-color: rgba(16,185,129,0.08); }
        }
        @keyframes shakeRed {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
