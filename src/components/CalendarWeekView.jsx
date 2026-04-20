import { useMemo, useState, useEffect, useRef } from 'react'
import { clean } from '../utils/strings'

const HOUR_HEIGHT = 56
const START_HOUR  = 6
const END_HOUR    = 22
const TOTAL_HOURS = END_HOUR - START_HOUR
const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const GCAL_BORDER = 'rgba(96,165,250,0.45)'

function theme_vars(dark) {
  return {
    gridLine:     dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.08)',
    gridLineHalf: dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)',
    gcalBg:       dark ? 'rgba(59,130,246,0.1)'    : 'rgba(59,130,246,0.12)',
    gcalText:     dark ? '#93c5fd'                  : '#1d4ed8',
    sessionAlpha: dark ? '16'                       : '30',
    subtitleText: dark ? '#4B5563'                  : '#6b7280',
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

function minutesToTimeStr(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function snap15(min) {
  return Math.round(min / 15) * 15
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

function getWeekMonday(dayStr) {
  const d = new Date(dayStr + 'T12:00:00')
  const dow = d.getDay()
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
  classBlocksByDate = {},
  completedIds,
  onToggle,
  onAddSession,
  onPrevWeek,
  onNextWeek,
  googleEvents = [],
  conflictMap = new Map(),
  onSessionMove,
  theme = 'dark',
}) {
  const tv = theme_vars(theme === 'dark')

  const [nowPx, setNowPx] = useState(() =>
    ((nowMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT
  )
  useEffect(() => {
    const update = () => setNowPx(((nowMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT)
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [])

  // ── Drag state ──────────────────────────────────────────────────────────────
  const dragRef     = useRef(null)   // mutable drag info — no re-renders
  const colDivRefs  = useRef([])     // DOM refs for each day column
  const columnsRef  = useRef([])     // mirrors `columns` for use in effect
  const [ghost, setGhost] = useState(null)
  // ghost: { colIdx, startMin, endMin, color, courseName, sessionId }

  const todayStr  = new Date().toISOString().split('T')[0]
  const mondayStr = getWeekMonday(activeDayStr)

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const dateStr = addDays(mondayStr, i)
      return { dateStr, ...allDaysMap[dateStr] }
    }),
    [mondayStr, allDaysMap]
  )

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

  const weekLabel = useMemo(() => {
    const start = new Date(mondayStr + 'T12:00:00')
    const end   = new Date(addDays(mondayStr, 6) + 'T12:00:00')
    const opts  = { month: 'short', day: 'numeric' }
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    }
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`
  }, [mondayStr])

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
      ;(classBlocksByDate[day.dateStr] ?? []).forEach(e => {
        const startMin = timeToMinutes(e.startTime)
        if (startMin !== null) {
          timed.push({ ...e, startMin, endMin: timeToMinutes(e.endTime) ?? startMin + 60 })
        }
      })

      return { ...day, timed, allDay }
    }),
    [weekDays, syllabusEventsByDate, googleByDate, classBlocksByDate]
  )

  // Keep columnsRef in sync
  useEffect(() => { columnsRef.current = columns }, [columns])

  const hasAnyAllDay = columns.some(c => c.allDay.length > 0)
  const todayColIdx  = columns.findIndex(c => c.dateStr === todayStr)
  const showRedLine  = todayColIdx >= 0 && nowPx >= 0 && nowPx <= TOTAL_HOURS * HOUR_HEIGHT

  // ── Drag handlers ───────────────────────────────────────────────────────────

  function handleSessionPointerDown(e, ev, colIdx) {
    if (ev._type !== 'session') return
    e.preventDefault()
    e.stopPropagation()

    const colEl = colDivRefs.current[colIdx]
    const rect  = colEl?.getBoundingClientRect()
    if (!rect) return

    const mouseY       = e.clientY - rect.top
    const blockTopPx   = ((ev.startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT
    const duration     = ev.endMin - ev.startMin
    const mouseOffsetMin = Math.max(0, Math.min(
      ((mouseY - blockTopPx) / HOUR_HEIGHT) * 60,
      duration
    ))

    dragRef.current = {
      type: 'move',
      sessionId: ev.id,
      duration,
      mouseOffsetMin,
      didMove: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      currentGhost: { colIdx, startMin: ev.startMin, endMin: ev.endMin },
    }

    setGhost({
      colIdx,
      startMin:  ev.startMin,
      endMin:    ev.endMin,
      color:     ev.color,
      courseName: ev.courseName,
      sessionId: ev.id,
    })

    document.body.style.userSelect = 'none'
  }

  function handleResizePointerDown(e, ev, colIdx) {
    e.preventDefault()
    e.stopPropagation()

    dragRef.current = {
      type: 'resize',
      sessionId: ev.id,
      origStartMin: ev.startMin,
      colIdx,
      didMove: false,
      startClientY: e.clientY,
      currentGhost: { colIdx, startMin: ev.startMin, endMin: ev.endMin },
    }

    setGhost({
      colIdx,
      startMin:  ev.startMin,
      endMin:    ev.endMin,
      color:     ev.color,
      courseName: ev.courseName,
      sessionId: ev.id,
    })

    document.body.style.cursor    = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      const drag = dragRef.current

      const dx = e.clientX - drag.startClientX
      const dy = e.clientY - drag.startClientY
      if (!drag.didMove && Math.sqrt(dx * dx + dy * dy) > 4) {
        drag.didMove = true
        if (drag.type === 'move') document.body.style.cursor = 'grabbing'
      }
      if (!drag.didMove) return

      if (drag.type === 'move') {
        // Determine hovered column from clientX
        let targetCol = null
        for (let i = 0; i < colDivRefs.current.length; i++) {
          const el = colDivRefs.current[i]
          if (!el) continue
          const r = el.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right) { targetCol = i; break }
        }
        if (targetCol === null) {
          const first = colDivRefs.current[0]?.getBoundingClientRect()
          const last  = colDivRefs.current[colDivRefs.current.length - 1]?.getBoundingClientRect()
          targetCol = (first && e.clientX < first.left) ? 0 : (last ? colDivRefs.current.length - 1 : 0)
        }

        const colEl = colDivRefs.current[targetCol]
        if (!colEl) return
        const rect     = colEl.getBoundingClientRect()
        const mouseY   = e.clientY - rect.top
        const rawStart = (mouseY / HOUR_HEIGHT) * 60 + START_HOUR * 60 - drag.mouseOffsetMin
        const newStart = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - drag.duration, snap15(rawStart)))
        const newEnd   = newStart + drag.duration

        drag.currentGhost = { colIdx: targetCol, startMin: newStart, endMin: newEnd }
        setGhost(prev => prev ? { ...prev, colIdx: targetCol, startMin: newStart, endMin: newEnd } : null)

      } else if (drag.type === 'resize') {
        const colEl = colDivRefs.current[drag.colIdx]
        if (!colEl) return
        const rect   = colEl.getBoundingClientRect()
        const mouseY = e.clientY - rect.top
        const rawEnd = (mouseY / HOUR_HEIGHT) * 60 + START_HOUR * 60
        const newEnd = Math.max(drag.origStartMin + 15, Math.min(END_HOUR * 60, snap15(rawEnd)))

        drag.currentGhost = { colIdx: drag.colIdx, startMin: drag.origStartMin, endMin: newEnd }
        setGhost(prev => prev ? { ...prev, startMin: drag.origStartMin, endMin: newEnd } : null)
      }
    }

    const onUp = (e) => {
      if (!dragRef.current) return
      const drag = dragRef.current

      if (drag.didMove && onSessionMove) {
        const g       = drag.currentGhost
        const newDate = columnsRef.current[g.colIdx]?.dateStr
        if (newDate) {
          onSessionMove(drag.sessionId, newDate, minutesToTimeStr(g.startMin), minutesToTimeStr(g.endMin))
        }
      } else if (!drag.didMove && onToggle) {
        onToggle(drag.sessionId)
      }

      dragRef.current = null
      setGhost(null)
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [onSessionMove, onToggle])

  return (
    <div className="flex flex-col">
      {/* ── Week nav ── */}
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: `1px solid ${tv.gridLine}` }}>
        <button onClick={onPrevWeek}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Prev week
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-400 tracking-tight">{weekLabel}</span>
          {onAddSession && (
            <button
              onClick={() => onAddSession(activeDayStr)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/50 hover:bg-indigo-500/10 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add session
            </button>
          )}
        </div>
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
      <div className="flex" style={{ borderBottom: `1px solid ${tv.gridLine}` }}>
        <div className="w-12 shrink-0" />
        {columns.map((col, i) => {
          const isToday = col.dateStr === todayStr
          const dayNum  = col.dateStr ? parseInt(col.dateStr.split('-')[2]) : null
          return (
            <div key={i}
              className="flex-1 flex flex-col items-center py-2 group cursor-pointer"
              style={{ borderLeft: `1px solid ${tv.gridLine}` }}
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
        <div className="flex" style={{ borderBottom: `1px solid ${tv.gridLine}` }}>
          <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
            <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: '#374151' }}>All day</span>
          </div>
          {columns.map((col, i) => (
            <div key={i}
              className="flex-1 py-0.5 px-0.5 min-h-[28px] space-y-0.5"
              style={{ borderLeft: `1px solid ${tv.gridLine}` }}
            >
              {col.allDay.map((ev, j) => {
                if (ev._type === 'gcal') return (
                  <div key={j} className="px-1.5 rounded text-[10px] truncate leading-none"
                    style={{ height: 16, lineHeight: '16px', background: tv.gcalBg, color: tv.gcalText }}>
                    {clean(ev.title)}
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
          <div
            key={colIdx}
            ref={el => colDivRefs.current[colIdx] = el}
            className="flex-1 relative min-w-0"
            style={{ borderLeft: `1px solid ${tv.gridLine}`, height: TOTAL_HOURS * HOUR_HEIGHT, cursor: 'default' }}
            onClick={e => {
              if (e.target !== e.currentTarget) return
              onAddSession?.(col.dateStr)
            }}
          >
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

            {/* Red current-time line */}
            {showRedLine && colIdx === todayColIdx && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowPx }}>
                {colIdx === 0 && (
                  <div className="absolute bg-red-500 rounded-full"
                    style={{ width: 8, height: 8, top: -3.5, left: -1 }} />
                )}
                <div className="w-full" style={{ height: 1.5, background: 'rgba(239,68,68,0.75)' }} />
              </div>
            )}

            {/* Ghost block (drag preview) */}
            {ghost && ghost.colIdx === colIdx && (() => {
              const topMin = ghost.startMin - START_HOUR * 60
              if (topMin < 0 || topMin > TOTAL_HOURS * 60) return null
              const top    = (topMin / 60) * HOUR_HEIGHT
              const height = Math.max(((ghost.endMin - ghost.startMin) / 60) * HOUR_HEIGHT, 20)
              return (
                <div className="absolute inset-x-0.5 rounded overflow-hidden pointer-events-none z-30"
                  style={{
                    top,
                    height,
                    background: `${ghost.color.dot}28`,
                    border: `1.5px dashed ${ghost.color.dot}`,
                    boxShadow: `0 4px 16px ${ghost.color.dot}30`,
                  }}
                >
                  <div className="px-1.5 py-0.5">
                    <p className="text-[10px] font-medium leading-tight truncate" style={{ color: ghost.color.dot }}>
                      {ghost.courseName}
                    </p>
                    {height > 28 && (
                      <p className="text-[9px] leading-tight opacity-70" style={{ color: ghost.color.dot }}>
                        {minutesToTimeStr(ghost.startMin)} – {minutesToTimeStr(ghost.endMin)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Timed events */}
            {col.timed.map((ev, j) => {
              const topMin = ev.startMin - START_HOUR * 60
              if (topMin < 0 || topMin > TOTAL_HOURS * 60) return null
              const top    = (topMin / 60) * HOUR_HEIGHT
              const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_HEIGHT, 20)

              if (ev._type === 'class') {
                return (
                  <div key={ev.id}
                    className="absolute inset-x-0.5 rounded overflow-hidden pointer-events-none z-10"
                    style={{
                      top, height,
                      background: `${ev.color.dot}14`,
                      borderLeft: `2px solid ${ev.color.dot}`,
                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${ev.color.dot}12 4px, ${ev.color.dot}12 8px)`,
                    }}
                  >
                    <div className="px-1.5 py-0.5">
                      <p className="text-[9px] font-bold leading-tight truncate uppercase tracking-wider" style={{ color: ev.color.dot, opacity: 0.85 }}>CLASS</p>
                      {height > 28 && <p className="text-[9px] leading-tight truncate" style={{ color: ev.color.dot, opacity: 0.6 }}>{ev.courseName}</p>}
                    </div>
                  </div>
                )
              }

              if (ev._type === 'gcal') {
                return (
                  <div key={`gcal-${j}`}
                    className="absolute inset-x-0.5 rounded overflow-hidden"
                    style={{ top, height, background: tv.gcalBg, borderLeft: `2px solid ${GCAL_BORDER}` }}
                  >
                    <div className="px-1.5 py-0.5">
                      <p className="text-[10px] font-medium leading-tight truncate" style={{ color: tv.gcalText }}>{clean(ev.title)}</p>
                    </div>
                  </div>
                )
              }

              // session
              const done         = completedIds.has(ev.id)
              const conflictWith = conflictMap.get(ev.id)
              const isDragging   = ghost?.sessionId === ev.id

              return (
                <div key={ev.id ?? j}
                  className="absolute inset-x-0.5 rounded overflow-hidden select-none"
                  style={{
                    top,
                    height,
                    background: `${ev.color.dot}${tv.sessionAlpha}`,
                    borderLeft: `2px solid ${conflictWith ? '#f59e0b' : ev.color.dot}`,
                    opacity: isDragging ? 0.25 : done ? 0.38 : 1,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                  }}
                  onPointerDown={e => handleSessionPointerDown(e, ev, colIdx)}
                  title={conflictWith ? `Conflicts with ${conflictWith}. Drag to reschedule.` : undefined}
                >
                  <div className="px-1.5 py-0.5">
                    <div className="flex items-center gap-0.5">
                      {conflictWith && (
                        <svg className="w-2 h-2 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      <p className={`text-[10px] font-medium leading-tight truncate ${done ? 'line-through' : ''}`}
                        style={{ color: conflictWith ? '#fbbf24' : ev.color.dot }}>
                        {ev.courseName}
                      </p>
                    </div>
                    {height > 30 && (
                      <p className="text-[9px] leading-tight truncate" style={{ color: tv.subtitleText }}>{ev.sessionType}</p>
                    )}
                  </div>

                  {/* Resize handle */}
                  {!isDragging && (
                    <div
                      className="absolute bottom-0 left-0 right-0 flex items-center justify-center"
                      style={{ height: 10, cursor: 'ns-resize' }}
                      onPointerDown={e => handleResizePointerDown(e, ev, colIdx)}
                    >
                      <div style={{ width: 20, height: 2, borderRadius: 1, background: ev.color.dot, opacity: 0.35 }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
