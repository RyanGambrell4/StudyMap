import { useState, useRef } from 'react'
import { clean } from '../utils/strings'

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

const EXAM_PRESETS = {
  MCAT: {
    label: 'MCAT',
    color: '#6366f1',
    desc: 'Med school entrance',
    sections: ['C/P — Chemistry & Physics', 'CARS — Critical Analysis', 'B/B — Biology & Biochemistry', 'P/S — Psychology & Sociology'],
  },
  LSAT: {
    label: 'LSAT',
    color: '#8b5cf6',
    desc: 'Law school entrance',
    sections: ['Logical Reasoning', 'Analytical Reasoning', 'Reading Comprehension'],
  },
  CPA: {
    label: 'CPA',
    color: '#14b8a6',
    desc: 'Accounting license',
    sections: ['FAR — Financial Accounting', 'AUD — Auditing & Attestation', 'REG — Tax & Regulation', 'BAR — Business Analysis'],
  },
  BAR: {
    label: 'Bar Exam',
    color: '#f97316',
    desc: 'Legal license',
    sections: ['MBE — Multistate Bar', 'MEE — Multistate Essay', 'MPT — Performance Test'],
  },
  GRE: {
    label: 'GRE',
    color: '#ec4899',
    desc: 'Grad school entrance',
    sections: ['Verbal Reasoning', 'Quantitative Reasoning', 'Analytical Writing'],
  },
  GMAT: {
    label: 'GMAT',
    color: '#eab308',
    desc: 'Business school',
    sections: ['Quantitative', 'Verbal', 'Data Insights'],
  },
}

const TARGET_SCORE_PLACEHOLDERS = {
  MCAT: 'e.g. 515 (out of 528)',
  LSAT: 'e.g. 170 (out of 180)',
  CPA: 'e.g. 85 (passing is 75)',
  BAR: 'e.g. 266 (UBE passing varies by state)',
  GRE: 'e.g. 320 (V+Q combined)',
  GMAT: 'e.g. 700 (out of 805)',
}

const emptyForm = () => ({ name: '', examDate: '', difficulty: 'Medium', targetGrade: 'B', targetScore: '', syllabusFile: null })

