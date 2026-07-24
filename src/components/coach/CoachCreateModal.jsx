import { useMemo, useState } from 'react'
import ModalShell from '../ui/ModalShell'
import { T } from '../../tokens'
import { TARGET_OPTIONS, letterGrade, getCurrentGrade } from '../../utils/gradeCalc'
import {
  buildTrustLine,
  buildWhyLines,
  extractTopics,
  extraRepsTopicsFromRecall,
  generatePlan,
} from './planLogic'
import { saveInitialV2Plan, todayIso } from './planStore'
import { pickSmartCourse } from '../../lib/smartDefault'
import { getMasteryForCourse } from '../../lib/masteryStore'

const LABEL = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim }
const PILL = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  background: T.bgEl, border: `1px solid ${T.border}`,
  borderRadius: T.radius.full, padding: '6px 14px',
  fontSize: 13, fontWeight: 600, color: T.text,
}
const LINK = { fontSize: 12.5, color: T.accent, cursor: 'pointer' }
const GRADE_LABELS = TARGET_OPTIONS.map(o => o.label)

// Best pick: same helper the tool modals use — closest exam or biggest gap.
function pickCourseForCoach(courses) {
  const smart = pickSmartCourse(courses)
  return { index: smart.index, course: courses[smart.index] ?? courses[0] ?? null }
}

// Derived current grade from assignments for this courseIdx. Falls back to the
// override on the course, then to null.
function deriveCurrentGradeLabel(course, assignments, courseIdx) {
  if (!course) return null
  if (course.currentGradeOverride) return course.currentGradeOverride
  const components = (assignments || []).filter(a => a.courseIdx === courseIdx && a.loggedGrade != null)
    .map(a => ({ graded: true, grade: a.loggedGrade, weight: a.weight ?? 1 }))
  const pct = getCurrentGrade(components)
  if (pct == null) return null
  return letterGrade(pct)
}

