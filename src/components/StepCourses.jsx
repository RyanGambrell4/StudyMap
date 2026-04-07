import { useState } from 'react'

const COURSE_COLORS = [
  { name: 'blue',   bg: 'bg-blue-500',   dot: '#3B82F6' },
  { name: 'purple', bg: 'bg-purple-500', dot: '#A855F7' },
  { name: 'green',  bg: 'bg-green-500',  dot: '#22C55E' },
  { name: 'orange', bg: 'bg-orange-500', dot: '#F97316' },
  { name: 'pink',   bg: 'bg-pink-500',   dot: '#EC4899' },
  { name: 'teal',   bg: 'bg-teal-500',   dot: '#14B8A6' },
  { name: 'red',    bg: 'bg-red-500',    dot: '#EF4444' },
  { name: 'yellow', bg: 'bg-yellow-500', dot: '#EAB308' },
]

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year+']

const emptyForm = () => ({ name: '', examDate: '', difficulty: 'Medium', targetGrade: 'B' })

const inputBase = 'w-full bg-slate-800/60 border rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors'

export default function StepCourses({ courses, setCourses, yearLevel, setYearLevel, onNext }) {
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [adding, setAdding] = useState(courses.length === 0)

  const today = new Date().toISOString().split('T')[0]

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Course name is required'
    if (!form.examDate) e.examDate = 'Exam date is required'
    else if (form.examDate <= today) e.examDate = 'Exam date must be in the future'
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
  }

  const handleRemove = (idx) => {
    const updated = courses.filter((_, i) => i !== idx).map((c, i) => ({ ...c, color: COURSE_COLORS[i] }))
    setCourses(updated)
  }

  const canAdd = courses.length < 8
  const canProceed = courses.length >= 1 && !!yearLevel

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Add Your Courses</h2>
        <p className="text-slate-400">Add up to 8 courses you're studying this semester</p>
      </div>

      {/* Year level question */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 p-5 mb-6">
        <label className="block font-semibold text-slate-100 mb-1">What year are you in?</label>
        <p className="text-sm text-slate-500 mb-4">This shapes the type of study sessions we assign you</p>
        <div className="flex flex-wrap gap-2">
          {YEAR_OPTIONS.map(y => (
            <button
              key={y}
              onClick={() => setYearLevel(y)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                yearLevel === y
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        {!yearLevel && (
          <p className="text-amber-500/80 text-xs mt-3">Select your year to continue</p>
        )}
      </div>

      {/* Course cards */}
      {courses.length > 0 && (
        <div className="space-y-2.5 mb-5">
          {courses.map((course, idx) => (
            <div key={idx} className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: course.color.dot }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100 truncate">{course.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-500">
                    {new Date(course.examDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    course.difficulty === 'Hard'   ? 'bg-red-900/50 text-red-400' :
                    course.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                                                     'bg-emerald-900/50 text-emerald-400'
                  }`}>{course.difficulty}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-900/50 text-indigo-400">
                    Target: {course.targetGrade}
                  </span>
                </div>
              </div>
              <button onClick={() => handleRemove(idx)} className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 p-6 mb-5">
          <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COURSE_COLORS[courses.length % COURSE_COLORS.length].dot }} />
            Course {courses.length + 1}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Course Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }) }}
                placeholder="e.g. Calculus II, Intro to Psychology"
                className={`${inputBase} ${errors.name ? 'border-red-500/70' : 'border-slate-700'}`}
              />
              {errors.name && <p className="text-red-400 text-xs mt-1.5">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Exam Date</label>
              <input
                type="date"
                value={form.examDate}
                min={today}
                onChange={e => { setForm({ ...form, examDate: e.target.value }); setErrors({ ...errors, examDate: '' }) }}
                className={`${inputBase} ${errors.examDate ? 'border-red-500/70' : 'border-slate-700'}`}
                style={{ colorScheme: 'dark' }}
              />
              {errors.examDate && <p className="text-red-400 text-xs mt-1.5">{errors.examDate}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={e => setForm({ ...form, difficulty: e.target.value })}
                  className={`${inputBase} border-slate-700`}
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="Easy">🟢 Easy</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Hard">🔴 Hard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Target Grade</label>
                <select
                  value={form.targetGrade}
                  onChange={e => setForm({ ...form, targetGrade: e.target.value })}
                  className={`${inputBase} border-slate-700`}
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

          <div className="flex gap-3 mt-5">
            <button onClick={handleAdd} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors">
              Add Course
            </button>
            {courses.length > 0 && (
              <button onClick={() => { setAdding(false); setErrors({}) }} className="px-5 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors">
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        canAdd && (
          <button
            onClick={() => setAdding(true)}
            className="w-full border border-dashed border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-400 font-medium py-4 rounded-2xl transition-all flex items-center justify-center gap-2 mb-5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add {courses.length === 0 ? 'a Course' : 'Another Course'} {courses.length > 0 ? `(${courses.length}/8)` : ''}
          </button>
        )
      )}

      {!canAdd && !adding && (
        <p className="text-center text-sm text-slate-600 mb-5">Maximum 8 courses reached</p>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
      >
        Continue to Schedule
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
      {!canProceed && (
        <p className="text-center text-sm text-slate-600 mt-2">
          {!yearLevel ? 'Select your year above to continue' : 'Add at least one course to continue'}
        </p>
      )}
    </div>
  )
}
