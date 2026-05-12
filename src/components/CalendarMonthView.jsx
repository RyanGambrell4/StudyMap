import { useMemo } from 'react'
import { clean } from '../utils/strings'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function theme_vars(dark) {
  return {
    gridLine:     dark ? 'rgba(255,255,255,0.06)'  : 'rgba(0,0,0,0.08)',
    gcalBg:       dark ? 'rgba(59,130,246,0.1)'    : 'rgba(59,130,246,0.12)',
    gcalText:     dark ? '#93c5fd'                  : '#1d4ed8',
    sessionAlpha: dark ? '15'                       : '2e',
    gcalBorder:         'rgba(96,165,250,0.45)',
  }
}

function firstDayOffset(year, month) {
  const dow = new Date(year, month - 1, 1).getDay()
  return dow === 0 ? 6 : dow - 1
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function fmtTime(iso) {
  if (!iso || !iso.includes('T')) return null
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2,'0')} ${ampm}`
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
  onAddSession,
  googleEvents = [],
  conflictMap = new Map(),
  theme = 'dark',
}) {
  const tv = theme_vars(theme === 'dark')
  const [yearStr, monthStr] = activeMonth.split('-')
  const year  = parseInt(yearStr)
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

  const googleEventsByDate = useMemo(() => {
    const map = {}
    googleEvents.forEach(e => {
      const d = (e.start || '').split('T')[0]
      if (!d) return
      if (!map[d]) map[d] = []
      map[d].push(e)
    })
    return map
  }, [googleEvents])

  const expandedDay     = expandedDayStr ? allDaysMap[expandedDayStr] : null
  const expandedSyllabus = expandedDayStr ? (syllabusEventsByDate[expandedDayStr] ?? []) : []

  return (
    <div>
      {/* ── Month nav ── */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth}
          className="flex items-center gap-1 transition-colors text-sm px-2 py-1.5 rounded-lg"
          style={{ color: '#9B9B9B' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-sm font-medium tracking-tight" style={{ color: '#1A1A1A' }}>{monthLabel}</h3>
        <button onClick={onNextMonth}
          className="flex items-center gap-1 transition-colors text-sm px-2 py-1.5 rounded-lg"
          style={{ color: '#9B9B9B' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Weekday headers + Day grid (scrollable on mobile) ── */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: 490 }}>

      {/* Weekday headers */}
      <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${tv.gridLine}` }}>
        {DAY_NAMES.map((n, i) => (
          <div key={n}
            className="py-2 text-center text-[10px] font-medium uppercase tracking-widest"
            style={{
              color: i === 6 ? '#C0C0C0' : '#9B9B9B',
              borderRight: i < 6 ? `1px solid ${tv.gridLine}` : 'none',
            }}
          >
            {n}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7"
        style={{ borderBottom: `1px solid ${tv.gridLine}` }}
      >
        {cells.map((dateStr, i) => {
          const colIdx = i % 7
          const isLastRow = i >= cells.length - 7

          if (!dateStr) {
            return (
              <div key={`pad-${i}`}
                className="min-h-[90px]"
                style={{
                  borderRight: colIdx < 6 ? `1px solid ${tv.gridLine}` : 'none',
                  borderBottom: !isLastRow ? `1px solid ${tv.gridLine}` : 'none',
                }}
              />
            )
          }

          const day       = allDaysMap[dateStr]
          const sessions  = day?.sessions ?? []
          const syllabus  = syllabusEventsByDate[dateStr] ?? []
          const gcalDay   = googleEventsByDate[dateStr] ?? []
          const isToday   = dateStr === todayStr
          const isPast    = dateStr < todayStr
          const isExpanded = dateStr === expandedDayStr
          const dayNum    = parseInt(dateStr.split('-')[2])

          // Build event pill list: syllabus banners first, then sessions, then gcal
          const allDayItems  = syllabus.map(e => ({ type: 'syllabus', ...e }))
          const timedItems   = sessions.map(s => ({ type: 'session', ...s }))
          const gcalItems    = gcalDay.map(e => ({ type: 'gcal', ...e }))
          const pills        = [...allDayItems, ...timedItems, ...gcalItems]
          const MAX_PILLS    = 3
          const overflow     = Math.max(0, pills.length - MAX_PILLS)

          return (
            <button
              key={dateStr}
              onClick={() => setExpandedDayStr(isExpanded ? null : dateStr)}
              className="text-left transition-colors relative group"
              style={{
                minHeight: 90,
                padding: '6px 5px 6px 5px',
                borderRight: colIdx < 6 ? `1px solid ${tv.gridLine}` : 'none',
                borderBottom: !isLastRow ? `1px solid ${tv.gridLine}` : 'none',
                background: isExpanded
                  ? 'rgba(59,97,196,0.05)'
                  : isToday
                    ? 'rgba(59,97,196,0.04)'
                    : isPast
                      ? 'rgba(0,0,0,0.03)'
                      : 'transparent',
              }}
            >
              {/* Date number */}
              <div className="flex items-center justify-start mb-1.5">
                <div
                  className="w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-medium"
                  style={isToday
                    ? { background: '#3B61C4', color: 'white' }
                    : { color: isPast ? '#C0C0C0' : isExpanded ? '#3B61C4' : '#1A1A1A' }
                  }
                >
                  {dayNum}
                </div>
              </div>

              {/* Event pills */}
              <div className="space-y-0.5">
                {pills.slice(0, MAX_PILLS).map((ev, j) => {
                  if (ev.type === 'syllabus') {
                    return (
                      <div key={`s-${j}`}
                        className="flex items-center gap-1 px-1.5 rounded text-[10px] leading-none"
                        style={{ height: 18, background: `${ev.color.dot}${tv.sessionAlpha}`, color: ev.color.dot }}
                      >
                        <span className="truncate">{ev.name}</span>
                      </div>
                    )
                  }
                  if (ev.type === 'gcal') {
                    const t = fmtTime(ev.start)
                    return (
                      <div key={`g-${j}`}
                        className="flex items-center gap-1 px-1.5 rounded text-[10px] leading-none"
                        style={{ height: 18, background: tv.gcalBg, color: tv.gcalText }}
                      >
                        {t && <span className="shrink-0 opacity-70">{t}</span>}
                        <span className="truncate">{clean(ev.title)}</span>
                      </div>
                    )
                  }
                  // session
                  const done        = completedIds.has(ev.id)
                  const conflictWith = conflictMap.get(ev.id)
                  const t = ev.startTime ? ev.startTime.replace(':00', '').replace(' ', '') : null
                  return (
                    <div key={`ss-${j}`}
                      className="flex items-center gap-1 px-1.5 rounded text-[10px] leading-none"
                      title={conflictWith ? `Conflicts with ${conflictWith}. Tap to reschedule.` : undefined}
                      style={{
                        height: 18,
                        background: conflictWith ? 'rgba(245,158,11,0.12)' : `${ev.color.dot}${tv.sessionAlpha}`,
                        color: conflictWith ? '#fbbf24' : ev.color.dot,
                        border: conflictWith ? '1px solid rgba(245,158,11,0.35)' : 'none',
                        opacity: done ? 0.45 : 1,
                      }}
                    >
                      {conflictWith && (
                        <svg className="w-2 h-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      {t && !conflictWith && <span className="shrink-0 opacity-60">{t}</span>}
                      <span className={`truncate ${done ? 'line-through' : ''}`}>{ev.courseName}</span>
                    </div>
                  )
                })}
                {overflow > 0 && (
                  <p className="text-[10px] px-1" style={{ color: '#9B9B9B' }}>+{overflow} more</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
      </div>{/* end minWidth */}
      </div>{/* end overflow-x scroll */}

      {/* ── Expanded day detail ── */}
      {expandedDayStr && (
        <div className="mt-3 rounded-xl p-4"
          style={{ background: '#FFFFFF', border: `1px solid rgba(0,0,0,0.07)` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
              {new Date(expandedDayStr + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </h4>
            <div className="flex items-center gap-3">
              {onAddSession && (
                <button
                  onClick={() => onAddSession(expandedDayStr)}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-all"
                  style={{ color: '#3B61C4', border: '1px solid rgba(59,97,196,0.25)', backgroundColor: 'rgba(59,97,196,0.06)' }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Add session
                </button>
              )}
              <button
                onClick={() => onDayClick(expandedDayStr)}
                className="text-[11px] transition-colors"
                style={{ color: '#3B61C4' }}
              >
                Day view →
              </button>
              <button onClick={() => setExpandedDayStr(null)}
                className="transition-colors"
                style={{ color: '#C0C0C0' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {(!expandedDay?.sessions?.length && !expandedSyllabus.length && !(googleEventsByDate[expandedDayStr]?.length)) ? (
            <p className="text-[12px]" style={{ color: '#374151' }}>No sessions or events scheduled.</p>
          ) : (
            <div className="space-y-1.5">
              {(googleEventsByDate[expandedDayStr] ?? []).map(e => (
                <div key={e.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: tv.gcalBg, borderLeft: `2px solid ${tv.gcalBorder}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: tv.gcalText }}>{clean(e.title)}</p>
                    <p className="text-[10px] text-slate-600">Google Calendar{e.allDay ? ' · All day' : ''}</p>
                  </div>
                </div>
              ))}
              {expandedDay?.sessions?.map(s => (
                <div key={s.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: `${s.color.dot}${tv.sessionAlpha}`, borderLeft: `2px solid ${s.color.dot}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: s.color.dot }}>{s.courseName}</p>
                    <p className="text-[10px] text-slate-600">{s.sessionType} · {s.duration}m{s.startTime ? ` · ${s.startTime}` : ''}</p>
                  </div>
                  {completedIds.has(s.id) && <span className="text-emerald-500 text-[10px] shrink-0">✓</span>}
                </div>
              ))}
              {expandedSyllabus.map(e => (
                <div key={e.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: `${e.color.dot}0E`, borderLeft: `2px solid ${e.color.dot}40` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: e.color.dot }}>{e.name}</p>
                    <p className="text-[10px] text-slate-600">{e.type} · {e.courseName}</p>
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
