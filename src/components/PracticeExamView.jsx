import { useState, useMemo, useEffect, useRef } from 'react'
import { getCachedPracticeExams, savePracticeExam } from '../lib/db'
import { listUploads } from '../lib/uploadRegistry'
import { loadExamDraft, clearExamDraft, draftSummary } from '../lib/examDraft'
import { getActivePlan, canUseFeature } from '../lib/subscription'
import { track } from '../lib/analytics'
import { PRACTICE_EXAMS as C, PE_SERIF, SANS } from '../theme/tokens'
import { useIsMobile } from '../utils/useIsMobile'
import {
  EXAM_LENGTHS, buildExamHistory, examRowMeta, scoreColor,
  sourceLine, timerLabel, timerMinutesFor, buildStartPayload,
} from '../utils/practiceExams'
import PracticeExamSetup from './PracticeExamSetup'
import PracticeExamScreen from './PracticeExamScreen'
import PracticeExamResults from './PracticeExamResults'

const btnReset = {
  appearance: 'none', border: 'none', background: 'none',
  padding: 0, margin: 0, cursor: 'pointer', textAlign: 'left',
}

/** Uppercase section label, 11px with the export's letter spacing. */
function Eyebrow({ children, style }) {
  return (
    <div style={{
      fontFamily: SANS, fontSize: 11, fontWeight: 600, lineHeight: 1,
      letterSpacing: '.08em', color: C.secondary, ...style,
    }}>{children}</div>
  )
}

/**
 * Course chip. Same shape as the Study Coach intake Pill, set to the values in
 * design/practice-exams/ (10px 16px, 14px) rather than intake's (9px 16px,
 * 13.5px). The 0.5px and 1px divergence is the export's, not a mistake; a
 * future pass should unify the two into one shared chip.
 */
function CourseChip({ name, dot, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...btnReset, fontFamily: SANS, fontSize: 14, fontWeight: 500, lineHeight: 1,
      display: 'inline-flex', alignItems: 'center', gap: 9,
      padding: '10px 16px', borderRadius: 999,
      border: `1px solid ${selected ? C.blue : C.cardBorder}`,
      background: selected ? C.blue : C.card,
      color: selected ? '#ffffff' : C.ink,
      minHeight: 40,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 999, flexShrink: 0,
        background: selected ? '#ffffff' : dot,
        ...(selected ? { opacity: 0.85 } : {}),
      }} />
      {name}
    </button>
  )
}

function LengthButton({ n, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...btnReset, fontFamily: SANS, fontSize: 14, lineHeight: 1,
      fontWeight: selected ? 600 : 500,
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: '9px 16px', borderRadius: 10,
      border: selected ? `1.5px solid ${C.blue}` : `1px solid ${C.cardBorder}`,
      background: C.card,
      color: selected ? C.blue : C.ink,
      minHeight: 38,
    }}>
      {n}
      <span style={{
        fontSize: 12,
        color: selected ? C.blue : C.secondary,
        ...(selected ? { opacity: 0.7 } : {}),
      }}>questions</span>
    </button>
  )
}

function TimerToggle({ on, label, onClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 35 }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Time this exam"
        onClick={onClick}
        style={{
          ...btnReset,
          width: 40, height: 23, borderRadius: 999, flexShrink: 0,
          background: on ? C.blue : C.cardBorder,
          display: 'inline-flex', alignItems: 'center',
          padding: '0 3px',
          justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span style={{ width: 17, height: 17, borderRadius: 999, background: '#ffffff' }} />
      </button>
      <span style={{
        fontFamily: SANS, fontSize: 14, fontWeight: 400, lineHeight: 1,
        color: on ? C.ink : C.secondary,
      }}>{label}</span>
    </div>
  )
}

function HistoryRow({ row, mobile, onReview }) {
  const meta = examRowMeta(row)
  const color = scoreColor(row.score)

  const identity = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: row.dot, flexShrink: 0 }} />
      <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: C.ink }}>
        {row.courseName}
      </span>
      {meta && (
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 400, lineHeight: 1.3, color: C.secondary }}>
          {meta}
        </span>
      )}
    </div>
  )

  // A record with no auto-gradable questions has no score. It gets a muted
  // dash, never a number and never a color.
  const numeral = (
    <span style={{
      fontFamily: PE_SERIF, fontSize: 22, fontWeight: 500,
      color: color ?? C.secondary,
      minWidth: 34, textAlign: 'right',
    }}>{row.score == null ? '–' : row.score}</span>
  )

  const review = row.canReview ? (
    <button type="button" onClick={() => onReview(row)} style={{
      ...btnReset, fontFamily: SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1,
      color: C.blue,
    }}>Review</button>
  ) : <span />

  if (mobile) {
    // Two lines on a phone: identity above, score and Review below.
    return (
      <div style={{
        borderTop: `1px solid ${C.cardBorder}`, padding: '16px 22px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {identity}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {numeral}
          {review}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      borderTop: `1px solid ${C.cardBorder}`, padding: '18px 32px',
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      alignItems: 'center', gap: 28,
    }}>
      {identity}
      {numeral}
      {review}
    </div>
  )
}

