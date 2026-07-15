const A = '#3B61C4'
const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const BORDER = 'rgba(0,0,0,0.07)'

const STYLES = [
  {
    id: 'visual',
    title: 'Visual Learner',
    description: 'You think in pictures. You love diagrams, color-coding, mind maps, and visual summaries to make concepts stick.',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    tags: ['Diagrams', 'Color-coding', 'Mind maps', 'Flashcards'],
    accent: '#6366F1',
    accentBg: 'rgba(99,102,241,0.08)',
    accentBorder: 'rgba(99,102,241,0.35)',
    tagBg: 'rgba(99,102,241,0.10)',
    tagColor: '#4338CA',
  },
  {
    id: 'reader',
    title: 'Deep Reader',
    description: 'You absorb material through careful reading, detailed notes, and written summaries. Depth over speed.',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    tags: ['Notes', 'Summaries', 'Re-reading', 'Outlines'],
    accent: '#059669',
    accentBg: 'rgba(5,150,105,0.07)',
    accentBorder: 'rgba(5,150,105,0.30)',
    tagBg: 'rgba(5,150,105,0.10)',
    tagColor: '#047857',
  },
  {
    id: 'practice',
    title: 'Practice-Focused',
    description: 'You learn by doing. Past papers, problem sets, quizzes, and flashcards are your best study tools.',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    tags: ['Past papers', 'Quizzes', 'Flashcards', 'Problem sets'],
    accent: '#EA580C',
    accentBg: 'rgba(234,88,12,0.07)',
    accentBorder: 'rgba(234,88,12,0.28)',
    tagBg: 'rgba(234,88,12,0.10)',
    tagColor: '#C2410C',
  },
]

export default function StepLearningStyle({ learningStyle, setLearningStyle, onNext, onBack }) {
  return (
    <div style={{ maxWidth: 672, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.5px' }}>How Do You Learn Best?</h2>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>We'll tailor your session types to match your style</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {STYLES.map(style => {
          const selected = learningStyle === style.id
          return (
            <button
              key={style.id}
              onClick={() => setLearningStyle(style.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
                background: selected ? style.accentBg : '#FFFFFF',
                border: selected ? `1.5px solid ${style.accentBorder}` : `1px solid ${BORDER}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  padding: 12, borderRadius: 12, flexShrink: 0,
                  background: selected ? `${style.accentBg}` : 'rgba(0,0,0,0.05)',
                  color: selected ? style.accent : MUTED,
                }}>
                  {style.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{style.title}</h3>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginLeft: 8,
                      border: selected ? 'none' : '2px solid rgba(0,0,0,0.18)',
                      background: selected ? style.accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && (
                        <svg width="10" height="10" fill="#fff" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED, lineHeight: 1.55 }}>{style.description}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {style.tags.map(tag => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                          background: selected ? style.tagBg : 'rgba(0,0,0,0.06)',
                          color: selected ? style.tagColor : MUTED,
                        }}
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

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            padding: '16px 20px', background: '#FFFFFF', border: `1px solid ${BORDER}`,
            borderRadius: 12, color: MUTED, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!learningStyle}
          style={{
            flex: 1, background: A, color: '#fff', border: 'none', borderRadius: 12,
            padding: '16px', fontSize: 16, fontWeight: 700,
            cursor: learningStyle ? 'pointer' : 'not-allowed', opacity: learningStyle ? 1 : 0.35,
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: learningStyle ? '0 4px 16px rgba(59,97,196,0.25)' : 'none',
          }}
        >
          Generate My Study Plan
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      </div>
      {!learningStyle && (
        <p style={{ textAlign: 'center', fontSize: 13, color: DIM, marginTop: 8 }}>Select a learning style to continue</p>
      )}
    </div>
  )
}