export default function CoachCreateModal({
  courses,
  assignments = [],
  scheduleHasData = false,   // whether the user's Schedule section has real availability data
  initialCourseIdx = null,
  onClose,
  onSaveCourse,              // (idx, updatedCourse) => void — persists currentGradeOverride
  onPlanSaved,               // (courseId, v2Plan) => void
}) {
  const smart = useMemo(() => pickCourseForCoach(courses), [courses])
  const [courseIdx, setCourseIdx] = useState(initialCourseIdx ?? smart.index)
  const [showCoursePicker, setShowCoursePicker] = useState(false)
  const course = courses[courseIdx] ?? null
  const courseColor = course?.color?.dot ?? T.course[courseIdx % T.course.length]

  // Exam date: change opens native date input inline.
  const [examEditing, setExamEditing] = useState(false)
  const [examDate, setExamDate] = useState(course?.examDate ?? '')

  // Grades: default current to derived-or-override; target defaults to course.targetGrade or unset.
  const derivedCurrent = deriveCurrentGradeLabel(course, assignments, courseIdx)
  const [currentGrade, setCurrentGrade] = useState(derivedCurrent ?? '')
  const [targetGrade,  setTargetGrade]  = useState(course?.targetGrade ?? '')

  // Availability: if the app-level schedule has data, we say "Fitting sessions around your schedule".
  // Otherwise, show the fallback picker inline.
  const [daysPerWeek, setDaysPerWeek] = useState(4)
  const [sessionLen, setSessionLen] = useState(45)
  const [availEditing, setAvailEditing] = useState(false)

  const [topicsText, setTopicsText] = useState('')
  const [step, setStep] = useState('create')      // 'create' | 'review'
  const [reviewTopics, setReviewTopics] = useState([])  // [{name, extra}]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Trust-line inputs, computed from real signals only. Uploads: not tracked
  // per-course pre-generation in v1, so treated as false unless the student
  // pastes into topicsText (that counts as "what you tell me here"). Practice:
  // any recall data existing for this course. Schedule: passed in from parent.
  const trustSignals = useMemo(() => {
    if (!course) return { uploads: false, practice: false, schedule: false }
    const practiceCount = getMasteryForCourse(course.id).length
    return {
      uploads: false,
      practice: practiceCount > 0,
      schedule: !!scheduleHasData,
    }
  }, [course, scheduleHasData])

  const trustLine = buildTrustLine(trustSignals)

  // ── Handlers ──
  const changeCourse = (idx) => {
    setCourseIdx(idx)
    setShowCoursePicker(false)
    const c = courses[idx]
    setExamDate(c?.examDate ?? '')
    const derived = deriveCurrentGradeLabel(c, assignments, idx)
    setCurrentGrade(derived ?? '')
    setTargetGrade(c?.targetGrade ?? '')
  }

  const commitCurrentGrade = (label) => {
    setCurrentGrade(label)
    // Persist as override on the course (only when different from derived).
    if (course && onSaveCourse && label && label !== derivedCurrent) {
      onSaveCourse(courseIdx, { ...course, currentGradeOverride: label })
    }
  }
  const commitTargetGrade = (label) => {
    setTargetGrade(label)
    if (course && onSaveCourse && label && label !== course.targetGrade) {
      onSaveCourse(courseIdx, { ...course, targetGrade: label })
    }
  }
  const commitExamDate = (iso) => {
    setExamDate(iso)
    setExamEditing(false)
    if (course && onSaveCourse && iso && iso !== course.examDate) {
      onSaveCourse(courseIdx, { ...course, examDate: iso })
    }
  }

  const goReview = () => {
    setError('')
    const topics = extractTopics(topicsText, [])
    if (!topics.length) {
      setError('Add at least one topic so I have something to build around.')
      return
    }
    const flagged = extraRepsTopicsFromRecall(course.id)
    setReviewTopics(topics.map(name => ({
      name,
      extra: flagged.has(name.toLowerCase()),
    })))
    setStep('review')
  }

  const toggleExtra = (i) => {
    setReviewTopics(prev => prev.map((t, j) => j === i ? { ...t, extra: !t.extra } : t))
  }
  const removeTopic = (i) => {
    setReviewTopics(prev => prev.filter((_, j) => j !== i))
  }

  const savePlan = async () => {
    if (!course) return
    setSaving(true)
    setError('')
    try {
      const struggles = reviewTopics.filter(t => t.extra).map(t => t.name)
      const v2 = generatePlan({
        courseId: course.id,
        courseName: course.name,
        examDateIso: examDate || null,
        todayIso: todayIso(),
        topicsText: reviewTopics.map(t => t.name).join('\n'),
        struggles,
        daysPerWeek,
        sessionLen,
        currentGrade,
        targetGrade,
      })
      if (!v2) {
        setError('No topics to plan around. Add one and try again.')
        setSaving(false)
        return
      }
      // Legacy shape retained so the old view still renders if the flag flips.
      const legacyPlan = {
        weeklyFocus: v2.weeks.map((w, i) => ({
          week: i + 1,
          sessions: w.sessions.map(s => ({
            focusArea: s.title,
            goal: s.title,
            sessionLabel: `${s.toolLabel} · ${s.method}`,
            duration: s.durationMin,
            keyTopics: [s.topic],
          })),
        })),
        priorityTopics: reviewTopics.filter(t => t.extra).map(t => t.name),
        coachNotes: '',
      }
      const legacyFormData = {
        courseIdx,
        goal: targetGrade || '',
        topics: reviewTopics.map(t => t.name),
        struggles,
        dates: examDate ? [{ label: 'Exam', date: examDate }] : [],
        daysPerWeek,
        sessionLen,
        style: [],
        includeWeekends: true,
        materials: [],
      }
      await saveInitialV2Plan(course.id, v2, legacyPlan, legacyFormData)
      onPlanSaved?.(course.id, v2)
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Something went wrong. Try again.')
      setSaving(false)
    }
  }

  if (!course) {
    return (
      <ModalShell ariaLabel="Study Coach" onClose={onClose} width={520}>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Add a course first</div>
          <div style={{ marginTop: 8, fontSize: 13, color: T.muted }}>Study Coach needs a course to build a plan around.</div>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell ariaLabel="Study Coach" onClose={onClose} width={520}>
      {step === 'create' && (
        <CreateStep
          course={course}
          courseColor={courseColor}
          courseIdx={courseIdx}
          courses={courses}
          onChangeCourse={changeCourse}
          showCoursePicker={showCoursePicker}
          setShowCoursePicker={setShowCoursePicker}
          examDate={examDate}
          examEditing={examEditing}
          setExamEditing={setExamEditing}
          commitExamDate={commitExamDate}
          currentGrade={currentGrade}
          commitCurrentGrade={commitCurrentGrade}
          targetGrade={targetGrade}
          commitTargetGrade={commitTargetGrade}
          scheduleHasData={scheduleHasData}
          daysPerWeek={daysPerWeek}
          setDaysPerWeek={setDaysPerWeek}
          sessionLen={sessionLen}
          setSessionLen={setSessionLen}
          availEditing={availEditing}
          setAvailEditing={setAvailEditing}
          topicsText={topicsText}
          setTopicsText={setTopicsText}
          trustLine={trustLine}
          onNext={goReview}
          onClose={onClose}
          error={error}
        />
      )}
      {step === 'review' && (
        <ReviewStep
          course={course}
          reviewTopics={reviewTopics}
          onToggle={toggleExtra}
          onRemove={removeTopic}
          onBack={() => setStep('create')}
          onSave={savePlan}
          saving={saving}
          error={error}
          examDate={examDate}
          daysPerWeek={daysPerWeek}
          sessionLen={sessionLen}
        />
      )}
    </ModalShell>
  )
}

// ── Create step ──────────────────────────────────────────────────────────────

function CreateStep(p) {
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '22px 24px 18px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{
          width: 40, height: 40, borderRadius: T.radius.md,
          background: T.accentSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" stroke={T.accent} strokeWidth="1.7" strokeLinejoin="round"/>
            <path d="M10 20h4" stroke={T.accent} strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 650, color: T.text }}>Study Coach</div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: T.muted }}>A week-by-week plan built around your schedule and exams.</div>
        </div>
        <button onClick={p.onClose} aria-label="Close" style={{
          background: 'none', border: 'none', fontSize: 18, color: T.dim,
          cursor: 'pointer', padding: '2px 6px', lineHeight: 1, fontFamily: 'inherit',
        }}>×</button>
      </header>
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={LABEL}>Best pick</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={PILL}>
              <span style={{ width: 8, height: 8, borderRadius: T.radius.full, background: p.courseColor }} />
              {p.course.name}
            </span>
            <a style={LINK} onClick={(e) => { e.preventDefault(); p.setShowCoursePicker(v => !v) }} href="#">change</a>
          </div>
          {p.showCoursePicker && (
            <div style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: T.radius.md, padding: 6, marginTop: 2, maxHeight: 220, overflowY: 'auto',
            }}>
              {p.courses.map((c, i) => (
                <div
                  key={c.id ?? i}
                  onClick={() => p.onChangeCourse(i)}
                  style={{
                    padding: '8px 10px', borderRadius: T.radius.sm,
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, color: T.text, cursor: 'pointer',
                    background: i === p.courseIdx ? T.bgEl : 'transparent',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: T.radius.full, background: c.color?.dot ?? T.course[i % T.course.length] }} />
                  {c.name}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.muted, flexWrap: 'wrap' }}>
            Exam date:
            {p.examEditing ? (
              <input
                type="date"
                defaultValue={p.examDate}
                onBlur={(e) => p.commitExamDate(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') p.commitExamDate(e.target.value) }}
                autoFocus
                style={{
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text,
                  background: T.bgEl, border: `1px solid ${T.border}`,
                  borderRadius: T.radius.sm, padding: '4px 8px', outline: 'none',
                }}
              />
            ) : (
              <>
                <span style={{ fontWeight: 600, color: p.examDate ? T.text : T.dim }}>
                  {p.examDate ? formatDate(p.examDate) : 'No exam date'}
                </span>
                <a style={LINK} onClick={(e) => { e.preventDefault(); p.setExamEditing(true) }} href="#">{p.examDate ? 'change' : 'add'}</a>
              </>
            )}
          </div>
        </div>

        {/* Grade pills */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <GradePill
            label="Current grade"
            value={p.currentGrade}
            onChange={p.commitCurrentGrade}
            placeholder="Add"
          />
          <GradePill
            label="Aiming for"
            value={p.targetGrade}
            onChange={p.commitTargetGrade}
            placeholder="Add"
          />
        </div>

        {/* Availability */}
        <div style={{ marginTop: 12 }}>
          {p.scheduleHasData ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted }}>
              Fitting sessions around your schedule
              <a style={LINK} onClick={(e) => { e.preventDefault(); p.setAvailEditing(v => !v) }} href="#">change</a>
            </div>
          ) : (
            <AvailabilityPicker
              daysPerWeek={p.daysPerWeek}
              sessionLen={p.sessionLen}
              onDays={p.setDaysPerWeek}
              onLen={p.setSessionLen}
            />
          )}
          {p.scheduleHasData && p.availEditing && (
            <div style={{ marginTop: 8 }}>
              <AvailabilityPicker
                daysPerWeek={p.daysPerWeek}
                sessionLen={p.sessionLen}
                onDays={p.setDaysPerWeek}
                onLen={p.setSessionLen}
              />
            </div>
          )}
        </div>

        {/* Topics textarea */}
        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.text, display: 'block' }}>Topics, struggles, and goals</label>
          <textarea
            value={p.topicsText}
            onChange={(e) => p.setTopicsText(e.target.value)}
            placeholder="Paste your syllabus topics and tell me what feels hard."
            rows={5}
            style={{
              marginTop: 8, width: '100%', boxSizing: 'border-box',
              border: `1px solid ${T.border}`, borderRadius: T.radius.md,
              padding: '12px 14px', fontSize: 13.5, color: T.text,
              lineHeight: 1.5, resize: 'vertical', outline: 'none',
              background: T.bgCard, fontFamily: 'inherit',
            }}
          />
        </div>

        {p.error && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: T.pink }}>{p.error}</div>
        )}

        <div style={{ marginTop: 16, fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>{p.trustLine}</div>

        <button
          onClick={p.onNext}
          style={{
            marginTop: 12, width: '100%',
            background: T.accent, border: 'none', borderRadius: T.radius.md,
            padding: '12px 0', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
            color: T.onAccent, cursor: 'pointer',
          }}
        >Build my plan</button>
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: T.dim }}>
          Takes about 30 seconds. You can refine it anytime.
        </div>
      </div>
    </>
  )
}

