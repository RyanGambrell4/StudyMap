import { useMemo } from 'react'


const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function firstDayOffset(year, month) {
  const dow = new Date(year, month - 1, 1).getDay()
  return dow === 0 ? 6 : dow - 1 // ISO: Mon=0 … Sun=6
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export default function CalendarMonthView({
  activeMonth,
  onPrevMonth,
  onNextMonth,
  allDaysMap,
  syllabusEventsByDate,
  completedIds,
  expandedDayStr,
  setExpandedDayStr,
  onDayClick,
  googleEvents = [],
}) {
  const [yearStr, monthStr] = activeMonth.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)
  const todayStr = new Date().toISOString().split('T')[0]

  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const cells = useMemo(() => {
    const arr = []
    const offset = firstDayOffset(year, month)
    for (let i = 0; i < offset; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth(year, month); d++) {
      arr.push(`${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`)
    }
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [year, month])

  const expandedDay = expandedDayStr ? allDaysMap[expandedDayStr] : null
  const expandedSyllabus = expandedDayStr ? (syllabusEventsByDate[expandedDayStr] ?? []) : []

  // Build a map of dateStr → google events for quick lookup
  const googleEventsByDate = useMemo(() => {
    const map = {}
    googleEvents.forEach(e => {
      const dateStr = (e.start || '').split('T')[0]
      if (!dateStr) return
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(e)
    })
    return map
  }, [googleEvents])

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onPrevMonth}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-white font-bold text-lg">{monthLabel}</h3>
        <button
          onClick={onNextMonth}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map(n => (
          <div key={n} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-1">
            {n}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`pad-${i}`} className="min-h-[72px]" />

          const day = allDaysMap[dateStr]
          const sessions = day?.sessions ?? []
          const syllabus = syllabusEventsByDate[dateStr] ?? []
          const gcalForDay = googleEventsByDate[dateStr] ?? []
          const allEvents = [...sessions, ...syllabus]
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr
          const isExpanded = dateStr === expandedDayStr
          const dayNum = parseInt(dateStr.split('-')[2])

          return (
            <button
              key={dateStr}
              onClick={() => setExpandedDayStr(isExpanded ? null : dateStr)}
              className={`rounded-xl p-1.5 min-h-[72px] text-left transition-all border ${
                isExpanded     ? 'border-indigo-500 bg-indigo-500/10' :
                isToday        ? 'border-indigo-500/40 bg-slate-700/60' :
                isPast         ? 'border-slate-700/20 bg-slate-800/20 opacity-60' :
                                 'border-slate-700/40 bg-slate-800/30 hover:bg-slate-800/60'
              }`}
            >
              <div className={`text-xs font-bold mb-1 ${isToday ? 'text-indigo-400' : isPast ? 'text-slate-600' : 'text-slate-300'}`}>
                {dayNum}
              </div>
              {/* Dot chips */}
              <div className="flex flex-wrap gap-0.5">
                {allEvents.slice(0, 5).map((ev, j) => (
                  <div
                    key={j}
                    className="w-2 h-2 rounded-full border"
                    style={{
                      backgroundColor: ev.isSyllabus ? 'transparent' : (ev.color?.dot ?? '#6366f1'),
                      borderColor: ev.color?.dot ?? '#6366f1',
                    }}
                  />
                ))}
                {gcalForDay.slice(0, 3).map((ev, j) => (
                  <div
                    key={`gcal-${j}`}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#475569' }}
                    title={ev.title}
                  />
                ))}
                {(allEvents.length + gcalForDay.length) > 8 && (
                  <span className="text-[9px] text-slate-500 leading-none self-end">+{allEvents.length + gcalForDay.length - 8}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Expanded day detail */}
      {expandedDayStr && (
        <div className="mt-4 bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-white font-bold">
                {new Date(expandedDayStr + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDayClick(expandedDayStr)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Day view →
              </button>
              <button onClick={() => setExpandedDayStr(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {(!expandedDay?.sessions.length && !expandedSyllabus.length && !(googleEventsByDate[expandedDayStr]?.length)) ? (
            <p className="text-slate-600 text-sm">No sessions or events scheduled.</p>
          ) : (
            <div className="space-y-2">
              {(googleEventsByDate[expandedDayStr] ?? []).map(e => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(71,85,105,0.15)', borderLeft: '3px solid #475569' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm font-medium truncate">{e.title}</p>
                    <p className="text-slate-500 text-xs">Google Calendar{e.allDay ? ' · All day' : ''}</p>
                  </div>
                </div>
              ))}
              {expandedDay?.sessions.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: `${s.color.dot}20`, borderLeft: `3px solid ${s.color.dot}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{s.courseName}</p>
                    <p className="text-slate-400 text-xs">{s.sessionType} · {s.duration}m{s.startTime ? ` · ${s.startTime}` : ''}</p>
                  </div>
                  {completedIds.has(s.id) && <span className="text-emerald-400 text-xs shrink-0">✓</span>}
                </div>
              ))}
              {expandedSyllabus.map(e => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                  style={{ borderColor: `${e.color.dot}50`, backgroundColor: `${e.color.dot}0D` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: e.color.dot }}>{e.name}</p>
                    <p className="text-slate-500 text-xs">{e.type} · {e.courseName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
