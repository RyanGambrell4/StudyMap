import { useState, useRef, useEffect } from 'react'
import imageCompression from 'browser-image-compression'
import { extractText } from '../utils/extractText'
import { getCachedStudyTools, saveStudyTools } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'

function loadSaved() {
  return getCachedStudyTools()
}

// ── Flashcard ──────────────────────────────────────────────────────────────────
function Flashcard({ card, flipped, onFlip }) {
  return (
    <div
      className="w-full cursor-pointer select-none"
      style={{ perspective: 900 }}
      onClick={onFlip}
    >
      <div className={`fc-inner${flipped ? ' fc-flipped' : ''}`} style={{ minHeight: 220 }}>
        {/* Front */}
        <div className="fc-face bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center p-8 gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Concept</span>
          <p className="text-slate-900 dark:text-white text-xl font-bold text-center leading-snug">{card.front}</p>
          <span className="text-slate-500 text-xs mt-2">Tap to reveal answer</span>
        </div>
        {/* Back */}
        <div className="fc-face fc-back bg-indigo-950/60 border border-indigo-500/30 rounded-2xl flex flex-col items-center justify-center p-8 gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Answer</span>
          <p className="text-slate-100 text-base text-center leading-relaxed">{card.back}</p>
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
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            (question.type === 'mc' || question.type === 'multiple_choice') ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' :
            question.type === 'tf' ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400' :
            'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
          }`}>
            {(question.type === 'mc' || question.type === 'multiple_choice') ? 'Multiple Choice' : question.type === 'tf' ? 'True / False' : 'Fill in the Blank'}
          </span>
        </div>
        <p className="text-slate-900 dark:text-white font-semibold text-base leading-relaxed">{question.question}</p>
        {question.hint && <p className="text-slate-500 text-xs mt-1">{question.hint}</p>}
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
                  showRight ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-500/60 text-emerald-700 dark:text-emerald-300' :
                  showWrong ? 'bg-red-50 dark:bg-red-900/40 border-red-400 dark:border-red-500/60 text-red-700 dark:text-red-300' :
                  isSelected ? 'bg-slate-100 dark:bg-slate-700/60 border-slate-400 dark:border-slate-500 text-slate-900 dark:text-white' :
                  'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="text-slate-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
                {showRight && <span className="ml-2 text-emerald-400">✓</span>}
                {showWrong && <span className="ml-2 text-red-400">✗</span>}
              </button>
            )
          })}
          {revealed && question.explanation && (
            <p className="text-slate-500 text-xs px-1 mt-1">{question.explanation}</p>
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
                  showRight ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-500/60 text-emerald-700 dark:text-emerald-300' :
                  showWrong ? 'bg-red-50 dark:bg-red-900/40 border-red-400 dark:border-red-500/60 text-red-700 dark:text-red-300' :
                  isSelected ? 'bg-slate-100 dark:bg-slate-700 border-slate-400 dark:border-slate-500 text-slate-900 dark:text-white' :
                  'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {val ? 'True' : 'False'}
                {showRight && ' ✓'}
                {showWrong && ' ✗'}
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
            className="w-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          {!revealed && (
            <button
              onClick={() => fillInput.trim() && submit(fillInput)}
              disabled={!fillInput.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Submit Answer
            </button>
          )}
          {revealed && (
            <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${
              fillInput.trim().toLowerCase() === question.answer.toLowerCase()
                ? 'bg-emerald-900/40 border-emerald-500/60 text-emerald-300'
                : 'bg-red-900/30 border-red-500/40 text-red-300'
            }`}>
              {fillInput.trim().toLowerCase() === question.answer.toLowerCase()
                ? '✓ Correct!'
                : `✗ The answer was: ${question.answer}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function StudyToolsView({ courses, userId, onShowPaywall, onNavigateToCoach }) {
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
  const [showTextPreview, setShowTextPreview] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)

  // Mode + content
  const [mode, setMode] = useState('hub') // 'hub' | 'upload' | 'flashcards' | 'quiz'
  const [flashcards, setFlashcards] = useState([])
  const [quiz, setQuiz] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [generateError, setGenerateError] = useState('')

  // Flashcard state
  const [cardIdx, setCardIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [knownSet, setKnownSet] = useState(new Set())
  const [almostSet, setAlmostSet] = useState(new Set())
  const [reviewSet, setReviewSet] = useState(new Set())

  // Quiz state
  const [questionIdx, setQuestionIdx] = useState(0)
  const [answers, setAnswers] = useState([]) // array of booleans
  const [quizDone, setQuizDone] = useState(false)

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
      setFlashcards(saved.flashcards)
      setQuiz(saved.quiz ?? [])
      setExtractedText(saved.text ?? '')
      setSelectedCourse(saved.courseIdx ?? null)
      if (saved.fileLabel) setUploadedFile({ name: saved.fileLabel })
    }
  }, [])

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

  async function handleGenerateFlashcards() {
    // Check AI query limit before calling
    if (!canUseAI()) {
      onShowPaywall?.('ai')
      return
    }

    setIsGenerating(true)
    setGenerateError('')
    setLoadingMessage('Our AI is reading your notes and generating study materials…')
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: activeText }),
      })
      if (!response.ok) throw new Error(`API returned ${response.status}`)
      const data = await response.json()
      if (!data.flashcards?.length) throw new Error('No flashcards returned')
      const cards = data.flashcards
      const q = data.quiz ?? []
      setFlashcards(cards)
      setQuiz(q)
      setCardIdx(0)
      setFlipped(false)
      setKnownSet(new Set())
      setAlmostSet(new Set())
      setReviewSet(new Set())
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
      console.error('Generation error:', err)
      setGenerateError('Failed to generate study materials. Please check your API key and try again.')
    } finally {
      setIsGenerating(false)
      setLoadingMessage('')
    }
  }

  function handleGenerateQuiz() {
    setQuestionIdx(0)
    setAnswers([])
    setQuizDone(false)
    setMode('quiz')
  }

  function handleFlashcardRate(rating) {
    // rating: 'know' | 'almost' | 'review'
    setKnownSet(prev => { const s = new Set(prev); if (rating === 'know') s.add(cardIdx); else s.delete(cardIdx); return s })
    setAlmostSet(prev => { const s = new Set(prev); if (rating === 'almost') s.add(cardIdx); else s.delete(cardIdx); return s })
    setReviewSet(prev => { const s = new Set(prev); if (rating === 'review') s.add(cardIdx); else s.delete(cardIdx); return s })
    setFlipped(false)
    setTimeout(() => {
      if (cardIdx < flashcards.length - 1) setCardIdx(i => i + 1)
    }, 150)
  }

  function handleQuizAnswer(correct) {
    const next = [...answers, correct]
    setAnswers(next)
    if (questionIdx + 1 >= quiz.length) {
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
  }

  function handleBack() {
    setMode('hub')
  }

  async function handleGenerateDrill() {
    if (!drillTopic.trim()) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    const course = drillCourse !== null ? courses[drillCourse] : null
    const courseName = course?.name ?? 'General'
    setDrillGenerating(true)
    setDrillError('')
    setDrillQuiz([])
    setDrillQuestionIdx(0)
    setDrillAnswers([])
    setDrillDone(false)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'quick-quiz', courseName, topic: drillTopic.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      const questions = (data.questions ?? []).map(q => ({ ...q, type: 'mc' }))
      if (!questions.length) throw new Error('No questions returned — try a different topic.')
      setDrillQuiz(questions)
      await incrementAIQuery()
    } catch (e) {
      setDrillError(e.message)
    } finally {
      setDrillGenerating(false)
    }
  }

  const activeText = extractedText || pastedText
  const hasText = activeText.length > 50
  const score = answers.filter(Boolean).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">

      {/* ── Hub screen ── */}
      {mode === 'hub' && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Study Tools</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Choose how you want to study.</p>
          <div className="space-y-3">

            {/* Flashcards card */}
            <button
              onClick={() => setMode('upload')}
              className="w-full text-left bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-500/40 rounded-2xl p-5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 group-hover:bg-indigo-600/30 transition-colors">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Flashcards</h2>
                    {flashcards.length > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
                        {flashcards.length} ready
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">Upload your notes and get AI-generated flashcards to memorize key concepts.</p>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Quizzes card */}
            <button
              onClick={() => { setMode('upload') }}
              className="w-full text-left bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 hover:border-violet-300 dark:hover:border-violet-500/40 rounded-2xl p-5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 group-hover:bg-violet-600/30 transition-colors">
                  <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Quizzes</h2>
                    {quiz.length > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300 border border-violet-700/50">
                        {quiz.length} questions ready
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">Test your knowledge with multiple choice, true/false, and fill-in-the-blank questions.</p>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Topic Drill card */}
            <button
              onClick={() => { setDrillQuiz([]); setDrillAnswers([]); setDrillDone(false); setDrillQuestionIdx(0); setDrillError(''); setMode('drill') }}
              className="w-full text-left bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 hover:border-amber-300 dark:hover:border-amber-500/40 rounded-2xl p-5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:bg-amber-600/30 transition-colors">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Topic Drill</h2>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/50">No upload needed</span>
                  </div>
                  <p className="text-slate-400 text-sm">Type any topic and get 5 AI-generated practice questions instantly — no file upload required.</p>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Study Coach card */}
            <button
              onClick={() => onNavigateToCoach?.()}
              className="w-full text-left bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 hover:border-emerald-300 dark:hover:border-emerald-500/40 rounded-2xl p-5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-600/30 transition-colors">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Study Coach</h2>
                  </div>
                  <p className="text-slate-400 text-sm">Get a personalized AI study plan tailored to your schedule and upcoming exams.</p>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

          </div>
        </div>
      )}

      {/* ── Upload section ── */}
      {mode === 'upload' && (
        <div className="space-y-5">
          {/* Back to hub */}
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setMode('hub')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Upload Material</h1>
          </div>
          {/* Course selector — always visible at top */}
          {courses.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Which course is this for?</label>
              <select
                value={selectedCourse ?? ''}
                onChange={e => setSelectedCourse(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                style={{ colorScheme: 'dark' }}
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
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all ${
              dragging
                ? 'border-indigo-400 bg-indigo-500/10'
                : uploadedFile
                  ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/30'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/20 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:bg-indigo-500/5'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
              uploadedFile ? 'bg-indigo-600/20 border border-indigo-500/30' : 'bg-slate-200 dark:bg-slate-700/60 border border-slate-300 dark:border-slate-600'
            }`}>
              {isExtracting ? (
                <svg className="w-6 h-6 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : uploadedFile ? (
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
            </div>
            {isExtracting ? (
              <div className="text-center">
                <p className="text-indigo-300 font-medium">Extracting text…</p>
                <p className="text-slate-500 text-xs mt-1">This may take a moment</p>
              </div>
            ) : uploadedFile ? (
              <div className="text-center">
                <p className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-xs">{uploadedFile.name}</p>
                <p className="text-slate-500 text-xs mt-1">
                  {hasText ? `${extractedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words extracted` : 'Click to replace'}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-slate-700 dark:text-slate-300 font-medium">Drop your file here or click to browse</p>
                <p className="text-slate-500 text-xs mt-1">PDF, .docx, or .pptx</p>
              </div>
            )}
          </div>

          {/* Scan handwritten notes */}
          <div>
            <p className="text-xs text-slate-500 text-center mb-3">or</p>
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
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/5 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
              <p className="text-red-400 text-xs mt-2">{scanError}</p>
            )}
          </div>

          {/* Paste box */}
          <div>
            <p className="text-xs text-slate-500 text-center mb-3">or</p>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Paste your notes directly</label>
            <textarea
              value={pastedText}
              onChange={e => {
                setPastedText(e.target.value)
                if (e.target.value) { setUploadedFile(null); setExtractedText('') }
              }}
              placeholder="Paste lecture notes, slides text, or any course material here…"
              rows={5}
              className="w-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 text-sm resize-none leading-relaxed"
            />
            {pastedText.length > 0 && pastedText.length <= 50 && (
              <p className="text-amber-400 text-xs mt-1">Paste at least a few sentences to generate useful materials.</p>
            )}
            {pastedText.length > 50 && (
              <p className="text-slate-600 text-xs mt-1">{pastedText.trim().split(/\s+/).length.toLocaleString()} words</p>
            )}
          </div>

          {extractError && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3 text-red-300 text-sm">
              {extractError}
            </div>
          )}

          {generateError && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3 text-red-300 text-sm">
              {generateError}
            </div>
          )}


          {/* Text preview */}
          {hasText && (
            <div>
              <button
                onClick={() => setShowTextPreview(v => !v)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showTextPreview ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showTextPreview ? 'Hide' : 'Show'} extracted text
              </button>
              {showTextPreview && (
                <div className="mt-2 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-48 overflow-y-auto">
                  <p className="text-slate-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">{extractedText.slice(0, 2000)}{extractedText.length > 2000 ? '\n…' : ''}</p>
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {isGenerating && (
            <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-2xl px-6 py-8 flex flex-col items-center gap-4">
              <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div className="text-center">
                <p className="text-indigo-300 font-semibold">{loadingMessage}</p>
                <p className="text-slate-500 text-xs mt-1">This usually takes 5–10 seconds</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {hasText && !isGenerating && (
            <div className="flex gap-3">
              <button
                onClick={handleGenerateFlashcards}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate with AI
              </button>
              {flashcards.length > 0 && (
                <button
                  onClick={handleGenerateQuiz}
                  className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Take Quiz
                </button>
              )}
            </div>
          )}

          {/* Previously generated cards */}
          {flashcards.length > 0 && (
            <div className="bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/40 rounded-2xl p-4">
              <p className="text-slate-400 text-xs font-medium mb-3">Previously generated</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setCardIdx(0); setFlipped(false); setMode('flashcards') }}
                  className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/60 px-3 py-2 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {flashcards.length} flashcards
                </button>
                {quiz.length > 0 && (
                  <button
                    onClick={handleGenerateQuiz}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-500 px-3 py-2 rounded-xl transition-all"
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
            <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-400 font-medium">{knownSet.size} know it</span>
              <span className="text-amber-400 font-medium">{almostSet.size} almost</span>
              <span className="text-red-400 font-medium">{reviewSet.size} reviewing</span>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Card {cardIdx + 1} of {flashcards.length}</span>
              <span>{Math.round(((knownSet.size + almostSet.size) / flashcards.length) * 100)}% covered</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
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

          {/* Rating buttons (visible after flip) */}
          {flipped && (
            <div className="flex gap-2.5">
              <button
                onClick={() => handleFlashcardRate('review')}
                className="flex-1 py-3 rounded-xl border border-red-500/30 bg-red-900/20 text-red-400 hover:bg-red-900/40 text-sm font-medium transition-all"
              >
                Need to Review
              </button>
              <button
                onClick={() => handleFlashcardRate('almost')}
                className="flex-1 py-3 rounded-xl border border-amber-500/30 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 text-sm font-medium transition-all"
              >
                Almost
              </button>
              <button
                onClick={() => handleFlashcardRate('know')}
                className="flex-1 py-3 rounded-xl border border-emerald-500/30 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 text-sm font-medium transition-all"
              >
                Got It!
              </button>
            </div>
          )}

          {/* Nav arrows */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setCardIdx(i => Math.max(0, i - 1)); setFlipped(false) }}
              disabled={cardIdx === 0}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <button
              onClick={handleGenerateQuiz}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Take quiz instead →
            </button>
            <button
              onClick={() => { setCardIdx(i => Math.min(flashcards.length - 1, i + 1)); setFlipped(false) }}
              disabled={cardIdx === flashcards.length - 1}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* End of deck */}
          {cardIdx === flashcards.length - 1 && (
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl px-5 py-4 text-center">
              <p className="text-indigo-300 font-semibold mb-1">You've gone through all {flashcards.length} cards!</p>
              <p className="text-slate-500 text-xs mb-3">{knownSet.size} known · {almostSet.size} almost · {reviewSet.size} to review</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setCardIdx(0); setFlipped(false); setKnownSet(new Set()); setAlmostSet(new Set()); setReviewSet(new Set()) }}
                  className="text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-4 py-1.5 rounded-lg transition-colors"
                >
                  Restart deck
                </button>
                <button
                  onClick={handleGenerateQuiz}
                  className="text-sm text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded-lg transition-colors font-medium"
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
            <button onClick={() => setMode('hub')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Topic Drill</h1>
          </div>

          {/* Setup form — shown until questions are generated */}
          {drillQuiz.length === 0 && !drillGenerating && (
            <div className="space-y-4">
              {courses.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Course (optional)</label>
                  <select
                    value={drillCourse ?? ''}
                    onChange={e => setDrillCourse(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 appearance-none"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="">No course</option>
                    {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">What topic do you want to drill?</label>
                <input
                  type="text"
                  value={drillTopic}
                  onChange={e => setDrillTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && drillTopic.trim() && handleGenerateDrill()}
                  placeholder="e.g. Cardiac output, CARS reasoning, Contract formation…"
                  autoFocus
                  className="w-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500/60 text-sm"
                />
              </div>
              {drillError && (
                <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3 text-red-300 text-sm">{drillError}</div>
              )}
              <button
                onClick={handleGenerateDrill}
                disabled={!drillTopic.trim()}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate 5 Questions — 1 AI Boost
              </button>
            </div>
          )}

          {/* Loading */}
          {drillGenerating && (
            <div className="bg-amber-950/40 border border-amber-500/20 rounded-2xl px-6 py-8 flex flex-col items-center gap-4">
              <svg className="w-8 h-8 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div className="text-center">
                <p className="text-amber-300 font-semibold">Generating questions on "{drillTopic}"…</p>
                <p className="text-slate-500 text-xs mt-1">This usually takes 5–10 seconds</p>
              </div>
            </div>
          )}

          {/* Active drill quiz */}
          {drillQuiz.length > 0 && !drillDone && (
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="text-amber-400 font-medium">{drillTopic}</span>
                <span>Question {drillQuestionIdx + 1} of {drillQuiz.length}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
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
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
                      <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold"
                        style={{
                          background: pct >= 80 ? 'rgba(16,185,129,0.15)' : pct >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                          border: `2px solid ${pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'}`,
                          color: pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444',
                        }}
                      >
                        {s}/{t}
                      </div>
                      <h2 className="text-white text-xl font-bold mb-1">
                        {pct >= 80 ? 'Solid understanding!' : pct >= 60 ? 'Getting there!' : 'Needs more work!'}
                      </h2>
                      <p className="text-slate-400 text-sm">{pct}% on <span className="text-amber-300">{drillTopic}</span></p>
                    </div>
                    <div className="space-y-2">
                      {drillQuiz.map((q, i) => (
                        <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                          drillAnswers[i] ? 'bg-emerald-900/20 border-emerald-800/40' : 'bg-red-900/20 border-red-800/40'
                        }`}>
                          <span className={`shrink-0 font-bold ${drillAnswers[i] ? 'text-emerald-400' : 'text-red-400'}`}>
                            {drillAnswers[i] ? '✓' : '✗'}
                          </span>
                          <span className={`${drillAnswers[i] ? 'text-emerald-300' : 'text-red-300'}`}>
                            {q.question.slice(0, 80)}{q.question.length > 80 ? '…' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setDrillQuestionIdx(0); setDrillAnswers([]); setDrillDone(false) }}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-3 rounded-xl text-sm transition-colors"
                      >
                        Retry This Topic
                      </button>
                      <button
                        onClick={() => { setDrillQuiz([]); setDrillAnswers([]); setDrillDone(false); setDrillQuestionIdx(0); setDrillTopic('') }}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-3 rounded-xl text-sm transition-colors"
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
            <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            {!quizDone && (
              <span className="text-xs text-slate-500">Question {questionIdx + 1} of {quiz.length}</span>
            )}
          </div>

          {!quizDone ? (
            <>
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
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
            <div className="space-y-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
                <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold"
                  style={{
                    background: score >= quiz.length * 0.8 ? 'rgba(16,185,129,0.15)' : score >= quiz.length * 0.6 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `2px solid ${score >= quiz.length * 0.8 ? '#10b981' : score >= quiz.length * 0.6 ? '#f59e0b' : '#ef4444'}`,
                    color: score >= quiz.length * 0.8 ? '#10b981' : score >= quiz.length * 0.6 ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {score}/{quiz.length}
                </div>
                <h2 className="text-white text-xl font-bold mb-1">
                  {score >= quiz.length * 0.8 ? 'Excellent work!' : score >= quiz.length * 0.6 ? 'Good effort!' : 'Keep studying!'}
                </h2>
                <p className="text-slate-400 text-sm">
                  You got {score} out of {quiz.length} questions correct ({Math.round((score / quiz.length) * 100)}%)
                </p>
              </div>

              {/* Per-question breakdown */}
              <div className="space-y-2">
                {quiz.map((q, i) => (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                    answers[i] ? 'bg-emerald-900/20 border-emerald-800/40' : 'bg-red-900/20 border-red-800/40'
                  }`}>
                    <span className={`shrink-0 font-bold ${answers[i] ? 'text-emerald-400' : 'text-red-400'}`}>
                      {answers[i] ? '✓' : '✗'}
                    </span>
                    <span className={`truncate ${answers[i] ? 'text-emerald-300' : 'text-red-300'}`}>
                      {q.question.slice(0, 80)}{q.question.length > 80 ? '…' : ''}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRetryQuiz}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
                >
                  Retry Quiz
                </button>
                <button
                  onClick={() => { setCardIdx(0); setFlipped(false); setMode('flashcards') }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-3 rounded-xl text-sm transition-colors"
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