// ── Review step ──────────────────────────────────────────────────────────────

function ReviewStep({ course, reviewTopics, onToggle, onRemove, onBack, onSave, saving, error, examDate, daysPerWeek, sessionLen }) {
  const whyLines = buildWhyLines(course.id, reviewTopics)
  // Pacing line: use daysPerWeek + sessionLen from parent; wrap phrasing only
  // when we have a real exam date.
  const pacing = examDate
    ? `${daysPerWeek} sessions a week, ${sessionLen}m each, wrapping 3 days before your exam.`
    : `${daysPerWeek} sessions a week, ${sessionLen}m each.`

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '24px 24px 0' }}>
        <h2 style={{
          fontFamily: `'Source Serif 4', Georgia, serif`,
          fontWeight: 600, fontSize: 24, margin: 0, color: T.text,
        }}>Here&apos;s your plan</h2>
        <button onClick={onBack} aria-label="Close" style={{
          background: 'none', border: 'none', fontSize: 18, color: T.dim,
          cursor: 'pointer', padding: '2px 6px', lineHeight: 1, fontFamily: 'inherit',
        }}>×</button>
      </header>
      <div style={{ padding: '10px 24px 24px' }}>
        <div style={{ fontSize: 13.5, color: T.muted }}>{pacing}</div>
        <div style={{ marginTop: 18, ...LABEL }}>What this plan covers</div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {reviewTopics.map((t, i) => (
            <TopicChip key={`${t.name}-${i}`} topic={t} onToggle={() => onToggle(i)} onRemove={() => onRemove(i)} />
          ))}
        </div>
        {whyLines.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {whyLines.map((line, i) => (
              <div key={i} style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{line}</div>
            ))}
          </div>
        )}
        {error && <div style={{ marginTop: 12, fontSize: 12.5, color: T.pink }}>{error}</div>}
        <button
          onClick={onSave}
          disabled={saving || reviewTopics.length === 0}
          style={{
            marginTop: 20, width: '100%',
            background: T.accent, border: 'none', borderRadius: T.radius.md,
            padding: '12px 0', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
            color: T.onAccent, cursor: saving ? 'default' : 'pointer',
            opacity: saving || reviewTopics.length === 0 ? 0.7 : 1,
          }}
        >{saving ? 'Saving…' : 'Save my plan'}</button>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <a onClick={(e) => { e.preventDefault(); onBack() }} style={{ fontSize: 12.5, color: T.muted, cursor: 'pointer' }} href="#">Change my inputs</a>
        </div>
      </div>
    </>
  )
}

