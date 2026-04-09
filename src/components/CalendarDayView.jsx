import { useMemo, useState } from 'react'

const HOUR_HEIGHT = 64
const START_HOUR = 6
const END_HOUR = 23
const TOTAL_HOURS = END_HOUR - START_HOUR

function timeToMinutes(str) {
  if (!str) return null
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12} ${ampm}`
}

export default function CalendarDayView({
  dayStr,
  allDaysMap,
  syllabusEventsByDate,
  completedIds,
  onToggle,
  onPrev,
  onNext,
  googleEvents = [],
  userId,
  gcalConnected = false,
}) {
  const [addingToGcal, setAddingToGcal] = useState(null) // sessionId being added
  const [gcalAdded, setGcalAdded] = useState(new Set())  // sessionIds already added

  const todayStr = new Date().toISOString().split('T')[0]
  const dayData = allDaysMap[dayStr]
  const syllabusForDay = syllabusEventsByDate[dayStr] ?? []

  // Google events for this day
  const googleEventsForDay = useMemo(() =>
    googleEvents.filter(e => (e.start || '').split('T')[0] === dayStr),
    [googleEvents, dayStr]
  )

  // Timed google events
  const timedGoogleBlocks = useMemo(() =>
    googleEventsForDay
      .filter(e => !e.allDay && e.start?.includes('T'))
      .map(e => {
        const parseISO = iso => {
          const d = new Date(iso)
          return d.getHours() * 60 + d.getMinutes()
        }
        return { ...e, startMin: parseISO(e.start), endMin: parseISO(e.end || e.start) + 30 }
      }),
    [googleEventsForDay]
  )

  const allDayGoogleBlocks = useMemo(() =>
    googleEventsForDay.filter(e => e.allDay || !e.start?.includes('T')),
    [googleEventsForDay]
  )

  const handleAddToGcal = async (session) => {
    if (!userId || !gcalConnected) return
    setAddingToGcal(session.id)
    try {
      // Build an ISO datetime from date + startTime ("9:00 AM")
      const parseTime = (str, dateStr) => {
        const m = str?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (!m) return null
        let h = parseInt(m[1])
        const min = parseInt(m[2])
        if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
        return `${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`
      }
      const startISO = parseTime(session.startTime, session.dateStr || dayStr)
      const endISO = parseTime(session.endTime, session.dateStr || dayStr)

      await fetch('/api/add-to-google-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: `Study: ${session.courseName}`,
          description: `${session.sessionType} · ${session.duration} min`,
          startDateTime: startISO,
          endDateTime: endISO,
          date: startISO ? undefined : (session.dateStr || dayStr),
        }),
      })
      setGcalAdded(prev => new Set([...prev, session.id]))
    } catch (e) {
      console.error('[CalendarDayView] add-to-gcal error:', e)
    } finally {
      setAddingToGcal(null)
    }
  }

  const dateLabel = new Date(dayStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const { timedBlocks, allDayBlocks } = useMemo(() => {
    const sessions = dayData?.sessions ?? []
    const timed = [], allDay = []
    sessions.forEach(s => {
      const startMin = timeToMinutes(s.startTime)
      if (startMin !== null) {
        timed.push({ ...s, startMin, endMin: timeToMinutes(s.endTime) ?? startMin + s.duration })
      } else {
        allDay.push(s)
      }
    })
    syllabusForDay.forEach(e => allDay.push({ ...e, isSyllabus: true }))
    return { timedBlocks: timed, allDayBlocks: allDay }
  }, [dayData, syllabusForDay])

  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT

  return (
    <div>
      {/* Day nav */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Prev
        </button>
        <div className="text-center">
          <p className={`font-bold text-lg ${dayStr === todayStr ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>{dateLabel}</p>
          {dayStr === todayStr && <p className="text-indigo-400/50 text-xs">Today</p>}
        </div>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm transition-colors"
        >
          Next
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* All-day / no-time events */}
      {(allDayBlocks.length > 0 || allDayGoogleBlocks.length > 0) && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">All Day</p>
          <div className="space-y-1.5">
            {allDayGoogleBlocks.map((ev, i) => (
              <div
                key={`gcal-allday-${i}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(71,85,105,0.15)', borderLeft: '3px solid #475569' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 font-medium truncate">{ev.title}</p>
                  <p className="text-slate-500 text-xs">Google Calendar · All day</p>
                </div>
              </div>
            ))}
            {allDayBlocks.map((ev, i) => (
              <div
                key={ev.id ?? i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
                style={
                  ev.isSyllabus
                    ? { border: `1px solid ${ev.color.dot}50`, backgroundColor: `${ev.color.dot}0D` }
                    : { backgroundColor: `${ev.color.dot}25`, borderLeft: `3px solid ${ev.color.dot}` }
                }
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium truncate"
                    style={{ color: ev.isSyllabus ? ev.color.dot : 'white' }}
                  >
                    {ev.isSyllabus ? ev.name : ev.courseName}
                  </p>
                  <p className="text-slate-400 text-xs">
                    {ev.isSyllabus
                      ? `${ev.type} · ${ev.courseName}`
                      : `${ev.sessionType} · ${ev.duration}m`}
                  </p>
                </div>
                {!ev.isSyllabus && (
                  <button onClick={() => onToggle(ev.id)} className="shrink-0">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      completedIds.has(ev.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 hover:border-slate-400'
                    }`}>
                      {completedIds.has(ev.id) && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex">
        {/* Hour labels */}
        <div className="w-16 shrink-0 relative select-none" style={{ height: totalHeight }}>
          {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute right-3 text-[11px] text-slate-400 dark:text-slate-600 font-medium"
              style={{ top: i * HOUR_HEIGHT - 7 }}
            >
              {fmtHour(START_HOUR + i)}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 relative border-l border-slate-300/50 dark:border-slate-700/50" style={{ height: totalHeight }}>
          {/* Hour lines */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 border-t border-slate-200/80 dark:border-slate-700/30" style={{ top: i * HOUR_HEIGHT }} />
          ))}
          {/* Half-hour lines */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div key={`h${i}`} className="absolute left-0 right-0 border-t border-slate-200/40 dark:border-slate-700/15 border-dashed" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
          ))}

          {/* Session blocks */}
          {timedBlocks.map((s, i) => {
            const topMin = s.startMin - START_HOUR * 60
            if (topMin < 0 || topMin > TOTAL_HOURS * 60) return null
            const dur = s.endMin - s.startMin
            const top = (topMin / 60) * HOUR_HEIGHT
            const height = Math.max((dur / 60) * HOUR_HEIGHT, 28)
            const done = completedIds.has(s.id)
            const addedToGcal = gcalAdded.has(s.id)
            const isAdding = addingToGcal === s.id

            return (
              <div
                key={s.id ?? i}
                className={`absolute left-1 right-1 rounded-lg px-2 py-1 text-white text-xs select-none ${done ? 'opacity-40' : ''}`}
                style={{ top, height, backgroundColor: s.color.dot }}
              >
                <div className="flex items-start justify-between gap-1 h-full">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onToggle(s.id)}>
                    <p className={`font-semibold leading-tight truncate ${done ? 'line-through' : ''}`}>{s.courseName}</p>
                    {height > 34 && <p className="text-white/75 text-[10px] leading-tight truncate">{s.sessionType}</p>}
                    {height > 50 && <p className="text-white/60 text-[10px]">{s.startTime} – {s.endTime}</p>}
                  </div>
                  {gcalConnected && height > 40 && (
                    <button
                      onClick={e => { e.stopPropagation(); if (!addedToGcal && !isAdding) handleAddToGcal(s) }}
                      className="shrink-0 mt-0.5 opacity-70 hover:opacity-100 transition-opacity"
                      title={addedToGcal ? 'Added to Google Calendar' : 'Add to Google Calendar'}
                    >
                      {addedToGcal ? (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isAdding ? (
                        <div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      ) : (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Google Calendar timed blocks */}
          {timedGoogleBlocks.map((e, i) => {
            const topMin = e.startMin - START_HOUR * 60
            if (topMin < 0 || topMin > TOTAL_HOURS * 60) return null
            const dur = Math.max(e.endMin - e.startMin, 30)
            const top = (topMin / 60) * HOUR_HEIGHT
            const height = Math.max((dur / 60) * HOUR_HEIGHT, 24)
            return (
              <div
                key={`gcal-${i}`}
                className="absolute left-1 right-1 rounded-lg px-2 py-1 text-xs select-none opacity-80"
                style={{ top, height, backgroundColor: '#1e293b', border: '1px solid #475569' }}
              >
                <p className="text-slate-300 font-medium leading-tight truncate">{e.title}</p>
                {height > 32 && <p className="text-slate-500 text-[10px]">Google Calendar</p>}
              </div>
            )
          })}

          {timedBlocks.length === 0 && allDayBlocks.length === 0 && timedGoogleBlocks.length === 0 && allDayGoogleBlocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-slate-700 text-sm">No sessions scheduled</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
