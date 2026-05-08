function DIYComparison() {
  const diyTools = [
    { name: 'Anki',           task: 'for flashcards',     price: 'free',      letter: 'A', bg: '#e8523a' },
    { name: 'Quizlet',        task: 'for quizzes',        price: '$7.99/mo',  letter: 'Q', bg: '#4257b2' },
    { name: 'Notion',         task: 'for notes',          price: '$10/mo',    letter: 'N', bg: '#1a1a1a' },
    { name: 'Google Calendar',task: 'for scheduling',     price: 'free',      letter: '31',bg: '#1a73e8' },
    { name: 'ChatGPT',        task: 'for explanations',   price: '$20/mo',    letter: 'G', bg: '#10a37f' },
    { name: 'You',            task: '— for holding it all together', price: 'priceless', letter: '?', bg: '#6366f1', italic: true },
  ];

  const seItems = [
    'Auto-generated study schedule across every course',
    'Built-in flashcards, quizzes, and active recall',
    'AI study coach that runs each session',
    'Grade tracking that shifts priorities automatically',
    'Score projection — know if you\'ll hit your target',
  ];

  const iconBgs = ['#e8523a','#4257b2','#1a1a1a','#1a73e8','#10a37f'];
  const iconLetters = ['A','Q','N','31','▶'];

  return (
    <section style={{ padding: '90px 0 80px', position: 'relative' }}>
      <div className="container" style={{ maxWidth: 1080 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20,
            padding: '5px 14px', marginBottom: 22,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block', flexShrink: 0 }}/>
            The Real Comparison
          </div>
          <h2 style={{
            fontSize: 'clamp(32px, 4.5vw, 56px)', fontWeight: 900, lineHeight: 1.1,
            color: '#fff', margin: '0 auto 16px', letterSpacing: '-1px',
          }}>
            Stop being your own<br/>
            <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg, #818cf8, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>project manager</span>
            {' '}during finals.
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(226,232,240,0.45)', maxWidth: 420, margin: '0 auto' }}>
            Your primary competitor isn't another app. It's the pile of tabs you already have open.
          </p>
        </div>

        {/* Two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT: DIY Stack ── */}
          <div style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, overflow: 'hidden',
          }}>
            {/* App icons row */}
            <div style={{
              padding: '20px 24px 16px',
              background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 14, left: 16, fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 20, padding: '2px 8px' }}>3 unread</div>
              <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '2px 8px' }}>12 due</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingTop: 8 }}>
                {iconBgs.map((bg, i) => (
                  <div key={i} style={{
                    width: 52, height: 52, borderRadius: 14, background: bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: i === 3 ? 15 : 18, fontWeight: 900, color: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    {iconLetters[i]}
                  </div>
                ))}
              </div>
            </div>

            {/* DIY header */}
            <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>The DIY Stack</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>5 apps + your willpower</div>
              </div>
            </div>

            {/* Tool rows */}
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {diyTools.map((tool, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.055)',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: tool.italic ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)' }}>
                    <span style={{ fontWeight: 700, fontStyle: tool.italic ? 'italic' : 'normal', color: tool.italic ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)' }}>{tool.name}</span>
                    {' '}
                    <span style={{ color: 'rgba(255,255,255,0.30)' }}>{tool.task}</span>
                  </span>
                  <span style={{ fontSize: 11, color: tool.price === 'priceless' ? 'rgba(255,255,255,0.20)' : tool.price === 'free' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.25)', fontStyle: tool.price === 'priceless' ? 'italic' : 'normal', whiteSpace: 'nowrap' }}>{tool.price}</span>
                </div>
              ))}
            </div>

            {/* Bottom stats */}
            <div style={{ margin: '0 16px 16px', padding: '14px 16px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>5</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginTop: 3 }}>Apps to juggle</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)' }}/>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>up to <span style={{ color: '#ef4444' }}>$37</span><span style={{ fontSize: 13 }}>/mo</span></div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginTop: 3 }}>In subscriptions</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)' }}/>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>0</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginTop: 3 }}>Talking to each other</div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: StudyEdge AI ── */}
          <div style={{
            background: 'linear-gradient(160deg, rgba(99,102,241,0.12) 0%, rgba(79,70,229,0.06) 100%)',
            border: '1px solid rgba(99,102,241,0.30)',
            borderRadius: 20, overflow: 'hidden',
          }}>
            {/* Mock browser bar */}
            <div style={{
              padding: '14px 20px',
              background: 'rgba(99,102,241,0.08)',
              borderBottom: '1px solid rgba(99,102,241,0.15)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {/* StudyEdge logo */}
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(99,102,241,0.4)' }}>
                <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 22, height: 22, objectFit: 'contain', mixBlendMode: 'screen' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>StudyEdge AI</div>
                <div style={{ fontSize: 11, color: 'rgba(165,180,252,0.6)' }}>app.studyedge.ai</div>
              </div>
            </div>

            {/* SE header row */}
            <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src="/favicon.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', mixBlendMode: 'screen' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: '#818cf8', textTransform: 'uppercase' }}>StudyEdge AI</div>
                <div style={{ fontSize: 11, color: 'rgba(129,140,248,0.5)', marginTop: 1 }}>One app. Everything built in.</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#6366f1', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, padding: '3px 9px', textTransform: 'uppercase' }}>Recommended</div>
            </div>

            {/* Feature rows */}
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {seItems.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.10)',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(226,232,240,0.80)' }}>{item}</span>
                </div>
              ))}
              {/* "You just study." row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.10)',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ fontSize: 13, fontStyle: 'italic', fontWeight: 700, color: '#818cf8' }}>You just study.</span>
              </div>
            </div>

            {/* Bottom bar */}
            <div style={{ margin: '0 16px 16px', padding: '13px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#34d399' }}>$0/mo</span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>1 app</span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Everything in sync</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <button
            className="btn btn-primary"
            onClick={() => window.location.href = '/app?signup=1'}
            style={{ fontSize: 16, fontWeight: 700, padding: '14px 36px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 10 }}
          >
            Switch to one system — it's free
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <div style={{ marginTop: 12, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
            No credit card &nbsp;·&nbsp; Free forever for 1 course &nbsp;·&nbsp; Setup in under 2 min
          </div>
        </div>

      </div>
    </section>
  );
}