function TopicChip({ topic, onToggle, onRemove }) {
  return (
    <span
      onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: topic.extra ? T.accentSoft : T.bgCard,
        border: `1px solid ${topic.extra ? T.accentGlow : T.border}`,
        borderRadius: T.radius.full, padding: '6px 8px 6px 13px',
        fontSize: 12.5, color: T.text, cursor: 'pointer',
      }}
    >
      {topic.name}
      {topic.extra && (
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: T.accent,
          background: T.bgCard, borderRadius: T.radius.full, padding: '2px 7px',
          border: `1px solid ${T.accentGlow}`,
        }}>extra reps</span>
      )}
      <span
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        aria-label="Remove topic"
        style={{
          width: 16, height: 16, borderRadius: T.radius.full,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: T.dim, cursor: 'pointer',
        }}
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </span>
    </span>
  )
}

function GradePill({ label, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted, position: 'relative' }}>
      {label}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
          color: value ? T.text : T.dim,
          background: T.bgEl, border: `1px solid ${T.border}`,
          borderRadius: T.radius.sm, padding: '4px 10px',
          cursor: 'pointer', minWidth: 46, textAlign: 'left',
        }}
      >{value || placeholder}</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: T.radius.sm, boxShadow: T.shadow.float,
          padding: 4, zIndex: 5, minWidth: 88, maxHeight: 220, overflowY: 'auto',
        }}>
          {GRADE_LABELS.map(g => (
            <div
              key={g}
              onClick={() => { onChange(g); setOpen(false) }}
              style={{
                padding: '6px 10px', fontSize: 13, color: T.text, cursor: 'pointer',
                borderRadius: T.radius.sm - 4,
                background: g === value ? T.bgEl : 'transparent',
              }}
            >{g}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function AvailabilityPicker({ daysPerWeek, sessionLen, onDays, onLen }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 13, color: T.muted, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Days per week
        <select
          value={daysPerWeek}
          onChange={(e) => onDays(Number(e.target.value))}
          style={{
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text,
            background: T.bgEl, border: `1px solid ${T.border}`,
            borderRadius: T.radius.sm, padding: '4px 8px', outline: 'none', cursor: 'pointer',
          }}
        >
          {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Minutes per session
        <select
          value={sessionLen}
          onChange={(e) => onLen(Number(e.target.value))}
          style={{
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text,
            background: T.bgEl, border: `1px solid ${T.border}`,
            borderRadius: T.radius.sm, padding: '4px 8px', outline: 'none', cursor: 'pointer',
          }}
        >
          {[15, 20, 30, 45, 60, 75, 90].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
