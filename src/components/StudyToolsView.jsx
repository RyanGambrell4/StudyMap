import { useState, useRef, useEffect } from 'react'
import Spinner from './ui/spinner'
import imageCompression from 'browser-image-compression'
import { extractText } from '../utils/extractText'
import { getCachedStudyTools, getCachedCoachPlan, saveStudyTools } from '../lib/db'
import { getToolSessionsThisWeek, getStudyHistory } from '../lib/studyHistory'
import { sm2, sortCardsByDue, getDueCards } from '../lib/sm2'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, hasUsedTrial } from '../lib/subscription'
import { findSimilarCards, dedupeAgainstExisting } from '../lib/embeddings'
import { getDeckHealth, labelForSource } from '../lib/deckHealth'
import { useCelebration } from '../utils/useCelebration'
import { hydrateCourseContext } from '../lib/courseContext'
import { track } from '../lib/analytics'

function loadSaved() {
  return getCachedStudyTools()
}

// ── Flashcard ──────────────────────────────────────────────────────────────────
function Flashcard({ card, flipped, onFlip }) {
  const isWeak = card?.isWeakTopic || card?.reviewFirst
  return (
    <div
      className="w-full cursor-pointer select-none"
      style={{ perspective: 900 }}
      onClick={onFlip}
    >
      <div className={`fc-inner${flipped ? ' fc-flipped' : ''}`} style={{ minHeight: 220 }}>
        {/* Front */}
        <div className="fc-face bg-white border border-[#E5E5E5] rounded-2xl flex flex-col items-center justify-center p-8 gap-3 relative">
          {isWeak && (
            <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 999, padding: '2px 8px' }}>
              REVIEW FIRST
            </span>
          )}
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6B6B6B]">Concept</span>
          <p className="text-[#111111] text-xl font-bold text-center leading-snug">{card.front}</p>
          <span className="text-[#9B9B9B] text-xs mt-2">Tap to reveal answer</span>
        </div>
        {/* Back */}
        <div className="fc-face fc-back bg-white border border-[#E5E5E5] rounded-2xl flex flex-col items-center justify-center p-8 gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6B6B6B]">Answer</span>
          <p className="text-[#111111] text-base text-center leading-relaxed">{card.back}</p>
        </div>
      </div>
    </div>
  )
}

