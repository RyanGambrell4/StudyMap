import { useMemo, useState, useEffect } from 'react'

const HOUR_HEIGHT = 56
const START_HOUR  = 6
const END_HOUR    = 22
const TOTAL_HOURS = END_HOUR - START_HOUR
const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const GRID_LINE      = 'rgba(255,255,255,0.055)'
const GRID_LINE_HALF = 'rgba(255,255,255,0.025)'
const GCAL_BG        = 'rgba(59,130,246,0.1)'
const GCAL_BORDER    = 'rgba(96,165,250,0.45)'
const GCAL_TEXT      = '#93c5fd'

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

// Returns ISO dateStr for the Monday of the week containing dayStr
function getWeekMonday(dayStr) {
  const d = new Date(dayStr + 'T12:00:00')
  const dow = d.getDay() // 0=Sun
  const offset = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - offset)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export default function CalendarWeekView({
  activeDayStr,
  allDaysMap,
  syllabusEventsByDate,
  completedIds,
  onToggle,
  onAddSession,
  onPrevWeek,
  onNextWeek,
  googleEvents = [],
}) {
  const [nowPx, setNowPx] = useState(() =>
    ((nowMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT
  )
  useEffect(() => {
    const update = () => setNowPx(((nowMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT)
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [])

  const todayStr   = new Date().toISOString().split('T')[0]
  const mondayStr  = getWeekMonday(activeDayStr)
  const weekDays   = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const dateStr = addDays(mondayStr, i)
      return { dateStr, ...allDaysMap[dateStr] }
    }),
    [mondayStr, allDaysMap]
  )

  // Google events keyed by date
  const googleByDate = useMemo(() => {
    const map = {}
    googleEvents.forEach(e => {
      const d = (e.start || '').split('T')[0]
      if (!d) return
      if (!map[d]) map[d] = []
      map[d].push(e)
    })
    return map
  }, [googleEvents])

  // Week label
  const weekLabel = useMemo(() => {
    const start = new Date(mondayStr + 'T12:00:00')
    const end   = new Date(addDays(mondayStr, 6) + 'T12:00:00')
    const opts  = { month: 'short', day: 'numeric' }
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    }
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`
  }, [mondayStr])

  // Per-column: split sessions into timed vs all-day
  const columns = useMemo(() =>
    weekDays.map(day => {
      const sessions  = day?.sessions ?? []
      const syllabus  = syllabusEventsByDate[day.dateStr] ?? []
      const gcalDay   = googleByDate[day.dateStr] ?? []
      const timed = [], allDay = []

      sessions.forEach(s => {
        const startMin = timeToMinutes(s.startTime)
        startMin !== null
          ? timed.push({ ...s, _type: 'session', startMin, endMin: timeToMinutes(s.endTime) ?? startMin + s.duration })
          : allDay.push({ ...s, _type: 'session' })
      })
      syllabus.forEach(e => allDay.push({ ...e, _type: 'syllabus' }))
      gcalDay.filter(e => e.allDay || !e.start?.includes('T')).forEach(e => allDay.push({ ...e, _type: 'gcal' }))
      gcalDay.filter(e => !e.allDay && e.start?.includes('T')).forEach(e => {
        const parseISO = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
        timed.push({ ...e, _type: 'gcal', startMin: parseISO(e.start), endMin: parseISO(e.end || e.start) + 30 })
      })

      return { ...day, timed, allDay }
    }),
    [weekDays, syllabusEventsByDate, googleByDate]
  )

  const hasAnyAllDay = columns.some(c => c.allDay.length > 0)
  const todayColIdx  = columns.findIndex(c => c.dateStr === todayStr)
  const showRedLine  = todayColIdx >= 0 && nowPx >= 0 && nowPx <= TOTAL_HOURS * HOUR_HEIGHT

  return (
    <div className="flex flex-col">
      {/* ── Week nav ── */}
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: `1px solid ${GRID_LINE}` }}>
        <button onClick={onPrevWeek}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Prev week
        </button>
        <span className="text-sm font-medium text-slate-400 tracking-tight">{weekLabel}</span>
        <button onClick={onNextWeek}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          Next week
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Column headers ── */}
      <div className="flex" style={{ borderBottom: `1px solid ${GRID_LINE}` }}>
        {/* Gutter */}
        <div className="w-12 shrink-0" />
        {/* Day headers */}
        {columns.map((col, i) => {
          const isToday = col.dateStr === todayStr
          const dayNum  = col.dateStr ? parseInt(col.dateStr.split('-')[2]) : null
          return (
            <div key={i}
              className="flex-1 flex flex-col items-center py-2 group cursor-pointer"
              style={{ borderLeft: `1px solid ${GRID_LINE}` }}
              onClick={() => onAddSession && onAddSession(col.dateStr)}
            >
              <span className="text-[10px] font-medium uppercase tracking-widest mb-1"
                style={{ color: isToday ? '#818CF8' : '#4B5563' }}>
                {DAY_LABELS[i]}
              </span>
              <div className="w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-medium transition-colors"
                style={isToday
                  ? { background: '#4F46E5', color: 'white' }
                  : { color: '#6B7280' }}
              >
                {dayNum}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── All-day row ── */}
      {hasAnyAllDay && (
        <div className="flex" style={{ borderBottom: `1px solid ${GRID_LINE}` }}>
          <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
            <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: '#374151' }}>All day</span>
          </div>
          {columns.map((col, i) => (
            <div key={i}
              className="flex-1 py-0.5 px-0.5 min-h-[28px] space-y-0.5"
              style={{ borderLeft: `1px solid ${GRID_LINE}` }}
            >
              {col.allDay.map((ev, j) => {
                if (ev._type === 'gcal') return (
                  <div key={j} className="px-1.5 rounded text-[10px] truncate leading-none"
                    style={{ height: 16, lineHeight: '16px', background: GCAL_BG, color: GCAL_TEXT }}>
                    {ev.title}
                  </div>
                )
                if (ev._type === 'syllabus') return (
                  <div key={j} className="px-1.5 rounded text-[10px] truncate leading-none"
                    style={{ height: 16, lineHeight: '16px', background: `${ev.color.dot}18`, color: ev.color.dot }}>
                    {ev.name}
                  </div>
                )
                return (
                  <div key={j} className="px-1.5 rounded text-[10px] truncate leading-none"
                    style={{ height: 16, lineHeight: '16px', background: `${ev.color.dot}18`, color: ev.color.dot }}>
                    {ev.courseName}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Time grid ── */}
      <div className="flex overflow-x-auto" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
        {/* Hour labels */}
        <div className="w-12 shrink-0 relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {Array.from({ length: TOTAL_HOURS }, (_, i) => i > 0 && (
            <div key={i}
              className="absolute right-2 text-[10px]"
              style={{ top: i * HOUR_HEIGHT - 6, color: '#374151' }}
            >
              {fmtHour(START_HOUR + i)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {columns.map((col, colIdx) => (
          <div key={colIdx}
            className="flex-1 relative min-w-0"
            style={{ borderLeft: `1px solid ${GRID_LINE}`, height: TOTAL_HOURS * HOUR_HEIGHT }}
          >
            {/* Hour lines */}
            {Array.from({ length: TOTAL_HOURS - 1 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 pointer-events-none"
                style={{ top: (i + 1) * HOUR_HEIGHT, height: 1, background: GRID_LINE }} />
            ))}
            {/* Half-hour lines */}
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div key={`h${i}`} className="absolute left-0 right-0 pointer-events-none"
                style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2, height: 1, background: GRID_LINE_HALF }} />
            ))}

            {/* Red current-time line — only in today's column */}
            {showRedLine && colIdx === todayColIdx && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowPx }}>
                {colIdx === 0 && (
                  <div className="absolute bg-red-500 rounded-full"
                    style={{ width: 8, height: 8, top: -3.5, left: -1 }} />
                )}
                <div className="w-full" style={{ height: 1.5, background: 'rgba(239,68,68,0.75)' }} />
              </div>
            )}

            {/* Timed events */}
            {col.timed.map((ev, j) => {
              const topMin = ev.startMin - START_HOUR * 60
              if (topMin < 0 || topMin > TOTAL_HOURS * 60) return null
              const top    = (topMin / 60) * HOUR_HEIGHT
              const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_HEIGHT, 20)

              if (ev._type === 'gcal') {
                return (
                  <div key={`gcal-${j}`}
                    className="absolute inset-x-0.5 rounded overflow-hidden"
                    style={{ top, height, background: GCAL_BG, borderLeft: `2px solid ${GCAL_BORDER}` }}
                  >
                    <div className="px-1.5 py-0.5">
                      <p className="text-[10px] font-medium leading-tight truncate" style={{ color: GCAL_TEXT }}>{ev.title}</p>
                    </div>
                  </div>
                )
              }

              // session
              const done = completedIds.has(ev.id)
              return (
                <div key={ev.id ?? j}
                  className="absolute inset-x-0.5 rounded overflow-hidden cursor-pointer"
                  style={{ top, height, background: `${ev.color.dot}16`, borderLeft: `2px solid ${ev.color.dot}`, opacity: done ? 0.38 : 1 }}
                  onClick={() => onToggle(ev.id)}
                >
                  <div className="px-1.5 py-0.5">
                    <p className={`text-[10px] font-medium leading-tight truncate ${done ? 'line-through' : ''}`}
                      style={{ color: ev.color.dot }}>
                      {ev.courseName}
                    </p>
                    {height > 30 && (
                      <p className="text-[9px] leading-tight truncate" style={{ color: '#4B5563' }}>{ev.sessionType}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