export default function PracticeExamView({ courses = [], onShowPaywall, onOpenTeachItBack, onOpenQuizBurst }) {
  const mobile = useIsMobile()

  const [subview, setSubview] = useState('landing') // 'landing' | 'setup' | 'taking' | 'results'
  const [examCourse, setExamCourse] = useState(null)
  const [examQuestions, setExamQuestions] = useState([])
  const [examAnswers, setExamAnswers] = useState([])
  const [examTimeMs, setExamTimeMs] = useState(0)
  const [examTimerMinutes, setExamTimerMinutes] = useState(null)
  const [questionTimings, setQuestionTimings] = useState([])
  const [replay, setReplay] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // A saved, unfinished exam. Read once on mount and refreshed whenever we
  // come back to the entry screen.
  const [draft, setDraft] = useState(() => loadExamDraft())
  const [resumeInitial, setResumeInitial] = useState(null)
  const [confirmReplaceDraft, setConfirmReplaceDraft] = useState(false)

  // Setup choices, all made here so no downstream step asks for them again.
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? null)
  const [length, setLength] = useState(20)
  const [timerOn, setTimerOn] = useState(true)

  const selectedCourse = useMemo(
    () => courses.find(c => String(c.id) === String(selectedCourseId)) ?? courses[0] ?? null,
    [courses, selectedCourseId],
  )

  // Uploads are a per-course network read, so every answer is kept for the
  // life of the view. Switching chips back and forth never refetches.
  //
  // The cache is read during render and the fetch only bumps a counter, so a
  // course whose answer is already known renders resolved on the first pass
  // with no intermediate "checking" frame.
  const materialCache = useRef(new Map())
  const [materialVersion, setMaterialVersion] = useState(0)
  const courseKey = selectedCourse?.id != null ? String(selectedCourse.id) : null
  const _materialBust = materialVersion // re-render trigger when a fetch resolves
  const material = courseKey ? materialCache.current.get(courseKey) ?? null : null

  useEffect(() => {
    if (!courseKey || materialCache.current.has(courseKey)) return
    // Until this lands the source line says it is checking rather than
    // warning, so a student who has material never sees the amber line flash
    // before it is corrected.
    let cancelled = false
    listUploads(courseKey)
      .then(uploads => {
        const processed = uploads.filter(u => u.status === 'processed')
        return {
          hasNotes: processed.some(u => u.kind !== 'syllabus'),
          hasSyllabus: processed.some(u => u.kind === 'syllabus'),
        }
      })
      .catch(() => ({ error: true }))
      .then(result => {
        materialCache.current.set(courseKey, result)
        if (!cancelled) setMaterialVersion(v => v + 1)
      })
    return () => { cancelled = true }
  }, [courseKey])

  const history = useMemo(() => {
    const plans = Object.fromEntries(
      courses.map(c => [String(c.id), { practice_exams: getCachedPracticeExams(c.id) }]),
    )
    return buildExamHistory(plans, courses)
    // refreshKey is a deliberate cache bust: getCachedPracticeExams reads a
    // module-level cache that a finished exam mutates outside of React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, refreshKey])

  const hasPastResults = useMemo(
    () => history.some(r => String(r.courseId) === String(selectedCourse?.id)),
    [history, selectedCourse?.id],
  )

  const handleStart = ({ questions, timerMinutes }) => {
    setExamQuestions(questions)
    setExamAnswers(questions.map(() => ''))
    setExamTimerMinutes(timerMinutes ?? null)
    setSubview('taking')
  }

  const handleSubmit = ({ answers, timeMs, questionTimings: timings }) => {
    setExamAnswers(answers)
    setExamTimeMs(timeMs)
    setQuestionTimings(timings ?? [])
    setReplay(null)
    setSubview('results')
    try {
      const courseId = examCourse?.id ?? null
      if (courseId !== null) {
        const correct = examQuestions.reduce((n, q, i) => {
          if (q.type !== 'multiple_choice') return n
          return answers[i] === q.answer ? n + 1 : n
        }, 0)
        const mcCount = examQuestions.filter(q => q.type === 'multiple_choice').length
        const score = mcCount > 0 ? Math.round((correct / mcCount) * 100) : null
        savePracticeExam(courseId, {
          id: `exam_${Date.now()}`,
          takenAt: Date.now(),
          courseName: examCourse?.name ?? null,
          questions: examQuestions,
          answers,
          score,
          timeMs,
        })
          .then(() => setRefreshKey(k => k + 1))
          .catch(e => console.error('savePracticeExam failed', e))
      }
    } catch (e) { console.error('savePracticeExam failed', e) }
  }

  const handleRetake = () => {
    track('practice_exam_retake', { questionCount: examQuestions.length, courseName: examCourse?.name ?? null })
    setExamAnswers(examQuestions.map(() => ''))
    setExamTimeMs(0)
    setQuestionTimings([])
    setReplay(null)
    setSubview('taking')
  }

  const closeToLanding = () => {
    setSubview('landing')
    setExamCourse(null)
    setExamQuestions([])
    setExamAnswers([])
    setExamTimeMs(0)
    setExamTimerMinutes(null)
    setQuestionTimings([])
    setReplay(null)
    setResumeInitial(null)
    // The exam screen may have just saved or discarded a draft.
    setDraft(loadExamDraft())
  }

  // Picks a saved exam back up exactly where it was left.
  const handleResume = () => {
    if (!draft) return
    const course = courses.find(c => String(c.id) === String(draft.courseId)) ?? null
    track('practice_exam_resumed', {
      questionCount: draft.questions.length,
      answeredCount: draft.answeredCount,
      courseName: draft.courseName ?? null,
    })
    setExamCourse(course ?? { id: draft.courseId, name: draft.courseName })
    setExamQuestions(draft.questions)
    setExamAnswers(draft.answers)
    setExamTimerMinutes(draft.timerMinutes ?? null)
    setResumeInitial(draft)
    setReplay(null)
    setSubview('taking')
  }

  const discardDraft = () => {
    clearExamDraft()
    setDraft(null)
    setConfirmReplaceDraft(false)
  }

  const goToSetup = () => {
    setResumeInitial(null)
    setConfirmReplaceDraft(false)
    setSubview('setup')
  }

  // Opens a stored exam in the results view. readOnly stops the replay from
  // re-recording a study session, re-adding deck cards or re-firing mastery
  // signals for work the student already did.
  const handleReview = (row) => {
    const course = courses.find(c => String(c.id) === String(row.courseId)) ?? null
    setExamCourse(course ?? { id: row.courseId, name: row.courseName })
    setExamQuestions(row.exam.questions ?? [])
    setExamAnswers(row.exam.answers ?? [])
    setExamTimeMs(Number.isFinite(row.exam.timeMs) ? row.exam.timeMs : 0)
    setQuestionTimings([])
    setReplay(row.id)
    setSubview('results')
  }

  // ── Overlays ───────────────────────────────────────────────────────────────
  if (subview === 'taking') {
    return (
      <PracticeExamScreen
        questions={examQuestions}
        courseId={examCourse?.id ?? null}
        courseName={examCourse?.name ?? null}
        timerMinutes={examTimerMinutes}
        initial={resumeInitial}
        onSubmit={handleSubmit}
        onExit={closeToLanding}
      />
    )
  }

  if (subview === 'results') {
    return (
      <PracticeExamResults
        questions={examQuestions}
        answers={examAnswers}
        timeMs={examTimeMs}
        questionTimings={questionTimings}
        courseId={examCourse?.id ?? null}
        courseName={examCourse?.name ?? null}
        course={examCourse}
        readOnly={replay !== null}
        onRetake={handleRetake}
        onClose={closeToLanding}
        onOpenTeachItBack={onOpenTeachItBack ? (topic) => {
          const courseIdx = Math.max(0, courses.findIndex(c => String(c.id) === String(examCourse?.id)))
          onOpenTeachItBack({ courseIdx, topic })
        } : null}
        onOpenQuizBurst={onOpenQuizBurst ? (topic) => {
          const courseIdx = Math.max(0, courses.findIndex(c => String(c.id) === String(examCourse?.id)))
          onOpenQuizBurst({ courseIdx, topic })
        } : null}
      />
    )
  }

  if (subview === 'setup') {
    return (
      <PracticeExamSetup
        course={selectedCourse}
        length={length}
        timerMinutes={timerOn ? timerMinutesFor(length) : null}
        onBack={() => setSubview('landing')}
        onStart={(payload) => {
          setExamCourse(payload.course)
          handleStart(payload)
        }}
        onShowPaywall={onShowPaywall}
      />
    )
  }

  // ── Entry screen ───────────────────────────────────────────────────────────
  const pagePad = mobile ? '28px 20px 48px' : '56px 72px 72px'
  const cardPadX = mobile ? 22 : 32
  const source = sourceLine({
    courseName: selectedCourse?.name,
    material,
    hasPastResults,
  })

  const heading = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Eyebrow>PRACTICE EXAMS</Eyebrow>
      <h1 style={{
        margin: 0, fontFamily: PE_SERIF, fontSize: mobile ? 34 : 44,
        fontWeight: 500, lineHeight: 1.1, color: C.ink,
      }}>Practice Exams<span style={{ color: C.blue }}>.</span></h1>
      <p style={{
        margin: 0, fontFamily: SANS, fontSize: 15, fontWeight: 400, lineHeight: 1.5,
        color: C.secondary, maxWidth: 560,
      }}>Built from your material. Find out where you stand before it counts.</p>
    </div>
  )

  if (!courses.length) {
    return (
      <div style={{ minHeight: '100%', background: C.pageBg, padding: pagePad, fontFamily: SANS }}>
        <div style={{ maxWidth: 1136, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          {heading}
          <p style={{
            margin: 0, fontFamily: SANS, fontSize: 13.5, fontWeight: 400, lineHeight: 1.5,
            color: C.secondary,
          }}>Add a course first. Practice exams are built per course.</p>
        </div>
      </div>
    )
  }

  const plan = getActivePlan()
  const isPro = plan === 'pro' || plan === 'unlimited'
  const canStart = isPro || canUseFeature('practiceExam').allowed

  return (
    <div style={{ minHeight: '100%', background: C.pageBg, padding: pagePad, fontFamily: SANS }}>
      <div style={{ maxWidth: 1136, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {heading}

        {/* ── Saved exam ────────────────────────────────────────────────── */}
        {/* Sits above the setup card because picking up an unfinished exam is
            the more urgent of the two things this screen offers. */}
        {draft && (
          <div style={{
            background: C.card, border: `1px solid ${C.cardBorder}`,
            borderRadius: 16, boxShadow: C.cardShadow,
            padding: `20px ${cardPadX}px`,
            display: 'flex', alignItems: mobile ? 'stretch' : 'center',
            flexDirection: mobile ? 'column' : 'row',
            justifyContent: 'space-between', gap: mobile ? 14 : 24,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <Eyebrow>EXAM IN PROGRESS</Eyebrow>
              <p style={{
                margin: '6px 0 0', fontFamily: SANS, fontSize: 15, fontWeight: 500,
                lineHeight: 1.3, color: C.ink,
              }}>{draft.courseName || 'Practice exam'}</p>
              <p style={{
                margin: 0, fontFamily: SANS, fontSize: 13, fontWeight: 400,
                lineHeight: 1.4, color: C.secondary,
              }}>{draftSummary(draft)}</p>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
              ...(mobile ? { justifyContent: 'space-between' } : {}),
            }}>
              <button type="button" onClick={discardDraft} style={{
                ...btnReset, fontFamily: SANS, fontSize: 13.5, fontWeight: 500,
                lineHeight: 1, color: C.secondary, padding: '10px 4px',
              }}>Discard</button>
              <button type="button" onClick={handleResume} style={{
                ...btnReset,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px 22px', borderRadius: 12,
                border: `1px solid ${C.blue}`, background: C.card,
                fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1,
                color: C.blue, minHeight: 42,
              }}>Resume exam</button>
            </div>
          </div>
        )}

        {/* ── Setup card ────────────────────────────────────────────────── */}
        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 16, boxShadow: C.cardShadow,
        }}>
          <div style={{
            padding: `28px ${cardPadX}px 26px`,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <Eyebrow>COURSE</Eyebrow>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {courses.map((c, i) => (
                <CourseChip
                  key={c.id ?? i}
                  name={c.name}
                  dot={c.color?.dot ?? history.find(r => String(r.courseId) === String(c.id))?.dot ?? C.blue}
                  selected={String(c.id) === String(selectedCourse?.id)}
                  onClick={() => setSelectedCourseId(c.id)}
                />
              ))}
            </div>
          </div>

          <div style={{
            borderTop: `1px solid ${C.cardBorder}`,
            padding: `24px ${cardPadX}px`,
            display: 'flex', alignItems: mobile ? 'stretch' : 'flex-end',
            flexDirection: mobile ? 'column' : 'row',
            gap: mobile ? 24 : 48, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Eyebrow>LENGTH</Eyebrow>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXAM_LENGTHS.map(n => (
                  <LengthButton key={n} n={n} selected={length === n} onClick={() => setLength(n)} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Eyebrow>TIMER</Eyebrow>
              <TimerToggle on={timerOn} label={timerLabel(timerOn, length)} onClick={() => setTimerOn(v => !v)} />
            </div>
          </div>

          <div style={{
            borderTop: `1px solid ${C.cardBorder}`,
            padding: `22px ${cardPadX}px 26px`,
            display: 'flex', alignItems: mobile ? 'stretch' : 'center',
            flexDirection: mobile ? 'column' : 'row',
            justifyContent: 'space-between', gap: mobile ? 18 : 32, flexWrap: 'wrap',
          }}>
            <p style={{
              margin: 0, fontFamily: SANS, fontSize: 13.5, fontWeight: 400, lineHeight: 1.5,
              color: source.tone === 'amber' ? C.amber : C.secondary,
              maxWidth: source.tone === 'amber' ? 540 : 520,
            }}>{source.text}</p>
            <button
              type="button"
              onClick={() => {
                if (!canStart) { onShowPaywall?.('practice_exam'); return }
                const { course: _course, ...payload } = buildStartPayload({ course: selectedCourse, length, timerOn })
                track('practice_exam_start_clicked', { plan, courseCount: courses.length, ...payload })
                // Only one exam is held at a time, so ask before a new one
                // takes the saved one's place.
                if (draft) { setConfirmReplaceDraft(true); return }
                goToSetup()
              }}
              style={{
                ...btnReset,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '14px 26px', borderRadius: 12, background: C.blue,
                fontFamily: SANS, fontSize: 14.5, fontWeight: 600, lineHeight: 1, color: '#ffffff',
                flexShrink: 0, minHeight: 44,
                ...(mobile ? { width: '100%' } : {}),
              }}
            >Start practice exam</button>
          </div>
        </div>

        {/* ── History ───────────────────────────────────────────────────── */}
        {history.length === 0 ? (
          <p style={{
            margin: `-16px 0 0 ${mobile ? 0 : 2}px`, fontFamily: SANS,
            fontSize: 13.5, fontWeight: 400, lineHeight: 1.5, color: C.secondary,
          }}>Your past exams and scores will show up here.</p>
        ) : (
          <div style={{
            background: C.card, border: `1px solid ${C.cardBorder}`,
            borderRadius: 16, boxShadow: C.cardShadow,
          }}>
            <div style={{
              padding: `24px ${cardPadX}px 18px`,
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16,
            }}>
              <h2 style={{
                margin: 0, fontFamily: PE_SERIF, fontSize: 24, fontWeight: 500, color: C.ink,
              }}>Past exams</h2>
              <span style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 400, lineHeight: 1, color: C.secondary,
              }}>{history.length} taken</span>
            </div>
            {history.map(row => (
              <HistoryRow key={row.id} row={row} mobile={mobile} onReview={handleReview} />
            ))}
          </div>
        )}

      </div>

      {confirmReplaceDraft && draft && (
        <div role="dialog" aria-modal="true" aria-label="Replace saved exam" style={{
          position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: C.card, borderRadius: 16, padding: 24, maxWidth: 440, width: '100%',
            boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{
              margin: 0, fontFamily: SANS, fontSize: 17, fontWeight: 600, color: C.ink,
            }}>You have an exam in progress</h3>
            <p style={{
              margin: '8px 0 20px', fontFamily: SANS, fontSize: 14, lineHeight: 1.55, color: C.secondary,
            }}>
              {draft.courseName ? `${draft.courseName}, ` : ''}{draftSummary(draft)}. Starting a new exam replaces it.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setConfirmReplaceDraft(false)} style={{
                ...btnReset, padding: '10px 16px', borderRadius: 10,
                border: `1px solid ${C.cardBorder}`, background: C.card,
                fontFamily: SANS, fontSize: 13.5, fontWeight: 500, color: C.secondary,
              }}>Cancel</button>
              <button type="button" onClick={() => { discardDraft(); goToSetup() }} style={{
                ...btnReset, padding: '10px 20px', borderRadius: 10, border: 'none',
                background: C.blue, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: '#ffffff',
              }}>Start a new exam</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
