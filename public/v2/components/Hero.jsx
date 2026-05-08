// Hero: animated dashboard composition with floating cards
const { useState, useEffect, useRef, useMemo } = React;

function AuroraCanvas(){
  const canvasRef = useRef(null);
  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let t = 0;

    const blobs = [
      { x:0.78, y:0.38, r:320, color:[124,58,237], speed:0.7 },
      { x:0.62, y:0.62, r:280, color:[99,102,241], speed:0.5 },
      { x:0.55, y:0.2,  r:200, color:[129,140,248], speed:0.9 },
    ];

    const resize = ()=>{
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = ()=>{
      t += 0.008;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      blobs.forEach(b=>{
        const cx = canvas.width  * (b.x + Math.sin(t*b.speed)*0.07);
        const cy = canvas.height * (b.y + Math.cos(t*b.speed)*0.06);
        const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,b.r);
        grad.addColorStop(0, `rgba(${b.color},0.38)`);
        grad.addColorStop(1, `rgba(${b.color},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx,cy,b.r,0,Math.PI*2);
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return ()=>{ cancelAnimationFrame(raf); ro.disconnect(); };
  },[]);
  return <canvas ref={canvasRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',filter:'blur(18px)'}}/>;
}

function StreakHeatmap(){
  // 7 rows x 20 cols animated grid
  const cells = useMemo(()=>{
    const arr=[];
    for(let i=0;i<7*20;i++){
      const r = Math.random();
      let v = 0;
      if(r>0.35) v = 1;
      if(r>0.55) v = 2;
      if(r>0.75) v = 3;
      if(r>0.9) v = 4;
      arr.push(v);
    }
    return arr;
  },[]);
  const colors = ['rgba(255,255,255,0.04)','rgba(99,102,241,0.25)','rgba(99,102,241,0.5)','rgba(124,58,237,0.75)','#a78bfa'];
  return (
    <div className="heatmap">
      {cells.map((v,i)=>(
        <div key={i} className="hm-cell" style={{
          background:colors[v],
          animationDelay:`${(i%20)*0.04 + Math.floor(i/20)*0.06}s`
        }}/>
      ))}
    </div>
  );
}

function WeeklyRing({pct=72}){
  const r = 46, c = 2*Math.PI*r;
  const [display,setDisplay] = useState(0);
  useEffect(()=>{
    let raf, start;
    const anim = (t)=>{
      if(!start) start=t;
      const p = Math.min(1,(t-start)/1400);
      const eased = 1 - Math.pow(1-p, 3);
      setDisplay(Math.round(pct*eased));
      if(p<1) raf=requestAnimationFrame(anim);
    };
    raf=requestAnimationFrame(anim);
    return ()=>cancelAnimationFrame(raf);
  },[pct]);
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" width="110" height="110">
        <defs>
          <linearGradient id="ringg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#818cf8"/>
            <stop offset="1" stopColor="#a78bfa"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} stroke="rgba(255,255,255,0.07)" strokeWidth="8" fill="none"/>
        <circle cx="60" cy="60" r={r} stroke="url(#ringg)" strokeWidth="8" fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c*(1-display/100)}
          style={{transform:'rotate(-90deg)',transformOrigin:'60px 60px',transition:'stroke-dashoffset .2s linear',filter:'drop-shadow(0 0 8px rgba(129,140,248,0.6))'}}/>
      </svg>
      <div className="ring-inner">
        <div className="ring-val">{display}%</div>
        <div className="ring-lbl">this week</div>
      </div>
    </div>
  );
}

function MiniCourseCard({code,name,color,pct,delay}){
  const [w,setW] = useState(0);
  useEffect(()=>{
    const t=setTimeout(()=>setW(pct),300+delay);
    return ()=>clearTimeout(t);
  },[pct,delay]);
  return (
    <div className="mcc" style={{borderLeftColor:color,animationDelay:`${delay}ms`}}>
      <div className="mcc-top">
        <div className="mcc-code" style={{color}}>{code}</div>
        <div className="mcc-pct" style={{color}}>{pct}%</div>
      </div>
      <div className="mcc-name">{name}</div>
      <div className="mcc-bar"><div className="mcc-fill" style={{width:`${w}%`,background:color,boxShadow:`0 0 12px ${color}80`}}/></div>
    </div>
  );
}

function TickingCounter({value, label, suffix=""}){
  const [n,setN] = useState(0);
  useEffect(()=>{
    let raf, start;
    const anim=(t)=>{
      if(!start) start=t;
      const p = Math.min(1,(t-start)/1600);
      const eased = 1 - Math.pow(1-p, 3);
      setN(Math.round(value*eased));
      if(p<1) raf=requestAnimationFrame(anim);
    };
    raf=requestAnimationFrame(anim);
    return ()=>cancelAnimationFrame(raf);
  },[value]);
  return (<div className="tc"><div className="tc-n">{n.toLocaleString()}{suffix}</div><div className="tc-l">{label}</div></div>);
}

function TimerChip(){
  const [s,setS] = useState(291); // 04:51
  useEffect(()=>{
    const i = setInterval(()=>setS(x => x>0 ? x-1 : 291),1000);
    return ()=>clearInterval(i);
  },[]);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  const pct = (s/291)*100;
  const r=28, c=2*Math.PI*r;
  return (
    <div className="timer-chip">
      <div className="tc-ring">
        <svg viewBox="0 0 70 70" width="70" height="70">
          <circle cx="35" cy="35" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none"/>
          <circle cx="35" cy="35" r={r} stroke="#a78bfa" strokeWidth="4" fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c*(1-pct/100)}
            style={{transform:'rotate(-90deg)',transformOrigin:'35px 35px',filter:'drop-shadow(0 0 6px #a78bfa)'}}/>
        </svg>
        <div className="tc-time">{mm}:{ss}</div>
      </div>
      <div className="tc-meta">
        <div className="tc-kicker">BLOCK 1 OF 9</div>
        <div className="tc-label">Warm-Up Recall</div>
        <div className="tc-blocks">
          {['#a78bfa','#60a5fa','#a78bfa','#60a5fa','#34d399','#a78bfa','#60a5fa','#a78bfa','#34d399'].map((col,i)=>(
            <div key={i} className="tc-blk" style={{background:i===0?col:'rgba(255,255,255,0.1)'}}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero(){
  const heroRef = useRef(null);
  const [tilt,setTilt] = useState({x:0,y:0});
  const [scrollScale,setScrollScale] = useState(0.92);

  useEffect(()=>{
    const h = (e)=>{
      const r = heroRef.current?.getBoundingClientRect();
      if(!r) return;
      const cx = (e.clientX - r.left)/r.width - 0.5;
      const cy = (e.clientY - r.top)/r.height - 0.5;
      setTilt({x:cx, y:cy});
    };
    window.addEventListener('mousemove',h);
    return ()=>window.removeEventListener('mousemove',h);
  },[]);

  useEffect(()=>{
    const onScroll = ()=>{
      const heroH = heroRef.current?.offsetHeight || 700;
      const p = Math.min(1, window.scrollY / (heroH * 0.5));
      setScrollScale(0.92 + p * 0.08);
    };
    window.addEventListener('scroll',onScroll,{passive:true});
    return ()=>window.removeEventListener('scroll',onScroll);
  },[]);

  return (
    <section className="hero" ref={heroRef}>
      <AuroraCanvas/>
      <div className="container hero-inner">
        <div className="hero-left">
          <div className="eyebrow"><span className="dot"/>AI-Powered Study System</div>
          <h1 className="hero-h1">
            Stop surviving your courses.{' '}
            <span style={{ background: 'linear-gradient(135deg, #a5b4fc, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 18px rgba(129,140,248,0.7))' }}>Start owning them.</span>
          </h1>
          <p className="hero-sub">
            StudyEdge AI builds your study system across every course, coaches every session, and shifts your focus to wherever your grades actually need help. One app. All semester.
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary btn-lg" onClick={()=>window.location.href='/app?signup=1'}>Start Studying Free</button>
            <button className="btn btn-ghost btn-lg" onClick={()=>document.getElementById('how')?.scrollIntoView({behavior:'smooth'})}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
              See how it works
            </button>
          </div>
          <div className="hero-trust">
            <div className="avatars">
              {['#818cf8','#a78bfa','#60a5fa','#f472b6'].map((c,i)=>(
                <div key={i} className="av" style={{background:`linear-gradient(135deg,${c},${c}aa)`,zIndex:4-i}}/>
              ))}
            </div>
            <div className="hero-trust-text"><strong>30,000+ students</strong> in our community</div>
          </div>
        </div>
        <div className="hero-right" style={{'--tx':`${tilt.x*6}deg`,'--ty':`${-tilt.y*4}deg`}}>
          <div className="browser" style={{transform:`perspective(1400px) rotateY(var(--tx,-8deg)) rotateX(var(--ty,4deg)) scale(${scrollScale})`,transformOrigin:'center top'}}>
            <div className="browser-bar">
              <div className="dots"><span/><span/><span/></div>
              <div className="url">getstudyedge.com/app</div>
              <div className="browser-icons"><span/><span/></div>
            </div>
            <div className="browser-body">
              {/* simulated dashboard */}
              <div className="dash">
                <div className="dash-side">
                  <div className="dash-logo"><div className="dash-logo-mark"/><span>StudyEdge AI</span></div>
                  {['Dashboard','Calendar','Courses','Progress','Study Tools','Study Coach'].map((x,i)=>(
                    <div key={x} className={`dash-nav ${i===0?'active':''}`}>
                      <div className="dash-nav-i"/>
                      <span>{x}</span>
                    </div>
                  ))}
                </div>
                <div className="dash-main">
                  <div className="dash-hd">
                    <div>
                      <div className="dash-date">Friday, April 17</div>
                      <div className="dash-hello">Good afternoon, Alex</div>
                    </div>
                    <div className="dash-streak">🔥 12 day streak</div>
                  </div>

                  <div className="dash-stats">
                    <TickingCounter value={12} label="Day streak"/>
                    <TickingCounter value={7} label="Sessions this week"/>
                    <TickingCounter value={9} label="Hours studied" suffix="h"/>
                  </div>

                  <div className="dash-panel up-next">
                    <div>
                      <div className="un-k">UP NEXT · TODAY · 2:00 PM</div>
                      <div className="un-t">PSYC 101: Memory & Cognition</div>
                      <div className="un-s">Active Recall Lockdown · 60 min</div>
                    </div>
                    <div className="un-btns">
                      <div className="un-b1">Start Session</div>
                    </div>
                  </div>

                  <div className="dash-row">
                    <div className="dash-panel heat-panel">
                      <div className="panel-h">
                        <span>Consistency</span>
                        <span className="panel-v">20 weeks</span>
                      </div>
                      <StreakHeatmap/>
                      <div className="heat-legend">
                        <span>Less</span>
                        <div className="lg-cell" style={{background:'rgba(255,255,255,0.04)'}}/>
                        <div className="lg-cell" style={{background:'rgba(99,102,241,0.25)'}}/>
                        <div className="lg-cell" style={{background:'rgba(99,102,241,0.5)'}}/>
                        <div className="lg-cell" style={{background:'rgba(124,58,237,0.75)'}}/>
                        <div className="lg-cell" style={{background:'#a78bfa'}}/>
                        <span>More</span>
                      </div>
                    </div>
                    <div className="dash-panel ring-panel">
                      <div className="panel-h"><span>This week</span></div>
                      <WeeklyRing pct={72}/>
                    </div>
                  </div>

                  <div className="dash-row2">
                    <div className="dash-panel courses-panel">
                      <div className="panel-h"><span>Your courses</span><span className="panel-v">5 / 7</span></div>
                      <div className="mcc-grid">
                        <MiniCourseCard code="PSYC 101" name="Intro to Psychology" color="#60a5fa" pct={70} delay={100}/>
                        <MiniCourseCard code="CALC II" name="Calculus" color="#a78bfa" pct={64} delay={200}/>
                        <MiniCourseCard code="BIO 1010" name="General Biology" color="#34d399" pct={86} delay={300}/>
                        <MiniCourseCard code="ECON 201" name="Microeconomics" color="#fb923c" pct={60} delay={400}/>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

          {/* Floating cards */}
          <div className="float-card fc-timer"><TimerChip/></div>
          <div className="float-card fc-session">
            <div className="fc-k">SESSION PLAN READY</div>
            <div className="fc-t">Memory, Perception & Brain</div>
            <div className="fc-bar">
              <div className="fcb" style={{background:'#a78bfa',flex:1}}/>
              <div className="fcb" style={{background:'#60a5fa',flex:2}}/>
              <div className="fcb" style={{background:'#a78bfa',flex:1}}/>
              <div className="fcb" style={{background:'#60a5fa',flex:2}}/>
              <div className="fcb" style={{background:'#34d399',flex:1}}/>
              <div className="fcb" style={{background:'#a78bfa',flex:2}}/>
              <div className="fcb" style={{background:'#60a5fa',flex:1}}/>
              <div className="fcb" style={{background:'#a78bfa',flex:2}}/>
              <div className="fcb" style={{background:'#34d399',flex:1}}/>
            </div>
            <div className="fc-meta"><span>9 blocks</span><span>70 min</span></div>
          </div>
          <div className="float-card fc-grade">
            <div className="fc-g-k">PROJECTED GRADE</div>
            <div className="fc-g-v"><span className="fc-g-n">85.2</span><span className="fc-g-p">% A</span></div>
            <div className="fc-g-delta">+0.2% vs target</div>
          </div>

        </div>
      </div>
    </section>
  );
}

window.Hero = Hero;
