export default function StudyNowCard({ nextSession, completedIds, onStartFocus }) {
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
  const isToday = nextSession.dateStr === new Date().toISOString().split('T')[0]
  const isTomorrow = (() => {
    const t = new Date(); t.setDate(t.getDate() + 1)
    return nextSession.dateStr === t.toISOString().split('T')[0]
  })()

  const whenLabel = isToday ? 'Scheduled today'
    : isTomorrow ? 'Scheduled tomorrow'
    : `Scheduled ${new Date(nextSession.dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`

  return (
    <div className="no-print relative overflow-hidden bg-slate-800/50 border border-slate-700/60 rounded-2xl px-6 py-5 mb-6">
      {/* Subtle color bleed */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{ background: `radial-gradient(ellipse 80% 100% at 0% 50%, ${nextSession.color.dot}, transparent)` }}
      />

      <div className="relative flex items-center gap-5 flex-wrap">
        {/* Left: info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
              {isFinal ? '⚡ Priority Session' : '📚 Ready to get ahead?'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: nextSession.color.dot }} />
            <h3 className="text-white font-bold text-lg leading-tight">{nextSession.courseName}</h3>
            {isFinal && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                {nextSession.sessionType === 'Exam Cram' ? '🔥 Exam Cram' : '⚡ Final Review'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-sm text-slate-400">{nextSession.sessionType}</span>
            <span className="text-slate-700">·</span>
            {nextSession.startTime ? (
              <span className="text-sm text-slate-400">{nextSession.startTime} – {nextSession.endTime}</span>
            ) : (
              <span className="text-sm text-slate-400">{nextSession.duration} min</span>
            )}
            <span className="text-slate-700">·</span>
            <span className="text-sm text-slate-500">{whenLabel}</span>
          </div>
        </div>

        {/* Right: CTA */}
        <button
          onClick={() => onStartFocus(nextSession)}
          className="shrink-0 flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            backgroundColor: nextSession.color.dot,
            boxShadow: `0 4px 20px ${nextSession.color.dot}50`,
          }}
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
