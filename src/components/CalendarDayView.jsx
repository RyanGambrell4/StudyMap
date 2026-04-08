import { useMemo } from 'react'

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
}) {
  const todayStr = new Date().toISOString().split('T')[0]
  const dayData = allDaysMap[dayStr]
  const syllabusForDay = syllabusEventsByDate[dayStr] ?? []

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
      {allDayBlocks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">All Day</p>
          <div className="space-y-1.5">
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

            return (
              <div
                key={s.id ?? i}
                onClick={() => onToggle(s.id)}
                className={`absolute left-1 right-1 rounded-lg px-2 py-1 text-white text-xs cursor-pointer transition-opacity select-none ${done ? 'opacity-40' : 'hover:opacity-90'}`}
                style={{ top, height, backgroundColor: s.color.dot }}
              >
                <p className={`font-semibold leading-tight truncate ${done ? 'line-through' : ''}`}>{s.courseName}</p>
                {height > 34 && <p className="text-white/75 text-[10px] leading-tight truncate">{s.sessionType}</p>}
                {height > 50 && <p className="text-white/60 text-[10px]">{s.startTime} – {s.endTime}</p>}
              </div>
            )
          })}

          {timedBlocks.length === 0 && allDayBlocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-slate-700 text-sm">No sessions scheduled</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
