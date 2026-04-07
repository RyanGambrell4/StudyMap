export default function TodayFocus({ nextSession, onStartFocus }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]
  })()

  const whenLabel = !nextSession ? null
    : nextSession.dateStr === todayStr     ? 'Today'
    : nextSession.dateStr === tomorrowStr  ? 'Tomorrow'
    : new Date(nextSession.dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  if (!nextSession) {
    return (
      <div className="no-print flex items-center gap-4 bg-emerald-950/40 border border-emerald-800/40 rounded-2xl px-6 py-5 mb-6">
        <div className="text-2xl">🎓</div>
        <div>
          <p className="font-bold text-emerald-400 text-base">All sessions complete!</p>
          <p className="text-slate-500 text-sm mt-0.5">You've finished every scheduled session. Incredible work.</p>
        </div>
      </div>
    )
  }

  const isFinal = nextSession.sessionType === 'Final Review' || nextSession.sessionType === 'Exam Cram'

  return (
    <div className="no-print relative overflow-hidden bg-slate-800/40 border border-slate-700/60 rounded-2xl mb-6">
      {/* Color bleed */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{ background: `radial-gradient(ellipse 80% 100% at 0% 50%, ${nextSession.color.dot}, transparent)` }}
      />

      <div className="relative px-5 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Up Next · {whenLabel}</span>
            {isFinal && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                {nextSession.sessionType === 'Exam Cram' ? '🔥 Exam Cram' : '⚡ Final Review'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: nextSession.color.dot }} />
            <span className="text-white font-bold text-lg leading-tight">{nextSession.courseName}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <span>{nextSession.sessionType}</span>
            <span className="text-slate-700">·</span>
            {nextSession.startTime
              ? <span>{nextSession.startTime} – {nextSession.endTime}</span>
              : <span>{nextSession.duration} min</span>
            }
          </div>
        </div>

        <button
          onClick={() => onStartFocus(nextSession)}
          className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ backgroundColor: nextSession.color.dot, boxShadow: `0 4px 16px ${nextSession.color.dot}40` }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          Start This Session Now
        </button>
      </div>
    </div>
  )
}
