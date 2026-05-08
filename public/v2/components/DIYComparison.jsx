function DIYComparison() {
  const diyTools = [
    { name: 'Anki',            task: 'for flashcards',              price: 'free',      you: false },
    { name: 'Quizlet',         task: 'for quizzes',                 price: '$7.99/mo',  you: false },
    { name: 'Notion',          task: 'for notes',                   price: '$10/mo',    you: false },
    { name: 'Google Calendar', task: 'for scheduling',              price: 'free',      you: false },
    { name: 'ChatGPT',         task: 'for explanations',            price: '$20/mo',    you: false },
    { name: 'You',             task: '— for holding it all together', price: 'priceless', you: true },
  ];

  const seItems = [
    { text: 'Auto-generated study schedule across every course', accent: false },
    { text: 'Built-in flashcards, quizzes, and active recall',   accent: false },
    { text: 'AI study coach that runs each session',             accent: false },
    { text: 'Grade tracking that shifts priorities automatically', accent: false },
    { text: "Score projection — know if you'll hit your target", accent: false },
    { text: 'You just study.',                                   accent: true },
  ];

  const icons = [
    { letter: 'A',  bg: 'linear-gradient(145deg, #f06040, #e8402a)', dot: true },
    { letter: 'Q',  bg: 'linear-gradient(145deg, #4a6ee0, #3a55c4)', dot: true },
    { letter: 'N',  bg: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)', dot: false },
    { letter: '31', bg: 'linear-gradient(145deg, #2196f3, #1565c0)', dot: true },
    { letter: '▶',  bg: 'linear-gradient(145deg, #30c060, #20a050)', dot: false },
  ];

  return (
    <section style={{ padding: '88px 0 72px' }}>
      <div className="container" style={{ maxWidth: 1060 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)', borderRadius: 99,
            padding: '6px 16px', marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }}/>
            The Real Comparison
          </div>
          <h2 style={{
            fontSize: 'clamp(36px, 5.5vw, 64px)', fontWeight: 900, lineHeight: 1.08,
            letterSpacing: '-1.5px', color: '#fff', margin: '0 auto 18px',
          }}>
            Stop being your own<br/>
            <em style={{ fontStyle: 'italic', background: 'linear-gradient(135deg, #818cf8, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>project manager</em>
            {' '}during finals.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(226,232,240,0.40)', maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>
            Your primary competitor isn't another app. It's the pile of tabs you already have open.
          </p>
        </div>

        {/* Columns wrapper */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>

          {/* VS badge */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            width: 44, height: 44, borderRadius: '50%',
            background: '#1e1e2e',
            border: '2px solid rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.50)',
            letterSpacing: '0.04em',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}>VS</div>

          {/* ── LEFT: DIY Stack ── */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 18,
            overflow: 'hidden',
          }}>
            {/* Icon row */}
            <div style={{
              position: 'relative',
              padding: '24px 20px 20px',
              background: 'rgba(0,0,0,0.15)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ position: 'absolute', top: 14, left: 14, fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.30)', borderRadius: 99, padding: '3px 9px' }}>3 unread</div>
              <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.30)', borderRadius: 99, padding: '3px 9px' }}>12 due</div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 8, paddingTop: 16, perspective: 600 }}>
                {icons.map((ic, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 13,
                      background: ic.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: i === 3 ? 16 : 20, fontWeight: 900, color: '#fff',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.45), 0 1px 2px rgba(255,255,255,0.08) inset',
                      border: '1px solid rgba(255,255,255,0.10)',
                      transform: i === 0 ? 'rotate(-6deg) translateY(4px)' : i === 1 ? 'rotate(-3deg) translateY(2px)' : i === 3 ? 'rotate(3deg) translateY(2px)' : i === 4 ? 'rotate(6deg) translateY(4px)' : 'none',
                    }}>
                      {ic.letter}
                    </div>
                    {ic.dot && (
                      <div style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: '50%', background: '#ef4444', border: '2px solid #0f0f1a', fontSize: 7, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* DIY header */}
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' }}>The DIY Stack</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 2 }}>5 apps + your willpower</div>
              </div>
            </div>

            {/* Tool rows */}
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {diyTools.map((tool, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: tool.you ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                  border: tool.you ? '1px dashed rgba(239,68,68,0.20)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 9, padding: '9px 12px',
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </div>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, fontStyle: tool.you ? 'italic' : 'normal', color: tool.you ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.75)' }}>{tool.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.30)' }}>{' '}{tool.task}</span>
                  </span>
                  <span style={{ fontSize: 11, whiteSpace: 'nowrap', color: tool.price === 'free' ? 'rgba(52,211,153,0.55)' : tool.price === 'priceless' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.28)', fontStyle: tool.price === 'priceless' ? 'italic' : 'normal' }}>{tool.price}</span>
                </div>
              ))}
            </div>

            {/* Stats bar */}
            <div style={{ margin: '0 12px 12px', padding: '13px 12px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>5</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>Apps to juggle</div>
              </div>
              <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.07)' }}/>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', lineHeight: 1 }}>up to <span style={{ fontSize: 22, color: '#ef4444' }}>$37</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>/mo</span></div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>In subscriptions</div>
              </div>
              <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.07)' }}/>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>0</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>Talking to each other</div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: StudyEdge AI ── */}
          <div style={{
            background: 'linear-gradient(150deg, rgba(99,102,241,0.11) 0%, rgba(67,56,202,0.07) 100%)',
            border: '1px solid rgba(99,102,241,0.28)',
            borderRadius: 18,
            overflow: 'hidden',
          }}>
            {/* Browser-style top bar */}
            <div style={{
              padding: '14px 20px',
              background: 'rgba(99,102,241,0.10)',
              borderBottom: '1px solid rgba(99,102,241,0.15)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 10px rgba(99,102,241,0.4)' }}>
                <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 24, height: 24, objectFit: 'contain', mixBlendMode: 'screen' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>StudyEdge AI</div>
                <div style={{ fontSize: 11, color: 'rgba(165,180,252,0.55)' }}>app.studyedge.ai</div>
              </div>
            </div>

            {/* SE header row */}
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(99,102,241,0.10)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src="/favicon.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', mixBlendMode: 'screen' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.07em', color: '#818cf8', textTransform: 'uppercase' }}>StudyEdge AI</div>
                <div style={{ fontSize: 11, color: 'rgba(129,140,248,0.45)', marginTop: 2 }}>One app. Everything built in.</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#818cf8', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap' }}>Recommended</div>
            </div>

            {/* Feature rows */}
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {seItems.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: item.accent ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.03)',
                  border: item.accent ? '1px solid rgba(99,102,241,0.15)' : '1px solid rgba(99,102,241,0.08)',
                  borderRadius: 9, padding: '9px 12px',
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: item.accent ? 'rgba(99,102,241,0.18)' : 'rgba(52,211,153,0.12)', border: `1px solid ${item.accent ? 'rgba(99,102,241,0.35)' : 'rgba(52,211,153,0.28)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke={item.accent ? '#818cf8' : '#34d399'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize: 13, fontStyle: item.accent ? 'italic' : 'normal', fontWeight: item.accent ? 700 : 400, color: item.accent ? '#818cf8' : 'rgba(226,232,240,0.80)' }}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Bottom bar */}
            <div style={{ margin: '0 12px 12px', padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#34d399' }}>$0/mo</span>
              <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>·</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>1 app</span>
              <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>·</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>Everything in sync</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 44 }}>
          <button
            className="btn btn-primary"
            onClick={() => window.location.href = '/app?signup=1'}
            style={{ fontSize: 16, fontWeight: 700, padding: '14px 36px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 10 }}
          >
            Switch to one system — it's free
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>
            No credit card &nbsp;·&nbsp; Free forever for 1 course &nbsp;·&nbsp; Setup in under 2 min
          </div>
        </div>

      </div>
    </section>
  );
}
