import { useState } from 'react'
import { clean } from '../utils/strings'

const A = '#3B61C4'
const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const BORDER = 'rgba(0,0,0,0.07)'
const CARD = { background: '#FFFFFF', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: 14 }

const ASSIGNMENT_TYPES = ['Assignment', 'Quiz', 'Midterm', 'Final Exam', 'Project', 'Lab']

const emptyForm = () => ({ name: '', dueDate: '', type: 'Assignment', weight: '' })

const inputStyle = {
  width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 10, padding: '10px 14px', fontSize: 13, color: TEXT,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function StepAssignments({ courses, assignments, setAssignments, onNext, onSkip, onBack }) {
  const [activeCourse, setActiveCourse] = useState(0)
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [adding, setAdding] = useState(false)

  const getCourseAssignments = (idx) => assignments.filter(a => a.courseIdx === idx)
  const getTotalWeight = (idx) => getCourseAssignments(idx).reduce((sum, a) => sum + a.weight, 0)

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.dueDate) e.dueDate = 'Due date is required'
    const w = parseFloat(form.weight)
    if (!form.weight || isNaN(w) || w <= 0 || w > 100) {
      e.weight = 'Enter a valid weight (1-100%)'
    } else {
      const remaining = 100 - getTotalWeight(activeCourse)
      if (w > remaining) e.weight = `Only ${remaining}% remaining for this course`
    }
    return e
  }

  const handleAdd = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setAssignments([...assignments, {
      id: `${activeCourse}-${Date.now()}`,
      courseIdx: activeCourse,
      name: form.name.trim(),
      dueDate: form.dueDate,
      type: form.type,
      weight: parseFloat(form.weight),
      loggedGrade: null,
    }])
    setForm(emptyForm())
    setErrors({})
    setAdding(false)
  }

  const handleRemove = (id) => setAssignments(assignments.filter(a => a.id !== id))

  const courseAssignments = getCourseAssignments(activeCourse)
  const totalWeight = getTotalWeight(activeCourse)
  const canAdd = courseAssignments.length < 10 && totalWeight < 100

  return (
    <div style={{ maxWidth: 672, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.5px' }}>Your Assignments</h2>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Track grades and get smart recovery sessions when you fall behind</p>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: DIM }}>Optional. You can skip and add these later.</p>
      </div>

      {/* Course tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {courses.map((course, idx) => {
          const count = getCourseAssignments(idx).length
          const isActive = activeCourse === idx
          return (
            <button
              key={idx}
              onClick={() => { setActiveCourse(idx); setAdding(false); setForm(emptyForm()); setErrors({}) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: isActive ? course.color.dot : '#FFFFFF',
                color: isActive ? '#FFFFFF' : MUTED,
                border: isActive ? 'none' : '1px solid rgba(0,0,0,0.12)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isActive ? 'rgba(255,255,255,0.7)' : course.color.dot }} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(course.name)}</span>
              {count > 0 && <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.75)' : DIM }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Weight progress bar */}
      <div style={{ ...CARD, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: MUTED }}>Grade Weight Used</span>
          <span style={{
            fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: totalWeight >= 100 ? '#16A34A' : totalWeight > 75 ? '#D97706' : TEXT,
          }}>
            {totalWeight}% / 100%
          </span>
        </div>
        <div style={{ height: 8, background: 'rgba(0,0,0,0.07)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4, transition: 'width 0.3s',
            width: `${Math.min(totalWeight, 100)}%`,
            background: totalWeight >= 100 ? '#16A34A' : courses[activeCourse]?.color.dot ?? A,
          }} />
        </div>
        {totalWeight >= 100 && (
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#16A34A', fontWeight: 600 }}>100% of grade accounted for</p>
        )}
      </div>

      {/* Assignment list */}
      {courseAssignments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {courseAssignments.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', ...CARD }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: MUTED }}>
                    Due {new Date(a.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: MUTED, fontWeight: 500 }}>{a.type}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(59,97,196,0.08)', color: A, fontWeight: 600, border: '1px solid rgba(59,97,196,0.2)' }}>{a.weight}%</span>
                </div>
              </div>
              <button
                onClick={() => handleRemove(a.id)}
                style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4, flexShrink: 0, borderRadius: 6 }}
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

      {courseAssignments.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: DIM, marginBottom: 8 }}>No assignments added for this course yet.</div>
      )}

      {/* Add form */}
      {adding ? (
        <div style={{ ...CARD, borderRadius: 16, padding: '20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Assignment Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }) }}
                placeholder="e.g. Midterm 1, Problem Set 3"
                style={{ ...inputStyle, borderColor: errors.name ? '#F87171' : 'rgba(0,0,0,0.12)' }}
                onFocus={e => e.target.style.borderColor = A}
                onBlur={e => e.target.style.borderColor = errors.name ? '#F87171' : 'rgba(0,0,0,0.12)'}
              />
              {errors.name && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#DC2626' }}>{errors.name}</p>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => { setForm({ ...form, dueDate: e.target.value }); setErrors({ ...errors, dueDate: '' }) }}
                  style={{ ...inputStyle, borderColor: errors.dueDate ? '#F87171' : 'rgba(0,0,0,0.12)', colorScheme: 'light' }}
                  onFocus={e => e.target.style.borderColor = A}
                  onBlur={e => e.target.style.borderColor = errors.dueDate ? '#F87171' : 'rgba(0,0,0,0.12)'}
                />
                {errors.dueDate && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#DC2626' }}>{errors.dueDate}</p>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value })}
                  style={{ ...inputStyle, colorScheme: 'light' }}
                  onFocus={e => e.target.style.borderColor = A}
                  onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
                >
                  {ASSIGNMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 6 }}>Grade Weight (%)</label>
              <input
                type="number"
                value={form.weight}
                min="1" max="100" step="1"
                onChange={e => { setForm({ ...form, weight: e.target.value }); setErrors({ ...errors, weight: '' }) }}
                placeholder="e.g. 25"
                style={{ ...inputStyle, borderColor: errors.weight ? '#F87171' : 'rgba(0,0,0,0.12)' }}
                onFocus={e => e.target.style.borderColor = A}
                onBlur={e => e.target.style.borderColor = errors.weight ? '#F87171' : 'rgba(0,0,0,0.12)'}
              />
              {errors.weight && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#DC2626' }}>{errors.weight}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              onClick={handleAdd}
              style={{ flex: 1, background: A, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Add Assignment
            </button>
            <button
              onClick={() => { setAdding(false); setErrors({}) }}
              style={{ padding: '11px 18px', background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: 10, color: MUTED, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : canAdd ? (
        <button
          onClick={() => setAdding(true)}
          style={{
            width: '100%', padding: '14px', borderRadius: 16, marginBottom: 16,
            border: '1.5px dashed rgba(0,0,0,0.18)', background: 'transparent',
            color: MUTED, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = A; e.currentTarget.style.color = A; e.currentTarget.style.background = 'rgba(59,97,196,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.color = MUTED; e.currentTarget.style.background = 'transparent' }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v16m8-8H4" />
          </svg>
          Add Assignment {courseAssignments.length > 0 ? `(${courseAssignments.length}/10)` : 'for this course'}
        </button>
      ) : (
        <p style={{ textAlign: 'center', fontSize: 13, color: DIM, marginBottom: 16 }}>
          {totalWeight >= 100 ? '100% of grade weight assigned' : 'Maximum 10 assignments per course'}
        </p>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{ padding: '14px 18px', background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 12, color: MUTED, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Back
        </button>
        <button
          onClick={onSkip}
          style={{ flex: 1, background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: 12, color: MUTED, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '14px' }}
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          style={{
            flex: 1, background: A, color: '#fff', border: 'none', borderRadius: 12,
            padding: '14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(59,97,196,0.25)',
          }}
        >
          Generate Plan
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
