import { useState } from 'react'

const SESSION_TYPES = ['Custom Study', 'Review', 'Practice', 'Reading', 'Notes', 'Problem Set', 'Flashcards', 'Other']

function toAmPm(h, m) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function AddSessionModal({ dateStr, courses, onConfirm, onClose }) {
  const [mode, setMode] = useState('session') // 'session' | 'event'
  const [courseIdx, setCourseIdx] = useState(0)
  const [sessionType, setSessionType] = useState('Custom Study')
  const [eventTitle, setEventTitle] = useState('')
  const [duration, setDuration] = useState('60')
  const [startTime, setStartTime] = useState('')
  const [error, setError] = useState('')

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const handleSave = () => {
    const dur = parseInt(duration)
    if (!dur || dur < 5) { setError('Duration must be at least 5 minutes'); return }

    let stStr = null, etStr = null
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number)
      stStr = toAmPm(h, m)
      const endTotalMin = h * 60 + m + dur
      etStr = toAmPm(Math.floor(endTotalMin / 60) % 24, endTotalMin % 60)
    }

    if (mode === 'event') {
      const title = eventTitle.trim()
      if (!title) { setError('Give your event a name'); return }

      onConfirm({
        id: `event-${dateStr}-${Date.now()}`,
        dateStr,
        courseId: null,
        courseName: title,
        color: { dot: '#64748b', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)' },
        sessionType: 'Event',
        duration: dur,
        startTime: stStr,
        endTime: etStr,
        isManual: true,
        isEvent: true,
      })
      return
    }

    const course = courses[courseIdx]
    onConfirm({
      id: `manual-${dateStr}-${Date.now()}`,
      dateStr,
      courseId: courseIdx,
      courseName: course.name,
      color: course.color,
      sessionType,
      duration: dur,
      startTime: stStr,
      endTime: etStr,
      isManual: true,
    })
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-bold">{mode === 'event' ? 'Add Event' : 'Add Session'}</h3>
            <p className="text-slate-400 text-xs mt-0.5">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-slate-900/60 border border-slate-700 rounded-xl p-1 mb-4">
          <button
            onClick={() => { setMode('session'); setError('') }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'session' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Study Session
          </button>
          <button
            onClick={() => { setMode('event'); setError('') }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'event' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Event
          </button>
        </div>

        <div className="space-y-3">
          {mode === 'event' ? (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Event name</label>
              <input
                type="text"
                value={eventTitle}
                onChange={e => { setEventTitle(e.target.value); setError('') }}
                placeholder="e.g. Doctor's appointment, Dinner with friends"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Course</label>
                <select
                  value={courseIdx}
                  onChange={e => setCourseIdx(parseInt(e.target.value))}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ colorScheme: 'dark' }}
                >
                  {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Session Type</label>
                <select
                  value={sessionType}
                  onChange={e => setSessionType(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ colorScheme: 'dark' }}
                >
                  {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Duration (min)</label>
              <input
                type="number"
                value={duration}
                min="5"
                max="480"
                onChange={e => { setDuration(e.target.value); setError('') }}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Start time (opt.)</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-slate-700/70 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl text-sm transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
            {mode === 'event' ? 'Add Event' : 'Add Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
