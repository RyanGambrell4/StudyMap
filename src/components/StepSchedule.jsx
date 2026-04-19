const TIME_OPTIONS = ['Morning', 'Afternoon', 'Evening']

const TIME_ICONS = {
  Morning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  ),
  Afternoon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  ),
  Evening: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
}

export default function StepSchedule({ schedule, setSchedule, courses, onNext, onBack }) {
  const { hoursPerWeek, preferredTime } = schedule
  const pct = ((hoursPerWeek - 5) / 35) * 100

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Your Study Schedule</h2>
        <p className="text-slate-400">Help us understand how you want to study</p>
      </div>

      {/* Hours slider */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 p-6 mb-4">
        <label className="block font-semibold text-slate-100 mb-1">
          How many hours per week can you realistically study?
        </label>
        <p className="text-sm text-slate-500 mb-6">Be honest. Consistent shorter sessions beat burnout.</p>

        <div className="flex items-center gap-4 mb-5">
          <span className="text-sm text-slate-500 w-6 text-right shrink-0">5h</span>
          <input
            type="range"
            min={5}
            max={40}
            step={1}
            value={hoursPerWeek}
            onChange={e => setSchedule({ ...schedule, hoursPerWeek: Number(e.target.value) })}
            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500"
            style={{
              background: `linear-gradient(to right, #6366F1 0%, #6366F1 ${pct}%, #334155 ${pct}%, #334155 100%)`
            }}
          />
          <span className="text-sm text-slate-500 w-6 shrink-0">40h</span>
        </div>

        <div className="flex items-baseline justify-center gap-2">
          <span className="text-5xl font-bold text-white tabular-nums">{hoursPerWeek}</span>
          <span className="text-slate-400 text-xl">hrs / week</span>
        </div>
        <p className="text-center text-sm text-slate-500 mt-2">
          ≈ {Math.round((hoursPerWeek / 6) * 10) / 10}h per day &nbsp;·&nbsp; ~{Math.round(hoursPerWeek / 6 * 60)} min sessions
        </p>
      </div>

      {/* Time preference */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 p-6 mb-4">
        <label className="block font-semibold text-slate-100 mb-1">When do you prefer to study?</label>
        <p className="text-sm text-slate-500 mb-4">We'll note this in your schedule</p>
        <div className="grid grid-cols-3 gap-3">
          {TIME_OPTIONS.map(t => {
            const active = preferredTime === t
            return (
              <button
                key={t}
                onClick={() => setSchedule({ ...schedule, preferredTime: t })}
                className={`flex flex-col items-center gap-2 py-4 px-3 rounded-xl border font-medium transition-all ${
                  active
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:bg-slate-700/40 hover:text-slate-300'
                }`}
              >
                <span className={active ? 'text-indigo-400' : 'text-slate-600'}>
                  {TIME_ICONS[t]}
                </span>
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Course summary */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/60 p-6 mb-6">
        <h3 className="font-semibold text-slate-300 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Your Courses ({courses.length})
        </h3>
        <div className="space-y-2.5">
          {courses.map((course, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: course.color.dot }} />
              <span className="text-sm font-medium text-slate-200 flex-1 truncate">{course.name}</span>
              <span className="text-xs text-slate-500">
                {new Date(course.examDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                course.difficulty === 'Hard'   ? 'bg-red-900/50 text-red-400' :
                course.difficulty === 'Medium' ? 'bg-amber-900/50 text-amber-400' :
                                                 'bg-emerald-900/50 text-emerald-400'
              }`}>{course.difficulty}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold py-4 rounded-xl transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
