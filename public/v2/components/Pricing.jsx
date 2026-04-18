// Pricing + Final CTA + Footer
const { useState: p1, useEffect: p2 } = React;

function Pricing(){
  const [bill, setBill] = p1('monthly');
  const mult = bill==='monthly'?1:bill==='semester'?0.77:0.55;
  const fmt = (p)=> (p*mult).toFixed(2);
  const goSignup = (plan)=>{
    const qs = new URLSearchParams({ signup: '1' });
    if (plan) { qs.set('plan', plan); qs.set('billing', bill); }
    window.location.href = '/app?' + qs.toString();
  };
  const tiers = [
    {
      name:'Free', price:0, sub:'Try the system. No credit card.',
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
      name:'Pro', price:12.99, sub:bill==='monthly'?'Billed monthly':bill==='semester'?'Billed per semester':'Billed yearly',
      cta:'Get Pro', primary:true, popular:true, plan:'pro',
      feats:[
        [true,'5 courses'],
        [true,'30 study boosts / month'],
        [true,'Smart calendar'],
        [true,'Focus Mode timer'],
        [true,'Syllabus upload'],
        [true,'Push notifications'],
        [false,'Priority support'],
      ]
    },
    {
      name:'Unlimited', price:19.99, sub:bill==='monthly'?'Billed monthly':bill==='semester'?'Billed per semester':'Billed yearly',
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
                <span className="dollar">$</span>
                <span className="amt">{t.price===0?'0':fmt(t.price)}</span>
                <span className="per">{t.price===0?'/forever':'/mo'}</span>
              </div>
              <div className="tier-sub">{t.sub}</div>
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials(){
  const quotes = [
    {t:"My first semester with a plan I actually followed. Went from a 2.9 to a 3.7 GPA.", n:"Maya R.", r:"Junior · Biology"},
    {t:"I used to spend Sundays making study plans that I never stuck to. StudyEdge just does it.", n:"Chris D.", r:"Sophomore · CS"},
    {t:"The session blueprints are the unlock. I show up, hit start, the work is already mapped.", n:"Priya S.", r:"Senior · Econ"},
    {t:"Knowing my projected grade in real time is low-key addicting. Changed how I study.", n:"Jordan L.", r:"Freshman · Pre-med"},
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
            <p className="section-sub" style={{margin:'22px auto 32px',maxWidth:560}}>StudyEdge is your edge to success. Free to start, no credit card needed.</p>
            <div className="cta-btns">
              <button className="btn btn-primary btn-lg" onClick={()=>window.location.href='/app?signup=1'}>Get Started Free →</button>
            </div>
            <div className="cta-foot">
              <span>✓ No credit card</span>
              <span>✓ 14-day free Pro trial</span>
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
            <div className="logo-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M7 4l5 4 5-4v16l-5-4-5 4V4z" fill="#fff"/></svg></div>
            <span>StudyEdge</span>
          </div>
          <p className="footer-tag">One system for students who are done winging it.</p>
          <div className="footer-social">
            {['X','IG','TT','YT'].map(s=>(<div key={s} className="fs">{s}</div>))}
          </div>
        </div>
        <div className="footer-cols">
          <div><div className="fc-h">Product</div><a>Features</a><a>Pricing</a><a>Roadmap</a><a>Changelog</a></div>
          <div><div className="fc-h">Learn</div><a>Study guides</a><a>Blog</a><a>Student stories</a><a>Help center</a></div>
          <div><div className="fc-h">Company</div><a>About</a><a>Careers</a><a>Contact</a><a>Press</a></div>
          <div><div className="fc-h">Legal</div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a>Security</a></div>
        </div>
      </div>
      <div className="container footer-bot">
        <span>© 2026 StudyEdge, Inc.</span>
        <span>Built by students, for students.</span>
      </div>
    </footer>
  );
}

window.Pricing = Pricing;
window.Testimonials = Testimonials;
window.FinalCTA = FinalCTA;
window.Footer = Footer;