const inputBase = 'w-full bg-white border rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors'
const CARD = { border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }

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
      name: section,
      examDate: '',
      difficulty: 'Hard',
      targetGrade: 'Pass/Fail',
      syllabusFile: null,
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Add Your Courses</h2>
        <p className="text-slate-600">Add up to 8 courses — or pick an exam below to get started instantly</p>
      </div>

      <div className="mb-6">
        <button
          onClick={() => setExamExpanded(x => !x)}
          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${
            examExpanded || selectedExam
              ? 'bg-indigo-50 border-indigo-300'
              : 'bg-white hover:border-slate-300'
          }`}
          style={examExpanded || selectedExam ? undefined : { border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${examExpanded || selectedExam ? 'bg-indigo-100' : 'bg-slate-100'}`}>
              <svg className={`w-4 h-4 ${examExpanded || selectedExam ? 'text-indigo-600' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div className="text-left">
              <p className={`text-sm font-semibold ${examExpanded || selectedExam ? 'text-indigo-700' : 'text-slate-900'}`}>
                {selectedExam ? `${EXAM_PRESETS[selectedExam].label} sections loaded` : 'Studying for a professional exam?'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedExam ? 'Tap to switch exam or clear' : 'MCAT, LSAT, CPA, Bar, GRE, GMAT — load sections instantly'}
              </p>
            </div>
          </div>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${examExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {examExpanded && (
          <div className="mt-2 p-4 bg-white rounded-2xl" style={CARD}>
            <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Select your exam to auto-load sections</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(EXAM_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => applyExamPreset(key)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                    selectedExam === key
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${preset.color}1A` }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: preset.color }} />
                  </div>
                  <p className="text-xs font-bold text-slate-900">{preset.label}</p>
                  <p className="text-xs text-slate-500 leading-tight">{preset.desc}</p>
                </button>
              ))}
            </div>
            {selectedExam && (
              <button
                onClick={() => { setCourses([]); setSelectedExam(null); setYearLevel(null) }}
                className="mt-3 w-full text-xs text-slate-500 hover:text-red-600 transition-colors py-2"
              >
                Clear preset and start fresh
              </button>
            )}
          </div>
        )}
      </div>

      {!selectedExam && (
      <div className="bg-white rounded-2xl p-5 mb-6" style={CARD}>
        <label className="block font-semibold text-slate-900 mb-1">What year are you in?</label>
        <p className="text-sm text-slate-600 mb-4">This shapes the type of study sessions we assign you</p>
        <div className="flex flex-wrap gap-2">
          {YEAR_OPTIONS.map(y => (
            <button
              key={y}
              onClick={() => setYearLevel(y)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                yearLevel === y
                  ? 'border-transparent text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
              style={yearLevel === y ? { backgroundColor: '#3B61C4' } : undefined}
            >
              {y}
            </button>
          ))}
        </div>
        {!yearLevel && (
          <p className="text-amber-600 text-xs mt-3">Select your year to continue</p>
        )}
      </div>
      )}

      {courses.length > 0 && (
        <div className="space-y-2.5 mb-5">
          {courses.map((course, idx) => (
            <div key={idx} className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white" style={CARD}>
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: course.color.dot }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{clean(course.name)}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-500">
                    {course.examDate ? new Date(course.examDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No exam date'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                    course.difficulty === 'Hard'   ? 'bg-red-50 text-red-700 border-red-200' :
                    course.difficulty === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                     'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>{course.difficulty}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Target: {course.targetGrade}
                  </span>
                </div>
              </div>
              <button onClick={() => handleRemove(idx)} className="text-slate-400 hover:text-red-600 transition-colors p-1 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="bg-white rounded-2xl p-6 mb-5" style={CARD}>
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COURSE_COLORS[courses.length % COURSE_COLORS.length].dot }} />
            Course {courses.length + 1}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Course Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }) }}
                placeholder="e.g. Calculus II, Intro to Psychology"
                className={`${inputBase} ${errors.name ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.name && <p className="text-red-600 text-xs mt-1.5">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Exam Date <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="date"
                value={form.examDate}
                min={today}
                onChange={e => { setForm({ ...form, examDate: e.target.value }); setErrors({ ...errors, examDate: '' }) }}
                className={`${inputBase} ${errors.examDate ? 'border-red-400' : 'border-slate-200'}`}
                style={{ colorScheme: 'light' }}
              />
              {errors.examDate && <p className="text-red-600 text-xs mt-1.5">{errors.examDate}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={e => setForm({ ...form, difficulty: e.target.value })}
                  className={`${inputBase} border-slate-200`}
                  style={{ colorScheme: 'light' }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                {selectedExam ? (
                  <>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Target Score</label>
                    <input
                      type="text"
                      value={form.targetScore || ''}
                      onChange={e => setForm({ ...form, targetScore: e.target.value })}
                      placeholder={TARGET_SCORE_PLACEHOLDERS[selectedExam] || 'e.g. 90'}
                      className={`${inputBase} border-slate-200`}
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Target Grade</label>
                    <select
                      value={form.targetGrade}
                      onChange={e => setForm({ ...form, targetGrade: e.target.value })}
                      className={`${inputBase} border-slate-200`}
                      style={{ colorScheme: 'light' }}
                    >
                      <option value="A">A (90%+)</option>
                      <option value="B">B (80–89%)</option>
                      <option value="C">C (70–79%)</option>
                      <option value="Pass/Fail">Pass/Fail</option>
                    </select>
                  </>
                )}
              </div>
            </div>
          </div>

            <input ref={syllabusRef} type="file" accept=".pdf,.docx,.png,.jpg" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) setForm({ ...form, syllabusFile: e.target.files[0] }) }} />
            <div className={`mt-4 rounded-xl border overflow-hidden transition-all ${syllabusOpen ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => { setSyllabusOpen(x => !x); if (form.syllabusFile && syllabusOpen) setForm({ ...form, syllabusFile: null }) }}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${syllabusOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2v6h6M10 13h4M10 17h4"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Import syllabus</div>
                  <div className="text-xs text-slate-500 mt-0.5">Drop a PDF or paste a link: we'll extract dates, weights, and topics</div>
                </div>
                <div className={`w-8 h-5 rounded-full relative transition-all shrink-0 ${syllabusOpen ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${syllabusOpen ? 'left-3.5' : 'left-0.5'}`} style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                </div>
              </button>
              {syllabusOpen && (
                <div className="border-t border-indigo-100 px-4 pb-4 pt-3 flex flex-col gap-2">
                  <button type="button" onClick={() => syllabusRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-slate-900 text-sm font-medium hover:bg-indigo-100 transition-colors">
                    <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    {form.syllabusFile ? form.syllabusFile.name : 'Choose file (PDF, DOCX, image)'}
                  </button>
                  <p className="text-xs text-slate-500">You can also import after adding the course from the Courses page.</p>
                </div>
              )}
            </div>

          <div className="flex gap-3 mt-5">
            <button onClick={handleAdd} className="flex-1 text-white font-semibold py-3 rounded-xl transition-colors" style={{ backgroundColor: '#3B61C4' }}>
              Add Course
            </button>
            {courses.length > 0 && (
              <button onClick={() => { setAdding(false); setErrors({}); setSyllabusOpen(false) }} className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl transition-colors">
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        canAdd && (
          <button
            onClick={() => setAdding(true)}
            className="w-full border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/60 text-slate-500 hover:text-indigo-600 font-medium py-4 rounded-2xl transition-all flex items-center justify-center gap-2 mb-5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add {courses.length === 0 ? 'a Course' : 'Another Course'} {courses.length > 0 ? `(${courses.length}/8)` : ''}
          </button>
        )
      )}

      {!canAdd && !adding && (
        <p className="text-center text-sm text-slate-500 mb-5">Maximum 8 courses reached</p>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
        style={{ backgroundColor: '#3B61C4', boxShadow: canProceed ? '0 4px 16px rgba(59,97,196,0.25)' : 'none' }}
      >
        Continue to Schedule
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
      {!canProceed && (
        <p className="text-center text-sm text-slate-500 mt-2">
          {courses.length === 0 ? 'Add at least one course or select an exam preset to continue' : 'Select your year above to continue'}
        </p>
      )}
    </div>
  )
}
