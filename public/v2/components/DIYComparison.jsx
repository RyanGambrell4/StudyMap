function DIYComparison() {
  const diyItems = [
    { tool: 'Anki', task: 'Flashcards' },
    { tool: 'Quizlet', task: 'Quizzes' },
    { tool: 'Notion', task: 'Notes' },
    { tool: 'Google Calendar', task: 'Scheduling' },
    { tool: 'ChatGPT', task: 'Explanations' },
    { tool: 'You', task: 'Holding it all together' },
  ];
  const seItems = [
    'Auto-generated study schedule across every course',
    'Built-in flashcards, quizzes, and active recall',
    'AI study coach that runs each session',
    'Grade tracking that shifts priorities automatically',
    'Score projection — know if you\'ll hit your target',
    'You just study.',
  ];
  return (
    <section className="fade-up" style={{
      padding: '80px 0',
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 70%)',
    }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 14 }}>
            <span style={{ width: 20, height: 1, background: 'var(--accent)', display: 'inline-block' }} />
            The real comparison
            <span style={{ width: 20, height: 1, background: 'var(--accent)', display: 'inline-block' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 900, color: '#fff', margin: '0 auto 12px', maxWidth: 600, lineHeight: 1.15, letterSpacing: '-0.5px' }}>
            Stop being your own<br/>project manager during finals.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 440, margin: '0 auto' }}>
            Your primary competitor isn't another app — it's the pile of tabs you already have open.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 0, maxWidth: 860, margin: '0 auto', alignItems: 'stretch' }}>
          {/* DIY Stack column */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px 0 0 16px',
            padding: '28px 28px 32px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ fontSize: 18 }}>😩</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>THE DIY STACK</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>5 apps + your willpower</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {diyItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>{item.tool}</span>
                    {item.tool !== 'You' && <span style={{ color: 'rgba(255,255,255,0.20)' }}> for </span>}
                    {item.task === 'Holding it all together'
                      ? <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.30)' }}>for holding it all together</span>
                      : <span style={{ color: 'rgba(255,255,255,0.30)' }}>{item.task.toLowerCase()}</span>
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* VS divider */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 4px', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.3), transparent)' }} />
            <div style={{ padding: '10px 0', fontSize: 11, fontWeight: 800, color: 'rgba(99,102,241,0.7)', letterSpacing: '0.1em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>VS</div>
            <div style={{ width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.3), transparent)' }} />
          </div>

          {/* StudyEdge AI column */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(79,70,229,0.06) 100%)',
            border: '1px solid rgba(99,102,241,0.30)',
            borderRadius: '0 16px 16px 0',
            padding: '28px 28px 32px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: '#6366f1', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, padding: '3px 8px' }}>RECOMMENDED</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ fontSize: 18 }}>⚡</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#818cf8', letterSpacing: '0.04em' }}>STUDYEDGE AI</div>
                <div style={{ fontSize: 11, color: 'rgba(129,140,248,0.5)', marginTop: 1 }}>One app. Everything built in.</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {seItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize: 13, color: i === seItems.length - 1 ? '#818cf8' : 'rgba(226,232,240,0.75)', fontWeight: i === seItems.length - 1 ? 700 : 400, fontStyle: i === seItems.length - 1 ? 'italic' : 'normal' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <button
            className="btn btn-primary"
            onClick={() => window.location.href = '/app?signup=1'}
            style={{ fontSize: 15, padding: '13px 32px', borderRadius: 10 }}
          >
            Switch to one system — it's free
          </button>
        </div>
      </div>
    </section>
  );
}
