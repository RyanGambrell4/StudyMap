// Stats bar + How it works + Bento + Grade + Pricing + Final CTA
const { useState: uS, useEffect: uE, useRef: uR, useMemo: uM } = React;

function StatsBar(){
  return (
    <section className="stats-bar">
      <div className="container">
        <div className="stats-card">
          <Stat n={30000} suffix="+" label="Students in our community" col="#818cf8"/>
          <div className="stat-div"/>
          <Stat n={12} suffix="" label="AI-powered study tools" col="#a78bfa"/>
          <div className="stat-div"/>
          <Stat n={4.9} label="Average rating" suffix="/5" decimals={1} col="#34d399"/>
        </div>
      </div>
    </section>
  );
}
function Stat({n,suffix="",label,col,decimals=0}){
  const ref = uR(null);
  const [v,setV] = uS(0);
  const [seen,setSeen] = uS(false);
  uE(()=>{
    const io = new IntersectionObserver(([e])=>{ if(e.isIntersecting){ setSeen(true); io.disconnect();} },{threshold:0.3});
    if(ref.current) io.observe(ref.current);
    return ()=>io.disconnect();
  },[]);
  uE(()=>{
    if(!seen) return;
    let raf, start;
    const anim=(t)=>{
      if(!start) start=t;
      const p=Math.min(1,(t-start)/1800);
      const eased = 1 - Math.pow(1-p,3);
      setV(n*eased);
      if(p<1) raf=requestAnimationFrame(anim);
    };
    raf=requestAnimationFrame(anim);
    return ()=>cancelAnimationFrame(raf);
  },[seen,n]);
  const fmt = decimals>0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return (
    <div className="stat" ref={ref}>
      <div className="stat-n" style={{color:col}}>{fmt}{suffix}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function Step({num,title,body,children,reverse}){
  return (
    <div className={`step ${reverse?'rev':''}`}>
      <div className="step-copy">
        <div className="step-num">{num}</div>
        <h3 className="step-t">{title}</h3>
        <p className="step-b">{body}</p>
      </div>
      <div className="step-vis">{children}</div>
    </div>
  );
}

/* Step 1 visual: live animated calendar */
function CalendarVis(){
  const days = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  const events = [
    {d:0, t:'8a', h:1, c:'#60a5fa', name:'PSYC 101'},
    {d:0, t:'11a', h:1, c:'#a78bfa', name:'CALC II'},
    {d:0, t:'1p', h:1, c:'#34d399', name:'BIO 1010'},
    {d:1, t:'8a', h:1, c:'#60a5fa', name:'PSYC 101'},
    {d:1, t:'11a', h:1, c:'#a78bfa', name:'CALC II'},
    {d:1, t:'2p', h:1, c:'#fb923c', name:'ECON 201'},
    {d:2, t:'1p', h:1, c:'#34d399', name:'BIO 1010'},
    {d:2, t:'3p', h:1, c:'#f472b6', name:'ENG 110'},
    {d:3, t:'8a', h:1, c:'#60a5fa', name:'PSYC 101'},
    {d:3, t:'11a', h:1, c:'#a78bfa', name:'CALC II'},
    {d:3, t:'1p', h:1, c:'#34d399', name:'BIO 1010'},
    {d:4, t:'8a', h:1, c:'#60a5fa', name:'PSYC 101'},
    {d:4, t:'3p', h:1, c:'#f472b6', name:'ENG 110'},
    {d:5, t:'11a', h:1, c:'#a78bfa', name:'CALC II'},
    {d:5, t:'1p', h:1, c:'#34d399', name:'BIO 1010'},
    {d:6, t:'8a', h:1, c:'#60a5fa', name:'PSYC 101'},
  ];
  return (
    <div className="cal">
      <div className="cal-top">
        <span className="cal-prev">‹ Prev</span>
        <span className="cal-range">April 13–19, 2026</span>
        <div className="cal-tabs">
          <span>Day</span><span className="active">Week</span><span>Month</span>
        </div>
      </div>
      <div className="cal-grid">
        {days.map((d,i)=>(<div key={d} className="cal-col">
          <div className="cal-hd">{d}<br/><span>{13+i}</span></div>
          <div className="cal-slots">
            {events.filter(e=>e.d===i).map((e,j)=>(
              <div key={j} className="cal-ev" style={{
                borderLeft:`2px solid ${e.c}`,
                background:`${e.c}1a`,
                color:e.c,
                animationDelay:`${(i*100+j*150)}ms`
              }}>
                <div className="ev-t">{e.t}</div>
                <div className="ev-n">{e.name}</div>
              </div>
            ))}
          </div>
        </div>))}
      </div>
      <div className="cal-glow"/>
    </div>
  );
}

/* Step 2: session blueprint */
function BlueprintVis(){
  const blocks = [
    {min:5, title:'Warm-Up Recall', c:'#a78bfa', k:'Active Recall'},
    {min:10, title:'Memory Deep Dive', c:'#60a5fa', k:'Review'},
    {min:8, title:'Core Concepts Dive', c:'#a78bfa', k:'Active Recall'},
    {min:10, title:'Perception Review', c:'#60a5fa', k:'Review'},
    {min:5, title:'Break', c:'#34d399', k:'Break'},
    {min:8, title:'Active Recall Sprint', c:'#a78bfa', k:'Active Recall'},
    {min:10, title:'Biological Bases', c:'#60a5fa', k:'Review'},
    {min:7, title:'Integration & Summary', c:'#a78bfa', k:'Summary'},
    {min:7, title:'Wrap & Consolidate', c:'#34d399', k:'Break'},
  ];
  return (
    <div className="bp">
      <div className="bp-hd">
        <div className="bp-k">SESSION PLAN READY</div>
        <h4 className="bp-t">PSYC 101: Active Recall Lockdown</h4>
        <div className="bp-s">70 min · 9 blocks · Built for exam in 14 days</div>
      </div>
      <div className="bp-bar">
        {blocks.map((b,i)=>(
          <div key={i} className="bp-seg" style={{background:b.c,flex:b.min,animationDelay:`${i*80}ms`}}/>
        ))}
      </div>
      <div className="bp-legend">
        {[
          {name:'Active Recall',c:'#a78bfa'},{name:'Review',c:'#60a5fa'},{name:'Break',c:'#34d399'}
        ].map(x=>(<span key={x.name} className="bp-chip"><i style={{background:x.c,boxShadow:`0 0 8px ${x.c}`}}/>{x.name}</span>))}
      </div>
      <div className="bp-list">
        {blocks.slice(0,4).map((b,i)=>(
          <div key={i} className="bp-row" style={{animationDelay:`${i*120+200}ms`}}>
            <div className="bp-min" style={{background:`${b.c}26`,color:b.c,borderColor:`${b.c}55`}}>{b.min} min</div>
            <div className="bp-rt"><div className="bp-rn">{b.title}</div><div className="bp-rs">#{i+1}</div></div>
          </div>
        ))}
        <div className="bp-more">+ 5 more blocks</div>
      </div>
    </div>
  );
}

/* Step 3: focus timer running */
function FocusVis(){
  const [s,setS] = uS(1498); // 24:58
  uE(()=>{
    const i=setInterval(()=>setS(x=>x>0?x-1:1498),1000);
    return ()=>clearInterval(i);
  },[]);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  const pct = s/1498;
  const r=78, c=2*Math.PI*r;
  const [tab,setTab] = uS(0);
  const tabs = ['Active Recall','Flashcards','Quick Quiz','Notes','Ask AI'];
  return (
    <div className="focus-v">
      <div className="fv-hd">
        <span className="fv-dot"/>
        <div className="fv-t">PSYC 101: Memory & Cognition</div>
        <span className="fv-x">✕</span>
      </div>
      <div className="fv-ring-row">
        <div className="fv-ring">
          <svg viewBox="0 0 200 200" width="160" height="160">
            <defs>
              <linearGradient id="fvg" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#818cf8"/>
                <stop offset="1" stopColor="#a78bfa"/>
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r={r} stroke="rgba(255,255,255,0.07)" strokeWidth="4" fill="none"/>
            <circle cx="100" cy="100" r={r} stroke="url(#fvg)" strokeWidth="5" fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c*(1-pct)}
              style={{transform:'rotate(-90deg)',transformOrigin:'100px 100px',filter:'drop-shadow(0 0 10px #a78bfa)'}}/>
          </svg>
          <div className="fv-time">
            <div className="fv-mm">{mm}:{ss}</div>
            <div className="fv-sub">this block</div>
          </div>
        </div>
        <div className="fv-actions">
          <div className="fv-session-chip">60 min session</div>
          <button className="fv-btn ghost">⏸ Pause</button>
          <button className="fv-btn primary">✓ Finish (03:02)</button>
        </div>
      </div>
      <div className="fv-tabs">
        {tabs.map((t,i)=>(
          <button key={t} className={`fv-tab ${i===tab?'active':''}`} onClick={()=>setTab(i)}>{t}{i===tab && <span className="fv-tab-dot"/>}</button>
        ))}
      </div>
      <div className="fv-body">
        {tab===0 && <div>
          <div className="fv-q">Without notes, list the 3 main memory systems and describe how encoding differs for each.</div>
          <div className="fv-pill-row"><span className="fv-pill">Sensory</span><span className="fv-pill">Short-term</span><span className="fv-pill">Long-term</span></div>
        </div>}
        {tab===1 && <div>
          <div className="fv-kicker">CONCEPT · Card 2/15</div>
          <div className="fv-q">What is Miller's Law regarding short-term memory capacity?</div>
          <div className="fv-pill-row small"><span className="fv-pill g">I know it</span><span className="fv-pill a">Almost</span><span className="fv-pill r">Reviewing</span></div>
        </div>}
        {tab===2 && <div>
          <div className="fv-kicker">MULTIPLE CHOICE · Question 5/10</div>
          <div className="fv-q">What is confirmation bias most likely to cause someone to do?</div>
          <div className="fv-mc">
            <div className="mc-opt">A. Encode information acoustically</div>
            <div className="mc-opt correct">C. Ignore evidence that challenges their existing views ✓</div>
          </div>
        </div>}
        {tab===3 && <div>
          <div className="fv-kicker">NOTES</div>
          <div className="fv-q">Sensory memory → very short (ms). Short-term ≈ 7±2 items (Miller's Law). Long-term: declarative + procedural…</div>
        </div>}
        {tab===4 && <div>
          <div className="fv-q-ai">"What are the 4 most important things to know for this exam?"</div>
          <div className="fv-ai">
            <div><strong>1. Research Methods & Stats:</strong> validity, controls, basic stats.</div>
            <div><strong>2. Biological Bases of Behavior:</strong> brain, neurotransmitters.</div>
            <div><strong>3. Sensation & Perception:</strong> bridges biology & cognition.</div>
            <div><strong>4. Memory, Learning, Cognition:</strong> encoding, retrieval.</div>
          </div>
        </div>}
      </div>
    </div>
  );
}

function HowItWorks(){
  return (
    <section className="how">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">How it works</div>
          <h2 className="section-title">Three problems every student has.<br/><span className="grad-text">One system that fixes all of them.</span></h2>
        </div>
        <div className="steps">
          <Step num="01" title="Your schedule, built around your real life." body="Add your classes and due dates. StudyEdge maps out your entire week automatically, filling your free time with the right courses at the right time, prioritized by exam date and difficulty.">
            <CalendarVis/>
          </Step>
          <Step num="02" title="Every session planned before you open a book." body="Before each session, the AI builds a minute-by-minute plan for your course, your upcoming exams, and your goals. All mapped out before you sit down." reverse>
            <BlueprintVis/>
          </Step>
          <Step num="03" title="An AI coach that runs the session while you're in it." body="Hit start and StudyEdge runs the clock. Flashcards, recall prompts, practice quizzes, and notes, all built in. You're not reading over slides hoping it sticks.">
            <FocusVis/>
          </Step>
        </div>
      </div>
    </section>
  );
}

window.StatsBar = StatsBar;
window.HowItWorks = HowItWorks;
