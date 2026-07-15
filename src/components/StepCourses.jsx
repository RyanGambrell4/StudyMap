import { useState, useRef } from 'react'
import { clean } from '../utils/strings'

const A = '#3B61C4'
const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const BORDER = 'rgba(0,0,0,0.07)'
const CARD = { background: '#FFFFFF', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: 16 }

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

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year+']

const EXAM_PRESETS = {
  MCAT: { label: 'MCAT', color: '#6366f1', desc: 'Med school entrance', sections: ['C/P - Chemistry & Physics', 'CARS - Critical Analysis', 'B/B - Biology & Biochemistry', 'P/S - Psychology & Sociology'] },
  LSAT: { label: 'LSAT', color: '#8b5cf6', desc: 'Law school entrance', sections: ['Logical Reasoning', 'Analytical Reasoning', 'Reading Comprehension'] },
  CPA:  { label: 'CPA',  color: '#14b8a6', desc: 'Accounting license', sections: ['FAR - Financial Accounting', 'AUD - Auditing & Attestation', 'REG - Tax & Regulation', 'BAR - Business Analysis'] },
  BAR:  { label: 'Bar Exam', color: '#f97316', desc: 'Legal license', sections: ['MBE - Multistate Bar', 'MEE - Multistate Essay', 'MPT - Performance Test'] },
  GRE:  { label: 'GRE',  color: '#ec4899', desc: 'Grad school entrance', sections: ['Verbal Reasoning', 'Quantitative Reasoning', 'Analytical Writing'] },
  GMAT: { label: 'GMAT', color: '#eab308', desc: 'Business school', sections: ['Quantitative', 'Verbal', 'Data Insights'] },
}

const TARGET_SCORE_PLACEHOLDERS = {
  MCAT: 'e.g. 515 (out of 528)',
  LSAT: 'e.g. 170 (out of 180)',
  CPA:  'e.g. 85 (passing is 75)',
  BAR:  'e.g. 266 (UBE passing varies by state)',
  GRE:  'e.g. 320 (V+Q combined)',
  GMAT: 'e.g. 700 (out of 805)',
}

const emptyForm = () => ({ name: '', examDate: '', difficulty: 'Medium', targetGrade: 'B', targetScore: '', syllabusFile: null })

