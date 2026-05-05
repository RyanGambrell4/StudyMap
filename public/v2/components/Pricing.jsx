// Pricing + Final CTA + Footer
const { useState: p1, useEffect: p2 } = React;

function Pricing(){
  const [bill, setBill] = p1('yearly');

  // Actual charge amounts (match Stripe price IDs)
  const PRICE_TABLE = {
    pro:       { monthly: 12.99, semester: 39.99, yearly: 84.99 },
    unlimited: { monthly: 19.99, semester: 59.99, yearly: 119.99 },
  };

  // For semester/yearly show per-month equivalent so the number looks smaller
  const MONTHLY_EQUIV = {
    pro:       { monthly: 12.99, semester: (39.99/5), yearly: (84.99/12) },
    unlimited: { monthly: 19.99, semester: (59.99/5), yearly: (119.99/12) },
  };

  const SAVE_LABEL = { monthly: null, semester: 'Save 23%', yearly: 'Save 45%' };

  // What's actually billed (shown as sub-label)
  const billedSub = (planKey) => {
    if (bill === 'monthly') return 'Billed monthly';
    if (bill === 'semester') return `Billed $${PRICE_TABLE[planKey].semester.toFixed(2)}/semester`;
    return `Billed $${PRICE_TABLE[planKey].yearly.toFixed(2)}/year`;
  };

  const displayPrice = (planKey) => MONTHLY_EQUIV[planKey][bill];

  const goSignup = (plan)=>{
    const qs = new URLSearchParams({ signup: '1' });
    if (plan) { qs.set('plan', plan); qs.set('billing', bill); }
    window.location.href = '/app?' + qs.toString();
  };

  const tiers = [
    {
      name:'Free', planKey:null, sub:'Try the system. No credit card.',
      cta:'Start for free', primary:false, plan:null,
      feats:[
        [true,'1 course'],
        [true,'10 study boosts / month'],
        [true,'Basic calendar'],
        [true,'Focus Mode timer'],
        [true,'Syllabus upload (1 course)'],
        [false,'Push notifications'],
        [false,'Priority support'],
      ]
    },
    {
      name:'Pro', planKey:'pro',
      cta:'Get Pro', primary:true, popular:true, plan:'pro',
      feats:[
        [true,'5 courses'],
        [true,'75 study boosts / month'],
        [true,'Smart calendar'],
        [true,'Focus Mode timer'],
        [true,'Syllabus upload'],
        [true,'Push notifications'],
        [false,'Priority support'],
      ]
    },
    {
      name:'Unlimited', planKey:'unlimited',
      cta:'Get Unlimited', primary:false, plan:'unlimited',
      feats:[
        [true,'Unlimited courses'],
        [true,'Unlimited study boosts'],
        [true,'Smart calendar'],
        [true,'Focus Mode timer'],
        [true,'Syllabus upload'],
        [true,'Push notifications'],
        [true,'Priority support'],
      ]
    }
  ];

  return (
    <section className="pricing-sec">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Pricing</div>
          <h2 className="section-title">The full system,<br/><span className="grad-text">free to start.</span></h2>
        </div>
        <div className="bill-toggle">
          {[
            {k:'monthly',l:'Monthly'},
            {k:'semester',l:'Semester', save:'Save 23%'},
            {k:'yearly',l:'Yearly', save:'Save 45%'},
          ].map(o=>(
            <button key={o.k} className={`bt ${bill===o.k?'active':''}`} onClick={()=>setBill(o.k)}>
              {o.l}
              {o.save && <span className="bt-save">{o.save}</span>}
            </button>
          ))}
        </div>
        <div className="tiers">
          {tiers.map(t=>(
            <div key={t.name} className={`tier ${t.primary?'tier-primary':''}`}>
              {t.popular && <div className="tier-pop">MOST POPULAR</div>}
              <div className="tier-name">{t.name}</div>
              <div className="tier-price">
                <span className="dollar">{t.planKey ? '$' : ''}</span>
                <span className="amt">{t.planKey ? displayPrice(t.planKey).toFixed(2) : '0'}</span>
                <span className="per">{t.planKey ? '/mo' : '/forever'}</span>
              </div>
              {t.planKey && bill !== 'monthly' && (
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2,flexWrap:'wrap'}}>
                  <span style={{fontSize:12,color:'var(--text-muted)',textDecoration:'line-through'}}>${PRICE_TABLE[t.planKey].monthly.toFixed(2)}/mo</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#34d399',background:'rgba(52,211,153,0.12)',border:'1px solid rgba(52,211,153,0.25)',borderRadius:20,padding:'2px 8px'}}>{SAVE_LABEL[bill]}</span>
                  {t.planKey === 'pro' && bill === 'yearly' && (
                    <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)'}}>· Save $48/year</span>
                  )}
                </div>
              )}
              <div className="tier-sub">{t.planKey ? billedSub(t.planKey) : 'Try the system. No credit card.'}</div>
              <div className="tier-feats">
                {t.feats.map(([on,f])=>(
                  <div key={f} className={`tf ${on?'on':'off'}`}>
                    {on ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3"><polyline points="5 12 10 17 20 7"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>}
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <button className={`btn ${t.primary?'btn-primary':'btn-ghost'} tier-cta`} onClick={()=>goSignup(t.plan)}>{t.cta}</button>
              {t.primary && (
                <p style={{textAlign:'center',fontSize:11,color:'var(--text-muted)',marginTop:8,marginBottom:0}}>✓ 7-day free trial included</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials(){
  const quotes = [
    {t:"I've always struggled to stay consistent. StudyEdge AI just plans it for me. Seeing my hours and progress tracked has genuinely helped bring my grades up.", n:"Andy G.", r:"Undergraduate"},
    {t:"If you want to stay mediocre at studying, don't use this. Scheduling, coaching, daily organization: it has everything you need to take your marks to the next level with less effort.", n:"Danny K.", r:"PhD Student"},
    {t:"First AI study platform I can confidently say has it all. Week-by-week study plans, progress tracking, flashcards, quizzes, and it cuts all the prep time so you can just focus on actually learning.", n:"Charlotte B.", r:"University Student"},
    {t:"It does an amazing job of meeting you where you're at and taking you where you want to go academically.", n:"Gavin D.", r:"Graduate Student"},
    {t:"Right when you log in you see a beautifully structured dashboard that makes you want to get to work. Personalized schedule, flashcards, quizzes: there's so much you can do, how can you not be excited?", n:"Alex G.", r:"College Student"},
  ];
  return (
    <section className="testimonials">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Loved by students</div>
          <h2 className="section-title">Study smarter.<br/><span className="grad-text">Stress less.</span></h2>
        </div>
      </div>
      <div className="marquee">
        <div className="marquee-track">
          {[...quotes, ...quotes].map((q,i)=>(
            <div key={i} className="tq">
              <div className="tq-stars">{'★★★★★'}</div>
              <div className="tq-t">"{q.t}"</div>
              <div className="tq-n">{q.n} <span>· {q.r}</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA(){
  return (
    <section className="cta-sec">
      <div className="container">
        <div className="cta-card">
          <div className="cta-aurora"/>
          <div className="cta-grid"/>
          <div className="cta-inner">
            <h2 className="section-title" style={{maxWidth:820,margin:'0 auto'}}>You already know you need a<br/><span className="grad-text">better system.</span></h2>
            <p className="section-sub" style={{margin:'22px auto 32px',maxWidth:560}}>StudyEdge AI is your edge to success. Free to start, no credit card needed.</p>
            <div className="cta-btns">
              <button className="btn btn-primary btn-lg" onClick={()=>window.location.href='/app?signup=1&plan=pro&billing=monthly&trial=1'}>Get Started Free →</button>
            </div>
            <div className="cta-foot">
              <span>✓ No credit card</span>
              <span>✓ 7-day free Pro trial</span>
              <span>✓ Cancel anytime</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer(){
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-left">
          <div className="logo" style={{fontSize:17}}>
            <div className="logo-mark">
              <img src="/favicon.png" alt="StudyEdge AI" style={{width:'100%',height:'100%',objectFit:'contain',mixBlendMode:'screen'}} />
            </div>
            <span>StudyEdge AI</span>
          </div>
          <p className="footer-tag">One system for students who are done winging it.</p>
          <div style={{display:'flex',gap:12,marginTop:12}}>
            <a href="https://www.tiktok.com/@getstudyedge" target="_blank" rel="noopener noreferrer" aria-label="StudyEdge AI on TikTok" style={{color:'var(--text-muted)',transition:'color .2s'}} onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-muted)'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
            </a>
            <a href="https://www.instagram.com/getstudyedge/" target="_blank" rel="noopener noreferrer" aria-label="StudyEdge AI on Instagram" style={{color:'var(--text-muted)',transition:'color .2s'}} onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-muted)'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            <a href="https://x.com/getstudyedge" target="_blank" rel="noopener noreferrer" aria-label="StudyEdge AI on X" style={{color:'var(--text-muted)',transition:'color .2s'}} onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-muted)'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L2.25 2.25h6.844l4.262 5.634 5.888-5.634Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://www.linkedin.com/company/getstudyedge/" target="_blank" rel="noopener noreferrer" aria-label="StudyEdge AI on LinkedIn" style={{color:'var(--text-muted)',transition:'color .2s'}} onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-muted)'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
        <div className="footer-cols">
          <div>
            <div className="fc-h">Legal</div>
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
            <a href="mailto:support@getstudyedge.com">Contact</a>
          </div>
        </div>
      </div>
      <div className="container footer-bot">
        <span>© 2026 StudyEdge AI, Inc.</span>
        <span>Built by students, for students.</span>
      </div>
    </footer>
  );
}

window.Pricing = Pricing;
window.Testimonials = Testimonials;
window.FinalCTA = FinalCTA;
window.Footer = Footer;
