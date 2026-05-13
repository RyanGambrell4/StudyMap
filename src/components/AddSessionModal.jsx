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

  const inputStyle = { width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', colorScheme: 'light' }
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.12)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#1A1A1A', fontWeight: 700, fontSize: 15, margin: 0 }}>{mode === 'event' ? 'Add Event' : 'Add Session'}</h3>
            <p style={{ color: '#9B9B9B', fontSize: 12, margin: '2px 0 0' }}>{dateLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', padding: 4 }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {[['session', 'Study Session'], ['event', 'Event']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              style={{ flex: 1, padding: '7px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === m ? '#3B61C4' : 'transparent', color: mode === m ? '#fff' : '#9B9B9B', transition: 'all 0.15s' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'event' ? (
            <div>
              <label style={labelStyle}>Event name</label>
              <input type="text" value={eventTitle} onChange={e => { setEventTitle(e.target.value); setError('') }} placeholder="e.g. Doctor's appointment" style={inputStyle} />
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Course</label>
                <select value={courseIdx} onChange={e => setCourseIdx(parseInt(e.target.value))} style={inputStyle}>
                  {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Session Type</label>
                <select value={sessionType} onChange={e => setSessionType(e.target.value)} style={inputStyle}>
                  {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Duration (min)</label>
              <input type="number" value={duration} min="5" max="480" onChange={e => { setDuration(e.target.value); setError('') }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Start time (opt.)</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {error && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.08)', color: '#6B6B6B', fontWeight: 600, padding: '10px', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ flex: 1, background: '#3B61C4', border: 'none', color: '#fff', fontWeight: 700, padding: '10px', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>
            {mode === 'event' ? 'Add Event' : 'Add Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