// ── Quiz question ──────────────────────────────────────────────────────────────
function QuizQuestion({ question, onAnswer }) {
  const [selected, setSelected] = useState(null)
  const [fillInput, setFillInput] = useState('')
  const [revealed, setRevealed] = useState(false)

  function submit(answer) {
    if (revealed) return
    let correct
    if (question.type === 'mc' || question.type === 'multiple_choice') correct = answer === question.answer
    else if (question.type === 'tf') correct = answer === question.answer
    else correct = fillInput.trim().toLowerCase() === question.answer.toLowerCase()
    setSelected(answer)
    setRevealed(true)
    setTimeout(() => onAnswer(correct), 1400)
  }

  return (
    <div className="space-y-5">
      {/* Question */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            (question.type === 'mc' || question.type === 'multiple_choice') ? 'bg-[#F0EFEC] text-[#6B6B6B]' :
            question.type === 'tf' ? 'bg-[#F0EFEC] text-[#6B6B6B]' :
            'bg-[#F0EFEC] text-[#6B6B6B]'
          }`}>
            {(question.type === 'mc' || question.type === 'multiple_choice') ? 'Multiple Choice' : question.type === 'tf' ? 'True / False' : 'Fill in the Blank'}
          </span>
        </div>
        <p className="text-[#111111] font-semibold text-base leading-relaxed">{question.question}</p>
        {question.hint && <p className="text-[#9B9B9B] text-xs mt-1">{question.hint}</p>}
      </div>

      {/* Answers */}
      {(question.type === 'mc' || question.type === 'multiple_choice') && (
        <div className="space-y-2.5">
          {question.options.map((opt, i) => {
            const isSelected = selected === opt
            const isCorrect = opt === question.answer
            const showRight = revealed && isCorrect
            const showWrong = revealed && isSelected && !isCorrect
            return (
              <button
                key={i}
                onClick={() => !revealed && submit(opt)}
                disabled={revealed}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  showRight ? 'bg-emerald-50 border-emerald-400 text-emerald-700' :
                  showWrong ? 'bg-red-50 border-red-400 text-red-700' :
                  isSelected ? 'bg-[#F0EFE9] border-[#D4D4D4] text-[#111111]' :
                  'bg-white border-[#E5E5E5] text-[#6B6B6B] hover:border-[#3B61C4] hover:text-[#111111]'
                }`}
              >
                <span className="text-[#9B9B9B] mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
                {showRight && (
                  <svg className="inline-block ml-2 w-4 h-4 text-emerald-600 align-text-bottom" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" /></svg>
                )}
                {showWrong && (
                  <svg className="inline-block ml-2 w-4 h-4 text-red-600 align-text-bottom" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>
                )}
              </button>
            )
          })}
          {revealed && question.explanation && (
            <p className="text-[#9B9B9B] text-xs px-1 mt-1">{question.explanation}</p>
          )}
        </div>
      )}

      {question.type === 'tf' && (
        <div className="flex gap-3">
          {[true, false].map(val => {
            const isSelected = selected === val
            const isCorrect = val === question.answer
            const showRight = revealed && isCorrect
            const showWrong = revealed && isSelected && !isCorrect
            return (
              <button
                key={String(val)}
                onClick={() => !revealed && submit(val)}
                disabled={revealed}
                className={`flex-1 py-3 rounded-xl border font-semibold text-sm transition-all ${
                  showRight ? 'bg-emerald-50 border-emerald-400 text-emerald-700' :
                  showWrong ? 'bg-red-50 border-red-400 text-red-700' :
                  isSelected ? 'bg-[#F0EFE9] border-[#D4D4D4] text-[#111111]' :
                  'bg-white border-[#E5E5E5] text-[#6B6B6B] hover:border-[#3B61C4] hover:text-[#111111]'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{val ? 'True' : 'False'}</span>
                  {showRight && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  {showWrong && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {question.type === 'fill' && (
        <div className="space-y-3">
          <input
            type="text"
            value={fillInput}
            onChange={e => setFillInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !revealed && fillInput.trim() && submit(fillInput)}
            disabled={revealed}
            placeholder="Type your answer…"
            autoFocus
            className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#111111] placeholder-[#9B9B9B] focus:outline-none focus:ring-2 focus:ring-[#3B61C4] text-sm"
          />
          {!revealed && (
            <button
              onClick={() => fillInput.trim() && submit(fillInput)}
              disabled={!fillInput.trim()}
              className="w-full bg-[#3B61C4] hover:bg-[#2d4fa8] disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Submit Answer
            </button>
          )}
          {revealed && (
            <div className={`px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${
              fillInput.trim().toLowerCase() === question.answer.toLowerCase()
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {fillInput.trim().toLowerCase() === question.answer.toLowerCase() ? (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" /></svg>
                  Correct!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>
                  The answer was: {question.answer}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function StudyToolsView({ courses, userId, onShowPaywall, onNavigateToCoach, learningStyle, yearLevel = null, firstName = null, schoolType = null, assignments = [], onOpenCheatSheet, onOpenBrainDump, onOpenExamRescue, onOpenQuizBurst, onOpenPodcast, onOpenTeachItBack, onOpenConnectionsMode, onOpenTimeAttack, onOpenSessionBundle, initialDrillTopic, onDrillTopicConsumed }) {
  const fileInputRef = useRef(null)
  const scanInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  // Upload + extraction state
  const [uploadedFile, setUploadedFile] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

  // YouTube ingestion state
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isImportingYoutube, setIsImportingYoutube] = useState(false)
  const [youtubeError, setYoutubeError] = useState('')
  const [youtubeTitle, setYoutubeTitle] = useState('')

  // Lecture audio upload state
  const audioInputRef = useRef(null)
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [audioFileName, setAudioFileName] = useState('')
  const [showTextPreview, setShowTextPreview] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)

  // Mode + content
  const [mode, setMode] = useState('hub') // 'hub' | 'upload' | 'flashcards' | 'quiz'
  const [flashcards, setFlashcards] = useState([])
  const [quiz, setQuiz] = useState([])
  const [startHere, setStartHere] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [generateError, setGenerateError] = useState('')

  // Flashcard state
  const [cardIdx, setCardIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [knownSet, setKnownSet] = useState(new Set())
  const [almostSet, setAlmostSet] = useState(new Set())
  const [reviewSet, setReviewSet] = useState(new Set())

  const celebrate = useCelebration()
  const deckDoneRef = useRef(false)

  // deckDoneRef prevents double-fire if the component re-renders after rating the last card


  // Quiz state
  const [questionIdx, setQuestionIdx] = useState(0)
  const [answers, setAnswers] = useState([]) // array of booleans
  const [quizDone, setQuizDone] = useState(false)

  // Test mode (timed)
  const [testMode, setTestMode] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef(null)

  // Card search state
  const [cardSearch, setCardSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  // Topic Drill state
  const [drillTopic, setDrillTopic] = useState('')
  const [drillCourse, setDrillCourse] = useState(null)
  const [drillQuiz, setDrillQuiz] = useState([])
  const [drillQuestionIdx, setDrillQuestionIdx] = useState(0)
  const [drillAnswers, setDrillAnswers] = useState([])
  const [drillDone, setDrillDone] = useState(false)
  const [drillGenerating, setDrillGenerating] = useState(false)
  const [drillError, setDrillError] = useState('')

  // Load saved tools state on mount
  useEffect(() => {
    const saved = loadSaved()
    if (saved?.flashcards?.length) {
      setFlashcards(sortCardsByDue(saved.flashcards))
      setQuiz(saved.quiz ?? [])
      setExtractedText(saved.text ?? '')
      setSelectedCourse(saved.courseIdx ?? null)
      if (saved.fileLabel) setUploadedFile({ name: saved.fileLabel })
    }
  }, [])

  // Auto-open drill when navigated here from another tool (e.g. Brain Dump → Drill the Gaps)
  useEffect(() => {
    if (!initialDrillTopic) return
    setDrillTopic(initialDrillTopic)
    setDrillQuiz([])
    setDrillAnswers([])
    setDrillDone(false)
    setDrillQuestionIdx(0)
    setDrillError('')
    setMode('drill')
    onDrillTopicConsumed?.()
  }, [initialDrillTopic])

  // Timer effect - runs only in test mode during quiz
  useEffect(() => {
    if (mode === 'quiz' && testMode && !quizDone && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current)
            setQuizDone(true)
            return 0
          }
          return t - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [mode, testMode, quizDone])

  async function handleFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'pptx'].includes(ext)) {
      setExtractError('Please upload a PDF, .docx, or .pptx file.')
      return
    }
    setUploadedFile(file)
    setExtractError('')
    setIsExtracting(true)
    setExtractedText('')
    setPastedText('')
    setFlashcards([])
    setQuiz([])
    setMode('upload')
    try {
      const text = await extractText(file)
      setExtractedText(text)
    } catch (err) {
      setExtractError(err.message ?? 'Failed to extract text from file.')
      setUploadedFile(null)
    } finally {
      setIsExtracting(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleScanImage(file) {
    if (!file) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setScanError('')
    setIsScanning(true)
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true })
      const mediaType = compressed.type || 'image/jpeg'
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(compressed)
      })
      const token = await getAccessToken()
      const res = await fetch('/api/scan-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to scan notes')
      setPastedText(data.text)
      incrementAIQuery()
      setUploadedFile(null)
      setExtractedText('')
      setMode('upload')
    } catch (e) {
      setScanError(e.message)
    } finally {
      setIsScanning(false)
      if (scanInputRef.current) scanInputRef.current.value = ''
    }
  }

  async function handleAudioUpload(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['mp3', 'm4a', 'mp4', 'wav', 'webm', 'ogg', 'oga', 'aac', 'flac']
    if (!allowed.includes(ext)) {
      setAudioError('Please upload an audio file (mp3, m4a, wav, webm, ogg, aac, flac)')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setAudioError('File too large. Max 50 MB.')
      return
    }
    setAudioError('')
    setIsTranscribingAudio(true)
    setAudioFileName(file.name)
    setPastedText('')
    setExtractedText('')
    setUploadedFile(null)
    setYoutubeTitle('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/transcribe-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-ext': ext,
          Authorization: `Bearer ${token}`,
        },
        body: file,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Transcription failed')
      setPastedText(data.transcript)
    } catch (err) {
      setAudioError(err.message ?? 'Could not transcribe this audio file')
      setAudioFileName('')
    } finally {
      setIsTranscribingAudio(false)
    }
  }

  async function handleYoutubeImport() {
    if (!youtubeUrl.trim()) return
    setYoutubeError('')
    setIsImportingYoutube(true)
    setYoutubeTitle('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/youtube-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch transcript')
      setPastedText(data.transcript)
      setExtractedText('')
      setUploadedFile(null)
      setYoutubeTitle(data.title ?? '')
      setYoutubeUrl('')
    } catch (err) {
      setYoutubeError(err.message ?? 'Could not import this video')
    } finally {
      setIsImportingYoutube(false)
    }
  }

  async function handleGenerateFlashcards() {
    // Check AI query limit before calling
    if (!canUseAI()) {
      onShowPaywall?.('ai')
      return
    }

    setIsGenerating(true)
    setGenerateError('')
    setLoadingMessage('Reading your notes and building study materials...')
    track('flashcards_started', { hasCourse: selectedCourse !== null, source: uploadedFile ? 'file' : pastedText ? 'paste' : 'youtube' })
    const activeCourse = selectedCourse !== null ? courses[selectedCourse] : null
    const activePlan = activeCourse?.id ? getCachedCoachPlan(activeCourse.id) : null
    const fcEmphasis = activePlan?.formData?.emphasisTopics ?? activePlan?.formData?.topics?.join(', ') ?? null
    const fcStruggles = activePlan?.struggles ?? []
    // Full context so the API can flag weak-topic flashcards as review-first,
    // pull terminology from the syllabus, and dedupe against past cards.
    const courseContext = hydrateCourseContext(activeCourse, {
      firstName, yearLevel, learningStyle, schoolType, assignments,
    })
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: activeText,
          courseName: activeCourse?.name ?? null,
          professorEmphasis: fcEmphasis || null,
          struggles: fcStruggles.length ? fcStruggles : null,
          learningStyle: learningStyle ?? null,
          courseContext,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `API returned ${response.status}`)
      if (!data.flashcards?.length) throw new Error('No flashcards returned')
      // Dedupe against flashcards already generated for this course so the
      // student doesn't see the same "define mitosis" card three sessions
      // in a row. Fails open — never blocks the deck from appearing.
      const priorSaved = getCachedStudyTools()
      const priorCards = (priorSaved?.flashcards ?? []).filter(c =>
        !activeCourse || priorSaved?.courseIdx === selectedCourse
      )
      const rawCards = data.flashcards ?? []
      let uniqueCards = rawCards
      let dropped = []
      if (priorCards.length && rawCards.length) {
        const result = await dedupeAgainstExisting(rawCards, priorCards, 0.90)
        uniqueCards = result.kept
        dropped = result.dropped
      }
      // If dedup left us with too few cards, fall back to the full raw set —
      // better to show a mostly-fresh deck than an anemic one.
      if (uniqueCards.length < Math.min(6, rawCards.length)) uniqueCards = rawCards

      // Weak-topic cards front of deck so the student closes real gaps first,
      // regardless of SM-2 due dates. The rest keeps SM-2 order.
      const weakFirst = [
        ...uniqueCards.filter(c => c.isWeakTopic || c.reviewFirst),
        ...uniqueCards.filter(c => !(c.isWeakTopic || c.reviewFirst)),
      ]
      const cards = sortCardsByDue(weakFirst)
      const q = data.quiz ?? []
      setFlashcards(cards)
      setQuiz(q)
      const startHint = data.startHere ?? ''
      const dedupHint = dropped.length > 0
        ? `Dropped ${dropped.length} card${dropped.length === 1 ? '' : 's'} you already have. ${startHint}`.trim()
        : startHint
      setStartHere(dedupHint)
      setCardIdx(0)
      setFlipped(false)
      setKnownSet(new Set())
      setAlmostSet(new Set())
      setReviewSet(new Set())
      track('flashcards_generated', { cardCount: cards.length, quizCount: q.length, plan: getActivePlan() })
      setMode('flashcards')
      saveStudyTools({
        flashcards: cards,
        quiz: q,
        text: activeText,
        courseIdx: selectedCourse,
        fileLabel: uploadedFile?.name ?? (pastedText ? 'Pasted notes' : ''),
      })
      // Track AI query usage
      await incrementAIQuery()
    } catch (err) {
      track('flashcards_error', { error: err.message ?? 'unknown' })
      setGenerateError(err.message ?? 'Failed to generate study materials. Please try again.')
    } finally {
      setIsGenerating(false)
      setLoadingMessage('')
    }
  }

  function handleGenerateQuiz(timed = false) {
    setQuestionIdx(0)
    setAnswers([])
    setQuizDone(false)
    setTestMode(timed)
    if (timed) setTimeLeft(quiz.length * 45) // 45s per question
    clearInterval(timerRef.current)
    setMode('quiz')
  }

  function handleFlashcardRate(rating) {
    // rating: 'know' | 'almost' | 'review'
    setKnownSet(prev => { const s = new Set(prev); if (rating === 'know') s.add(cardIdx); else s.delete(cardIdx); return s })
    setAlmostSet(prev => { const s = new Set(prev); if (rating === 'almost') s.add(cardIdx); else s.delete(cardIdx); return s })
    setReviewSet(prev => { const s = new Set(prev); if (rating === 'review') s.add(cardIdx); else s.delete(cardIdx); return s })
    setFlipped(false)
    const isLast = cardIdx === flashcards.length - 1
    if (isLast && !deckDoneRef.current) {
      deckDoneRef.current = true
      setTimeout(() => celebrate('medium'), 300)
    } else if (!isLast) {
      deckDoneRef.current = false
    }
    setTimeout(() => {
      if (cardIdx < flashcards.length - 1) setCardIdx(i => i + 1)
    }, 150)
  }

  function handleRate(quality) {
    const currentCard = flashcards[cardIdx]
    const updated = sm2(currentCard, quality)
    const updatedCards = flashcards.map((c, i) =>
      i === cardIdx ? { ...c, ...updated } : c
    )
    setFlashcards(updatedCards)
    // Persist to Supabase (fire-and-forget)
    saveStudyTools({
      flashcards: updatedCards,
      quiz,
      text: activeText,
      courseIdx: selectedCourse,
      fileLabel: uploadedFile?.name ?? (pastedText ? 'Pasted notes' : ''),
    })
    setFlipped(false)
    const isLastSm2 = cardIdx === flashcards.length - 1
    if (isLastSm2 && !deckDoneRef.current) {
      deckDoneRef.current = true
      track('flashcard_deck_complete', { cardCount: flashcards.length, plan: getActivePlan() })
      setTimeout(() => celebrate('medium'), 300)
    } else if (!isLastSm2) {
      deckDoneRef.current = false
    }
    setTimeout(() => {
      if (cardIdx < flashcards.length - 1) setCardIdx(i => i + 1)
    }, 150)
  }

  function handleQuizAnswer(correct) {
    const next = [...answers, correct]
    setAnswers(next)
    if (questionIdx + 1 >= quiz.length) {
      const finalScore = Math.round(([...answers, correct].filter(Boolean).length / quiz.length) * 100)
      track('flashcard_quiz_complete', { score: finalScore, questionCount: quiz.length, plan: getActivePlan() })
      setQuizDone(true)
    } else {
      setQuestionIdx(i => i + 1)
    }
  }

  function handleRetryQuiz() {
    const shuffled = [...quiz].sort(() => Math.random() - 0.5)
    setQuiz(shuffled)
    setQuestionIdx(0)
    setAnswers([])
    setQuizDone(false)
    if (testMode) setTimeLeft(shuffled.length * 45)
    clearInterval(timerRef.current)
  }

  function handleBack() {
    setMode('hub')
  }

  async function handleGenerateDrill() {
    if (!drillTopic.trim()) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    const course = drillCourse !== null ? courses[drillCourse] : null
    const courseName = course?.name ?? 'General'
    const drillPlan = course?.id ? getCachedCoachPlan(course.id) : null
    const drillEmphasis = drillPlan?.formData?.emphasisTopics ?? drillPlan?.formData?.topics?.join(', ') ?? null
    const drillStruggles = drillPlan?.struggles ?? []
    setDrillGenerating(true)
    setDrillError('')
    setDrillQuiz([])
    setDrillQuestionIdx(0)
    setDrillAnswers([])
    setDrillDone(false)
    track('drill_started', { topic: drillTopic.trim(), hasCourse: drillCourse !== null })
    try {
      const token = await getAccessToken()
      const drillContext = hydrateCourseContext(course, {
        firstName, yearLevel, learningStyle, schoolType, assignments,
      })
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'quick-quiz',
          courseName,
          topic: drillTopic.trim(),
          professorEmphasis: drillEmphasis || null,
          struggles: drillStruggles.length ? drillStruggles : null,
          learningStyle: learningStyle ?? null,
          courseContext: drillContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      const questions = (data.questions ?? []).map(q => ({ ...q, type: 'mc' }))
      if (!questions.length) throw new Error('No questions returned. Try a different topic.')
      track('drill_generated', { questionCount: questions.length, topic: drillTopic.trim(), plan: getActivePlan() })
      setDrillQuiz(questions)
      await incrementAIQuery()
    } catch (e) {
      track('drill_error', { error: e.message ?? 'unknown' })
      setDrillError(e.message)
    } finally {
      setDrillGenerating(false)
    }
  }

  async function handleCardSearch(query) {
    setCardSearch(query)
    if (!query.trim()) { setSearchResults(null); return }
    const results = await findSimilarCards(query, flashcards)
    setSearchResults(results)
  }

  const activeText = extractedText || pastedText
  const hasText = activeText.length > 50
  const score = answers.filter(Boolean).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto" style={{ animation: 'stv-in 220ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{`
        @keyframes stv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes stv-card { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .stv-tool-btn { transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s !important; }
        .stv-tool-btn:hover { border-color: rgba(0,0,0,0.14) !important; box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important; }
        .stv-tool-btn:active { transform: scale(0.97) !important; }
      `}</style>

      {/* Always-mounted hidden inputs (must be outside mode conditionals so refs work from hub) */}
      <input
        ref={audioInputRef}
        type="file"
        accept=".mp3,.m4a,.mp4,.wav,.webm,.ogg,.oga,.aac,.flac"
        className="hidden"
        onChange={e => { handleAudioUpload(e.target.files?.[0]); e.target.value = '' }}
      />

      {/* ── Hub screen ── */}
      {mode === 'hub' && (() => {
        const plan = getActivePlan()
        const isPro = plan === 'pro' || plan === 'unlimited' || plan === 'trial'
        const freeBadge = (feature, color) => {
          if (isPro) return { badge: null, badgeColor: color }
          const { remaining } = canUseFeature(feature)
          if (remaining === null) return { badge: null, badgeColor: color }
          if (remaining === 0) return { badge: hasUsedTrial() ? '0 left · Upgrade' : '0 left · Start trial', badgeColor: '#D97706' }
          return { badge: `${remaining} left`, badgeColor: color }
        }

        const tools = [
          {
            label: 'AI Cheat Sheet',
            desc: 'Instantly see what to focus on based on your weakest areas.',
            color: '#3B61C4',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>,
            onClick: () => isPro ? onOpenCheatSheet?.() : onShowPaywall?.('cheat-sheet'),
            pro: !isPro,
          },
          {
            label: 'Exam Rescue',
            desc: 'Get a crisis study plan when your exam is hours away.',
            color: '#DC2626',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
            onClick: () => onOpenExamRescue?.(),
            ...freeBadge('examRescue', '#DC2626'),
          },
          {
            label: 'Brain Dump',
            desc: 'Recall everything you know on a topic and score your memory.',
            color: '#059669',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/></svg>,
            onClick: () => onOpenBrainDump?.(),
            ...freeBadge('brainDump', '#059669'),
          },
          {
            label: 'Quiz Burst',
            desc: '5 rapid-fire questions in 10 seconds to warm up your brain.',
            color: '#D97706',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>,
            onClick: () => onOpenQuizBurst?.(),
            ...freeBadge('quizBurst', '#D97706'),
          },
          {
            label: 'Study Podcast',
            desc: 'AI hosts review your notes as a 5-minute audio conversation.',
            color: '#0D9488',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
            onClick: () => plan === 'unlimited' ? onOpenPodcast?.() : onShowPaywall?.('unlimited'),
            badge: plan !== 'unlimited' ? 'Unlimited' : null,
            badgeColor: '#0D9488',
          },
          {
            label: 'Flashcards',
            desc: 'Cards built from your notes, served on a spaced-repetition schedule.',
            color: '#3B61C4',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
            onClick: () => setMode('upload'),
            badge: flashcards.length > 0 ? `${flashcards.length} ready` : null,
            badgeColor: '#3B61C4',
          },
          {
            label: 'Quizzes',
            desc: 'Multiple choice, true/false, and fill-in-the-blank questions.',
            color: '#D97706',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
            onClick: () => setMode('upload'),
            badge: quiz.length > 0 ? `${quiz.length} ready` : null,
            badgeColor: '#D97706',
          },
          {
            label: 'Topic Drill',
            desc: 'Type any topic and get 5 practice questions instantly.',
            color: '#16A34A',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
            onClick: () => { setDrillQuiz([]); setDrillAnswers([]); setDrillDone(false); setDrillQuestionIdx(0); setDrillError(''); setMode('drill') },
            badge: 'No upload needed',
            badgeColor: '#16A34A',
          },
          {
            label: 'Lecture Audio',
            desc: 'Upload a recorded lecture (mp3, m4a, wav) to generate flashcards and a quiz.',
            color: '#0EA5E9',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>,
            onClick: () => { setAudioError(''); setMode('upload'); audioInputRef.current?.click() },
            badge: 'No notes needed',
            badgeColor: '#0EA5E9',
          },
          {
            label: 'YouTube Lecture',
            desc: 'Paste a YouTube lecture URL to generate flashcards and a quiz.',
            color: '#DC2626',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>,
            onClick: () => { setYoutubeUrl(''); setYoutubeError(''); setYoutubeTitle(''); setMode('upload') },
            badge: 'No notes needed',
            badgeColor: '#DC2626',
          },
          {
            label: 'Study Coach',
            desc: 'Week-by-week study plan built around your schedule and exams.',
            color: '#0891B2',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>,
            onClick: () => onNavigateToCoach?.(),
          },
          {
            label: 'Teach It Back',
            desc: 'Type out an explanation of any concept. Your understanding is scored and a follow-up tests it.',
            color: '#3B61C4',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
            onClick: () => onOpenTeachItBack?.(),
            ...freeBadge('teachItBack', '#3B61C4'),
          },
          {
            label: 'Connections',
            desc: 'See how your concepts relate to each other and explain the links.',
            color: '#059669',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4"/></svg>,
            onClick: () => onOpenConnectionsMode?.(),
            ...freeBadge('connectionsMode', '#059669'),
          },
          {
            label: 'Time Attack',
            desc: '60 seconds. 14 questions. How many can you get right?',
            color: '#EA580C',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>,
            onClick: () => onOpenTimeAttack?.(),
            badge: 'Speed Mode',
            badgeColor: '#EA580C',
          },
        ]

        const toolsByLabel = Object.fromEntries(tools.map(t => [t.label, t]))
        const contentReadyCount = [flashcards.length > 0, quiz.length > 0].filter(Boolean).length
        const recentSessions = getStudyHistory().slice(-4).reverse()
        const hubSections = [
          { id: 'quick', label: 'Quick Practice', keys: ['Quiz Burst', 'Topic Drill', 'Teach It Back', 'Brain Dump', 'Time Attack', 'Connections'] },
          { id: 'materials', label: 'Study Materials', keys: ['Flashcards', 'Quizzes', 'AI Cheat Sheet'] },
          { id: 'ai', label: 'Deep Work', keys: ['Study Coach', 'Exam Rescue', 'Study Podcast'] },
          { id: 'import', label: 'Import & Convert', keys: ['Lecture Audio', 'YouTube Lecture'] },
        ]

        return (
          <div>
            {contentReadyCount > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: '#DCFCE7', marginBottom: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: '#16A34A' }} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803D' }}>{contentReadyCount} tool{contentReadyCount !== 1 ? 's' : ''} have content ready</span>
              </div>
            )}

            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111111', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Study Tools</h1>
            <p style={{ fontSize: 13.5, color: '#6B6B6B', margin: '0 0 22px' }}>Pick a tool, pick a topic, and go.</p>

            {(() => {
              const health = getDeckHealth()
              if (health.total === 0) return null
              const primaryColor = health.dueToday >= 5 ? '#DC2626'
                : health.dueToday > 0 ? '#D97706'
                : '#16A34A'
              return (
                <div style={{ marginBottom: 22, background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: primaryColor }} />
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#9B9B9B', textTransform: 'uppercase' }}>Deck Health</div>
                    </div>
                    <button
                      onClick={() => setMode('flashcards')}
                      disabled={!flashcards.length}
                      style={{
                        fontSize: 12, fontWeight: 700,
                        padding: '6px 12px', borderRadius: 7,
                        background: flashcards.length ? primaryColor : 'transparent',
                        color: flashcards.length ? '#fff' : '#9B9B9B',
                        border: flashcards.length ? 'none' : '1px solid rgba(0,0,0,0.12)',
                        cursor: flashcards.length ? 'pointer' : 'default', fontFamily: 'inherit',
                      }}
                    >
                      {flashcards.length ? 'Review now →' : 'No deck yet'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                    {[
                      { label: 'Total', value: health.total, color: '#111' },
                      { label: 'Due today', value: health.dueToday, color: primaryColor, emphasized: true },
                      { label: 'Stale (14d+)', value: health.stale, color: '#D97706' },
                      { label: 'Sticky misses', value: health.consistentlyMissed, color: '#DC2626' },
                    ].map(cell => (
                      <div key={cell.label} style={{
                        padding: '10px 12px', borderRadius: 10,
                        background: cell.emphasized ? `${cell.color}0F` : '#F7F6F3',
                        border: cell.emphasized ? `1px solid ${cell.color}33` : '1px solid rgba(0,0,0,0.05)',
                      }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: cell.color, letterSpacing: '-0.02em' }}>{cell.value}</div>
                        <div style={{ fontSize: 10.5, color: '#6B6B6B', fontWeight: 600, marginTop: 1 }}>{cell.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 12.5, color: '#111', lineHeight: 1.5, marginBottom: health.topicBreakdown.length ? 12 : 0 }}>
                    <strong style={{ color: primaryColor }}>Do this next:</strong> {health.recommendedAction}
                  </div>

                  {health.topicBreakdown.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {health.topicBreakdown.map(t => (
                        <span key={t.topic} style={{
                          fontSize: 11.5, padding: '4px 10px', borderRadius: 999,
                          background: t.dueNow > 0 ? 'rgba(220,38,38,0.06)' : '#F7F6F3',
                          border: `1px solid ${t.dueNow > 0 ? 'rgba(220,38,38,0.20)' : 'rgba(0,0,0,0.07)'}`,
                          color: t.dueNow > 0 ? '#DC2626' : '#6B6B6B', fontWeight: 600,
                        }}>
                          {t.topic}{t.dueNow > 0 ? ` · ${t.dueNow} due` : ` · ${t.count}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {health.fromMisses > 0 && health.newestSource && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: '#9B9B9B' }}>
                      {health.fromMisses} card{health.fromMisses === 1 ? '' : 's'} auto-added this month — most recently from {labelForSource(health.newestSource)}.
                    </div>
                  )}
                </div>
              )
            })()}

            {onOpenSessionBundle && courses.length > 0 && (
              <div style={{ marginBottom: 22, padding: '18px 20px', borderRadius: 14, background: 'linear-gradient(135deg, #111111 0%, #1F1F1F 100%)', color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(232,83,26,0.20)', filter: 'blur(40px)' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#F97316', marginBottom: 8 }}>Session Bundle</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginBottom: 4 }}>Start a 15-min session</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, marginBottom: 14 }}>
                    One tap. We pick your weakest topic, run a brain dump, quiz you on it, and show what you moved. No setup.
                  </div>
                  <button
                    onClick={onOpenSessionBundle}
                    style={{ padding: '11px 20px', background: '#E8531A', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(232,83,26,0.45)' }}
                  >
                    Start now →
                  </button>
                </div>
              </div>
            )}

            {recentSessions.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 10px' }}>Recent Activity</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {recentSessions.map((s, i) => {
                    const pct = s.score != null ? s.score : null
                    const scoreColor = pct == null ? '#9B9B9B' : pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626'
                    const when = (() => {
                      const d = new Date(s.date)
                      const now = new Date()
                      const diffMs = now - d
                      const diffH = Math.floor(diffMs / 36e5)
                      if (diffH < 1) return 'just now'
                      if (diffH < 24) return `${diffH}h ago`
                      const diffD = Math.floor(diffMs / 864e5)
                      return diffD === 1 ? 'yesterday' : `${diffD}d ago`
                    })()
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', flexShrink: 0 }}>{s.tool}</span>
                          {s.topic && <span style={{ fontSize: 11, color: '#9B9B9B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {s.topic}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {pct != null && <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>{pct}%</span>}
                          <span style={{ fontSize: 10.5, color: '#C4C4C4' }}>{when}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {hubSections.map(({ id, label, keys }, sIdx) => {
              const sectionTools = keys.map(k => toolsByLabel[k]).filter(Boolean)
              return (
                <div key={id} style={{ marginBottom: 20, animation: `stv-in 260ms ease ${sIdx * 60}ms both` }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 8px' }}>{label}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {sectionTools.map(({ label: lbl, desc, color, icon, onClick, pro, badge, badgeColor }) => {
                      const isNoNotes = badge === 'No notes needed' || badge === 'No upload needed' || badge === 'Speed Mode'
                      const isProBadge = pro || badge === 'Unlimited'
                      const showCountBadge = badge && !isNoNotes && !isProBadge
                      const weeklySessions = getToolSessionsThisWeek(lbl)
                      return (
                        <button
                          key={lbl}
                          onClick={onClick}
                          className="stv-tool-btn"
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '12px 12px', borderRadius: 12, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          <div style={{ width: 38, height: 38, borderRadius: 9, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0, marginTop: 1 }}>
                            {icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111111', lineHeight: 1.3 }}>{lbl}</span>
                              {isProBadge && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(59,97,196,0.1)', color: '#3B61C4', border: '1px solid rgba(59,97,196,0.2)', letterSpacing: '0.04em' }}>PRO</span>
                              )}
                              {showCountBadge && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.25)', letterSpacing: '0.02em' }}>{badge}</span>
                              )}
                            </div>
                            {isNoNotes && badge !== 'Speed Mode' && (
                              <div style={{ marginBottom: 3 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#D97706' }}>No notes needed</span>
                              </div>
                            )}
                            {badge === 'Speed Mode' && (
                              <div style={{ marginBottom: 3 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#EA580C' }}>Speed Mode</span>
                              </div>
                            )}
                            <p style={{ margin: 0, fontSize: 11.5, color: '#6B6B6B', lineHeight: 1.4 }}>{desc}</p>
                            {weeklySessions > 0 && (
                              <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9B9B9B', fontWeight: 500 }}>{weeklySessions}x this week</p>
                            )}
                          </div>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                            <path d="M9 5l7 7-7 7"/>
                          </svg>
                        </button>
                      )
                    })}
                    {id === 'import' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: 12, border: '1.5px dashed rgba(0,0,0,0.12)', minHeight: 72 }}>
                        <span style={{ fontSize: 11.5, color: '#9B9B9B', fontWeight: 500, textAlign: 'center' }}>+ More tools coming soon</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── Upload section ── */}
      {mode === 'upload' && (
        <div className="space-y-5">
          {/* Back to hub */}
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setMode('hub')} className="flex items-center gap-2 text-[#6B6B6B] hover:text-[#111111] text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-lg font-bold text-[#111111]">Upload Material</h1>
          </div>
          {/* Course selector - always visible at top */}
          {courses.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#9B9B9B] mb-1.5">Which course is this for?</label>
              <select
                value={selectedCourse ?? ''}
                onChange={e => setSelectedCourse(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B61C4] appearance-none"
              >
                <option value="">No course</option>
                {courses.map((c, i) => (
                  <option key={i} value={i}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all"
            style={dragging
              ? { borderColor: '#3b82f6', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }
              : uploadedFile && hasText
                ? { borderColor: '#86efac', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' }
                : { borderColor: 'rgba(59,97,196,0.3)', background: 'linear-gradient(135deg, #EEF2FF, #E8EEFF)' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={isExtracting
                ? { background: '#3B61C4', boxShadow: '0 4px 14px rgba(59,97,196,0.3)' }
                : uploadedFile && hasText
                  ? { background: '#16A34A', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }
                  : { background: '#3B61C4', boxShadow: '0 4px 14px rgba(59,97,196,0.3)' }}>
              {isExtracting ? (
                <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : uploadedFile && hasText ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
            </div>
            {isExtracting ? (
              <div className="text-center">
                <p className="font-semibold" style={{ color: '#2563eb' }}>Extracting text…</p>
                <p className="text-[#9B9B9B] text-xs mt-1">This may take a moment</p>
              </div>
            ) : uploadedFile && hasText ? (
              <div className="text-center">
                <p className="font-bold truncate max-w-xs" style={{ color: '#15803d' }}>{uploadedFile.name}</p>
                <p className="text-xs mt-1" style={{ color: '#16a34a' }}>
                  {extractedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words extracted · click to replace
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-semibold" style={{ color: '#3B61C4' }}>Drop your file here or click to browse</p>
                <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>PDF, .docx, or .pptx</p>
              </div>
            )}
          </div>

          {/* Scan handwritten notes */}
          <div>
            <p className="text-xs text-[#9B9B9B] text-center mb-3">or</p>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => handleScanImage(e.target.files?.[0])}
            />
            <button
              onClick={() => scanInputRef.current?.click()}
              disabled={isScanning}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-dashed border-[#E5E5E5] text-[#6B6B6B] hover:border-[#3B61C4] hover:text-[#3B61C4] hover:bg-blue-50/30 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning notes…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Scan Handwritten Notes
                </>
              )}
            </button>
            {scanError && (
              <p className="text-red-600 text-xs mt-2">{scanError}</p>
            )}
          </div>

          {/* Upload lecture audio */}
          <div>
            <p className="text-xs text-[#9B9B9B] text-center mb-3">or</p>
            <button
              onClick={() => { setAudioError(''); audioInputRef.current?.click() }}
              disabled={isTranscribingAudio}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-dashed border-[#E5E5E5] text-[#6B6B6B] hover:border-[#0EA5E9] hover:text-[#0EA5E9] hover:bg-sky-50/30 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTranscribingAudio ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Transcribing audio…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                  </svg>
                  Upload Lecture Audio (mp3, m4a, wav)
                </>
              )}
            </button>
            {audioError && <p className="text-red-600 text-xs mt-1.5">{audioError}</p>}
            {audioFileName && !isTranscribingAudio && pastedText.length > 50 && (
              <p style={{ fontSize: 11.5, color: '#16a34a', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Transcribed: <strong>{audioFileName}</strong>. {pastedText.trim().split(/\s+/).length.toLocaleString()} words. Click "Generate flashcards" below.
              </p>
            )}
          </div>

          {/* Paste box */}
          <div>
            <p className="text-xs text-[#9B9B9B] text-center mb-3">or</p>
            <label className="block text-xs font-medium text-[#9B9B9B] mb-1.5">Paste your notes directly</label>
            <textarea
              value={pastedText}
              onChange={e => {
                setPastedText(e.target.value)
                if (e.target.value) { setUploadedFile(null); setExtractedText('') }
              }}
              placeholder="Paste lecture notes, slides text, or any course material here…"
              rows={5}
              className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#111111] placeholder-[#9B9B9B] focus:outline-none focus:border-[#3B61C4] text-sm resize-none leading-relaxed"
            />
            {pastedText.length > 0 && pastedText.length <= 50 && (
              <p className="text-amber-400 text-xs mt-1">Paste at least a few sentences to generate useful materials.</p>
            )}
            {pastedText.length > 50 && (
              <p className="text-[#6B6B6B] text-xs mt-1">{pastedText.trim().split(/\s+/).length.toLocaleString()} words</p>
            )}
          </div>

          {/* YouTube lecture import */}
          <div>
            <p className="text-xs text-[#9B9B9B] text-center mb-3">or import a YouTube lecture</p>
            <div className="flex gap-2">
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#DC2626" stroke="none"/></svg>
                </span>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={e => { setYoutubeUrl(e.target.value); setYoutubeError('') }}
                  onKeyDown={e => e.key === 'Enter' && !isImportingYoutube && youtubeUrl.trim() && handleYoutubeImport()}
                  placeholder="youtube.com/watch?v=..."
                  style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, borderRadius: 10, border: '1px solid #E5E5E5', fontSize: 13, color: '#111', background: '#fff', boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#DC2626'}
                  onBlur={e => e.target.style.borderColor = '#E5E5E5'}
                />
              </div>
              <button
                onClick={handleYoutubeImport}
                disabled={!youtubeUrl.trim() || isImportingYoutube}
                style={{ flexShrink: 0, padding: '10px 16px', borderRadius: 10, background: '#DC2626', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: youtubeUrl.trim() && !isImportingYoutube ? 'pointer' : 'not-allowed', opacity: youtubeUrl.trim() && !isImportingYoutube ? 1 : 0.5, whiteSpace: 'nowrap' }}
              >
                {isImportingYoutube ? 'Importing…' : 'Import'}
              </button>
            </div>
            {youtubeError && <p className="text-red-600 text-xs mt-1.5">{youtubeError}</p>}
            {youtubeTitle && !isImportingYoutube && (
              <p style={{ fontSize: 11.5, color: '#16a34a', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Imported: <strong>{youtubeTitle}</strong>. Transcript ready. Click "Generate flashcards" below.
              </p>
            )}
          </div>

          {extractError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {extractError}
            </div>
          )}

          {generateError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {generateError}
            </div>
          )}


          {/* Text preview */}
          {hasText && (
            <div>
              <button
                onClick={() => setShowTextPreview(v => !v)}
                className="flex items-center gap-2 text-xs text-[#9B9B9B] hover:text-[#D4D4D4] transition-colors"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showTextPreview ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showTextPreview ? 'Hide' : 'Show'} extracted text
              </button>
              {showTextPreview && (
                <div className="mt-2 bg-[#F0EFEC] border border-[#E5E5E5] rounded-xl p-4 max-h-48 overflow-y-auto">
                  <p className="text-[#6B6B6B] text-xs whitespace-pre-wrap leading-relaxed">{extractedText.slice(0, 2000)}{extractedText.length > 2000 ? '\n…' : ''}</p>
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {isGenerating && (
            <div className="bg-white rounded-2xl px-6 py-8 flex flex-col items-center gap-4" style={{ border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <Spinner size="md" />
              <div className="text-center">
                <p className="text-[#111111] font-semibold">{loadingMessage}</p>
                <p className="text-[#6B6B6B] text-xs mt-1">This usually takes 5–10 seconds</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {hasText && !isGenerating && (
            <div className="flex gap-3">
              <button
                onClick={handleGenerateFlashcards}
                className="flex-1 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: '#3B61C4', boxShadow: '0 4px 16px rgba(59,97,196,0.3)' }}
              >
                Generate flashcards
              </button>
              {quiz.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleGenerateQuiz(false)}
                    className="bg-white hover:bg-[#F7F6F3] border border-[#E5E5E5] text-[#6B6B6B] font-semibold py-2 px-4 rounded-xl text-xs transition-colors"
                  >
                    Quiz
                  </button>
                  <button
                    onClick={() => handleGenerateQuiz(true)}
                    className="bg-white hover:bg-[#F7F6F3] border border-amber-300 text-amber-600 font-semibold py-2 px-4 rounded-xl text-xs transition-colors"
                  >
                    Timed
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Previously generated cards */}
          {flashcards.length > 0 && (
            <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4">
              <p className="text-[#6B6B6B] text-xs font-medium mb-3">Previously generated</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setCardIdx(0); setFlipped(false); setMode('flashcards') }}
                  className="flex items-center gap-2 text-sm text-[#3B61C4] hover:text-[#2d4fa8] border border-[#E5E5E5] hover:border-[#3B61C4] px-3 py-2 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {flashcards.length} flashcards
                </button>
                {quiz.length > 0 && (
                  <button
                    onClick={() => handleGenerateQuiz(false)}
                    className="flex items-center gap-2 text-sm text-[#6B6B6B] hover:text-[#111111] border border-[#E5E5E5] hover:border-[#D4D4D4] px-3 py-2 rounded-xl transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {quiz.length} quiz questions
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Flashcard mode ── */}
      {mode === 'flashcards' && flashcards.length > 0 && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="flex items-center gap-2 text-[#6B6B6B] hover:text-[#111111] text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              {getDueCards(flashcards).length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px',
                  background: 'rgba(59,97,196,0.1)', color: '#3B61C4',
                  borderRadius: 999, marginLeft: 4,
                }}>
                  {getDueCards(flashcards).length} due
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-600 font-medium">{knownSet.size} know it</span>
              <span className="text-amber-600 font-medium">{almostSet.size} almost</span>
              <span className="text-red-600 font-medium">{reviewSet.size} reviewing</span>
            </div>
          </div>

          {/* Card search */}
          <div style={{ marginBottom: 12 }}>
            <input
              placeholder="Search cards..."
              value={cardSearch}
              onChange={e => handleCardSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.1)', fontSize: 13,
                background: '#F7F6F3', boxSizing: 'border-box',
              }}
            />
            {searchResults !== null && (
              <div style={{ marginTop: 8 }}>
                {searchResults.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9B9B9B', textAlign: 'center', padding: '8px 0' }}>No similar cards found</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {searchResults.map((card, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const idx = flashcards.indexOf(card)
                          if (idx !== -1) { setCardIdx(idx); setFlipped(false); setCardSearch(''); setSearchResults(null) }
                        }}
                        style={{
                          textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                          border: '1px solid rgba(59,97,196,0.2)', background: 'rgba(59,97,196,0.05)',
                          cursor: 'pointer', fontSize: 13, color: '#111111',
                        }}
                      >
                        {card.front}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {startHere && cardIdx === 0 && (
            <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 10, fontSize: 13, color: '#7F1D1D', lineHeight: 1.45 }}>
              <strong style={{ fontSize: 10.5, letterSpacing: '0.06em', color: '#DC2626' }}>START HERE · </strong>
              {startHere}
            </div>
          )}

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-[#9B9B9B] mb-1.5">
              <span>Card {cardIdx + 1} of {flashcards.length}</span>
              <span>{Math.round(((knownSet.size + almostSet.size) / flashcards.length) * 100)}% covered</span>
            </div>
            <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3B61C4] rounded-full transition-all duration-300"
                style={{ width: `${((cardIdx + 1) / flashcards.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Flashcard */}
          <Flashcard
            card={flashcards[cardIdx]}
            flipped={flipped}
            onFlip={() => setFlipped(v => !v)}
          />

          {/* SM-2 rating buttons (visible after flip) */}
          {flipped && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              {[
                { label: 'Again', quality: 0, color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
                { label: 'Hard',  quality: 2, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
                { label: 'Good',  quality: 4, color: '#3B61C4', bg: 'rgba(59,97,196,0.08)'  },
                { label: 'Easy',  quality: 5, color: '#059669', bg: 'rgba(5,150,105,0.08)'  },
              ].map(({ label, quality, color, bg }) => (
                <button
                  key={label}
                  onClick={() => handleRate(quality)}
                  style={{
                    flex: 1, padding: '10px 8px',
                    background: bg, border: `1px solid ${color}30`,
                    borderRadius: 10, color, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Nav arrows */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setCardIdx(i => Math.max(0, i - 1)); setFlipped(false) }}
              disabled={cardIdx === 0}
              className="flex items-center gap-1.5 text-sm text-[#6B6B6B] hover:text-[#111111] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <button
              onClick={() => handleGenerateQuiz(false)}
              className="text-xs text-[#3B61C4] hover:text-[#2d4fa8] transition-colors"
            >
              Take quiz instead →
            </button>
            <button
              onClick={() => { setCardIdx(i => Math.min(flashcards.length - 1, i + 1)); setFlipped(false) }}
              disabled={cardIdx === flashcards.length - 1}
              className="flex items-center gap-1.5 text-sm text-[#6B6B6B] hover:text-[#111111] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* End of deck */}
          {cardIdx === flashcards.length - 1 && (
            <div className="bg-white border border-[#E5E5E5] rounded-2xl px-5 py-5 text-center" style={{ boxShadow: '0 0 0 2px rgba(249,115,22,0.15)' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p className="text-[#111111] font-bold text-base mb-1">Deck complete!</p>
              <p className="text-[#6B6B6B] text-xs mb-3">{knownSet.size} known · {almostSet.size} almost · {reviewSet.size} to review</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setCardIdx(0); setFlipped(false); setKnownSet(new Set()); setAlmostSet(new Set()); setReviewSet(new Set()) }}
                  className="text-sm text-[#3B61C4] hover:text-[#2d4fa8] border border-[#E5E5E5] px-4 py-1.5 rounded-lg transition-colors"
                >
                  Restart deck
                </button>
                <button
                  onClick={() => handleGenerateQuiz(false)}
                  className="text-sm text-white bg-[#3B61C4] hover:bg-[#2d4fa8] px-4 py-1.5 rounded-lg transition-colors font-medium"
                >
                  Take quiz
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Topic Drill mode ── */}
      {mode === 'drill' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setMode('hub')} className="flex items-center gap-2 text-[#6B6B6B] hover:text-[#111111] text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-lg font-semibold text-[#111111]">Topic Drill</h1>
          </div>

          {/* Setup form - shown until questions are generated */}
          {drillQuiz.length === 0 && !drillGenerating && (
            <div className="space-y-4">
              {courses.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#9B9B9B] mb-1.5">Course (optional)</label>
                  <select
                    value={drillCourse ?? ''}
                    onChange={e => setDrillCourse(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B61C4] appearance-none"
                    style={{ colorScheme: 'light' }}
                  >
                    <option value="">No course</option>
                    {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#9B9B9B] mb-1.5">What topic do you want to drill?</label>
                <input
                  type="text"
                  value={drillTopic}
                  onChange={e => setDrillTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && drillTopic.trim() && handleGenerateDrill()}
                  placeholder="e.g. Cardiac output, CARS reasoning, Contract formation…"
                  autoFocus
                  className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#111111] placeholder-[#9B9B9B] focus:outline-none focus:border-[#3B61C4] text-sm"
                />
              </div>
              {drillError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{drillError}</div>
              )}
              <button
                onClick={handleGenerateDrill}
                disabled={!drillTopic.trim()}
                className="w-full bg-[#3B61C4] hover:bg-[#2d4fa8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate 5 Questions (1 AI Boost)
              </button>
            </div>
          )}

          {/* Loading */}
          {drillGenerating && (
            <div className="bg-white rounded-2xl px-6 py-8 flex flex-col items-center gap-4" style={{ border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <Spinner size="md" />
              <div className="text-center">
                <p className="text-[#111111] font-semibold">Generating questions on "{drillTopic}"…</p>
                <p className="text-[#6B6B6B] text-xs mt-1">This usually takes 5–10 seconds</p>
              </div>
            </div>
          )}

          {/* Active drill quiz */}
          {drillQuiz.length > 0 && !drillDone && (
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs text-[#9B9B9B]">
                <span className="text-amber-400 font-medium">{drillTopic}</span>
                <span>Question {drillQuestionIdx + 1} of {drillQuiz.length}</span>
              </div>
              <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3B61C4] rounded-full transition-all duration-300"
                  style={{ width: `${(drillQuestionIdx / drillQuiz.length) * 100}%` }}
                />
              </div>
              <QuizQuestion
                key={drillQuestionIdx}
                question={drillQuiz[drillQuestionIdx]}
                onAnswer={correct => {
                  const next = [...drillAnswers, correct]
                  setDrillAnswers(next)
                  if (drillQuestionIdx + 1 >= drillQuiz.length) {
                    track('drill_complete', { score: Math.round(([...drillAnswers, correct].filter(Boolean).length / drillQuiz.length) * 100), questionCount: drillQuiz.length, plan: getActivePlan() })
                    setDrillDone(true)
                  } else {
                    setDrillQuestionIdx(i => i + 1)
                  }
                }}
              />
            </div>
          )}

          {/* Drill results */}
          {drillDone && (
            <div className="space-y-5">
              {(() => {
                const s = drillAnswers.filter(Boolean).length
                const t = drillQuiz.length
                const pct = Math.round((s / t) * 100)
                return (
                  <>
                    <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626', marginBottom: 4 }}>
                        {pct}<span style={{ fontSize: 28, fontWeight: 700 }}>%</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 8 }}>{s}/{t} correct</div>
                      <h2 className="text-[#111111] text-lg font-bold mb-1">
                        {pct >= 80 ? 'Solid understanding!' : pct >= 60 ? 'Getting there!' : 'Needs more work.'}
                      </h2>
                      <p className="text-[#9B9B9B] text-sm">{drillTopic}</p>
                    </div>
                    <div className="space-y-2">
                      {drillQuiz.map((q, i) => (
                        <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                          drillAnswers[i] ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                        }`}>
                          <svg className={`shrink-0 w-4 h-4 mt-0.5 ${drillAnswers[i] ? 'text-emerald-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d={drillAnswers[i] ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
                          </svg>
                          <span className={drillAnswers[i] ? 'text-emerald-800' : 'text-red-800'}>
                            {q.question.slice(0, 80)}{q.question.length > 80 ? '…' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setDrillQuestionIdx(0); setDrillAnswers([]); setDrillDone(false) }}
                        className="flex-1 bg-[#3B61C4] hover:bg-[#2d4fa8] text-white font-semibold py-3 rounded-xl text-sm transition-colors"
                      >
                        Retry This Topic
                      </button>
                      <button
                        onClick={() => { setDrillQuiz([]); setDrillAnswers([]); setDrillDone(false); setDrillQuestionIdx(0); setDrillTopic('') }}
                        className="flex-1 bg-white hover:bg-[#F7F6F3] border border-[#E5E5E5] text-[#6B6B6B] font-semibold py-3 rounded-xl text-sm transition-colors"
                      >
                        New Topic
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Quiz mode ── */}
      {mode === 'quiz' && quiz.length > 0 && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center gap-2 text-[#6B6B6B] hover:text-[#111111] text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            {!quizDone && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#9B9B9B]">Question {questionIdx + 1} of {quiz.length}</span>
                {testMode && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                    background: timeLeft <= 30 ? 'rgba(239,68,68,0.1)' : 'rgba(59,97,196,0.1)',
                    color: timeLeft <= 30 ? '#ef4444' : '#3B61C4',
                    border: `1px solid ${timeLeft <= 30 ? 'rgba(239,68,68,0.3)' : 'rgba(59,97,196,0.25)'}`,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
            )}
          </div>

          {!quizDone ? (
            <>
              {/* Progress bar */}
              <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3B61C4] rounded-full transition-all duration-300"
                  style={{ width: `${(questionIdx / quiz.length) * 100}%` }}
                />
              </div>

              <QuizQuestion
                key={questionIdx}
                question={quiz[questionIdx]}
                onAnswer={handleQuizAnswer}
              />
            </>
          ) : (
            /* Score summary */
            <div className="space-y-5">
              <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 text-center">
                <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold"
                  style={{
                    background: score >= quiz.length * 0.8 ? 'rgba(16,185,129,0.15)' : score >= quiz.length * 0.6 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `2px solid ${score >= quiz.length * 0.8 ? '#10b981' : score >= quiz.length * 0.6 ? '#f59e0b' : '#ef4444'}`,
                    color: score >= quiz.length * 0.8 ? '#10b981' : score >= quiz.length * 0.6 ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {score}/{quiz.length}
                </div>
                <h2 className="text-[#111111] text-xl font-bold mb-1">
                  {score >= quiz.length * 0.8 ? 'Excellent work!' : score >= quiz.length * 0.6 ? 'Good effort!' : 'Keep studying!'}
                </h2>
                <p className="text-[#9B9B9B] text-sm">
                  {Math.round((score / quiz.length) * 100)}% correct
                  {testMode && timeLeft === 0 && answers.length < quiz.length ? ' · time expired' : ''}
                </p>
              </div>

              {/* Weak areas - only show if any wrong */}
              {answers.some(a => !a) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#ef4444' }}>Weak Areas</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(239,68,68,0.2)' }} />
                  </div>
                  <div className="space-y-2.5">
                    {quiz.map((q, i) => !answers[i] && (
                      <div key={i} style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 14px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#111111', marginBottom: 4 }}>{q.question}</p>
                        <p style={{ fontSize: 12, color: '#16a34a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          {typeof q.answer === 'boolean' ? (q.answer ? 'True' : 'False') : q.answer}
                        </p>
                        {q.explanation && (
                          <p style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 4 }}>{q.explanation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correct - collapsed list */}
              {answers.some(a => a) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#16a34a' }}>Got Right ({answers.filter(Boolean).length})</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(22,163,74,0.2)' }} />
                  </div>
                  <div className="space-y-1.5">
                    {quiz.map((q, i) => answers[i] && (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <svg width="14" height="14" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                        <span style={{ fontSize: 12.5, color: '#334155' }}>{q.question.slice(0, 90)}{q.question.length > 90 ? '…' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleRetryQuiz}
                  className="flex-1 bg-[#3B61C4] hover:bg-[#2d4fa8] text-white font-semibold py-3 rounded-xl text-sm transition-colors"
                >
                  Retry Quiz
                </button>
                <button
                  onClick={() => { setCardIdx(0); setFlipped(false); setMode('flashcards') }}
                  className="flex-1 bg-white hover:bg-[#F7F6F3] border border-[#E5E5E5] text-[#6B6B6B] font-semibold py-3 rounded-xl text-sm transition-colors"
                >
                  Back to Flashcards
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
