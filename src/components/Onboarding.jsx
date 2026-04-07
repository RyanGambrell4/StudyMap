import { useState, useRef, useEffect } from 'react'
import { extractSyllabusEvents } from '../utils/extractSyllabusEvents'
import { getCachedSyllabusEvents, saveSyllabusEvents } from '../lib/db'

// ── Constants ─────────────────────────────────────────────────────────────────
const COURSE_COLORS = [
  { name: 'blue',   dot: '#3B82F6' },
  { name: 'purple', dot: '#A855F7' },
  { name: 'green',  dot: '#22C55E' },
  { name: 'orange', dot: '#F97316' },
  { name: 'pink',   dot: '#EC4899' },
  { name: 'teal',   dot: '#14B8A6' },
  { name: 'red',    dot: '#EF4444' },
  { name: 'yellow', dot: '#EAB308' },
]

const DIFFICULTY_MAP = { Strong: 'Easy', Decent: 'Medium', 'Need work': 'Hard' }

const YEAR_OPTIONS = [
  { label: '1st Year', emoji: '🎓' },
  { label: '2nd Year', emoji: '📚' },
  { label: '3rd Year', emoji: '🔬' },
  { label: '4th Year+', emoji: '🏆' },
]

const GEN_MSGS = [
  'Mapping your exam schedule...',
  'Calculating review intervals...',
  'Scheduling your sessions...',
]

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

// ── Reusable step wrapper ─────────────────────────────────────────────────────
function StepWrap({ children, animKey, dir }) {
  return (
    <div
      key={animKey}
      className={dir >= 0 ? 'slide-in' : 'slide-in-back'}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </div>
  )
}

