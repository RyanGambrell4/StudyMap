import { useState } from 'react'

const ASSIGNMENT_TYPES = ['Assignment', 'Quiz', 'Midterm', 'Final Exam', 'Project', 'Lab']

const emptyForm = () => ({ name: '', dueDate: '', type: 'Assignment', weight: '' })

const inputCls = 'w-full bg-slate-900/60 border rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-colors'

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
      e.weight = 'Enter a valid weight (1–100%)'
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
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Your Assignments</h2>
        <p className="text-slate-400">Track grades and get smart recovery sessions when you fall behind</p>
        <p className="text-slate-600 text-sm mt-1">Optional. You can skip and add these later.</p>
      </div>

      {/* Course tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {courses.map((course, idx) => {
          const count = getCourseAssignments(idx).length
          const isActive = activeCourse === idx
          return (
            <button
              key={idx}
              onClick={() => { setActiveCourse(idx); setAdding(false); setForm(emptyForm()); setErrors({}) }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold border transition-all ${
                isActive ? 'text-white border-transparent' : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
              style={isActive ? { backgroundColor: course.color.dot } : {}}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.7)' : course.color.dot }} />
              <span className="truncate max-w-[120px]">{course.name}</span>
              {count > 0 && <span className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-500'}`}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Weight bar */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/60 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">Grade Weight Used</span>
          <span className={`text-sm font-bold tabular-nums ${totalWeight >= 100 ? 'text-emerald-400' : totalWeight > 75 ? 'text-amber-400' : 'text-slate-300'}`}>
            {totalWeight}% / 100%
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(totalWeight, 100)}%`,
              backgroundColor: totalWeight >= 100 ? '#10B981' : courses[activeCourse]?.color.dot ?? '#6366F1',
            }}
          />
        </div>
        {totalWeight >= 100 && (
          <p className="text-emerald-400 text-xs mt-1.5 font-medium">✓ 100% of grade accounted for</p>
        )}
      </div>

      {/* Assignment list */}
      {courseAssignments.length > 0 && (
        <div className="space-y-2 mb-4">
          {courseAssignments.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100 text-sm truncate">{a.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-500">
                    Due {new Date(a.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/80 text-slate-300">{a.type}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-400 font-medium">{a.weight}%</span>
                </div>
              </div>
              <button onClick={() => handleRemove(a.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {courseAssignments.length === 0 && !adding && (
        <div className="text-center py-6 text-slate-600 text-sm mb-2">No assignments added for this course yet.</div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 p-5 mb-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Assignment Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }) }}
                placeholder="e.g. Midterm 1, Problem Set 3"
                className={`${inputCls} ${errors.name ? 'border-red-500/70' : 'border-slate-700'}`}
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => { setForm({ ...form, dueDate: e.target.value }); setErrors({ ...errors, dueDate: '' }) }}
                  className={`${inputCls} ${errors.dueDate ? 'border-red-500/70' : 'border-slate-700'}`}
                  style={{ colorScheme: 'dark' }}
                />
                {errors.dueDate && <p className="text-red-400 text-xs mt-1">{errors.dueDate}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value })}
                  className={`${inputCls} border-slate-700`}
                  style={{ colorScheme: 'dark' }}
                >
                  {ASSIGNMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Grade Weight (%)</label>
              <input
                type="number"
                value={form.weight}
                min="1"
                max="100"
                step="1"
                onChange={e => { setForm({ ...form, weight: e.target.value }); setErrors({ ...errors, weight: '' }) }}
                placeholder="e.g. 25"
                className={`${inputCls} ${errors.weight ? 'border-red-500/70' : 'border-slate-700'}`}
              />
              {errors.weight && <p className="text-red-400 text-xs mt-1">{errors.weight}</p>}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
              Add Assignment
            </button>
            <button onClick={() => { setAdding(false); setErrors({}) }} className="px-5 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : canAdd ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full border border-dashed border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-400 font-medium py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Assignment {courseAssignments.length > 0 ? `(${courseAssignments.length}/10)` : 'for this course'}
        </button>
      ) : (
        <p className="text-center text-sm text-slate-600 mb-4">
          {totalWeight >= 100 ? '100% of grade weight assigned' : 'Maximum 10 assignments per course'}
        </p>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-2">
        <button onClick={onBack} className="px-5 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-3.5 rounded-xl text-sm transition-colors">
          Back
        </button>
        <button
          onClick={onSkip}
          className="flex-1 bg-slate-700/50 hover:bg-slate-700 text-slate-400 font-medium py-3.5 rounded-xl text-sm transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          Generate Plan
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
