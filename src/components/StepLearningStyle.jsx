const STYLES = [
  {
    id: 'visual',
    title: 'Visual Learner',
    description: 'You think in pictures. You love diagrams, color-coding, mind maps, and visual summaries to make concepts stick.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    tags: ['Diagrams', 'Color-coding', 'Mind maps', 'Flashcards'],
    color: { border: 'border-indigo-500', bg: 'bg-indigo-500/10', icon: 'text-indigo-400 bg-indigo-500/15', tag: 'bg-indigo-500/15 text-indigo-300', check: 'bg-indigo-500' },
  },
  {
    id: 'reader',
    title: 'Deep Reader',
    description: 'You absorb material through careful reading, detailed notes, and written summaries. Depth over speed.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    tags: ['Notes', 'Summaries', 'Re-reading', 'Outlines'],
    color: { border: 'border-emerald-500', bg: 'bg-emerald-500/10', icon: 'text-emerald-400 bg-emerald-500/15', tag: 'bg-emerald-500/15 text-emerald-300', check: 'bg-emerald-500' },
  },
  {
    id: 'practice',
    title: 'Practice-Focused',
    description: 'You learn by doing. Past papers, problem sets, quizzes, and flashcards are your best study tools.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    tags: ['Past papers', 'Quizzes', 'Flashcards', 'Problem sets'],
    color: { border: 'border-orange-500', bg: 'bg-orange-500/10', icon: 'text-orange-400 bg-orange-500/15', tag: 'bg-orange-500/15 text-orange-300', check: 'bg-orange-500' },
  },
]

export default function StepLearningStyle({ learningStyle, setLearningStyle, onNext, onBack }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">How Do You Learn Best?</h2>
        <p className="text-slate-400">We'll tailor your session types to match your style</p>
      </div>

      <div className="space-y-3 mb-8">
        {STYLES.map(style => {
          const selected = learningStyle === style.id
          const c = style.color
          return (
            <button
              key={style.id}
              onClick={() => setLearningStyle(style.id)}
              className={`w-full text-left p-5 rounded-2xl border transition-all duration-150 ${
                selected
                  ? `${c.border} ${c.bg}`
                  : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl shrink-0 transition-colors ${selected ? c.icon : 'bg-slate-700/60 text-slate-400'}`}>
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className={`font-bold text-lg ${selected ? 'text-white' : 'text-slate-200'}`}>{style.title}</h3>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 transition-all ${
                      selected ? `${c.check} border-transparent` : 'border-slate-600'
                    }`}>
                      {selected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm mb-3 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{style.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {style.tags.map(tag => (
                      <span
                        key={tag}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${selected ? c.tag : 'bg-slate-700/60 text-slate-500'}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
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
          disabled={!learningStyle}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
        >
          Generate My Study Plan
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      </div>
      {!learningStyle && (
        <p className="text-center text-sm text-slate-600 mt-2">Select a learning style to continue</p>
      )}
    </div>
  )
}
