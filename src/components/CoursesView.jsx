import { useState, useMemo } from 'react'
import { canAddCourse, getActivePlan, getPlanLimits } from '../lib/subscription'

const TARGET_THRESHOLDS = { A: 90, B: 80, C: 70, 'Pass/Fail': 60 }

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

const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard']
const GRADE_OPTIONS = ['A', 'B', 'C', 'Pass/Fail']
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function ClassScheduleSection({ value, onChange }) {
  const [open, setOpen] = useState(!!value)
  const blank = { isDE: false, days: [], startTime: '09:00', endTime: '10:15', semesterStart: '', semesterEnd: '' }
  const cs = value ?? blank
  const set = (key, val) => onChange({ ...cs, [key]: val })
  const toggleDay = day => set('days', cs.days.includes(day) ? cs.days.filter(d => d !== day) : [...cs.days, day])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); onChange(blank) }}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-400 transition-colors py-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        + Add class schedule (optional)
      </button>
    )
  }

  return (
    <div className="space-y-3 border-t border-slate-200 dark:border-slate-700/50 pt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Class Schedule
        </h4>
        <button type="button" onClick={() => { setOpen(false); onChange(null) }} className="text-xs text-slate-500 hover:text-red-400 transition-colors">Remove</button>
      </div>

      {/* In-Person / DE toggle */}
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Attendance type</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => set('isDE', false)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${!cs.isDE ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'}`}>
            In-Person
          </button>
          <button type="button" onClick={() => set('isDE', true)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${cs.isDE ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'}`}>
            DE / Online
          </button>
        </div>
        {cs.isDE && <p className="text-[11px] text-slate-500 mt-1.5">Classes won't appear on your calendar, but study sessions will be scheduled around them.</p>}
      </div>

      {/* Days of the week */}
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Class days</label>
        <div className="flex gap-1.5 flex-wrap">
          {WEEK_DAYS.map(d => (
            <button
              key={d} type="button" onClick={() => toggleDay(d)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                cs.days.includes(d)
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >{d}</button>
          ))}
        </div>
      </div>

      {/* Class time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Start time</label>
          <input type="time" value={cs.startTime} onChange={e => set('startTime', e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">End time</label>
          <input type="time" value={cs.endTime} onChange={e => set('endTime', e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Semester dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">First class date</label>
          <input type="date" value={cs.semesterStart} onChange={e => set('semesterStart', e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Last class date</label>
          <input type="date" value={cs.semesterEnd} onChange={e => set('semesterEnd', e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {cs.days.length > 0 && cs.startTime && cs.endTime && (
        <p className="text-[11px] text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
          {cs.days.join(', ')} · {fmt12(cs.startTime)} – {fmt12(cs.endTime)}
          {cs.isDE ? ' · DE (not shown on calendar)' : ' · shown on calendar'}
        </p>
      )}
    </div>
  )
}

function AddCourseForm({ courseCount, onAdd, onCancel }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [name, setName]         = useState('')
  const [examDate, setExamDate] = useState('')
  const [difficulty, setDifficulty] = useState('Medium')
  const [targetGrade, setTargetGrade] = useState('B')
  const [classSchedule, setClassSchedule] = useState(null)
  const [error, setError]       = useState('')

  const handleAdd = () => {
    if (!name.trim()) { setError('Enter a course name'); return }
    if (!examDate) { setError('Select an exam/finals date'); return }
    if (examDate <= todayStr) { setError('Exam date must be in the future'); return }
    const color = COURSE_COLORS[courseCount % COURSE_COLORS.length]
    const courseId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
    onAdd({ id: courseId, name: name.trim(), examDate, difficulty, targetGrade, color, classSchedule: classSchedule || undefined })
  }

  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-indigo-500/40 rounded-2xl p-5 space-y-4">
      <h3 className="text-slate-900 dark:text-white font-bold text-sm">New Course</h3>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Course name</label>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          placeholder="e.g. Calculus II, Macro Economics…"
          className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Exam / finals date</label>
        <input
          type="date"
          value={examDate}
          min={todayStr}
          onChange={e => { setExamDate(e.target.value); setError('') }}
          className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Difficulty</label>
          <div className="flex gap-2">
            {DIFFICULTY_LABELS.map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  difficulty === d
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Target grade</label>
          <div className="flex gap-2">
            {GRADE_OPTIONS.map(g => (
              <button
                key={g}
                onClick={() => setTargetGrade(g)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  targetGrade === g
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ClassScheduleSection value={classSchedule} onChange={setClassSchedule} />

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700/60 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
            Cancel
          </button>
        )}
        <button
          onClick={handleAdd}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Course
        </button>
      </div>
    </div>
  )
}

function EditCourseForm({ course, onSave, onCancel }) {
  const [name, setName]             = useState(course.name)
  const [examDate, setExamDate]     = useState(course.examDate)
  const [difficulty, setDifficulty] = useState(course.difficulty)
  const [targetGrade, setTargetGrade] = useState(course.targetGrade)
  const [color, setColor]           = useState(course.color)
  const [classSchedule, setClassSchedule] = useState(course.classSchedule ?? null)
  const [error, setError]           = useState('')

  const handleSave = () => {
    if (!name.trim()) { setError('Enter a course name'); return }
    if (!examDate) { setError('Select an exam/finals date'); return }
    onSave({ ...course, name: name.trim(), examDate, difficulty, targetGrade, color, classSchedule: classSchedule || undefined })
  }

  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-indigo-500/40 rounded-2xl p-5 space-y-4">
      <h3 className="text-slate-900 dark:text-white font-bold text-sm">Edit Course</h3>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Course name</label>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Exam / finals date</label>
        <input
          type="date"
          value={examDate}
          onChange={e => { setExamDate(e.target.value); setError('') }}
          className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Difficulty</label>
          <div className="flex gap-2">
            {DIFFICULTY_LABELS.map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  difficulty === d
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Target grade</label>
          <div className="flex gap-2">
            {GRADE_OPTIONS.map(g => (
              <button
                key={g}
                onClick={() => setTargetGrade(g)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  targetGrade === g
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Color</label>
        <div className="flex gap-2.5 flex-wrap">
          {COURSE_COLORS.map(c => (
            <button
              key={c.name}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                color.name === c.name ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.dot }}
            />
          ))}
        </div>
      </div>

      <ClassScheduleSection value={classSchedule} onChange={setClassSchedule} />

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-slate-700/60 border border-slate-600 text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  )
}

function gradeColor(score, threshold) {
  if (score >= threshold) return 'text-emerald-400'
  if (score >= threshold - 10) return 'text-amber-400'
  return 'text-red-400'
}

export default function CoursesView({
  courses,
  allSessions,
  syllabusEventsByDate,
  completedIds,
  assignments,
  onLogGrade,
  onImportSyllabus,
  onAddCourse,
  onEditCourse,
  onDeleteCourse,
  onShowPaywall,
  onOpenStudyCoach,
}) {
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingIdx, setEditingIdx] = useState(null)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState(null)

  const plan = getActivePlan()
  const { courses: courseLimit } = getPlanLimits()
  const atLimit = !canAddCourse(courses.length)
  const limitLabel = courseLimit === Infinity ? null : `${courses.length} / ${courseLimit} courses`

  const todayStr = new Date().toISOString().split('T')[0]

  const syllabusForCourse = useMemo(() => {
    const map = {}
    Object.values(syllabusEventsByDate).flat().forEach(e => {
      if (e.courseIdx !== null && e.courseIdx !== undefined) {
        if (!map[e.courseIdx]) map[e.courseIdx] = []
        map[e.courseIdx].push(e)
      }
    })
    return map
  }, [syllabusEventsByDate])

  const sessionsByCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, i) => {
      map[i] = allSessions.filter(s => s.courseId === i).sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    })
    return map
  }, [courses, allSessions])

  const gradesByCourse = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      if (!map[a.courseIdx]) map[a.courseIdx] = []
      map[a.courseIdx].push(a)
    })
    return map
  }, [assignments])

  const handleAddCourse = (course) => {
    onAddCourse?.(course)
    setShowAddForm(false)
  }

  const handleSaveEdit = (idx, updatedCourse) => {
    onEditCourse?.(idx, updatedCourse)
    setEditingIdx(null)
  }

  const handleDelete = (idx) => {
    onDeleteCourse?.(idx)
    setConfirmDeleteIdx(null)
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Courses</h1>
          {limitLabel && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              atLimit
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-slate-700/50 text-slate-400'
            }`}>
              {limitLabel}
            </span>
          )}
        </div>
        {courses.length > 0 && !showAddForm && (
          <button
            onClick={() => {
              if (atLimit) { onShowPaywall?.('courses'); return }
              setShowAddForm(true)
            }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {atLimit ? '🔒 Add Course' : 'Add Course'}
          </button>
        )}
      </div>

      {/* Add course form — always open when no courses, toggled otherwise */}
      {(courses.length === 0 || showAddForm) && (
        <div className="mb-6">
          {courses.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 mb-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-amber-300 font-bold text-sm">Courses are required to use StudyEdge</p>
                <p className="text-amber-400/70 text-xs mt-0.5">Add each course you're taking this semester. Then import your syllabi to unlock your study schedule, deadlines, and AI tools.</p>
              </div>
            </div>
          )}
          <AddCourseForm
            courseCount={courses.length}
            onAdd={handleAddCourse}
            onCancel={courses.length > 0 ? () => setShowAddForm(false) : undefined}
          />
        </div>
      )}

      <div className="space-y-3">
        {courses.map((course, idx) => {
          const expanded = expandedIdx === idx
          const isEditing = editingIdx === idx
          const confirmingDelete = confirmDeleteIdx === idx
          const sessions = sessionsByCourse[idx] ?? []
          const completed = sessions.filter(s => completedIds.has(s.id)).length
          const pct = sessions.length ? Math.round((completed / sessions.length) * 100) : 0
          const grades = gradesByCourse[idx] ?? []
          const loggedGrades = grades.filter(g => g.loggedGrade !== null)
          const threshold = TARGET_THRESHOLDS[course.targetGrade] ?? 80
          const avgGrade = loggedGrades.length
            ? Math.round(loggedGrades.reduce((s, g) => s + g.loggedGrade * g.weight, 0) / loggedGrades.reduce((s, g) => s + g.weight, 0) * 10) / 10
            : null
          const daysLeft = Math.round((new Date(course.examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000)
          const syllabusEvts = syllabusForCourse[idx] ?? []

          return (
            <div key={idx} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-4 px-5 py-4">
                <button
                  onClick={() => { if (!isEditing) setExpandedIdx(expanded ? null : idx) }}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <div className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: course.color.dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{course.name}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                      <span>{daysLeft > 0 ? `${daysLeft}d to exam` : 'Exam passed'}</span>
                      <span>·</span>
                      <span>{completed}/{sessions.length} sessions</span>
                      <span>·</span>
                      <span>Target: {course.targetGrade}</span>
                      {avgGrade !== null && (
                        <>
                          <span>·</span>
                          <span className={gradeColor(avgGrade, threshold)}>Avg: {avgGrade}%</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-semibold text-slate-400 mr-1">{pct}%</span>

                  {/* Edit button */}
                  <button
                    onClick={e => { e.stopPropagation(); setEditingIdx(isEditing ? null : idx); setConfirmDeleteIdx(null); setExpandedIdx(idx) }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                    title="Edit course"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteIdx(confirmingDelete ? null : idx); setEditingIdx(null) }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete course"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Expand chevron */}
                  <button
                    onClick={() => { if (!isEditing) setExpandedIdx(expanded ? null : idx) }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${expanded || isEditing ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Delete confirmation */}
              {confirmingDelete && (
                <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-3 flex items-center justify-between gap-4">
                  <p className="text-sm text-red-300">Delete <span className="font-semibold">{course.name}</span>? This can't be undone.</p>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmDeleteIdx(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-600 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(idx)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Edit form */}
              {isEditing && (
                <div className="border-t border-slate-200 dark:border-slate-700/50 px-5 py-4">
                  <EditCourseForm
                    course={course}
                    onSave={updated => handleSaveEdit(idx, updated)}
                    onCancel={() => setEditingIdx(null)}
                  />
                </div>
              )}

              {/* Expanded content */}
              {expanded && !isEditing && (
                <div className="border-t border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-transparent px-5 py-4 space-y-5">

                  {/* Generate Study Plan CTA */}
                  {onOpenStudyCoach && (
                    <button
                      onClick={() => onOpenStudyCoach(idx)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-indigo-500 hover:text-indigo-400 border border-indigo-500/25 hover:border-indigo-400/40 hover:bg-indigo-500/5 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Generate Study Plan →
                    </button>
                  )}

                  {/* Sessions */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Sessions</h3>
                    {sessions.length === 0 ? (
                      <p className="text-slate-600 text-sm">No sessions scheduled.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {sessions.map(s => {
                          const done = completedIds.has(s.id)
                          const isPast = s.dateStr < todayStr
                          return (
                            <div key={s.id} className={`flex items-center gap-3 text-sm ${done ? 'opacity-50' : isPast ? 'opacity-60' : ''}`}>
                              <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-0.5 ${done ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                              <span className={`flex-1 truncate ${done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>{s.sessionType}</span>
                              <span className="text-slate-500 text-xs shrink-0">
                                {new Date(s.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-slate-600 text-xs shrink-0">{s.duration}m</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Syllabus events */}
                  {syllabusEvts.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Syllabus Events</h3>
                      <div className="space-y-1.5">
                        {syllabusEvts.sort((a, b) => a.date.localeCompare(b.date)).map(e => (
                          <div key={e.id} className="flex items-center gap-3 text-sm" style={{ borderLeft: `2px solid ${e.color.dot}`, paddingLeft: '10px' }}>
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-600 dark:text-slate-300 truncate block">{e.name}</span>
                              <span className="text-slate-500 text-xs">{e.type}</span>
                            </div>
                            <span className="text-slate-500 text-xs shrink-0">
                              {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grades */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Grades</h3>
                      {grades.length > 0 && avgGrade !== null && (
                        <span className={`text-sm font-bold ${gradeColor(avgGrade, threshold)}`}>Avg: {avgGrade}%</span>
                      )}
                    </div>
                    {grades.length === 0 ? (
                      <p className="text-slate-600 text-sm">No assignments added. <span className="text-slate-500">Edit your plan to add assignments and log grades.</span></p>
                    ) : (
                      <div className="space-y-2">
                        {grades.map(g => (
                          <div key={g.id} className="flex items-center gap-3 text-sm">
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-600 dark:text-slate-300 truncate block">{g.name}</span>
                              <span className="text-slate-500 text-xs">{g.type} · {g.weight}% of grade · Due {new Date(g.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                            {g.loggedGrade !== null ? (
                              <span className={`font-bold text-sm shrink-0 ${gradeColor(g.loggedGrade, threshold)}`}>{g.loggedGrade}%</span>
                            ) : (
                              <button
                                onClick={() => onLogGrade(g.id)}
                                className="text-xs text-indigo-400 hover:text-indigo-300 shrink-0 border border-indigo-500/30 hover:border-indigo-400/60 px-2.5 py-1 rounded-lg transition-all"
                              >
                                Log grade
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Import syllabus for this course */}
                  <button
                    onClick={() => onImportSyllabus(idx)}
                    className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Import syllabus for {course.name}
                  </button>

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
