import { useState, useRef } from 'react'
import { T } from '../tokens'

const SANS = "'Inter', 'system-ui', sans-serif"

// ── Small UI atoms ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.dim, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function SnippetBadge({ snippet }) {
  const [open, setOpen] = useState(false)
  if (!snippet) return null
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(x => !x)}
        title="View source text"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, color: T.dim, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1 }}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', zIndex: 20, marginTop: 4,
          background: '#fff', border: `1px solid ${T.borderStrong}`, borderRadius: 8,
          padding: '8px 10px', boxShadow: T.shadow.float, maxWidth: 280, minWidth: 180,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Found in syllabus</div>
          <div style={{ fontSize: 12, color: T.text, fontStyle: 'italic', lineHeight: 1.5 }}>"{snippet.slice(0, 160)}{snippet.length > 160 ? '...' : ''}"</div>
        </div>
      )}
    </div>
  )
}

function NeedsReviewBadge() {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(217,119,6,0.1)', color: T.amber, border: `1px solid rgba(217,119,6,0.25)`, letterSpacing: '0.04em' }}>
      Confirm year
    </span>
  )
}

function WeightChip({ weight }) {
  if (weight == null) return null
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentGlow}`, flexShrink: 0 }}>
      {weight}%
    </span>
  )
}

function CheckRow({ checked, onToggle, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: checked ? '#fff' : T.bgEl, border: `1px solid ${checked ? T.borderStrong : T.border}`, transition: 'all 0.12s' }}>
      <button
        onClick={onToggle}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, cursor: 'pointer',
          border: checked ? 'none' : `1.5px solid ${T.dim}`,
          background: checked ? T.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-pressed={checked}
      >
        {checked && (
          <svg width="10" height="10" fill="none" stroke="#fff" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

// parsedData: output of /api/parse-syllabus
// existingCourse: course object if scoping to an existing course (null = creating new)
// onConfirm(result): all confirmed data, caller generates plan + commits
// onSkipPlan(result): all confirmed data, caller commits course + events only
// onClose(): dismiss

export default function SyllabusOnboardingModal({ parsedData, existingCourse, onConfirm, onSkipPlan, onClose }) {
  const p = parsedData ?? {}

  // ── Course identity ────────────────────────────────────────────────────────
  const [courseName, setCourseName] = useState(
    existingCourse?.name ?? p.course?.name ?? ''
  )
  const [term, setTerm] = useState(p.course?.term ?? '')

  // ── Exams ─────────────────────────────────────────────────────────────────
  const [exams, setExams] = useState(() =>
    (p.exams ?? []).map((e, i) => ({
      ...e,
      _id: `exam-${i}`,
      checked: e.confidence === 'high',
    }))
  )

  // ── Due dates ─────────────────────────────────────────────────────────────
  const [dueDates, setDueDates] = useState(() =>
    (p.dueDates ?? []).map((d, i) => ({
      ...d,
      _id: `due-${i}`,
      checked: d.confidence === 'high',
    }))
  )

  // ── Topics ────────────────────────────────────────────────────────────────
  const [topics, setTopics] = useState(() =>
    (p.topics ?? []).map((t, i) => ({ ...t, _id: `topic-${i}` }))
  )

  // ── Class meetings ────────────────────────────────────────────────────────
  const [meetings, setMeetings] = useState(() =>
    (p.classMeetings ?? []).map((m, i) => ({
      ...m,
      _id: `meet-${i}`,
      checked: m.confidence === 'high',
    }))
  )

  const grading = p.gradingBreakdown ?? []
  const hasAnyDates = exams.length > 0 || dueDates.length > 0
  const hasTopics = topics.length > 0
  const hasGrading = grading.length > 0
  const hasMeetings = meetings.length > 0

  // Grade Hub only accepts a component set whose weights total 100 (within 0.5).
  // We never rescale what the syllabus says to force that, so the honest move is
  // to show the running total and name the gap. The student closes it in Grade Hub.
  const gradingTotal = grading.reduce((sum, g) => sum + (Number(g.percentage) || 0), 0)
  const gradingBalanced = Math.abs(gradingTotal - 100) < 0.5
  const gradingGap = Math.round((100 - gradingTotal) * 10) / 10

  // A course that already has Grade Hub set up keeps what it has. Overwriting a
  // student's own weights with a re-parse is data loss, not a setup step.
  const gradeHubAlreadySetUp = (existingCourse?.gradeData?.components?.length ?? 0) > 0

  // ── Helpers ───────────────────────────────────────────────────────────────
  const updateExam = (id, field, value) =>
    setExams(prev => prev.map(e => e._id === id ? { ...e, [field]: value } : e))

  const updateDue = (id, field, value) =>
    setDueDates(prev => prev.map(d => d._id === id ? { ...d, [field]: value } : d))

  const removeTopic = (id) =>
    setTopics(prev => prev.filter(t => t._id !== id))

  const toggleMeeting = (id) =>
    setMeetings(prev => prev.map(m => m._id === id ? { ...m, checked: !m.checked } : m))

  // ── Build result ──────────────────────────────────────────────────────────
  const buildResult = () => ({
    courseName: courseName.trim() || (existingCourse?.name ?? ''),
    courseCode: p.course?.code ?? existingCourse?.code ?? null,
    term: term.trim() || null,
    instructor: p.instructor ?? null,
    exams: exams.filter(e => e.checked).map(({ _id, checked, ...rest }) => rest),
    dueDates: dueDates.filter(d => d.checked).map(({ _id, checked, ...rest }) => rest),
    topics: topics.map(({ _id, ...rest }) => rest),
    // Emitted in the exact shape Grade Hub reads (component, not name), so the
    // confirmed breakdown lands in course.gradeData.components. Weights are
    // passed through verbatim: never rescaled to force a sum of 100.
    gradeComponents: grading.map((g, i) => ({
      id: `gc-${i}`,
      component: String(g.category ?? '').trim() || 'Untitled',
      weight: Number(g.percentage) || 0,
      grade: null,
      graded: false,
    })),
    gradeWeightsBalanced: gradingBalanced,
    gradeHubAlreadySetUp,
    classMeetings: meetings.filter(m => m.checked).map(({ _id, checked, ...rest }) => rest),
    isPastTerm: p.isPastTerm ?? false,
  })

  const inputStyle = {
    background: T.bgEl, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: '8px 12px', fontSize: 13.5, color: T.text, outline: 'none',
    width: '100%', boxSizing: 'border-box', fontFamily: SANS,
  }

  const dateInputStyle = {
    ...inputStyle,
    width: 'auto',
    minWidth: 130,
    flexShrink: 0,
    colorScheme: 'light',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px 24px', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', overflowY: 'auto', fontFamily: SANS }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 680, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 20, boxShadow: T.shadow.modal, display: 'flex', flexDirection: 'column' }}
      >

        {/* Header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Review your syllabus</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Check what to add, then confirm.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, padding: 4, borderRadius: 6 }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Past-term warning */}
        {p.isPastTerm && (
          <div style={{ margin: '16px 24px 0', padding: '10px 14px', borderRadius: 10, background: 'rgba(217,119,6,0.08)', border: `1px solid rgba(217,119,6,0.2)`, fontSize: 13, color: '#92400E' }}>
            This looks like a past-term syllabus. All dates are flagged for your review before anything gets added.
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 28, overflowY: 'auto', maxHeight: '65vh' }}>

          {/* Course */}
          <div>
            <SectionLabel>Course</SectionLabel>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.dim, marginBottom: 4 }}>Course name</div>
                <input
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  placeholder="e.g. Introduction to Biology"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.dim, marginBottom: 4 }}>Term (optional)</div>
                <input
                  value={term}
                  onChange={e => setTerm(e.target.value)}
                  placeholder="e.g. Fall 2026"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Dates */}
          {hasAnyDates && (
            <div>
              <SectionLabel>Your dates</SectionLabel>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Only checked dates go on your schedule.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {exams.map(e => (
                  <CheckRow key={e._id} checked={e.checked} onToggle={() => updateExam(e._id, 'checked', !e.checked)}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <input
                        type="date"
                        value={e.date ?? ''}
                        onChange={ev => updateExam(e._id, 'date', ev.target.value)}
                        style={{ ...dateInputStyle, borderColor: e.yearAmbiguous ? 'rgba(217,119,6,0.5)' : T.border }}
                      />
                      <input
                        value={e.name ?? ''}
                        onChange={ev => updateExam(e._id, 'name', ev.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <WeightChip weight={e.weight} />
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(220,38,38,0.08)', color: T.pink, border: '1px solid rgba(220,38,38,0.2)', flexShrink: 0 }}>Exam</span>
                      {e.yearAmbiguous && <NeedsReviewBadge />}
                      <SnippetBadge snippet={e.sourceSnippet} />
                    </div>
                  </CheckRow>
                ))}

                {dueDates.map(d => (
                  <CheckRow key={d._id} checked={d.checked} onToggle={() => updateDue(d._id, 'checked', !d.checked)}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <input
                        type="date"
                        value={d.date ?? ''}
                        onChange={ev => updateDue(d._id, 'date', ev.target.value)}
                        style={{ ...dateInputStyle, borderColor: d.yearAmbiguous ? 'rgba(217,119,6,0.5)' : T.border }}
                      />
                      <input
                        value={d.title ?? ''}
                        onChange={ev => updateDue(d._id, 'title', ev.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <WeightChip weight={d.weight} />
                      {d.yearAmbiguous && <NeedsReviewBadge />}
                      <SnippetBadge snippet={d.sourceSnippet} />
                    </div>
                  </CheckRow>
                ))}
              </div>
            </div>
          )}

          {/* Topics */}
          {hasTopics && (
            <div>
              <SectionLabel>Topics</SectionLabel>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Remove topics that won't be covered. The rest shape your study plan.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {topics.map(t => (
                  <div
                    key={t._id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 12px', borderRadius: 999, background: T.bgEl, border: `1px solid ${T.border}`, fontSize: 13, color: T.text }}
                  >
                    {t.weekLabel && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.dim }}>{t.weekLabel}</span>
                    )}
                    {t.title}
                    <button
                      onClick={() => removeTopic(t._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, padding: '0 1px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                    >
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grading breakdown */}
          {hasGrading && (
            <div>
              <SectionLabel>How you're graded</SectionLabel>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>
                {gradeHubAlreadySetUp
                  ? 'Grade Hub is already set up for this course, so these stay as a reference and will not replace what you have.'
                  : 'These become your Grade Hub components, exactly as your syllabus lists them.'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {grading.map((g, i) => (
                  <div
                    key={i}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 8px 6px 12px', borderRadius: 999, background: T.accentSoft, border: `1px solid ${T.accentGlow}`, fontSize: 13, color: T.accent, fontWeight: 600 }}
                  >
                    {g.category} {g.percentage}%
                    <SnippetBadge snippet={g.sourceSnippet} />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: gradingBalanced ? T.muted : T.amber }}>
                  Total: {Math.round(gradingTotal * 10) / 10}% of 100%
                </span>
              </div>

              {!gradingBalanced && !gradeHubAlreadySetUp && (
                <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', fontSize: 12.5, color: '#92400E', lineHeight: 1.55 }}>
                  {gradingGap > 0
                    ? `Your syllabus accounts for ${Math.round(gradingTotal * 10) / 10}%, so ${gradingGap}% is unaccounted for. We are keeping the numbers exactly as written rather than adjusting them to reach 100. Grade Hub will ask you to close the gap before it can track your grade.`
                    : `Your syllabus adds up to ${Math.round(gradingTotal * 10) / 10}%, which is ${Math.abs(gradingGap)}% over 100. We are keeping the numbers exactly as written rather than adjusting them. Grade Hub will ask you to reconcile this before it can track your grade.`}
                </div>
              )}
            </div>
          )}

          {/* Class meetings */}
          {hasMeetings && (
            <div>
              <SectionLabel>Class times</SectionLabel>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Confirmed times are treated as unavailable when building your schedule.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {meetings.map(m => (
                  <CheckRow key={m._id} checked={m.checked} onToggle={() => toggleMeeting(m._id)}>
                    <div style={{ fontSize: 13.5, color: T.text }}>
                      {(m.days ?? []).join(', ')}
                      {(m.startTime || m.endTime) && (
                        <span style={{ color: T.muted }}> {m.startTime}{m.endTime ? `-${m.endTime}` : ''}</span>
                      )}
                      {m.location && <span style={{ color: T.dim }}> {'·'} {m.location}</span>}
                    </div>
                    <SnippetBadge snippet={m.sourceSnippet} />
                  </CheckRow>
                ))}
              </div>
            </div>
          )}

          {/* Nothing found */}
          {!hasAnyDates && !hasTopics && !hasGrading && !hasMeetings && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: T.muted, fontSize: 14 }}>
              No dates or topics found. You can still set the course name and add details manually.
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => onConfirm(buildResult())}
            disabled={!courseName.trim() && !existingCourse}
            style={{
              width: '100%', padding: '13px 20px', borderRadius: 12, border: 'none',
              background: (courseName.trim() || existingCourse) ? T.accent : T.bgEl,
              color: (courseName.trim() || existingCourse) ? '#fff' : T.dim,
              fontSize: 14.5, fontWeight: 700, cursor: (courseName.trim() || existingCourse) ? 'pointer' : 'not-allowed',
              boxShadow: (courseName.trim() || existingCourse) ? '0 4px 14px rgba(59,97,196,0.22)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            Set up my course
          </button>
          <button
            onClick={() => onSkipPlan(buildResult())}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 2, padding: '4px 0' }}
          >
            Skip the plan for now
          </button>
        </div>

      </div>
    </div>
  )
}