// ── Step dots ─────────────────────────────────────────────────────────────────
function StepDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i + 1 === current
              ? 'w-5 h-2 bg-indigo-500'
              : i + 1 < current
              ? 'w-2 h-2 bg-indigo-500/50'
              : 'w-2 h-2 bg-slate-700'
          }`}
        />
      ))}
    </div>
  )
}

// ── Main Onboarding component ─────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const [step, setStep]           = useState(1)
  const [animKey, setAnimKey]     = useState(0)
  const [animDir, setAnimDir]     = useState(1)

  // Plan data
  const [yearLevel, setYearLevel]         = useState(null)
  const [semesterEnd, setSemesterEnd]     = useState('')
  const [courses, setCourses]             = useState([])
  const [hoursPerWeek, setHoursPerWeek]   = useState(15)
  const [preferredTime, setPreferredTime] = useState('Morning')
  const [learningStyle, setLearningStyle] = useState(null)

  // Course form (screen 4)
  const [courseForm, setCourseForm] = useState({ name: '', examDate: '', difficulty: 'Decent', targetGrade: 'B' })
  const [courseError, setCourseError] = useState('')

  // Syllabus (screen 8)
  const [syllabusMode, setSyllabusMode]     = useState('upload')
  const [syllabusText, setSyllabusText]     = useState('')
  const [syllabusItems, setSyllabusItems]   = useState(null) // null = no review yet
  const [syllabusError, setSyllabusError]   = useState('')
  const [syllabusLoading, setSyllabusLoading] = useState(false)
  const [dragging, setDragging]             = useState(false)
  const fileRef = useRef(null)

  // Per-course syllabus state (screen 4)
  const [courseExpandedSyllabus, setCourseExpandedSyllabus] = useState({})
  const [courseSyllabusLoading, setCourseSyllabusLoading] = useState({})
  const [courseSyllabusEvents, setCourseSyllabusEvents] = useState({})
  const [courseSyllabusError, setCourseSyllabusError] = useState({})
  const courseFileRefs = useRef({})

  // Generation (screen 9)
  const [genProgress, setGenProgress] = useState(0)
  const [genMsgIdx, setGenMsgIdx]     = useState(0)

  // ── Navigation ──
  const goTo = (next, dir = 1) => {
    setAnimDir(dir)
    setAnimKey(k => k + 1)
    setStep(next)
    window.scrollTo(0, 0)
  }
  const goNext = () => goTo(step + 1, 1)
  const goBack = () => goTo(step - 1, -1)

  // ── Courses ──
  const todayStr = new Date().toISOString().split('T')[0]
  const showCourseDetails = courseForm.name.trim().length > 0

  const addCourse = () => {
    if (!courseForm.name.trim()) { setCourseError('Enter a course name'); return }
    if (!courseForm.examDate) { setCourseError('Select an exam date'); return }
    if (courseForm.examDate <= todayStr) { setCourseError('Exam date must be in the future'); return }
    if (courses.length >= 8) { setCourseError('Maximum 8 courses'); return }
    const color = COURSE_COLORS[courses.length % COURSE_COLORS.length]
    const courseId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
    setCourses(prev => [...prev, {
      id: courseId,
      name: courseForm.name.trim(),
      examDate: courseForm.examDate,
      difficulty: DIFFICULTY_MAP[courseForm.difficulty] ?? 'Medium',
      targetGrade: courseForm.targetGrade,
      color,
    }])
    setCourseForm({ name: '', examDate: '', difficulty: 'Decent', targetGrade: 'B' })
    setCourseError('')
  }

  const removeCourse = idx => {
    setCourses(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, color: COURSE_COLORS[i] })))
  }

  // ── Syllabus (screen 8) ──
  const runAIExtraction = async text => {
    setSyllabusLoading(true)
    setSyllabusError('')
    try {
      const items = await extractSyllabusEvents(text)
      if (!items.length) {
        setSyllabusError('No events found. Try pasting more text, or skip for now.')
      } else {
        setSyllabusItems(items)
      }
    } catch (e) {
      setSyllabusError(e.message)
    } finally {
      setSyllabusLoading(false)
    }
  }

  const handleSyllabusFile = async file => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setSyllabusError('Please upload a PDF file.')
      return
    }
    setSyllabusError('')
    try {
      const text = await extractPdfText(file)
      await runAIExtraction(text)
    } catch (e) {
      setSyllabusError(`PDF error: ${e.message}`)
      setSyllabusLoading(false)
    }
  }

  // ── Per-course syllabus (screen 4) ──
  const handleCourseFile = async (file, courseId) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setCourseSyllabusError(prev => ({ ...prev, [courseId]: 'Please upload a PDF file.' }))
      return
    }
    setCourseSyllabusError(prev => ({ ...prev, [courseId]: '' }))
    setCourseSyllabusLoading(prev => ({ ...prev, [courseId]: true }))
    try {
      const text = await extractPdfText(file)
      const items = await extractSyllabusEvents(text)
      setCourseSyllabusEvents(prev => ({ ...prev, [courseId]: items }))
      if (!items.length) {
        setCourseSyllabusError(prev => ({ ...prev, [courseId]: 'No events found in this syllabus.' }))
      }
    } catch (e) {
      setCourseSyllabusError(prev => ({ ...prev, [courseId]: e.message }))
    } finally {
      setCourseSyllabusLoading(prev => ({ ...prev, [courseId]: false }))
    }
  }

  const saveCourseEvents = () => {
    const allCourseEvents = []
    courses.forEach((c, idx) => {
      const events = courseSyllabusEvents[c.id] ?? []
      events.forEach(e => allCourseEvents.push({
        ...e,
        id: `syl-course-${c.id}-${e.id}`,
        courseIdx: idx,
        courseName: c.name,
        color: c.color,
      }))
    })
    if (allCourseEvents.length) {
      const existing = getCachedSyllabusEvents() ?? []
      saveSyllabusEvents([...existing, ...allCourseEvents])
    }
  }

  const confirmSyllabus = () => {
    saveCourseEvents()
    if (syllabusItems) {
      const NEUTRAL = { name: 'slate', dot: '#64748b' }
      const events = syllabusItems.map(e => ({
        ...e,
        id: `syl-onboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        courseIdx: null,
        courseName: 'General',
        color: NEUTRAL,
      }))
      const existing = getCachedSyllabusEvents() ?? []
      saveSyllabusEvents([...existing, ...events])
    }
    goTo(9, 1)
  }

  // ── Generation ──
  useEffect(() => {
    if (step !== 9) return
    let msgIdx = 0
    const msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % GEN_MSGS.length
      setGenMsgIdx(msgIdx)
    }, 800)

    let prog = 0
    const progTimer = setInterval(() => {
      prog = Math.min(100, prog + 4)
      setGenProgress(Math.round(prog))
      if (prog >= 100) clearInterval(progTimer)
    }, 100)

    const completeTimer = setTimeout(() => {
      onComplete({
        yearLevel: yearLevel ?? '1st Year',
        courses,
        schedule: { hoursPerWeek, preferredTime },
        learningStyle: learningStyle ?? 'practice',
      })
    }, 2600)

    return () => { clearInterval(msgTimer); clearInterval(progTimer); clearTimeout(completeTimer) }
  }, [step])

  // ── Shared input style ──
  const inputCls = 'w-full bg-slate-800/70 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors'

  // ── Logo ──
  const Logo = () => (
    <div className="flex flex-col items-center mb-8">
      <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </div>
      <span className="text-2xl font-bold text-white tracking-tight">StudyMap</span>
    </div>
  )

  // ── Next button ──
  const NextBtn = ({ onClick, disabled, children = 'Continue', className = '' }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-base ${className}`}
    >
      {children}
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </button>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* ── Screen 1: Welcome ── */}
        {step === 1 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <div className="text-center">
              <Logo />
              <h1 className="text-4xl font-bold text-white mb-4 tracking-tight leading-tight">
                Your semester,<br />mapped in 60 seconds
              </h1>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">
                Personalized study plans built around your actual schedule
              </p>
              <button
                onClick={goNext}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2.5"
              >
                Let's build your plan
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </StepWrap>
        )}

        {/* ── Screen 2: Year Level ── */}
        {step === 2 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={1} total={7} />
            <h2 className="text-3xl font-bold text-white text-center mb-2">What year are you in?</h2>
            <p className="text-slate-400 text-center mb-8">This shapes your session types and study depth</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {YEAR_OPTIONS.map(({ label, emoji }) => (
                <button
                  key={label}
                  onClick={() => {
                    setYearLevel(label)
                    setTimeout(goNext, 220)
                  }}
                  className={`flex flex-col items-center gap-3 py-8 px-4 rounded-2xl border-2 transition-all ${
                    yearLevel === label
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-4xl">{emoji}</span>
                  <span className={`font-semibold text-base ${yearLevel === label ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</span>
                </button>
              ))}
            </div>
          </StepWrap>
        )}

        {/* ── Screen 3: Semester End ── */}
        {step === 3 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={2} total={7} />
            <h2 className="text-3xl font-bold text-white text-center mb-2">When does your semester end?</h2>
            <p className="text-slate-400 text-center mb-8">This sets your study plan horizon</p>
            <input
              type="date"
              value={semesterEnd}
              min={todayStr}
              onChange={e => setSemesterEnd(e.target.value)}
              className={`${inputCls} text-center text-lg py-5 mb-8`}
              style={{ colorScheme: 'dark' }}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={goBack} className="px-5 bg-slate-800 border border-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl hover:bg-slate-700 transition-colors">Back</button>
              <NextBtn onClick={goNext} />
            </div>
          </StepWrap>
        )}

        {/* ── Screen 4: Courses ── */}
        {step === 4 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={3} total={7} />
            <h2 className="text-3xl font-bold text-white text-center mb-2">Add your courses</h2>
            <p className="text-slate-400 text-center mb-6">Add up to 8 courses you're studying this semester</p>

            {/* Added courses */}
            {courses.length > 0 && (
              <div className="space-y-2 mb-4">
                {courses.map((c, i) => (
                  <div key={c.id ?? i} className="rounded-xl bg-slate-800/50 border border-slate-700/60 overflow-hidden">
                    {/* Course header row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color.dot }} />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-100 text-sm truncate block">{c.name}</span>
                        <span className="text-xs text-slate-500">{new Date(c.examDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {c.difficulty} · Target {c.targetGrade}</span>
                      </div>
                      <button
                        onClick={() => setCourseExpandedSyllabus(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors mr-1 ${
                          courseSyllabusEvents[c.id]?.length
                            ? 'border-emerald-700/60 bg-emerald-900/20 text-emerald-400'
                            : courseExpandedSyllabus[c.id]
                            ? 'border-indigo-600 bg-indigo-900/20 text-indigo-300'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {courseSyllabusEvents[c.id]?.length
                          ? `${courseSyllabusEvents[c.id].length} events`
                          : 'Syllabus'}
                      </button>
                      <button onClick={() => removeCourse(i)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Collapsible syllabus section */}
                    {courseExpandedSyllabus[c.id] && (
                      <div className="border-t border-slate-700/60 px-4 py-3">
                        {courseSyllabusLoading[c.id] ? (
                          <div className="flex items-center gap-2 py-1">
                            <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            <p className="text-slate-400 text-xs">AI is reading your syllabus…</p>
                          </div>
                        ) : courseSyllabusEvents[c.id]?.length ? (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-emerald-400 text-xs font-medium">Found {courseSyllabusEvents[c.id].length} deadlines</span>
                            <button
                              onClick={() => setCourseSyllabusEvents(prev => ({ ...prev, [c.id]: null }))}
                              className="ml-auto text-slate-600 hover:text-red-400 text-xs transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <>
                            {courseSyllabusError[c.id] && (
                              <p className="text-red-400 text-xs mb-2">{courseSyllabusError[c.id]}</p>
                            )}
                            <div
                              onClick={() => courseFileRefs.current[c.id]?.click()}
                              className="flex items-center gap-2 py-2.5 px-3 rounded-lg border border-dashed border-slate-600 hover:border-indigo-500/60 hover:bg-indigo-500/5 cursor-pointer transition-all"
                            >
                              <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-slate-400 text-xs">Upload syllabus PDF to auto-import deadlines</span>
                              <input
                                ref={el => { courseFileRefs.current[c.id] = el }}
                                type="file"
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleCourseFile(f, c.id); e.target.value = '' }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            {courses.length < 8 && (
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-5 mb-4">
                <div className="mb-3">
                  <input
                    type="text"
                    value={courseForm.name}
                    onChange={e => { setCourseForm(f => ({ ...f, name: e.target.value })); setCourseError('') }}
                    onKeyDown={e => e.key === 'Enter' && showCourseDetails && addCourse()}
                    placeholder="Course name (e.g. Calculus II)"
                    className={inputCls}
                  />
                </div>

                {/* Progressive reveal */}
                <div
                  style={{
                    maxHeight: showCourseDetails ? '200px' : '0',
                    overflow: 'hidden',
                    transition: 'max-height 300ms ease, opacity 250ms ease',
                    opacity: showCourseDetails ? 1 : 0,
                  }}
                >
                  <div className="space-y-3 pt-1">
                    <input
                      type="date"
                      value={courseForm.examDate}
                      min={todayStr}
                      onChange={e => { setCourseForm(f => ({ ...f, examDate: e.target.value })); setCourseError('') }}
                      placeholder="Exam date"
                      className={inputCls}
                      style={{ colorScheme: 'dark' }}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1.5">How well do you know this?</label>
                        <select
                          value={courseForm.difficulty}
                          onChange={e => setCourseForm(f => ({ ...f, difficulty: e.target.value }))}
                          className={inputCls}
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="Strong">💪 Strong</option>
                          <option value="Decent">📖 Decent</option>
                          <option value="Need work">😅 Need work</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1.5">Target grade</label>
                        <select
                          value={courseForm.targetGrade}
                          onChange={e => setCourseForm(f => ({ ...f, targetGrade: e.target.value }))}
                          className={inputCls}
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="A">🎯 A (90%+)</option>
                          <option value="B">✅ B (80–89%)</option>
                          <option value="C">📝 C (70–79%)</option>
                          <option value="Pass/Fail">☑️ Pass/Fail</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {courseError && <p className="text-red-400 text-xs mt-2">{courseError}</p>}

                {showCourseDetails && (
                  <button
                    onClick={addCourse}
                    className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    + Add Course
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={goBack} className="px-5 bg-slate-800 border border-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl hover:bg-slate-700 transition-colors">Back</button>
              <NextBtn onClick={goNext} disabled={courses.length === 0} />
            </div>
            {courses.length === 0 && (
              <p className="text-center text-xs text-slate-600 mt-2">Add at least one course to continue</p>
            )}
          </StepWrap>
        )}

        {/* ── Screen 5: Hours ── */}
        {step === 5 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={4} total={7} />
            <h2 className="text-3xl font-bold text-white text-center mb-2">How many hours a week can you realistically study?</h2>
            <p className="text-slate-400 text-center mb-10">Be honest — consistent short sessions beat burnout</p>

            <div className="text-center mb-8">
              <span className="text-7xl font-bold text-white tabular-nums">{hoursPerWeek}</span>
              <span className="text-2xl text-slate-400 ml-2">h/week</span>
            </div>

            <div className="mb-4">
              <input
                type="range"
                min={5} max={40} step={1}
                value={hoursPerWeek}
                onChange={e => setHoursPerWeek(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-500"
                style={{
                  background: `linear-gradient(to right, #6366F1 0%, #6366F1 ${((hoursPerWeek - 5) / 35) * 100}%, #1e293b ${((hoursPerWeek - 5) / 35) * 100}%, #1e293b 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-slate-600 mt-2">
                <span>5h</span>
                <span>40h</span>
              </div>
            </div>

            <p className="text-center text-slate-400 text-sm mb-8">
              That's <span className="text-white font-semibold">{Math.round((hoursPerWeek / 6) * 10) / 10}h</span> per study day across 6 days
            </p>

            <div className="flex gap-3">
              <button onClick={goBack} className="px-5 bg-slate-800 border border-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl hover:bg-slate-700 transition-colors">Back</button>
              <NextBtn onClick={goNext} />
            </div>
          </StepWrap>
        )}

        {/* ── Screen 6: Time Preference ── */}
        {step === 6 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={5} total={7} />
            <h2 className="text-3xl font-bold text-white text-center mb-2">When do you do your best thinking?</h2>
            <p className="text-slate-400 text-center mb-8">We'll schedule sessions when you're at your sharpest</p>

            <div className="space-y-3 mb-6">
              {[
                { id: 'Morning',   label: 'Morning person', hours: '6 AM – 12 PM', emoji: '☀️' },
                { id: 'Afternoon', label: 'Afternoon',       hours: '12 PM – 6 PM', emoji: '⛅' },
                { id: 'Evening',   label: 'Night owl',       hours: '6 PM – late',  emoji: '🌙' },
              ].map(({ id, label, hours, emoji }) => (
                <button
                  key={id}
                  onClick={() => { setPreferredTime(id); setTimeout(goNext, 220) }}
                  className={`w-full flex items-center gap-5 p-5 rounded-2xl border-2 transition-all ${
                    preferredTime === id
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-3xl">{emoji}</span>
                  <div className="text-left">
                    <p className={`font-semibold text-base ${preferredTime === id ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</p>
                    <p className="text-slate-500 text-sm">{hours}</p>
                  </div>
                </button>
              ))}
            </div>

            <button onClick={goBack} className="w-full px-5 bg-slate-800 border border-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl hover:bg-slate-700 transition-colors">Back</button>
          </StepWrap>
        )}

        {/* ── Screen 7: Learning Style ── */}
        {step === 7 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={6} total={7} />
            <h2 className="text-3xl font-bold text-white text-center mb-2">How do you learn best?</h2>
            <p className="text-slate-400 text-center mb-8">We'll tailor your session types to match</p>

            <div className="space-y-3 mb-6">
              {[
                {
                  id: 'visual', title: 'Visual Learner', desc: 'Diagrams, color-coding, mind maps, visual summaries.',
                  tags: ['Diagrams', 'Color-coding', 'Mind maps'],
                  col: { border: 'border-indigo-500', bg: 'bg-indigo-500/10', tag: 'bg-indigo-500/15 text-indigo-300' },
                },
                {
                  id: 'reader', title: 'Deep Reader', desc: 'Careful reading, detailed notes, written summaries.',
                  tags: ['Notes', 'Summaries', 'Re-reading'],
                  col: { border: 'border-emerald-500', bg: 'bg-emerald-500/10', tag: 'bg-emerald-500/15 text-emerald-300' },
                },
                {
                  id: 'practice', title: 'Practice-Focused', desc: 'Past papers, problem sets, quizzes, flashcards.',
                  tags: ['Past papers', 'Quizzes', 'Flashcards'],
                  col: { border: 'border-orange-500', bg: 'bg-orange-500/10', tag: 'bg-orange-500/15 text-orange-300' },
                },
              ].map(({ id, title, desc, tags, col }) => (
                <button
                  key={id}
                  onClick={() => { setLearningStyle(id); setTimeout(goNext, 220) }}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
                    learningStyle === id ? `${col.border} ${col.bg}` : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/60'
                  }`}
                >
                  <p className="font-bold text-slate-100 mb-1">{title}</p>
                  <p className="text-slate-500 text-sm mb-3">{desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${learningStyle === id ? col.tag : 'bg-slate-700/60 text-slate-500'}`}>{t}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <button onClick={goBack} className="w-full px-5 bg-slate-800 border border-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl hover:bg-slate-700 transition-colors">Back</button>
          </StepWrap>
        )}

        {/* ── Screen 8: Syllabus Upload (optional) ── */}
        {step === 8 && (
          <StepWrap animKey={animKey} dir={animDir}>
            <StepDots current={7} total={7} />

            {/* Review mode */}
            {syllabusItems ? (
              <div>
                <h2 className="text-2xl font-bold text-white text-center mb-1">Review your deadlines</h2>
                <p className="text-slate-400 text-center text-sm mb-6">
                  We found <span className="text-indigo-400 font-semibold">{syllabusItems.length}</span> events — edit or remove before adding.
                </p>
                <div className="space-y-2.5 mb-6 max-h-72 overflow-y-auto">
                  {syllabusItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => setSyllabusItems(prev => prev.map(it => it.id === item.id ? { ...it, name: e.target.value } : it))}
                          className="w-full bg-transparent text-slate-200 text-sm font-medium focus:outline-none truncate"
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="date"
                            value={item.date}
                            onChange={e => setSyllabusItems(prev => prev.map(it => it.id === item.id ? { ...it, date: e.target.value } : it))}
                            className="bg-transparent text-slate-500 text-xs focus:outline-none focus:text-slate-300"
                            style={{ colorScheme: 'dark' }}
                          />
                          <span className="text-slate-600 text-xs">·</span>
                          <span className="text-xs text-slate-500">{item.type}</span>
                        </div>
                      </div>
                      <button onClick={() => setSyllabusItems(prev => prev.filter(it => it.id !== item.id))} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <NextBtn onClick={confirmSyllabus}>
                  {`Add ${syllabusItems.length} Events & Continue`}
                </NextBtn>
                <button
                  onClick={() => { setSyllabusItems(null); setSyllabusError('') }}
                  className="w-full mt-2 text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors"
                >
                  Start over
                </button>
              </div>
            ) : (
              <div>
                {courses.some(c => courseSyllabusEvents[c.id]?.length) ? (
                  <>
                    <h2 className="text-2xl font-bold text-white text-center mb-2">Add any remaining deadlines</h2>
                    <p className="text-slate-400 text-center text-sm mb-6">You've already imported syllabuses for your courses above — upload here if you have any additional events to add.</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-white text-center mb-2">Pull in your deadlines automatically</h2>
                    <p className="text-slate-400 text-center text-sm mb-6">Upload your syllabus PDF and we'll extract all your due dates, exams, and assignments</p>
                  </>
                )}

                {syllabusError && (
                  <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">{syllabusError}</div>
                )}

                {syllabusLoading ? (
                  <div className="flex flex-col items-center gap-4 py-16">
                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">AI is reading your syllabus…</p>
                  </div>
                ) : syllabusMode === 'upload' ? (
                  <>
                    <div
                      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleSyllabusFile(f) }}
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onClick={() => fileRef.current?.click()}
                      className={`flex flex-col items-center gap-4 py-14 px-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all mb-5 ${
                        dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-500/5'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dragging ? 'bg-indigo-500/20' : 'bg-slate-800'}`}>
                        <svg className={`w-7 h-7 ${dragging ? 'text-indigo-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className={`font-semibold text-base ${dragging ? 'text-indigo-300' : 'text-slate-200'}`}>{dragging ? 'Drop to upload' : 'Drop your syllabus PDF here'}</p>
                        <p className="text-slate-500 text-sm mt-1">or click to browse</p>
                      </div>
                      <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleSyllabusFile(f); e.target.value = '' }} />
                    </div>
                    <button onClick={() => setSyllabusMode('paste')} className="w-full text-slate-400 hover:text-slate-200 text-sm py-2.5 transition-colors border border-slate-700/60 rounded-xl hover:bg-slate-800/60 mb-5">
                      Paste text instead
                    </button>
                  </>
                ) : (
                  <>
                    <textarea
                      value={syllabusText}
                      onChange={e => { setSyllabusText(e.target.value); setSyllabusError('') }}
                      placeholder="Paste your syllabus text here..."
                      autoFocus
                      className="w-full h-44 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none mb-3"
                    />
                    <button
                      onClick={() => {
                        if (!syllabusText.trim()) { setSyllabusError('Paste some text first.'); return }
                        runAIExtraction(syllabusText)
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors mb-3"
                    >
                      Extract Events
                    </button>
                    <button onClick={() => { setSyllabusMode('upload'); setSyllabusError('') }} className="w-full text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors mb-5">
                      Upload PDF instead
                    </button>
                  </>
                )}

                {courses.some(c => courseSyllabusEvents[c.id]?.length) ? (
                  <button
                    onClick={() => { saveCourseEvents(); goTo(9, 1) }}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-2xl transition-colors text-center"
                  >
                    Continue with imported events →
                  </button>
                ) : (
                  <button
                    onClick={() => goTo(9, 1)}
                    className="w-full text-slate-500 hover:text-slate-300 text-sm py-2.5 transition-colors text-center"
                  >
                    Skip for now, I'll do this later →
                  </button>
                )}
              </div>
            )}
          </StepWrap>
        )}

        {/* ── Screen 9: Generation ── */}
        {step === 9 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 mx-auto mb-6">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Building your plan…</h2>
            <p className="text-slate-400 text-sm mb-10 h-5 transition-all">{GEN_MSGS[genMsgIdx]}</p>

            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-300"
                style={{ width: `${genProgress}%` }}
              />
            </div>
            <p className="text-slate-600 text-xs">{genProgress}%</p>
          </div>
        )}

      </div>
    </div>
  )
}
