import { useMemo, useState, useEffect } from 'react'

const HOUR_HEIGHT = 56
const START_HOUR = 6
const END_HOUR = 22
const TOTAL_HOURS = END_HOUR - START_HOUR

const GCAL_BORDER = 'rgba(96,165,250,0.45)'

function theme_vars(dark) {
  return {
    gridLine:     dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.08)',
    gridLineHalf: dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)',
    gcalBg:       dark ? 'rgba(59,130,246,0.1)'    : 'rgba(59,130,246,0.12)',
    gcalText:     dark ? '#93c5fd'                  : '#1d4ed8',
    sessionAlpha: dark ? '16'                       : '30',
    emptyText:    dark ? '#374151'                  : '#9ca3af',
    subtitleText: dark ? '#64748B'                  : '#6b7280',
    timeText:     dark ? '#374151'                  : '#9ca3af',
  }
}

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
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

function nowMinutes() {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
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
  theme = 'dark',
}) {
  const tv = theme_vars(theme === 'dark')
  const [addingToGcal, setAddingToGcal] = useState(null)
  const [gcalAdded, setGcalAdded]       = useState(new Set())
  const [nowPx, setNowPx]               = useState(() =>
    ((nowMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT
  )

  useEffect(() => {
    const update = () => setNowPx(((nowMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT)
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [])

  const todayStr     = new Date().toISOString().split('T')[0]
  const isToday      = dayStr === todayStr
  const showRedLine  = isToday && nowPx >= 0 && nowPx <= TOTAL_HOURS * HOUR_HEIGHT
  const dayData      = allDaysMap[dayStr]
  const syllabusForDay = syllabusEventsByDate[dayStr] ?? []

  const googleEventsForDay = useMemo(() =>
    googleEvents.filter(e => (e.start || '').split('T')[0] === dayStr),
    [googleEvents, dayStr]
  )
  const timedGoogleBlocks = useMemo(() =>
    googleEventsForDay
      .filter(e => !e.allDay && e.start?.includes('T'))
      .map(e => {
        const parseISO = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
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
      const parseTime = (str, d) => {
        const m = str?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (!m) return null
        let h = parseInt(m[1])
        const min = parseInt(m[2])
        if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
        return `${d}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`
      }
      const startISO = parseTime(session.startTime, session.dateStr || dayStr)
      const endISO   = parseTime(session.endTime,   session.dateStr || dayStr)
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

  const dateLabel = new Date(dayStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const hasAllDay = allDayBlocks.length > 0 || allDayGoogleBlocks.length > 0

  return (
    <div className="select-none">
      {/* ── Day nav ── */}
      <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: `1px solid ${tv.gridLine}` }}>
        <button
          onClick={onPrev}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Prev
        </button>

        <div className="text-center">
          <p className={`text-sm font-medium tracking-tight ${isToday ? 'text-indigo-400' : 'text-slate-300'}`}>
            {dateLabel}
          </p>
          {isToday && <p className="text-[10px] text-indigo-500/60 mt-0.5 tracking-wide">TODAY</p>}
        </div>

        <button
          onClick={onNext}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          Next
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── All-day strip ── */}
      {hasAllDay && (
        <div className="flex mb-px" style={{ borderBottom: `1px solid ${tv.gridLine}` }}>
          <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-3">
            <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wide">All day</span>
          </div>
          <div className="flex-1 py-1 px-1 space-y-0.5 min-h-[28px]" style={{ borderLeft: `1px solid ${tv.gridLine}` }}>
            {allDayGoogleBlocks.map((ev, i) => (
              <div key={`gcal-ad-${i}`}
                className="px-2 py-0.5 rounded text-[11px] truncate"
                style={{ background: tv.gcalBg, color: tv.gcalText }}
              >
                {ev.title}
              </div>
            ))}
            {allDayBlocks.map((ev, i) => (
              <div key={ev.id ?? i}
                className="flex items-center justify-between px-2 py-0.5 rounded text-[11px]"
                style={ev.isSyllabus
                  ? { background: `${ev.color.dot}15`, color: ev.color.dot }
                  : { background: `${ev.color.dot}18`, color: '#f1f5f9' }}
              >
                <span className="truncate">{ev.isSyllabus ? ev.name : ev.courseName}</span>
                {!ev.isSyllabus && (
                  <button onClick={() => onToggle(ev.id)} className="ml-2 shrink-0">
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                      completedIds.has(ev.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-slate-400'
                    }`}>
                      {completedIds.has(ev.id) && (
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
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

      {/* ── Time grid ── */}
      <div className="flex" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
        {/* Hour labels */}
        <div className="w-12 shrink-0 relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {Array.from({ length: TOTAL_HOURS }, (_, i) => i > 0 && (
            <div
              key={i}
              className="absolute right-2 text-[10px] font-normal"
              style={{ top: i * HOUR_HEIGHT - 6, color: '#4B5563' }}
            >
              {fmtHour(START_HOUR + i)}
            </div>
          ))}
        </div>

        {/* Grid column */}
        <div className="flex-1 relative" style={{ borderLeft: `1px solid ${tv.gridLine}`, height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Hour lines */}
          {Array.from({ length: TOTAL_HOURS - 1 }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 pointer-events-none"
              style={{ top: (i + 1) * HOUR_HEIGHT, height: 1, background: tv.gridLine }} />
          ))}
          {/* Half-hour lines */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div key={`h${i}`} className="absolute left-0 right-0 pointer-events-none"
              style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2, height: 1, background: tv.gridLineHalf }} />
          ))}

          {/* Red current-time indicator */}
          {showRedLine && (
            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowPx }}>
              <div className="absolute bg-red-500 rounded-full"
                style={{ width: 8, height: 8, top: -3.5, left: -1 }} />
              <div className="w-full" style={{ height: 1.5, background: 'rgba(239,68,68,0.75)' }} />
            </div>
          )}

          {/* Study session blocks */}
          {timedBlocks.map((s, i) => {
            const topMin = s.startMin - START_HOUR * 60
            if (topMin < 0 || topMin > TOTAL_HOURS * 60) return null
            const top    = (topMin / 60) * HOUR_HEIGHT
            const height = Math.max(((s.endMin - s.startMin) / 60) * HOUR_HEIGHT, 22)
            const done   = completedIds.has(s.id)
            const added  = gcalAdded.has(s.id)
            const adding = addingToGcal === s.id
            return (
              <div key={s.id ?? i}
                className="absolute left-1 right-1 rounded overflow-hidden"
                style={{ top, height, background: `${s.color.dot}${tv.sessionAlpha}`, borderLeft: `2px solid ${s.color.dot}`, opacity: done ? 0.38 : 1 }}
              >
                <div className="flex items-start justify-between h-full px-2 py-1 gap-1">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onToggle(s.id)}>
                    <p className={`text-[11px] font-medium leading-tight truncate ${done ? 'line-through' : ''}`}
                      style={{ color: s.color.dot }}>
                      {s.courseName}
                    </p>
                    {height > 32 && (
                      <p className="text-[10px] leading-tight truncate mt-0.5" style={{ color: tv.subtitleText }}>
                        {s.sessionType}
                      </p>
                    )}
                    {height > 48 && s.startTime && (
                      <p className="text-[10px] mt-0.5" style={{ color: tv.timeText }}>
                        {s.startTime} – {s.endTime}
                      </p>
                    )}
                  </div>
                  {gcalConnected && height > 38 && (
                    <button
                      onClick={e => { e.stopPropagation(); if (!added && !adding) handleAddToGcal(s) }}
                      className="shrink-0 mt-0.5 opacity-50 hover:opacity-100 transition-opacity"
                      title={added ? 'Added to Google Calendar' : 'Add to Google Calendar'}
                    >
                      {added ? (
                        <svg className="w-3 h-3" fill="none" stroke="#34d399" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : adding ? (
                        <div className="w-3 h-3 rounded-full border border-slate-500 border-t-slate-300 animate-spin" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="#64748B" viewBox="0 0 24 24">
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
            const top    = (topMin / 60) * HOUR_HEIGHT
            const height = Math.max(((Math.max(e.endMin - e.startMin, 30)) / 60) * HOUR_HEIGHT, 22)
            return (
              <div key={`gcal-${i}`}
                className="absolute left-1 right-1 rounded overflow-hidden"
                style={{ top, height, background: tv.gcalBg, borderLeft: `2px solid ${GCAL_BORDER}` }}
              >
                <div className="px-2 py-1">
                  <p className="text-[11px] font-medium leading-tight truncate" style={{ color: tv.gcalText }}>{e.title}</p>
                  {height > 32 && <p className="text-[10px] mt-0.5" style={{ color: tv.timeText }}>Google Cal</p>}
                </div>
              </div>
            )
          })}

          {/* Empty state */}
          {timedBlocks.length === 0 && allDayBlocks.length === 0 &&
            timedGoogleBlocks.length === 0 && allDayGoogleBlocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-[12px]" style={{ color: tv.timeText }}>No sessions scheduled</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
