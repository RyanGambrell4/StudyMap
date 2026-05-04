// Bento, Grade, Pricing, CTA
const { useState: u1, useEffect: u2, useRef: u3 } = React;

/* Bento Grid */
function Bento(){
  return (
    <section className="bento-sec">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Features</div>
          <h2 className="section-title">Every tool a serious student needs.<br/><span className="grad-text">All in one system.</span></h2>
        </div>
        <div className="bento">
          <BentoCard
            title="Focus Mode"
            body="A distraction-free timer that runs your session block by block, with active recall, flashcards, quizzes and notes built in."
            className="bc-a"
            accent="#a78bfa"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 1h4"/></svg>}>
            <FocusBentoVis/>
          </BentoCard>

          <BentoCard
            title="Session Blueprint"
            body="AI breaks every study session into the exact blocks, topics, and techniques you need, before you sit down."
            className="bc-b"
            accent="#60a5fa"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M7 14h10M7 17h6"/></svg>}>
            <BlueprintBentoVis/>
          </BentoCard>

          <BentoCard
            title="Streak Tracking"
            body="A visual record of every session so you can see momentum build. Miss a day and you'll feel it."
            className="bc-c"
            accent="#fb923c"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2s3 3 3 6-3 4-3 7a4 4 0 1 0 8 0c0-2-2-3-2-6 0 0 3 1 3 5a7 7 0 0 1-14 0c0-5 5-8 5-12z"/></svg>}>
            <StreakBentoVis/>
          </BentoCard>

          <BentoCard
            title="Study Tools Built-In"
            body="Flashcards, quizzes, active recall prompts and an AI tutor, all stitched into one session. No tab-switching."
            className="bc-d"
            accent="#34d399"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V5a2 2 0 0 1 2-2h11l3 3v13M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M9 7h6M9 11h6M9 15h4"/></svg>}>
            <ToolsBentoVis/>
          </BentoCard>

          <BentoCard
            title="Grade Intelligence"
            body="Project your grade in real time, see what you need on every remaining assignment, and get three strategies to hit your target."
            className="bc-e"
            accent="#f472b6"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 20h18M6 16l4-6 4 4 5-8"/></svg>}>
            <GradeBentoVis/>
          </BentoCard>

          <BentoCard
            title="Smart Scheduling"
            body="StudyEdge AI reads your calendar, finds your free windows, and auto-fills them with the right course at the right time."
            className="bc-f"
            accent="#818cf8"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 11h18M8 3v4M16 3v4"/></svg>}>
            <ScheduleBentoVis/>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function BentoCard({title,body,children,className='',icon,accent}){
  const ref = u3(null);
  const [pos,setPos] = u1({x:50,y:50});
  const onMove = (e)=>{
    const r = ref.current.getBoundingClientRect();
    setPos({x:((e.clientX-r.left)/r.width)*100, y:((e.clientY-r.top)/r.height)*100});
  };
  return (
    <div ref={ref} className={`bc ${className}`} onMouseMove={onMove}
      style={{'--mx':`${pos.x}%`,'--my':`${pos.y}%`,'--accent':accent}}>
      <div className="bc-glow"/>
      <div className="bc-hd">
        <div className="bc-icon" style={{color:accent}}>{icon}</div>
        <div>
          <div className="bc-t">{title}</div>
          <div className="bc-b">{body}</div>
        </div>
      </div>
      <div className="bc-vis">{children}</div>
    </div>
  );
}

function FocusBentoVis(){
  const [s,setS] = u1(1485);
  u2(()=>{ const i=setInterval(()=>setS(x=>x>0?x-1:1485),1000); return ()=>clearInterval(i); },[]);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  const pct = s/1485;
  const r=40,c=2*Math.PI*r;
  return (
    <div className="fbv">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none"/>
        <circle cx="50" cy="50" r={r} stroke="#a78bfa" strokeWidth="4" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c*(1-pct)}
          style={{transform:'rotate(-90deg)',transformOrigin:'50px 50px',filter:'drop-shadow(0 0 6px #a78bfa)'}}/>
      </svg>
      <div className="fbv-time"><div className="fbv-mm">{mm}:{ss}</div><div className="fbv-sub">this block</div></div>
    </div>
  );
}
function BlueprintBentoVis(){
  const blocks = [
    {min:5,c:'#a78bfa'},{min:10,c:'#60a5fa'},{min:8,c:'#a78bfa'},{min:10,c:'#60a5fa'},
    {min:5,c:'#34d399'},{min:8,c:'#a78bfa'},{min:10,c:'#60a5fa'},{min:7,c:'#a78bfa'},{min:7,c:'#34d399'}
  ];
  return (
    <div className="bpv">
      <div className="bpv-bar">{blocks.map((b,i)=>(<div key={i} className="bpv-seg" style={{background:b.c,flex:b.min,animationDelay:`${i*70}ms`}}/>))}</div>
      <div className="bpv-rows">
        {[{m:5,t:'Warm-Up Recall',c:'#a78bfa'},{m:10,t:'Core Review',c:'#60a5fa'},{m:5,t:'Break',c:'#34d399'}].map((r,i)=>(
          <div key={i} className="bpv-r">
            <span className="bpv-m" style={{color:r.c,background:`${r.c}20`,border:`1px solid ${r.c}40`}}>{r.m}m</span>
            <span className="bpv-t">{r.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function StreakBentoVis(){
  const cells = u3(null);
  if(!cells.current){
    cells.current = Array.from({length:49},()=>{
      const r=Math.random();
      if(r>0.85) return 4; if(r>0.7) return 3; if(r>0.5) return 2; if(r>0.3) return 1; return 0;
    });
  }
  const colors=['rgba(255,255,255,0.04)','rgba(251,146,60,0.2)','rgba(251,146,60,0.45)','rgba(251,146,60,0.75)','#fb923c'];
  return (
    <div className="sbv">
      <div className="sbv-n"><span className="sbv-fire">🔥</span><span>12 day streak</span></div>
      <div className="sbv-grid">
        {cells.current.map((v,i)=>(<div key={i} className="sbv-c" style={{background:colors[v],animationDelay:`${i*12}ms`}}/>))}
      </div>
    </div>
  );
}
function ToolsBentoVis(){
  return (
    <div className="tbv">
      <div className="tbv-card">
        <div className="tbv-k">CONCEPT</div>
        <div className="tbv-q">What is Miller's Law?</div>
      </div>
      <div className="tbv-pills">
        <span className="tbv-p g">I know it</span>
        <span className="tbv-p a">Almost</span>
        <span className="tbv-p r">Review</span>
      </div>
    </div>
  );
}
function GradeBentoVis(){
  return (
    <div className="gbv">
      <div className="gbv-k">PROJECTED GRADE</div>
      <div className="gbv-v"><span className="gbv-n">85.2</span><span className="gbv-s">% A</span></div>
      <div className="gbv-paths">
        <div className="gbv-p">Consistent <span>78 / 78</span></div>
        <div className="gbv-p active">Strong Finish <span style={{color:'#fb923c'}}>68 / 90</span></div>
        <div className="gbv-p">Front-Loaded <span>90 / 63</span></div>
      </div>
    </div>
  );
}
function ScheduleBentoVis(){
  const events = [
    [0,0,0,0,0,0,0],
    [1,1,0,1,1,0,1], // 8a PSYC
    [2,2,0,0,2,2,0], // 11a CALC
    [0,0,3,3,0,3,0], // BIO
    [4,4,0,0,4,4,0], // ECON
    [5,0,0,0,5,0,0], // ENG
  ];
  const cols = ['#60a5fa','#a78bfa','#34d399','#fb923c','#f472b6'];
  return (
    <div className="schv">
      {events.map((row,ri)=>(
        <div key={ri} className="schv-row">
          {row.map((v,ci)=>(
            <div key={ci} className="schv-cell" style={{
              background:v>0?`${cols[v-1]}30`:'rgba(255,255,255,0.02)',
              borderLeft:v>0?`2px solid ${cols[v-1]}`:'2px solid transparent',
              animationDelay:`${(ri*7+ci)*20}ms`
            }}/>
          ))}
        </div>
      ))}
    </div>
  );
}

/* Grade Intelligence interactive */
function GradeIntel(){
  const [scores, setScores] = u1({midterm:95, final:78, project:95, quizzes:78, project2:90});
  const weights = {midterm:25, final:30, project:10, quizzes:25, project2:10};
  const grade = Object.keys(scores).reduce((a,k)=>a + scores[k]*weights[k]/100, 0);
  const letter = grade>=93?'A':grade>=90?'A-':grade>=87?'B+':grade>=83?'B':grade>=80?'B-':'C';
  const delta = (grade - 85).toFixed(1);
  return (
    <section className="grade-sec">
      <div className="container grade-inner">
        <div className="grade-copy">
          <div className="section-kicker">Grade intelligence</div>
          <h2 className="section-title">Stop guessing.<br/><span className="grad-text">Know exactly where you stand.</span></h2>
          <p className="section-sub" style={{margin:'22px 0 28px 0',textAlign:'left',maxWidth:'480px'}}>
            See your projected grade in real time. Scrub any score to test scenarios. StudyEdge AI tells you exactly what you need on every remaining assignment to hit your target.
          </p>
          <button className="btn btn-primary btn-lg" onClick={()=>window.location.href='/app?signup=1'}>Try it free →</button>
        </div>
        <div className="grade-card">
          <div className="gc-top">
            <div>
              <div className="gc-k">PROJECTED GRADE</div>
              <div className="gc-v"><span className="gc-n">{grade.toFixed(1)}</span><span className="gc-p">% {letter}</span></div>
            </div>
            <div className="gc-delta" style={{color:delta>=0?'#34d399':'#ef4444',borderColor:delta>=0?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)',background:delta>=0?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)'}}>
              {delta>=0?'+':''}{delta}% vs target
            </div>
          </div>
          {[
            {k:'midterm',n:'Midterm',actual:true},
            {k:'final',n:'Final'},
            {k:'project',n:'Project',actual:true},
            {k:'quizzes',n:'Weekly quizzes'},
            {k:'project2',n:'Project 2',actual:true}
          ].map(f=>(
            <div key={f.k} className="gs-row">
              <div className="gs-hd"><span className="gs-n">{f.n}{f.actual && <em>(actual)</em>}</span><span className="gs-v" style={{color:scores[f.k]>=90?'#34d399':scores[f.k]>=80?'#fbbf24':'#f59e0b'}}>{scores[f.k]}</span></div>
              <input type="range" min="0" max="100" value={scores[f.k]} className="gs-slider"
                onChange={(e)=>setScores(s=>({...s,[f.k]:+e.target.value}))}
                style={{'--pct':`${scores[f.k]}%`,'--col':scores[f.k]>=90?'#34d399':scores[f.k]>=80?'#fbbf24':'#f59e0b'}}/>
            </div>
          ))}
          <div className="gc-foot">
            <button className="btn btn-ghost">Reset to actuals</button>
            <button className="btn btn-primary">Save Scenario</button>
          </div>
        </div>
      </div>
    </section>
  );
}

window.Bento = Bento;
window.GradeIntel = GradeIntel;