const inputStyle = {
  width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 10, padding: '11px 14px', fontSize: 14, color: TEXT,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

function difficultyChip(d) {
  if (d === 'Hard')   return { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }
  if (d === 'Medium') return { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }
  return { background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }
}

export default function StepCourses({ courses, setCourses, yearLevel, setYearLevel, onNext }) {
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [adding, setAdding] = useState(courses.length === 0)
  const [syllabusOpen, setSyllabusOpen] = useState(false)
  const [examExpanded, setExamExpanded] = useState(false)
  const [selectedExam, setSelectedExam] = useState(null)
  const syllabusRef = useRef(null)

  const today = new Date().toISOString().split('T')[0]

  const applyExamPreset = (examKey) => {
    const preset = EXAM_PRESETS[examKey]
    const presetCourses = preset.sections.map((section, i) => ({
      name: section, examDate: '', difficulty: 'Hard',
      targetGrade: 'Pass/Fail', syllabusFile: null,
      color: COURSE_COLORS[i % COURSE_COLORS.length],
    }))
    setCourses(presetCourses)
    setSelectedExam(examKey)
    setYearLevel('Graduate / Professional')
    setAdding(false)
    setExamExpanded(false)
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Course name is required'
    if (form.examDate && form.examDate <= today) e.examDate = 'Exam date must be in the future'
    return e
  }

  const handleAdd = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const color = COURSE_COLORS[courses.length % COURSE_COLORS.length]
    setCourses([...courses, { ...form, name: form.name.trim(), color }])
    setForm(emptyForm())
    setErrors({})
    setAdding(false)
    setSyllabusOpen(false)
  }

  const handleRemove = (idx) => {
    const updated = courses.filter((_, i) => i !== idx).map((c, i) => ({ ...c, color: COURSE_COLORS[i] }))
    setCourses(updated)
  }

  const canAdd = courses.length < 8
  const canProceed = courses.length >= 1 && (!!yearLevel || !!selectedExam)
  const examActive = examExpanded || !!selectedExam

  return (
    <div style={{ maxWidth: 672, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.5px' }}>Add Your Courses</h2>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Add up to 8 courses, or pick an exam below to get started instantly</p>
      </div>

      {/* Exam preset accordion */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setExamExpanded(x => !x)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderRadius: 16,
            background: examActive ? 'rgba(59,97,196,0.06)' : '#FFFFFF',
            border: examActive ? `1px solid rgba(59,97,196,0.25)` : `1px solid ${BORDER}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: examActive ? 'rgba(59,97,196,0.12)' : 'rgba(0,0,0,0.05)',
              color: examActive ? A : MUTED, flexShrink: 0,
            }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: examActive ? A : TEXT }}>
                {selectedExam ? `${EXAM_PRESETS[selectedExam].label} sections loaded` : 'Studying for a professional exam?'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>
                {selectedExam ? 'Tap to switch exam or clear' : 'MCAT, LSAT, CPA, Bar, GRE, GMAT: load sections instantly'}
              </p>
            </div>
          </div>
          <svg
            width="16" height="16" fill="none" stroke={DIM} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: examExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {examExpanded && (
          <div style={{ marginTop: 8, padding: 16, background: '#FFFFFF', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Select your exam to auto-load sections
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {Object.entries(EXAM_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => applyExamPreset(key)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit',
                    border: selectedExam === key ? `1.5px solid ${A}` : '1px solid rgba(0,0,0,0.10)',
                    background: selectedExam === key ? 'rgba(59,97,196,0.06)' : '#FFFFFF',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${preset.color}1A` }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: preset.color }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: TEXT }}>{preset.label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: MUTED, lineHeight: 1.3 }}>{preset.desc}</p>
                </button>
              ))}
            </div>
            {selectedExam && (
              <button
                onClick={() => { setCourses([]); setSelectedExam(null); setYearLevel(null) }}
                style={{ marginTop: 12, width: '100%', fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '8px', fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                onMouseLeave={e => e.currentTarget.style.color = MUTED}
              >
                Clear preset and start fresh
              </button>
            )}
          </div>
        )}
      </div>

      {/* Year level */}
      {!selectedExam && (
        <div style={{ ...CARD, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: TEXT }}>What year are you in?</p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: MUTED }}>This shapes the type of study sessions we assign you</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {YEAR_OPTIONS.map(y => (
              <button
                key={y}
                onClick={() => setYearLevel(y)}
                style={{
                  padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: yearLevel === y ? A : '#FFFFFF',
                  color: yearLevel === y ? '#FFFFFF' : MUTED,
                  border: yearLevel === y ? `1.5px solid ${A}` : '1px solid rgba(0,0,0,0.12)',
                }}
              >
                {y}
              </button>
            ))}
          </div>
          {!yearLevel && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#D97706' }}>Select your year to continue</p>
          )}
        </div>
      )}

      {/* Course list */}
      {courses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {courses.map((course, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', ...CARD }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: course.color.dot }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(course.name)}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: MUTED }}>
                    {course.examDate ? new Date(course.examDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No exam date'}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, ...difficultyChip(course.difficulty) }}>{course.difficulty}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: 'rgba(59,97,196,0.08)', color: A, border: '1px solid rgba(59,97,196,0.2)' }}>
                    Target: {course.targetGrade}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRemove(idx)}
                style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                onMouseLeave={e => e.currentTarget.style.color = DIM}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div style={{ ...CARD, padding: '24px', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: TEXT, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: COURSE_COLORS[courses.length % COURSE_COLORS.length].dot }} />
            Course {courses.length + 1}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Course Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }) }}
                placeholder="e.g. Calculus II, Intro to Psychology"
                style={{ ...inputStyle, borderColor: errors.name ? '#F87171' : 'rgba(0,0,0,0.12)' }}
                onFocus={e => e.target.style.borderColor = A}
                onBlur={e => e.target.style.borderColor = errors.name ? '#F87171' : 'rgba(0,0,0,0.12)'}
              />
              {errors.name && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#DC2626' }}>{errors.name}</p>}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 6 }}>
                Exam Date <span style={{ fontWeight: 400, color: DIM }}>(optional)</span>
              </label>
              <input
                type="date"
                value={form.examDate}
                min={today}
                onChange={e => { setForm({ ...form, examDate: e.target.value }); setErrors({ ...errors, examDate: '' }) }}
                style={{ ...inputStyle, borderColor: errors.examDate ? '#F87171' : 'rgba(0,0,0,0.12)', colorScheme: 'light' }}
                onFocus={e => e.target.style.borderColor = A}
                onBlur={e => e.target.style.borderColor = errors.examDate ? '#F87171' : 'rgba(0,0,0,0.12)'}
              />
              {errors.examDate && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#DC2626' }}>{errors.examDate}</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={e => setForm({ ...form, difficulty: e.target.value })}
                  style={{ ...inputStyle, colorScheme: 'light' }}
                  onFocus={e => e.target.style.borderColor = A}
                  onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                {selectedExam ? (
                  <>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Target Score</label>
                    <input
                      type="text"
                      value={form.targetScore || ''}
                      onChange={e => setForm({ ...form, targetScore: e.target.value })}
                      placeholder={TARGET_SCORE_PLACEHOLDERS[selectedExam] || 'e.g. 90'}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = A}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
                    />
                  </>
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Target Grade</label>
                    <select
                      value={form.targetGrade}
                      onChange={e => setForm({ ...form, targetGrade: e.target.value })}
                      style={{ ...inputStyle, colorScheme: 'light' }}
                      onFocus={e => e.target.style.borderColor = A}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
                    >
                      <option value="A">A (90%+)</option>
                      <option value="B">B (80-89%)</option>
                      <option value="C">C (70-79%)</option>
                      <option value="Pass/Fail">Pass/Fail</option>
                    </select>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Syllabus toggle */}
          <input ref={syllabusRef} type="file" accept=".pdf,.docx,.png,.jpg" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) setForm({ ...form, syllabusFile: e.target.files[0] }) }} />
          <div style={{
            marginTop: 16, borderRadius: 10, overflow: 'hidden',
            border: syllabusOpen ? `1px solid rgba(59,97,196,0.3)` : '1px solid rgba(0,0,0,0.10)',
          }}>
            <button
              type="button"
              onClick={() => { setSyllabusOpen(x => !x); if (form.syllabusFile && syllabusOpen) setForm({ ...form, syllabusFile: null }) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: syllabusOpen ? 'rgba(59,97,196,0.04)' : '#FAFAF9', cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: syllabusOpen ? 'rgba(59,97,196,0.12)' : 'rgba(0,0,0,0.05)',
                color: syllabusOpen ? A : MUTED,
              }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 13h4M10 17h4"/>
                </svg>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: TEXT }}>Import syllabus</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: MUTED }}>Drop a PDF: we'll extract dates, weights, and topics</p>
              </div>
              <div style={{
                width: 32, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
                background: syllabusOpen ? A : 'rgba(0,0,0,0.18)', transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  left: syllabusOpen ? 14 : 2, transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                }} />
              </div>
            </button>
            {syllabusOpen && (
              <div style={{ borderTop: '1px solid rgba(59,97,196,0.12)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: '#FAFAF9' }}>
                <button
                  type="button"
                  onClick={() => syllabusRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    borderRadius: 8, background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.2)',
                    color: TEXT, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke={A} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  {form.syllabusFile ? form.syllabusFile.name : 'Choose file (PDF, DOCX, image)'}
                </button>
                <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>You can also import after adding the course from the Courses page.</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              onClick={handleAdd}
              style={{ flex: 1, background: A, color: '#fff', border: 'none', borderRadius: 11, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Add Course
            </button>
            {courses.length > 0 && (
              <button
                onClick={() => { setAdding(false); setErrors({}); setSyllabusOpen(false) }}
                style={{ padding: '13px 20px', background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: 11, color: MUTED, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        canAdd && (
          <button
            onClick={() => setAdding(true)}
            style={{
              width: '100%', padding: '16px', borderRadius: 16, marginBottom: 20,
              border: '1.5px dashed rgba(0,0,0,0.18)', background: 'transparent',
              color: MUTED, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = A; e.currentTarget.style.color = A; e.currentTarget.style.background = 'rgba(59,97,196,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.color = MUTED; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v16m8-8H4" />
            </svg>
            Add {courses.length === 0 ? 'a Course' : 'Another Course'} {courses.length > 0 ? `(${courses.length}/8)` : ''}
          </button>
        )
      )}

      {!canAdd && !adding && (
        <p style={{ textAlign: 'center', fontSize: 13, color: MUTED, marginBottom: 20 }}>Maximum 8 courses reached</p>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        style={{
          width: '100%', background: A, color: '#fff', border: 'none', borderRadius: 12,
          padding: '16px', fontSize: 16, fontWeight: 700, cursor: canProceed ? 'pointer' : 'not-allowed',
          opacity: canProceed ? 1 : 0.35, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: canProceed ? '0 4px 16px rgba(59,97,196,0.25)' : 'none',
        }}
      >
        Continue to Schedule
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
      {!canProceed && (
        <p style={{ textAlign: 'center', fontSize: 13, color: MUTED, marginTop: 8 }}>
          {courses.length === 0 ? 'Add at least one course or select an exam preset to continue' : 'Select your year above to continue'}
        </p>
      )}
    </div>
  )
}
