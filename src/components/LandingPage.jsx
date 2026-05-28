import { useState, useEffect, useRef } from 'react'

function FeatureCard({ color, icon, eyebrow, title, desc, children }) {
  const onMove = (e) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    const ry = (px - 0.5) * 10
    const rx = -(py - 0.5) * 10
    el.style.setProperty('--ry', `${ry}deg`)
    el.style.setProperty('--rx', `${rx}deg`)
    // also update a cursor-following inner glow
    el.style.setProperty('--gx', `${px * 100}%`)
    el.style.setProperty('--gy', `${py * 100}%`)
  }
  return (
    <div
      className="se-tilt"
      onMouseMove={onMove}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${color}55`
        e.currentTarget.style.boxShadow = `0 26px 60px rgba(0,0,0,0.4), 0 0 0 1px ${color}22`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.setProperty('--rx', '0deg')
        e.currentTarget.style.setProperty('--ry', '0deg')
      }}
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, overflow: 'hidden',
        '--gx': '50%', '--gy': '50%',
      }}
    >
      {/* Cursor-tracking inner glow */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `radial-gradient(380px circle at var(--gx) var(--gy), ${color}1a, transparent 50%)`,
        opacity: 0.9,
      }} />
      {/* Soft accent halo, top-right */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -40, right: -40,
        width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(closest-side, ${color}1f, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        background: `linear-gradient(160deg, ${color}10 0%, rgba(0,0,0,0.30) 60%, rgba(0,0,0,0.32) 100%)`,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        minHeight: 200, position: 'relative',
      }}>
        {children}
      </div>
      <div style={{ padding: '20px 24px 28px', position: 'relative' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${color}1c`, border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, marginBottom: 14,
          boxShadow: `0 6px 18px ${color}22`,
        }}>
          {icon}
        </div>
        {eyebrow && (
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: color, marginBottom: 8, opacity: 0.85,
          }}>{eyebrow}</div>
        )}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: '-0.015em' }}>{title}</h3>
        <p style={{ fontSize: 13.5, color: 'rgba(226,232,240,0.55)', lineHeight: 1.6, letterSpacing: '-0.005em' }}>{desc}</p>
      </div>
    </div>
  )
}

export default function LandingPage({ onGetStarted }) {
  const [scrollY, setScrollY] = useState(0)
  const [stickyDismissed, setStickyDismissed] = useState(
    () => sessionStorage.getItem('sticky_bar_dismissed') === '1'
  )

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const heroStageRef = useRef(null)
  useEffect(() => {
    const stage = heroStageRef.current
    if (!stage) return
    const STAGE_W = 1920
    const scale = () => {
      const w = stage.parentElement.offsetWidth
      stage.style.transform = `scale(${w / STAGE_W})`
    }
    const ro = new ResizeObserver(scale)
    ro.observe(stage.parentElement)
    scale()
    return () => ro.disconnect()
  }, [])

  const goTrial = () => window.location.href = '/app?signup=1&plan=pro&billing=weekly&trial=1'

  const [pricingPeriod, setPricingPeriod] = useState('weekly')
  const goCheckout = (plan, period) => {
    const trialParam = plan === 'pro' ? '&trial=1' : ''
    window.location.href = `/app?signup=1&plan=${plan}&billing=${period}${trialParam}`
  }
  const goSignupFree = () => window.location.href = '/app?signup=1'

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const scrollToHow = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Scroll-triggered reveals — any element with [data-reveal] fades up on enter.
  // Sibling stagger via [data-reveal-delay="1|2|3"].
  const revealRoot = useRef(null)
  useEffect(() => {
    const els = revealRoot.current?.querySelectorAll('[data-reveal]')
    if (!els || !els.length) return
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-revealed')
          io.unobserve(e.target)
        }
      }),
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Hero cursor-following spotlight — sets --sx/--sy on the hero section element.
  const heroSpotlightRef = useRef(null)
  useEffect(() => {
    const el = heroSpotlightRef.current
    if (!el) return
    let raf = 0
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 100
      const y = ((e.clientY - r.top) / r.height) * 100
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--sx', `${x}%`)
        el.style.setProperty('--sy', `${y}%`)
      })
    }
    el.addEventListener('mousemove', onMove)
    return () => { el.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [])

  // Animated stat counters — count from 0 → target when scrolled into view.
  // Targets are read from data-count-to on each .se-count element inside .se-counter-band.
  const counterBandRef = useRef(null)
  useEffect(() => {
    const root = counterBandRef.current
    if (!root) return
    const els = Array.from(root.querySelectorAll('.se-count'))
    if (!els.length) return
    const ease = (t) => 1 - Math.pow(1 - t, 3)
    const animate = (el) => {
      const target = parseFloat(el.dataset.countTo || '0')
      const suffix = el.dataset.countSuffix || ''
      const decimals = parseInt(el.dataset.countDecimals || '0', 10)
      const dur = 1700
      const t0 = performance.now()
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur)
        const v = target * ease(k)
        el.textContent = v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix
        if (k < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animate(e.target)
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.4 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Live "studying right now" badge — gently fluctuates between min/max each tick.
  const [liveNow, setLiveNow] = useState(() => 832 + Math.floor(Math.random() * 40))
  useEffect(() => {
    const id = setInterval(() => {
      setLiveNow((prev) => {
        const delta = Math.floor(Math.random() * 7) - 2
        const next = Math.max(780, Math.min(940, prev + delta))
        return next
      })
    }, 4200)
    return () => clearInterval(id)
  }, [])

  // Magnetic CTA — small translation toward cursor on hover.
  const magneticHandlers = (strength = 0.25, maxPx = 10) => ({
    onMouseMove: (e) => {
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = (e.clientX - cx) * strength
      const dy = (e.clientY - cy) * strength
      const clamp = (v) => Math.max(-maxPx, Math.min(maxPx, v))
      el.style.setProperty('--mx', `${clamp(dx)}px`)
      el.style.setProperty('--my', `${clamp(dy)}px`)
    },
    onMouseLeave: (e) => {
      const el = e.currentTarget
      el.style.setProperty('--mx', '0px')
      el.style.setProperty('--my', '0px')
    },
  })

  // 3D tilt — sets --rx/--ry on card based on cursor position.
  const tiltHandlers = (max = 8) => ({
    onMouseMove: (e) => {
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width  // 0..1
      const py = (e.clientY - r.top) / r.height  // 0..1
      const ry = (px - 0.5) * max * 2
      const rx = -(py - 0.5) * max * 2
      el.style.setProperty('--ry', `${ry}deg`)
      el.style.setProperty('--rx', `${rx}deg`)
    },
    onMouseLeave: (e) => {
      const el = e.currentTarget
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--ry', '0deg')
    },
  })

  // ─────────────────────────────────────────────────────────────────────
  // Headline A/B variants — current default is "While others cram. You execute."
  // Documented alternates for future tests (do not silently swap — A/B in code/cms):
  //   B: "Built to raise your GPA."        — outcome-led, specific to the result
  //   C: "Your AI study system. Your next A." — system + outcome, two-beat
  //   D: "Stop studying harder. Study what matters." — contrast-led, problem-first
  // Default kept for now; revisit once we have data from any of the three.
  // ─────────────────────────────────────────────────────────────────────

  return (
    /* intentionally dark — marketing landing page; the app shell itself is light-themed */
    <div ref={revealRoot} style={{ backgroundColor: '#060614', color: '#e2e8f0', minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        [data-reveal] { opacity: 0; transform: translateY(18px); transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1); }
        [data-reveal].is-revealed { opacity: 1; transform: translateY(0); }
        [data-reveal][data-reveal-delay="1"] { transition-delay: 0.08s; }
        [data-reveal][data-reveal-delay="2"] { transition-delay: 0.16s; }
        [data-reveal][data-reveal-delay="3"] { transition-delay: 0.24s; }
        @media (prefers-reduced-motion: reduce) {
          [data-reveal] { opacity: 1; transform: none; transition: none; }
        }
        /* Atmospheric layer — sits behind content, above page bg */
        .se-section { position: relative; overflow: hidden; isolation: isolate; }
        .se-section > * { position: relative; z-index: 1; }
        .se-wash, .se-grid { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        .se-grid {
          background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 28px 28px;
          -webkit-mask-image: radial-gradient(ellipse 80% 65% at 50% 30%, rgba(0,0,0,0.6), transparent 75%);
          mask-image: radial-gradient(ellipse 80% 65% at 50% 30%, rgba(0,0,0,0.6), transparent 75%);
        }
        .se-horizon {
          height: 1px; width: 100%; margin: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.0) 15%, rgba(99,102,241,0.45) 50%, rgba(99,102,241,0.0) 85%, transparent 100%);
          position: relative;
        }
        .se-horizon::after {
          content: ''; position: absolute; left: 50%; top: -120px;
          transform: translateX(-50%);
          width: 600px; height: 240px; pointer-events: none;
          background: radial-gradient(ellipse at center bottom, rgba(99,102,241,0.18), transparent 70%);
          filter: blur(8px);
        }
        /* JetBrains Mono for data/numerics + Plus Jakarta Sans (display) */
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
        .se-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace; font-feature-settings: 'tnum' 1, 'cv11' 1; }
        .se-display { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; letter-spacing: -0.035em; }

        /* Aurora — slow-drifting conic gradient blob */
        @keyframes se-aurora {
          0%   { transform: translate3d(0,0,0) rotate(0deg) scale(1); }
          33%  { transform: translate3d(-4%, 3%, 0) rotate(120deg) scale(1.1); }
          66%  { transform: translate3d(3%, -3%, 0) rotate(240deg) scale(1.05); }
          100% { transform: translate3d(0,0,0) rotate(360deg) scale(1); }
        }
        .se-aurora {
          position: absolute; inset: -20%; pointer-events: none; z-index: 0;
          background:
            conic-gradient(from 0deg at 50% 50%,
              rgba(99,102,241,0.22) 0%, rgba(124,92,252,0.16) 18%,
              rgba(45,212,191,0.12) 38%, rgba(244,114,182,0.14) 58%,
              rgba(124,92,252,0.16) 78%, rgba(99,102,241,0.22) 100%);
          filter: blur(80px);
          opacity: 0.55;
          animation: se-aurora 28s linear infinite;
        }

        /* Cursor spotlight overlay (uses --sx/--sy CSS vars from JS) */
        .se-spotlight {
          position: absolute; inset: 0; pointer-events: none; z-index: 2;
          background: radial-gradient(circle 460px at var(--sx, 50%) var(--sy, 50%),
            rgba(165,180,252,0.16), rgba(99,102,241,0.06) 35%, transparent 65%);
          transition: background 0.18s ease;
          mix-blend-mode: screen;
        }

        /* Hero headline — gradient cycling text */
        @keyframes se-gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        .se-gradient-text {
          background: linear-gradient(90deg,
            #ffffff 0%, #c7c8ff 20%, #a5b4fc 35%, #c4b5fd 50%,
            #a5b4fc 65%, #c7c8ff 80%, #ffffff 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: se-gradient-shift 7s ease-in-out infinite;
        }

        /* Marquee — endless horizontal scroll */
        @keyframes se-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .se-marquee-wrap {
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%);
        }
        .se-marquee-track {
          display: inline-flex; gap: 36px; white-space: nowrap;
          animation: se-marquee 38s linear infinite;
          will-change: transform;
        }
        .se-marquee-wrap:hover .se-marquee-track { animation-play-state: paused; }

        /* Twinkle — for decorative stars/dots */
        @keyframes se-twinkle {
          0%, 100% { opacity: 0.25; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.4); }
        }
        .se-twinkle { animation: se-twinkle 3.4s ease-in-out infinite; }

        /* Drift — floating decorative items */
        @keyframes se-drift {
          0%, 100% { transform: translateY(0) translateX(0); }
          50%      { transform: translateY(-14px) translateX(8px); }
        }
        .se-drift { animation: se-drift 9s ease-in-out infinite; }

        /* 3D tilt — applied via inline transform using --rx/--ry */
        .se-tilt {
          transform-style: preserve-3d;
          transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateZ(0);
          transition: transform 0.25s cubic-bezier(0.22,1,0.36,1);
          will-change: transform;
        }
        .se-tilt:hover { transition: transform 0.08s ease-out; }

        /* Magnetic — primary CTA uses --mx/--my for nudge */
        .se-magnetic {
          transform: translate3d(var(--mx, 0px), var(--my, 0px), 0);
          transition: transform 0.25s cubic-bezier(0.22,1,0.36,1);
          will-change: transform;
        }

        /* Shimmer — for buttons/labels */
        @keyframes se-shimmer-x {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .se-shimmer { position: relative; overflow: hidden; }
        .se-shimmer::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
          transform: translateX(-100%);
          animation: se-shimmer-x 3.8s ease-in-out infinite;
        }

        /* Live pulse ring */
        @keyframes se-ping {
          0%   { transform: scale(1); opacity: 0.7; }
          80%  { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .se-ping::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          background: currentColor; animation: se-ping 1.8s cubic-bezier(0,0,0.2,1) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .se-aurora, .se-spotlight, .se-gradient-text, .se-marquee-track,
          .se-twinkle, .se-drift, .se-shimmer::before, .se-ping::after { animation: none !important; }
          .se-tilt, .se-magnetic { transform: none !important; }
        }

        /* Hero mockup live animations */
        @keyframes se-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes se-grow-w { from { width: 0%; } }
        @keyframes se-grow-h { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes se-pulse-glow {
          0%, 100% { box-shadow: 0 6px 16px rgba(234,88,12,0.28); }
          50% { box-shadow: 0 8px 26px rgba(234,88,12,0.55), 0 0 0 4px rgba(234,88,12,0.10); }
        }
        @keyframes se-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.6; }
        }
        @keyframes se-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .se-row { animation: se-row-in 0.55s cubic-bezier(0.22,1,0.36,1) both; }
        .se-bar-fill { animation: se-grow-w 1.4s cubic-bezier(0.22,1,0.36,1) both; animation-delay: 0.6s; }
        .se-bar-grow { transform-origin: bottom center; animation: se-grow-h 0.8s cubic-bezier(0.22,1,0.36,1) both; }
        .se-pulse { animation: se-pulse-glow 2.6s ease-in-out infinite; }
        .se-pulse-dot { animation: se-pulse-dot 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .se-row, .se-bar-fill, .se-bar-grow, .se-pulse, .se-pulse-dot { animation: none !important; }
        }
      `}</style>

      {/* Fixed full-page noise grain — pointer-events:none, opacity 0.035, sits above bg/below text */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', opacity: 0.04,
        mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        backgroundSize: '220px 220px',
      }} />

      {/* ── Sticky bottom trial bar — glass + brand ── */}
      {!stickyDismissed && scrollY > 300 && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: 'rgba(11,12,32,0.78)',
          border: '1px solid rgba(99,102,241,0.30)',
          borderRadius: 999,
          padding: '8px 8px 8px 18px',
          display: 'inline-flex', alignItems: 'center', gap: 14,
          flexWrap: 'wrap',
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          boxShadow: '0 22px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px rgba(99,102,241,0.18)',
          maxWidth: 'calc(100% - 32px)', justifyContent: 'center',
        }}>
          <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8, color: '#22c55e', flexShrink: 0 }}>
            <span className="se-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
          </span>
          <span style={{ fontSize: 13.5, color: '#e2e8f0', fontWeight: 500, letterSpacing: '-0.005em' }}>
            <strong style={{ color: '#fff', fontWeight: 700 }}>Try Pro free for 3 days</strong> — $2.99/wk after, cancel anytime
          </span>
          <button
            onClick={goTrial}
            className="se-magnetic"
            {...magneticHandlers(0.25, 5)}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none', borderRadius: 999, padding: '9px 18px',
              fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 8px 24px rgba(99,102,241,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
              display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '-0.005em',
            }}
          >
            Start free trial
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={() => { sessionStorage.setItem('sticky_bar_dismissed', '1'); setStickyDismissed(true) }}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(226,232,240,0.6)', width: 26, height: 26, borderRadius: '50%',
              fontSize: 14, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrollY > 40 ? 'rgba(6,6,20,0.92)' : 'transparent',
        backdropFilter: scrollY > 40 ? 'blur(16px)' : 'none',
        borderBottom: scrollY > 40 ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/favicon.png"
            alt="StudyEdge AI"
            style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'contain' }}
          />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>StudyEdge AI</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onGetStarted('login')}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              color: '#e2e8f0', borderRadius: 10, padding: '9px 20px',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.target.style.borderColor = 'rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
          >
            Sign in
          </button>
          <button
            onClick={() => onGetStarted('signup')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none', color: '#fff', borderRadius: 10, padding: '9px 22px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 20px rgba(99,102,241,0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.target.style.boxShadow = '0 0 30px rgba(99,102,241,0.5)'}
            onMouseLeave={e => e.target.style.boxShadow = '0 0 20px rgba(99,102,241,0.3)'}
          >
            Get Started Free
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section
        ref={heroSpotlightRef}
        aria-label="StudyEdge landing hero"
        style={{
          position: 'relative', width: '100%', aspectRatio: '16/5',
          overflow: 'hidden', background: '#060614', isolation: 'isolate',
        }}
      >
        {/* Aurora — slow-drifting conic gradient */}
        <div aria-hidden="true" className="se-aurora" />
        {/* Cursor-following spotlight */}
        <div aria-hidden="true" className="se-spotlight" />
        {/* Twinkling decorative stars */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
          {[
            { x: 12, y: 22, c: '#a5b4fc', s: 4, d: 0 },
            { x: 22, y: 70, c: '#c4b5fd', s: 3, d: 0.6 },
            { x: 34, y: 14, c: '#86efac', s: 3, d: 1.2 },
            { x: 47, y: 82, c: '#f9a8d4', s: 4, d: 1.8 },
            { x: 64, y: 18, c: '#7dd3fc', s: 3, d: 0.3 },
            { x: 78, y: 64, c: '#a5b4fc', s: 4, d: 2.4 },
            { x: 89, y: 28, c: '#fbbf24', s: 3, d: 1.0 },
            { x: 92, y: 88, c: '#c4b5fd', s: 4, d: 0.9 },
          ].map((s, i) => (
            <span
              key={i}
              className="se-twinkle"
              style={{
                position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
                width: s.s, height: s.s, borderRadius: '50%',
                background: s.c,
                boxShadow: `0 0 10px ${s.c}, 0 0 18px ${s.c}88`,
                animationDelay: `${s.d}s`,
              }}
            />
          ))}
        </div>
        {/* 1920×600 stage — scaled to fill container width */}
        <div ref={heroStageRef} style={{
          position: 'absolute', inset: 0,
          width: 1920, height: 600,
          transformOrigin: 'top left',
        }}>

          {/* Background: frost */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(900px 480px at 72% 55%, #0d1117 0%, rgba(13,17,23,0.55) 35%, rgba(13,17,23,0) 70%)',
            zIndex: 0,
          }} />
          {/* Background: glow */}
          <div aria-hidden="true" style={{
            position: 'absolute', left: '58%', top: '30%',
            width: 1200, height: 800,
            transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(closest-side, rgba(99,102,241,0.18), rgba(99,102,241,0.05) 45%, rgba(99,102,241,0) 75%)',
            filter: 'blur(6px)', zIndex: 0,
          }} />
          {/* Background: dot grid */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            WebkitMaskImage: 'radial-gradient(ellipse 1000px 500px at 65% 50%, rgba(0,0,0,0.55), transparent 70%)',
            maskImage: 'radial-gradient(ellipse 1000px 500px at 65% 50%, rgba(0,0,0,0.55), transparent 70%)',
            zIndex: 0,
          }} />

          {/* Left copy */}
          <div style={{
            position: 'absolute', left: 100, top: '50%', transform: 'translateY(-50%)',
            zIndex: 4, width: 640,
          }}>
            {/* Brand chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '6px 12px 6px 8px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.025)',
              borderRadius: 999, fontSize: 13, fontWeight: 500,
              letterSpacing: '0.01em', color: 'rgba(255,255,255,0.78)',
              marginBottom: 28, backdropFilter: 'blur(8px)',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12, color: '#fff',
                boxShadow: '0 4px 12px rgba(99,102,241,0.45)', flexShrink: 0,
              }}>S</span>
              <span>StudyEdge AI</span>
              <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>getstudyedge.com</span>
            </div>

            {/* Headline */}
            <h1 className="se-display" style={{
              fontSize: 74, lineHeight: 0.98,
              fontWeight: 800, margin: '0 0 22px', color: '#fff',
            }}>
              While others cram.<br />
              <span className="se-gradient-text" style={{
                fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
                fontWeight: 400, letterSpacing: '-0.02em',
              }}>You execute</span><span style={{ color: '#6366F1' }}>.</span>
            </h1>

            {/* Subline */}
            <p style={{
              fontSize: 19, lineHeight: 1.5, color: 'rgba(226,232,240,0.62)',
              margin: '0 0 28px', maxWidth: 520, fontWeight: 400, letterSpacing: '-0.005em',
            }}>
              Your AI study system — plans, coaches, tracks, and tells you exactly where to focus. Every course. All semester.
            </p>

            {/* Primary CTAs */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap',
            }}>
              <button
                onClick={goTrial}
                className="se-magnetic se-shimmer"
                {...magneticHandlers(0.3, 8)}
                style={{
                  background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                  border: 'none', color: '#fff', borderRadius: 12,
                  padding: '14px 26px', fontSize: 15.5, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 10px 30px rgba(99,102,241,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset',
                  letterSpacing: '-0.01em',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  position: 'relative',
                }}
              >
                <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Start free 3-day trial
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </button>
              <button
                onClick={scrollToHow}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#e2e8f0', borderRadius: 12,
                  padding: '13px 22px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  letterSpacing: '-0.01em', transition: 'border-color 0.2s ease, background 0.2s ease',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
              >
                See how it works
              </button>
            </div>
            <div style={{
              fontSize: 12.5, color: 'rgba(226,232,240,0.45)', letterSpacing: '-0.005em',
              marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              No credit card required · Cancel anytime
            </div>

            {/* Social proof — live "studying right now" badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                padding: '6px 14px 6px 10px',
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.30)',
                borderRadius: 999, fontSize: 13, fontWeight: 500,
                color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.005em',
                backdropFilter: 'blur(8px)',
              }}>
                <span style={{ position: 'relative', display: 'inline-block', width: 7, height: 7, color: '#22c55e' }}>
                  <span className="se-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                </span>
                <span className="se-mono" style={{ color: '#86efac', fontWeight: 700, fontSize: 13, letterSpacing: '0.01em' }}>{liveNow.toLocaleString()}</span>
                <span style={{ color: 'rgba(226,232,240,0.7)' }}>studying right now</span>
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 13.5, color: 'rgba(255,255,255,0.55)', fontWeight: 500, letterSpacing: '-0.005em',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#6366F1',
                  boxShadow: '0 0 10px #6366F1', flexShrink: 0,
                }} />
                <strong className="se-mono" style={{ color: '#fff', fontWeight: 600, fontSize: 13.5 }}>9.6h</strong> studied this week
              </span>
            </div>
          </div>

          {/* Mockup */}
          <div style={{
            position: 'absolute', right: -30, top: 10, zIndex: 3,
            perspective: 2400, perspectiveOrigin: '50% 50%',
            width: 940, height: 580,
          }}>
            <div style={{
              width: 940, height: 580,
              transform: 'rotateX(4deg) rotateY(-7deg) rotateZ(0.3deg)',
              transformOrigin: '50% 50%', transformStyle: 'preserve-3d',
              boxShadow: '0 50px 100px rgba(0,0,0,0.65), 0 25px 50px rgba(0,0,0,0.45), 0 0 80px rgba(99,102,241,0.10), 0 0 0 1px rgba(255,255,255,0.06)',
              borderRadius: 12, overflow: 'hidden', background: '#1c1c1e',
            }}>
              {/* Browser chrome */}
              <div style={{
                height: 34, background: '#1c1c1e',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12,
              }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#ff5f57','#febc2e','#28c840'].map(c => (
                    <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  ))}
                </div>
                <div style={{
                  flex: 1, maxWidth: 380, margin: '0 auto',
                  background: '#2a2a2d', borderRadius: 7, padding: '6px 12px',
                  fontSize: 12, color: 'rgba(255,255,255,0.55)',
                  display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.005em',
                }}>
                  <svg style={{ width: 10, height: 10, opacity: 0.6, flexShrink: 0 }} viewBox="0 0 16 16" fill="none">
                    <path d="M4 7V5a4 4 0 1 1 8 0v2M3.5 7h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <span>app.getstudyedge.com<strong style={{ color: '#fff', fontWeight: 500 }}>/dashboard</strong></span>
                </div>
                <div style={{ width: 60 }} />
              </div>

              {/* App interior */}
              <div style={{
                height: 546, background: '#F5F4EF', color: '#0F172A',
                padding: '20px 26px 0', overflow: 'hidden', fontSize: 12.5,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}>
                <div style={{ color: '#6366F1', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>FRIDAY, MAY 22</div>
                <h2 style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 30, lineHeight: 1.02, margin: '0 0 6px', letterSpacing: '-0.01em', color: '#0F172A' }}>
                  Good morning<span style={{ color: '#6366F1' }}>.</span>
                </h2>
                <p style={{ color: '#64748B', fontSize: 12, marginBottom: 16, letterSpacing: '-0.005em' }}>9 sessions on the schedule. Linear Algebra exam in 3 days.</p>

                {/* Top grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14, marginBottom: 14 }}>
                  {/* Up Next */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)', position: 'relative', overflow: 'hidden', minHeight: 170 }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(254,215,170,0.45) 0%, rgba(255,255,255,0) 55%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#EA580C', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <span className="se-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} /> UP NEXT TODAY
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: '#EA580C', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, whiteSpace: 'nowrap' }}>
                        Organic Chemistry <span style={{ color: '#94A3B8', fontWeight: 400 }}>· 9:00 AM → 10:00 AM</span>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#0F172A', display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                        Practice <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400, letterSpacing: 0 }}>60 min</span>
                      </div>
                      <button className="se-pulse" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EA580C', color: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 600, fontSize: 12.5, boxShadow: '0 6px 16px rgba(234,88,12,0.28)', letterSpacing: '-0.005em', fontFamily: 'inherit', cursor: 'pointer', border: 'none' }}>
                        <span style={{ display: 'block', width: 0, height: 0, borderLeft: '7px solid #fff', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' }} />
                        Start session
                      </button>
                      <div style={{ marginTop: 14, display: 'flex', gap: 18, alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                        {['Mark done','Skip','Pomodoro · 25 + 5'].map((t, i, a) => (
                          <span key={t} style={i < a.length - 1 ? { paddingRight: 18, borderRight: '1px solid #E5E7EB' } : {}}>{t}</span>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>AI-structured session blocks · recall checkpoints</div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> QUICK ACTIONS
                    </div>
                    {[
                      { icon: '◫', bg: '#EEF2FF', color: '#4F46E5', title: 'Study Coach', desc: 'AI-powered weekly plan' },
                      { icon: '◎', bg: '#ECFDF5', color: '#059669', title: 'Grade Hub', desc: 'Track grades and targets' },
                      { icon: '▤', bg: '#F3E8FF', color: '#7C3AED', title: 'Flashcards', desc: 'Test your knowledge' },
                    ].map(({ icon, bg, color, title, desc }) => (
                      <div key={title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 4px', borderBottom: '1px solid #F1F5F9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{icon}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: '#0F172A' }}>{title}</div>
                            <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 1 }}>{desc}</div>
                          </div>
                        </div>
                        <span style={{ color: '#CBD5E1', fontSize: 14 }}>›</span>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ gridColumn: '1/-1', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8', textAlign: 'center', marginBottom: 2 }}>STUDY HACKS</div>
                      {[
                        { bg: '#F5F3FF', border: '#EDE9FE', icon: '◫', color: '#7C3AED', name: 'Brain Dump' },
                        { bg: '#FEF2F2', border: '#FEE2E2', icon: '◈', color: '#EF4444', name: 'Rescue Plan' },
                        { bg: '#FFF7ED', border: '#FED7AA', icon: '⚡', color: '#EA580C', name: 'Quiz Burst' },
                      ].map(({ bg, border, icon, color, name }) => (
                        <div key={name} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, fontSize: 12, color }}>{icon}</div>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0F172A' }}>{name}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, padding: '9px 12px', background: '#F8FAFC', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B' }}>
                      <div><strong style={{ color: '#0F172A' }}>9.7h</strong> this week · <strong style={{ color: '#0F172A' }}>78%</strong> recall</div>
                      <div style={{ color: '#6366F1', fontWeight: 600 }}>Progress →</div>
                    </div>
                  </div>
                </div>

                {/* Brief */}
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#EA580C', marginBottom: 4 }}>● TODAY'S BRIEF</div>
                    <div style={{ color: '#0F172A', fontWeight: 500 }}>Linear Algebra exam in 3 days. Add focused review sessions this week to stay on track.</div>
                  </div>
                  <button style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 500, color: '#0F172A', whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>View schedule</button>
                </div>

                {/* Bottom grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 18 }}>
                  {/* Courses */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> COURSES
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>Hrs · Recall <span style={{ color: '#4F46E5', fontWeight: 500, marginLeft: 8 }}>View all</span></div>
                    </div>
                    {[
                      { name: 'Cell Biology', last: 'Last studied today', hours: '7.2h', sessions: '12 sessions', status: 'On track', action: '88.5% · A', bar: '#22C55E', pillBg: '#FFEDD5', pillColor: '#C2410C' },
                      { name: 'Organic Chemistry', last: 'Last studied today', hours: '2.0h', sessions: '4 sessions', status: 'Needs Work', action: 'Brain Dump →', bar: '#F97316', pillBg: '#FFEDD5', pillColor: '#C2410C' },
                      { name: 'Cognitive Psychology', last: 'Last studied yesterday', hours: '2.2h', sessions: '5 sessions', status: 'Needs Work', action: 'Brain Dump →', bar: '#A855F7', pillBg: '#FFEDD5', pillColor: '#C2410C' },
                      { name: 'Linear Algebra', last: 'Last studied today · exam in 3 days', hours: '3.6h', sessions: '8 sessions', status: 'Priority', action: 'Rescue Plan →', bar: '#3B82F6', pillBg: '#FEE2E2', pillColor: '#B91C1C' },
                    ].map(({ name, last, hours, sessions, status, action, bar, pillBg, pillColor }, i) => (
                      <div key={name} className="se-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', padding: i === 0 ? '4px 0 8px' : '8px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9', animationDelay: `${0.35 + i * 0.12}s` }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 3, height: 26, borderRadius: 2, background: bar, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{last}</div>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', textAlign: 'right' }}>{hours}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1, textAlign: 'right' }}>{sessions}</div>
                        </div>
                        <div>
                          <div style={{ background: pillBg, color: pillColor, borderRadius: 999, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{status}</div>
                          <div style={{ color: '#EA580C', fontSize: 10.5, fontWeight: 500, marginTop: 3, textAlign: 'right' }}>{action}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* This Week */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> THIS WEEK
                      </div>
                      <div style={{ background: '#ECFDF5', color: '#059669', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>✓ On pace</div>
                    </div>
                    {[
                      { bg: '#FFF7ED', color: '#EA580C', icon: '◉', label: 'Study streak', value: '14', unit: 'days', delta: '↑ +3' },
                      { bg: '#F8FAFC', color: '#64748B', icon: '◷', label: 'Hours studied', value: '9.6', unit: 'hrs', delta: '↑ +1.4' },
                      { bg: '#ECFDF5', color: '#16A34A', icon: '✓', label: 'Sessions done', value: '8', unit: '', delta: '↑ +2' },
                    ].map(({ bg, color, icon, label, value, unit, delta }, i) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 12, alignItems: 'center', padding: i === 0 ? '6px 0 10px' : '10px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9', fontSize: 13 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 13 }}>{icon}</div>
                        <div style={{ color: '#475569', fontSize: 13 }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', letterSpacing: '-0.02em' }}>{value}{unit && <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginLeft: 3 }}>{unit}</span>}</div>
                        <div style={{ background: '#ECFDF5', color: '#059669', borderRadius: 6, padding: '2px 6px', fontSize: 10.5, fontWeight: 600 }}>{delta}</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', marginBottom: 6 }}>
                        <span>Weekly goal</span>
                        <span style={{ color: '#0F172A', fontWeight: 600 }}>9.6 of 10h</span>
                      </div>
                      <div style={{ height: 6, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                        <div className="se-bar-fill" style={{ width: '96%', height: '100%', background: 'linear-gradient(90deg, #22C55E, #16A34A)', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating card: Grade Hub */}
          <div style={{
            position: 'absolute', zIndex: 6,
            background: '#fff', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.55), 0 15px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
            color: '#0F172A', overflow: 'hidden',
            width: 290, right: 700, bottom: 24, transform: 'rotate(-2deg)',
            padding: '16px 18px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> Grade Hub
              </div>
              <div style={{ fontSize: 10.5, color: '#16A34A', fontWeight: 600, background: '#ECFDF5', padding: '3px 8px', borderRadius: 999 }}>3.78 GPA</div>
            </div>
            {[
              { dot: '#22C55E', name: 'Cell Biology',    pct: '88.5%', letter: 'A',  lc: '#16A34A' },
              { dot: '#3B82F6', name: 'Linear Algebra',  pct: '90.2%', letter: 'A−', lc: '#22C55E' },
              { dot: '#F97316', name: 'Organic Chem',    pct: '86.4%', letter: 'B+', lc: '#4F46E5' },
              { dot: '#A855F7', name: 'Cognitive Psyc',  pct: '82.0%', letter: 'B',  lc: '#64748B' },
            ].map(({ dot, name, pct, letter, lc }, i) => (
              <div key={name} className="se-row" style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto auto', gap: 10, alignItems: 'center', padding: i === 0 ? '2px 0 9px' : '9px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9', animationDelay: `${0.5 + i * 0.1}s` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.005em' }}>{name}</div>
                <div style={{ fontSize: 12.5, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{pct}</div>
                <div style={{ fontSize: 13, fontWeight: 800, width: 30, textAlign: 'right', letterSpacing: '-0.02em', color: lc }}>{letter}</div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Cumulative GPA</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1, color: '#0F172A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>3.78</div>
            </div>
          </div>

          {/* Floating card: Streak */}
          <div style={{
            position: 'absolute', zIndex: 6,
            background: '#fff', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.55), 0 15px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
            color: '#0F172A', overflow: 'hidden',
            width: 270, right: 110, bottom: 12, transform: 'rotate(2deg)',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg, #FB923C, #EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 6px 14px rgba(251,146,60,0.4)', flexShrink: 0 }}>🔥</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: '#0F172A', lineHeight: 1 }}>
                  14<span style={{ fontSize: 13, fontWeight: 500, color: '#64748B', marginLeft: 4, letterSpacing: 0 }}>day streak</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, letterSpacing: '-0.005em' }}>Longest this semester</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 32, marginBottom: 8 }}>
              {[30,45,38,60,55,72,68,80,75,88,92,96,60,60].map((h, i) => (
                <div key={i} className="se-bar-grow" style={{ flex: 1, height: `${h}%`, background: i >= 12 ? '#E2E8F0' : 'linear-gradient(180deg, #6366F1, #4F46E5)', borderRadius: 2, opacity: i >= 12 ? 1 : 0.9, animationDelay: `${0.7 + i * 0.05}s` }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
              <span>Hours this week</span>
              <strong style={{ color: '#0F172A', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>9.6 hrs</strong>
            </div>
          </div>

          {/* Vignette */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.4) 100%), radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)',
          }} />
        </div>
      </section>

      {/* ── Trust strip: endless marquee of programs ── */}
      <section className="se-section" style={{
        margin: '0 auto', padding: '56px 0 28px',
      }}>
        <div data-reveal style={{ textAlign: 'center', maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.22em',
            color: 'rgba(199,210,254,0.5)', textTransform: 'uppercase',
            marginBottom: 26,
          }}>
            Built for serious students across
          </div>
        </div>
        <div className="se-marquee-wrap">
          <div className="se-marquee-track" style={{
            fontSize: 15, fontWeight: 600, color: 'rgba(226,232,240,0.62)',
            letterSpacing: '-0.005em',
          }}>
            {/* Two duplicate tracks for seamless loop */}
            {[0, 1].map((dupKey) => (
              <div key={dupKey} style={{ display: 'inline-flex', alignItems: 'center', gap: 36 }}>
                {[
                  { name: 'Pre-Med', icon: '🩺', color: '#f9a8d4' },
                  { name: 'STEM', icon: '⚛', color: '#a5b4fc' },
                  { name: 'Engineering', icon: '⚙', color: '#fbbf24' },
                  { name: 'Liberal Arts', icon: '✦', color: '#c4b5fd' },
                  { name: 'MCAT', icon: '◆', color: '#86efac' },
                  { name: 'LSAT', icon: '⚖', color: '#7dd3fc' },
                  { name: 'GRE', icon: '◈', color: '#fda4af' },
                  { name: 'Pre-Law', icon: '§', color: '#a5b4fc' },
                  { name: 'Computer Science', icon: '〈〉', color: '#5eead4' },
                  { name: 'Business', icon: '◊', color: '#fcd34d' },
                  { name: 'Nursing', icon: '✚', color: '#fda4af' },
                  { name: 'Grad Programs', icon: '◉', color: '#c4b5fd' },
                ].map((tag, i, arr) => (
                  <span key={`${dupKey}-${tag.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 9,
                      padding: '7px 14px',
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 999,
                      transition: 'border-color 0.2s ease, background 0.2s ease',
                    }}>
                      <span style={{ color: tag.color, fontSize: 14, fontWeight: 700, textShadow: `0 0 12px ${tag.color}66` }}>{tag.icon}</span>
                      <span>{tag.name}</span>
                    </span>
                    {i < arr.length - 1 && (
                      <span aria-hidden="true" style={{
                        width: 4, height: 4, borderRadius: '50%',
                        background: 'rgba(99,102,241,0.55)',
                        boxShadow: '0 0 8px rgba(99,102,241,0.6)',
                      }} />
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capability stat band with animated counters ── */}
      <section className="se-section" style={{
        maxWidth: 1100, margin: '0 auto', padding: '8px 24px 12px',
      }}>
        <div ref={counterBandRef} data-reveal style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(99,102,241,0.06)',
          position: 'relative',
        }}>
          {/* Subtle aurora band behind the row */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
            background:
              'radial-gradient(380px 200px at 12% 50%, rgba(99,102,241,0.18), transparent 70%),' +
              'radial-gradient(380px 200px at 88% 50%, rgba(124,92,252,0.18), transparent 70%),' +
              'radial-gradient(380px 200px at 50% 50%, rgba(45,212,191,0.10), transparent 70%)',
          }} />
          {[
            { big: 4,   suffix: '',  decimals: 0, prefix: '',  sub: 'problems no other app solves together', accent: '#818cf8' },
            { big: 60,  suffix: 's', decimals: 0, prefix: '',  sub: 'setup, then your plan is live',           accent: '#c4b5fd' },
            { big: 100, suffix: '%', decimals: 0, prefix: '',  sub: 'of your syllabus, planned end-to-end',    accent: '#5eead4' },
            { big: 1,   suffix: '',  decimals: 0, prefix: '',  sub: 'grade target — backwards from the exam',  accent: '#86efac' },
          ].map((s, i, arr) => (
            <div key={i} style={{
              padding: '34px 24px 30px', textAlign: 'center',
              borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              position: 'relative',
            }}>
              <div aria-hidden="true" style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 220, height: 90, pointerEvents: 'none',
                background: `radial-gradient(closest-side, ${s.accent}2a, transparent 70%)`,
              }} />
              <div style={{ position: 'relative' }}>
                <div className="se-display" style={{
                  fontSize: 64, fontWeight: 800, lineHeight: 0.95,
                  background: `linear-gradient(180deg, #ffffff 0%, ${s.accent} 115%)`,
                  WebkitBackgroundClip: 'text', backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: 14, fontVariantNumeric: 'tabular-nums',
                  textShadow: `0 0 30px ${s.accent}33`,
                }}>
                  <span
                    className="se-count"
                    data-count-to={s.big}
                    data-count-suffix={s.suffix}
                    data-count-decimals={s.decimals}
                  >{s.prefix}0{s.suffix}</span>
                </div>
                <div style={{
                  fontSize: 13.5, color: 'rgba(226,232,240,0.65)',
                  lineHeight: 1.5, letterSpacing: '-0.005em',
                  maxWidth: 230, margin: '0 auto',
                }}>
                  {s.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Hero → How It Works horizon */}
      <div className="se-horizon" style={{ marginTop: 70 }} />

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="se-section"
        style={{
          maxWidth: 1120, margin: '0 auto', padding: '110px 24px 40px',
        }}
      >
        {/* Atmospheric washes */}
        <div aria-hidden="true" className="se-wash" style={{
          background:
            'radial-gradient(700px 480px at 15% 12%, rgba(99,102,241,0.13), transparent 65%),' +
            'radial-gradient(620px 440px at 92% 80%, rgba(124,92,252,0.12), transparent 60%)',
        }} />
        <div aria-hidden="true" className="se-grid" />
        <div data-reveal style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11.5, fontWeight: 600, letterSpacing: '0.18em',
            color: 'rgba(199,210,254,0.85)', textTransform: 'uppercase',
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.22)',
            marginBottom: 22,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', boxShadow: '0 0 10px #6366F1' }} />
            How it works
          </div>
          <h2 style={{
            fontSize: 'clamp(30px, 4.2vw, 50px)', fontWeight: 700,
            color: '#fff', letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 16px',
          }}>
            From your syllabus to your next A.<br />
            <span style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.02em',
              background: 'linear-gradient(180deg, #ffffff 0%, #c7c8ff 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>In three steps.</span>
          </h2>
          <p style={{
            fontSize: 16.5, color: 'rgba(226,232,240,0.55)',
            maxWidth: 560, margin: '0 auto', lineHeight: 1.6, letterSpacing: '-0.005em',
          }}>
            Most students open their notes and start reading. StudyEdge tells you exactly what to study, when, and for how long — and then scores you on what you actually retained.
          </p>
        </div>

        <div style={{
          display: 'grid', gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        }}>
          {[
            {
              num: '01',
              title: 'Add your courses',
              copy: 'Drop your syllabus, paste your class list, or pick from common courses. We pull exam dates, weights, and assignments — automatically.',
              accent: '#6366F1',
              accentSoft: 'rgba(99,102,241,0.10)',
              mockup: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#818cf8', letterSpacing: '0.12em' }}>YOUR COURSES</div>
                    <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.4)' }}>4 added</div>
                  </div>
                  {[
                    { name: 'Organic Chemistry', sub: 'Midterm in 12 days', color: '#F97316', done: true },
                    { name: 'Linear Algebra', sub: 'Exam in 3 days', color: '#3B82F6', done: true },
                    { name: 'Cognitive Psychology', sub: 'Paper due Friday', color: '#A855F7', done: true },
                  ].map((c) => (
                    <div key={c.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 11px', marginBottom: 6,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 9, fontSize: 12,
                    }}>
                      <span style={{ width: 3, height: 22, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ color: 'rgba(226,232,240,0.4)', fontSize: 10.5, marginTop: 1 }}>{c.sub}</div>
                      </div>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M2 5.2l2 2 4-4.4" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 11px',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px dashed rgba(99,102,241,0.35)',
                    borderRadius: 9, fontSize: 12, color: '#a5b4fc',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontWeight: 600 }}>Cell Biology</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(165,180,252,0.7)' }}>Parsing syllabus…</span>
                  </div>
                </div>
              ),
            },
            {
              num: '02',
              title: 'AI builds your plan',
              copy: 'Every week gets a strategy. Every session gets a minute-by-minute blueprint. Every grade gets a target score — backwards from the exam date.',
              accent: '#7c5cfc',
              accentSoft: 'rgba(124,92,252,0.10)',
              mockup: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.12em' }}>SESSION BLUEPRINT</div>
                    <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.4)' }}>60 min · 5 blocks</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-0.005em' }}>Organic Chem — Stereochem</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(226,232,240,0.45)', marginBottom: 12 }}>To hit 88% on the midterm</div>
                  <div style={{ display: 'flex', gap: 3, height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                    {[
                      { flex: 0.8, color: '#a78bfa' },
                      { flex: 2.2, color: '#7c5cfc' },
                      { flex: 1.6, color: '#a5b4fc' },
                      { flex: 0.6, color: '#22c55e' },
                      { flex: 1.4, color: '#a78bfa' },
                    ].map((s, i) => <div key={i} style={{ flex: s.flex, background: s.color }} />)}
                  </div>
                  {[
                    { time: '5m', label: 'Warm-up recall', color: '#a78bfa' },
                    { time: '20m', label: 'R/S configuration deep dive', color: '#7c5cfc' },
                    { time: '15m', label: 'Active recall sprint · 12 problems', color: '#a5b4fc' },
                    { time: '20m', label: 'Mixed-topic quiz · weighted', color: '#a78bfa' },
                  ].map((b, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '6.5px 10px', marginBottom: 4,
                      background: 'rgba(255,255,255,0.035)',
                      borderRadius: 8, borderLeft: `2px solid ${b.color}`,
                      fontSize: 11.5,
                    }}>
                      <span style={{ color: b.color, fontWeight: 700, minWidth: 30, fontSize: 10.5, letterSpacing: '-0.01em' }}>{b.time}</span>
                      <span style={{ color: 'rgba(226,232,240,0.7)' }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              num: '03',
              title: 'Execute every session',
              copy: 'Hit start. Follow the plan. Get scored on recall. Watch your grade target move in real time — and know exactly what to study next.',
              accent: '#22c55e',
              accentSoft: 'rgba(34,197,94,0.10)',
              mockup: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#86efac', letterSpacing: '0.12em' }}>SESSION ACTIVE</div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, fontWeight: 700, color: '#22c55e',
                      padding: '3px 8px', background: 'rgba(34,197,94,0.12)',
                      border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                      LIVE
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    <div style={{ position: 'relative', width: 78, height: 78, flexShrink: 0 }}>
                      <svg width="78" height="78" viewBox="0 0 100 100" aria-hidden="true">
                        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                        <circle cx="50" cy="50" r="44" fill="none" stroke="#22c55e" strokeWidth="7"
                          strokeDasharray="276" strokeDashoffset="86" strokeLinecap="round"
                          transform="rotate(-90 50 50)" />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em' }}>42:18</div>
                        <div style={{ fontSize: 8.5, color: '#22c55e', fontWeight: 700, letterSpacing: '0.06em' }}>RECALL</div>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>R/S Configuration Sprint</div>
                      <div style={{ fontSize: 10.5, color: 'rgba(226,232,240,0.45)', marginBottom: 8 }}>Block 3 of 5</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[1,1,0.6,0,0].map((on, i) => (
                          <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: on === 1 ? '#22c55e' : on > 0 ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.07)' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    padding: '10px 12px', borderRadius: 9,
                    background: 'rgba(34,197,94,0.07)',
                    border: '1px solid rgba(34,197,94,0.22)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 11.5,
                  }}>
                    <div>
                      <div style={{ color: '#86efac', fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', marginBottom: 2 }}>GRADE TARGET</div>
                      <div style={{ color: '#fff', fontWeight: 600, letterSpacing: '-0.01em' }}>78.3% on midterm → keep <span style={{ color: '#22c55e' }}>B+</span></div>
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 800, color: '#22c55e', letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      88.5%
                    </div>
                  </div>
                </div>
              ),
            },
          ].map((step, i) => (
            <div
              key={step.num}
              data-reveal
              data-reveal-delay={String(i + 1)}
              className="se-tilt"
              onMouseMove={tiltHandlers(7).onMouseMove}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${step.accent}55` }}
              onMouseLeave={(e) => {
                e.currentTarget.style.setProperty('--rx', '0deg')
                e.currentTarget.style.setProperty('--ry', '0deg')
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
              }}
              style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 18, padding: '28px 26px 26px',
                overflow: 'hidden',
              }}
            >
              {/* Soft accent glow */}
              <div aria-hidden="true" style={{
                position: 'absolute', top: -40, right: -40,
                width: 180, height: 180, borderRadius: '50%',
                background: `radial-gradient(closest-side, ${step.accent}22, transparent 70%)`,
                pointerEvents: 'none',
              }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    fontFamily: "'Instrument Serif', serif",
                    fontSize: 44, fontWeight: 400, lineHeight: 0.9,
                    color: step.accent, letterSpacing: '-0.04em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {step.num}
                  </div>
                  <div style={{
                    height: 1, flex: 1,
                    background: `linear-gradient(90deg, ${step.accent}55, transparent)`,
                  }} />
                </div>
                <h3 style={{
                  fontSize: 20, fontWeight: 700, color: '#fff',
                  letterSpacing: '-0.02em', margin: '0 0 10px',
                }}>
                  {step.title}
                </h3>
                <p style={{
                  fontSize: 14.5, color: 'rgba(226,232,240,0.6)',
                  lineHeight: 1.6, margin: '0 0 22px', letterSpacing: '-0.005em',
                }}>
                  {step.copy}
                </p>
                <div style={{
                  background: 'rgba(0,0,0,0.28)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 12, padding: 14,
                }}>
                  {step.mockup}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Inline CTA below 3-step */}
        <div data-reveal style={{
          marginTop: 48, textAlign: 'center',
        }}>
          <button
            onClick={goTrial}
            style={{
              background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              border: 'none', color: '#fff', borderRadius: 12,
              padding: '14px 30px', fontSize: 15.5, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(99,102,241,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset',
              letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'transform 0.15s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 14px 38px rgba(99,102,241,0.5), 0 0 0 1px rgba(255,255,255,0.08) inset'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(99,102,241,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset'
            }}
          >
            Try all three free for 3 days
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{
            marginTop: 12, fontSize: 12.5, color: 'rgba(226,232,240,0.4)',
            display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            No credit card required · Cancel anytime
          </div>
        </div>
      </section>

      {/* How It Works → Features horizon */}
      <div className="se-horizon" style={{ marginTop: 40 }} />

      {/* ── Features Grid ── */}
      <section className="se-section" style={{
        maxWidth: 1000, margin: '0 auto', padding: '80px 24px 100px',
      }}>
        {/* Atmospheric washes */}
        <div aria-hidden="true" className="se-wash" style={{
          background:
            'radial-gradient(720px 500px at 85% 8%, rgba(45,212,191,0.10), transparent 60%),' +
            'radial-gradient(620px 460px at 8% 95%, rgba(99,102,241,0.12), transparent 60%)',
        }} />
        <div data-reveal style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11.5, fontWeight: 600, letterSpacing: '0.18em',
            color: 'rgba(94,234,212,0.85)', textTransform: 'uppercase',
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(45,212,191,0.10)',
            border: '1px solid rgba(45,212,191,0.22)',
            marginBottom: 22,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 10px #2dd4bf' }} />
            What's inside
          </div>
          <h2 style={{
            fontSize: 'clamp(30px, 4.2vw, 50px)', fontWeight: 700,
            color: '#fff', letterSpacing: '-0.035em', lineHeight: 1.04, marginBottom: 16,
          }}>
            Everything that decides your grade.<br/>
            <span style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.02em',
              background: 'linear-gradient(180deg, #ffffff 0%, #c7c8ff 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Built into one app.</span>
          </h2>
          <p style={{
            fontSize: 16.5, color: 'rgba(226,232,240,0.55)',
            maxWidth: 580, margin: '0 auto', lineHeight: 1.6, letterSpacing: '-0.005em',
          }}>
            Plan, execute, recall, track — each one wired to your actual courses, syllabus, and exam dates. Not another flashcard app.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>

          {/* ── PRIMARY TIER: Session Blueprint — the differentiator (full-width) ── */}
          <div data-reveal style={{
            gridColumn: '1 / -1',
            position: 'relative',
            background: 'linear-gradient(160deg, rgba(99,102,241,0.10) 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(99,102,241,0.22)',
            borderRadius: 22, overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
            backdropFilter: 'blur(10px)',
            marginBottom: 4,
          }}>
            <div aria-hidden="true" style={{
              position: 'absolute', top: -140, left: -60,
              width: 540, height: 380, borderRadius: '50%',
              background: 'radial-gradient(closest-side, rgba(99,102,241,0.22), transparent 70%)',
              pointerEvents: 'none',
            }} />
            <div aria-hidden="true" style={{
              position: 'absolute', bottom: -120, right: -80,
              width: 480, height: 340, borderRadius: '50%',
              background: 'radial-gradient(closest-side, rgba(124,92,252,0.18), transparent 70%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'relative',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 0,
            }}>
              {/* Left: copy */}
              <div style={{ padding: '40px 32px 40px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.2em',
                  color: '#a5b4fc', textTransform: 'uppercase',
                  padding: '5px 11px', borderRadius: 999,
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.30)',
                  marginBottom: 20, alignSelf: 'flex-start',
                }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 8px #818cf8' }} />
                  The differentiator
                </div>
                <div style={{
                  width: 46, height: 46, borderRadius: 13,
                  background: 'rgba(99,102,241,0.18)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 18,
                  boxShadow: '0 10px 28px rgba(99,102,241,0.30)',
                }}>
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="#a5b4fc"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg>
                </div>
                <h3 style={{
                  fontSize: 'clamp(24px, 2.6vw, 32px)', fontWeight: 700,
                  color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.08, margin: '0 0 12px',
                }}>
                  Sit down knowing exactly what to do.
                </h3>
                <p style={{
                  fontSize: 15, color: 'rgba(226,232,240,0.65)',
                  lineHeight: 1.6, margin: '0 0 20px', letterSpacing: '-0.005em',
                }}>
                  Every session gets a <strong style={{ color: '#fff', fontWeight: 600 }}>minute-by-minute blueprint</strong> — warm-up, deep dive, active recall, mixed quiz. No staring at a syllabus trying to decide where to start.
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                  {[
                    'Built backwards from your exam date',
                    'Adjusts when you miss a session',
                    'Scores you on what you actually retained',
                  ].map((t) => (
                    <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'rgba(226,232,240,0.75)', letterSpacing: '-0.005em' }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'rgba(99,102,241,0.18)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M2 5.2l2 2 4-4.4" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Right: blueprint mockup */}
              <div style={{ padding: '40px 40px 40px 8px', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '100%', borderRadius: 14, padding: '20px 22px 16px',
                  background: 'linear-gradient(160deg, rgba(99,102,241,0.08) 0%, rgba(0,0,0,0.35) 70%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 14px 36px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.16em' }}>SESSION PLAN READY</div>
                    <div style={{ fontSize: 10.5, color: 'rgba(226,232,240,0.5)', fontVariantNumeric: 'tabular-nums' }}>60 min · 5 blocks</div>
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-0.005em' }}>Memory & Encoding · Active Recall</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(226,232,240,0.5)', marginBottom: 14 }}>Aimed at 88% on the midterm</div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 12, borderRadius: 4, overflow: 'hidden', height: 8 }}>
                    <div style={{ flex: 1, background: '#a78bfa' }} />
                    <div style={{ flex: 2, background: '#6366f1' }} />
                    <div style={{ flex: 1.5, background: '#818cf8' }} />
                    <div style={{ flex: 0.8, background: '#22c55e' }} />
                    <div style={{ flex: 1.2, background: '#a78bfa' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                    {['Active Recall','Review','Break','Summary'].map((t,i) => (
                      <span key={i} style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, background: ['#a78bfa22','#6366f122','#22c55e22','#2dd4bf22'][i], color: ['#a78bfa','#818cf8','#22c55e','#2dd4bf'][i], border: `1px solid ${['#a78bfa44','#6366f144','#22c55e44','#2dd4bf44'][i]}`, fontWeight: 600 }}>{t}</span>
                    ))}
                  </div>
                  {[['5 min','Warm-Up Recall','#a78bfa'],['20 min','Core Concepts Deep Dive','#6366f1'],['15 min','Active Recall Sprint · 12 problems','#818cf8'],['20 min','Mixed-topic quiz · weighted','#a78bfa']].map(([time,label,color],i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', background: 'rgba(255,255,255,0.04)', borderRadius: 9, marginBottom: 5, borderLeft: `2px solid ${color}` }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color, minWidth: 38 }}>{time}</span>
                      <span style={{ fontSize: 11.5, color: 'rgba(226,232,240,0.78)', letterSpacing: '-0.005em' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. AI Study Coach ── */}
          <FeatureCard color="#7c5cfc" eyebrow="When you're stuck" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>} title="A tutor for every course, on demand." desc="Ask. Get an answer that knows your syllabus, grade weights, and what you've struggled with. No more re-Googling the same concept twice.">
            <div style={{ padding: '16px 16px 8px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7c5cfc', letterSpacing: 1, marginBottom: 10 }}>YOUR WEEK-BY-WEEK PLAN</div>
              {[
                { week: 'Week 1', label: 'Foundation & Understanding', sessions: [['Session 1','Memory: encoding, storage, retrieval','60m'],['Session 2','Sensation & Perception basics','45m']] },
                { week: 'Week 2', label: 'Midterm Prep Sprint', sessions: [['Session 1','Active Recall, all units','60m']] },
              ].map((w, wi) => (
                <div key={wi} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{w.week}</span>
                    <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.4)' }}>{w.label}</span>
                  </div>
                  {w.sessions.map(([s, label, dur], si) => (
                    <div key={si} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderTop: si > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#7c5cfc', fontWeight: 600, marginBottom: 2 }}>{s}</div>
                        <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.65)' }}>{label}</div>
                      </div>
                      <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.35)', flexShrink: 0, marginLeft: 8 }}>{dur}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ── 3. Smart Flashcards ── */}
          <FeatureCard color="#22c55e" eyebrow="Skip what you already know" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>} title="Flashcards that only quiz what you're forgetting." desc="Generated from your notes, scored on recall, and re-served on the day they're about to slip. The cards you know stop showing up.">
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 10, color: 'rgba(226,232,240,0.4)' }}>
                <span>Card 3 of 15</span><span>23% covered</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '20px 16px', textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1, marginBottom: 10 }}>CONCEPT</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.5, marginBottom: 12 }}>What is Miller's Law regarding short-term memory?</div>
                <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.3)', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>Tap to reveal answer</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['✗ Reviewing','rgba(239,68,68,0.15)','#ef4444'],['~ Almost','rgba(234,179,8,0.15)','#eab308'],['✓ Know it','rgba(34,197,94,0.15)','#22c55e']].map(([label,bg,color],i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '7px 4px', background: bg, borderRadius: 8, fontSize: 10, fontWeight: 600, color }}>{label}</div>
                ))}
              </div>
            </div>
          </FeatureCard>

          {/* ── 4. Focus Mode ── */}
          <FeatureCard color="#f97316" eyebrow="Lock in for an hour" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>} title="One screen. Your plan. Nothing else." desc="Distraction-free deep work, timed blocks, recall checkpoints, and a streak that doesn't survive a skip. Built to keep you in the seat.">
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.35)', marginBottom: 12 }}>60 min session</div>
              <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 14px' }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#f97316" strokeWidth="6"
                    strokeDasharray="276" strokeDashoffset="80" strokeLinecap="round"
                    transform="rotate(-90 50 50)"/>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>24:35</div>
                  <div style={{ fontSize: 9, color: '#f97316', fontWeight: 600 }}>Active Recall</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 11, color: 'rgba(226,232,240,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>⏸ Pause</div>
                <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 11, color: 'rgba(226,232,240,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>Skip →</div>
              </div>
              <div style={{ padding: '9px', background: 'rgba(34,197,94,0.15)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>✓ Finish Block</div>
            </div>
          </FeatureCard>

          {/* ── 5. Study Schedule ── */}
          <FeatureCard color="#2dd4bf" eyebrow="Your week, decided" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} title="See your week before you've thought about it." desc="Every session, every course, slotted into the hours you actually have free. Miss one and the rest rebalance — no rebuilding the calendar.">
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                {['Mon','Tue','Wed','Thu','Fri'].map((d,i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'rgba(226,232,240,0.35)', marginBottom: 5 }}>{d}</div>
                    <div style={{ height: 28, borderRadius: 6, background: [i===0||i===2||i===4 ? 'rgba(99,102,241,0.35)' : i===1 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.04)'][0], border: `1px solid ${[i===0||i===2||i===4 ? 'rgba(99,102,241,0.5)' : i===1 ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)'][0]}`, margin: '0 2px' }} />
                  </div>
                ))}
              </div>
              {[
                ['9:00 AM','PSYC 101: Memory','#6366f1'],
                ['11:00 AM','Biology: Cell Division','#22c55e'],
                ['2:30 PM','PSYC 101: Perception','#6366f1'],
              ].map(([time, label, color], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 5, borderLeft: `2px solid ${color}` }}>
                  <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.35)', minWidth: 52 }}>{time}</span>
                  <span style={{ fontSize: 11, color: 'rgba(226,232,240,0.75)' }}>{label}</span>
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ── 6. Progress Dashboard ── */}
          <FeatureCard color="#a78bfa" eyebrow="Watch the grade move" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>} title="Every session updates the grade you'll get." desc="Hours, streak, recall, sessions done — and your projected exam score, recalculated after every session. The only feedback loop that means anything.">
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display:'flex', justifyContent:'center', color:'#f97316' }}><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd"/></svg></div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>7</div>
                  <div style={{ fontSize: 9, color: 'rgba(226,232,240,0.4)' }}>day streak</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display:'flex', justifyContent:'center', color:'#22c55e' }}><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg></div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>32</div>
                  <div style={{ fontSize: 9, color: 'rgba(226,232,240,0.4)' }}>sessions done</div>
                </div>
              </div>
              <div style={{ background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#a78bfa', marginBottom: 10, border: '1px solid rgba(167,139,250,0.2)' }}>
                Great start. Consistency is everything. Keep going!
              </div>
              {[['PSYC 101', 78, '#6366f1'],['Biology', 52, '#22c55e'],['Study Hours', 65, '#a78bfa']].map(([label, pct, color], i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(226,232,240,0.5)', marginBottom: 4 }}>
                    <span>{label}</span><span>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </FeatureCard>

        </div>
      </section>

      {/* Features → Testimonials horizon */}
      <div className="se-horizon" />

      {/* ── Testimonials ── */}
      <section className="se-section" style={{ maxWidth: 1000, margin: '0 auto', padding: '90px 24px 100px' }}>
        <div aria-hidden="true" className="se-wash" style={{
          background:
            'radial-gradient(700px 460px at 12% 15%, rgba(244,114,182,0.10), transparent 60%),' +
            'radial-gradient(680px 460px at 95% 85%, rgba(251,191,36,0.08), transparent 60%)',
        }} />
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800,
            color: '#fff', letterSpacing: '-0.6px', marginBottom: 10,
          }}>
            Students who stopped winging it
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(226,232,240,0.4)', maxWidth: 420, margin: '0 auto' }}>
            Real results from real students this semester.
          </p>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
        }}>
          {[
            {
              quote: "I went from a C+ to a B+ in Organic Chemistry. Having a session plan every time I sat down made the difference — I stopped wasting time figuring out what to study.",
              name: 'Maya R.',
              role: '3rd year · Pre-Med',
              color: '#6366f1',
            },
            {
              quote: "Finals week used to be pure panic. This semester I had everything mapped out 3 weeks before. I actually slept the night before my Calc exam.",
              name: 'Jordan T.',
              role: '2nd year · Engineering',
              color: '#8b5cf6',
            },
            {
              quote: "The flashcards it generates from my notes are way better than what I'd make myself. I just do a session and it handles the rest.",
              name: 'Priya S.',
              role: '1st year · Business',
              color: '#ec4899',
            },
            {
              quote: "I have 5 courses and a part-time job. Before this I was always behind. Now I actually know what to do every day and I'm keeping up.",
              name: 'Marcus L.',
              role: '4th year · Psychology',
              color: '#f59e0b',
            },
            {
              quote: "The Study Coach is what got me. It knows which topics I'm weak on and focuses my sessions there. My GPA went from 2.8 to 3.4 in one semester.",
              name: 'Aisha K.',
              role: '2nd year · Biology',
              color: '#10b981',
            },
            {
              quote: "I was skeptical about another study app but the AI session blueprints are genuinely useful. It's the only app I've used for more than a week.",
              name: 'Chris M.',
              role: '3rd year · Computer Science',
              color: '#22d3ee',
            },
          ].map(({ quote, name, role, color }) => (
            <div key={name} style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: '24px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {/* Stars */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="13" height="13" viewBox="0 0 20 20" fill={color}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                ))}
              </div>
              {/* Quote */}
              <p style={{
                fontSize: 14, color: 'rgba(226,232,240,0.7)',
                lineHeight: 1.65, margin: 0, flex: 1,
              }}>
                "{quote}"
              </p>
              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: `${color}22`, border: `1px solid ${color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color,
                }}>
                  {name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.35)' }}>{role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials → Bottom CTA horizon */}
      <div className="se-horizon" />

      {/* ── Pricing ── */}
      <section id="pricing" className="se-section" style={{
        maxWidth: 1100, margin: '0 auto', padding: '90px 24px 100px',
        position: 'relative',
      }}>
        <div aria-hidden="true" className="se-wash" style={{
          background:
            'radial-gradient(700px 460px at 50% 0%, rgba(99,102,241,0.10), transparent 60%)',
        }} />
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800,
            color: '#fff', letterSpacing: '-0.02em', marginBottom: 12,
          }}>
            Pick your plan. Cancel anytime.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(226,232,240,0.55)', maxWidth: 540, margin: '0 auto 28px', lineHeight: 1.55 }}>
            Less than a coffee a week. Full access to the AI study system, your way.
          </p>

          {/* Billing toggle */}
          <div role="tablist" aria-label="Billing period" style={{
            display: 'inline-flex', gap: 4,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 999, padding: 4,
          }}>
            {[
              { id: 'weekly',  label: 'Weekly',  save: null      },
              { id: 'monthly', label: 'Monthly', save: 'Save 17%' },
              { id: 'yearly',  label: 'Annual',  save: 'Save 55%' },
            ].map(p => {
              const active = pricingPeriod === p.id
              return (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPricingPeriod(p.id)}
                  style={{
                    padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: active ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'transparent',
                    color: active ? '#fff' : 'rgba(226,232,240,0.65)',
                    fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.005em',
                    boxShadow: active ? '0 6px 18px rgba(99,102,241,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {p.label}
                  {p.save && (
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: active ? '#a5f3d4' : '#34d399',
                      letterSpacing: '0.005em',
                    }}>
                      {p.save}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {(() => {
          const pricing = {
            free: { weekly: '$0', monthly: '$0', yearly: '$0', sub: 'Forever free' },
            pro: {
              weekly:  { price: '$2.99', unit: '/week',  sub: 'Billed weekly · less than a coffee' },
              monthly: { price: '$9.99', unit: '/month', sub: 'Billed monthly' },
              yearly:  { price: '$69.99', unit: '/year',  sub: 'Billed annually · ~$1.35/wk' },
            },
            unlimited: {
              weekly:  { price: '$4.99',  unit: '/week',  sub: 'Billed weekly' },
              monthly: { price: '$14.99', unit: '/month', sub: 'Billed monthly' },
              yearly:  { price: '$119.99', unit: '/year', sub: 'Billed annually · ~$2.31/wk' },
            },
          }
          const proP = pricing.pro[pricingPeriod]
          const ultP = pricing.unlimited[pricingPeriod]
          // Per-card savings badge — shows on monthly (vs weekly) and annual.
          // Caller passes { monthly, annual } amounts.
          const savingsBadge = (savings) => {
            const val = pricingPeriod === 'yearly' ? savings?.annual
                      : pricingPeriod === 'monthly' ? savings?.monthly
                      : null
            if (!val) return null
            return (
              <span style={{
                display: 'inline-block', marginLeft: 8,
                fontSize: 11, fontWeight: 800, color: '#34d399',
                background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.30)',
                borderRadius: 999, padding: '2px 10px', letterSpacing: '0.2px',
              }}>{val}</span>
            )
          }

          return (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 18, alignItems: 'stretch',
            }}>

              {/* Free */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 18, padding: '28px 24px 24px',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.55)', marginBottom: 10 }}>Free</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>$0</span>
                    <span style={{ fontSize: 14, color: 'rgba(226,232,240,0.45)' }}>forever</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(226,232,240,0.50)' }}>Try the basics. No credit card.</p>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 13.5, color: 'rgba(226,232,240,0.7)' }}>
                  {['1 course', '2 AI tutor actions/day', '1 Coach Plan', '1 Practice Exam', '60 min Focus/day'].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="rgba(226,232,240,0.50)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={goSignupFree} style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#e2e8f0', borderRadius: 12, padding: '12px 18px',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.005em',
                }}>
                  Get started free
                </button>
              </div>

              {/* Pro — featured */}
              <div style={{
                background: 'linear-gradient(180deg, rgba(99,102,241,0.08), rgba(99,102,241,0.02))',
                border: '1.5px solid rgba(99,102,241,0.45)',
                borderRadius: 18, padding: '28px 24px 24px',
                display: 'flex', flexDirection: 'column', gap: 16,
                boxShadow: '0 24px 64px rgba(99,102,241,0.20), 0 0 0 1px rgba(255,255,255,0.04) inset',
                position: 'relative', transform: 'translateY(-6px)',
              }}>
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.10em',
                  textTransform: 'uppercase', padding: '5px 14px', borderRadius: 999,
                  boxShadow: '0 8px 24px rgba(99,102,241,0.45)',
                }}>
                  Most popular
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#c7d2fe', marginBottom: 10 }}>
                    Pro {savingsBadge({ monthly: 'Save 17%', annual: 'Save 55%' })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{proP.price}</span>
                    <span style={{ fontSize: 15, color: 'rgba(226,232,240,0.55)' }}>{proP.unit}</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(226,232,240,0.55)' }}>{proP.sub}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#34d399', fontWeight: 700 }}>
                    3-day free trial · No card needed
                  </p>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 13.5, color: 'rgba(226,232,240,0.85)' }}>
                  {[
                    '5 courses',
                    '100 AI actions/month',
                    'AI Study Coach',
                    'Unlimited Session Blueprints',
                    'Unlimited Focus sessions',
                    'Flashcards & quizzes',
                  ].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => goCheckout('pro', pricingPeriod)} style={{
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  border: 'none', color: '#fff', borderRadius: 12,
                  padding: '14px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 14px 36px rgba(99,102,241,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
                  letterSpacing: '-0.005em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  Start free trial
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Unlimited */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(52,211,153,0.30)',
                borderRadius: 18, padding: '28px 24px 24px',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#34d399', marginBottom: 10 }}>
                    Unlimited {savingsBadge({ monthly: 'Save 25%', annual: 'Save 53%' })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{ultP.price}</span>
                    <span style={{ fontSize: 14, color: 'rgba(226,232,240,0.45)' }}>{ultP.unit}</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(226,232,240,0.50)' }}>{ultP.sub}</p>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 13.5, color: 'rgba(226,232,240,0.85)' }}>
                  {[
                    'Everything in Pro',
                    'Unlimited courses',
                    'Unlimited AI actions',
                    'AI Tutor with session memory',
                    'Advanced exam analytics',
                    'Predicted exam score',
                  ].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => goCheckout('unlimited', pricingPeriod)} style={{
                  background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.40)',
                  color: '#34d399', borderRadius: 12,
                  padding: '14px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '-0.005em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  Get Unlimited
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })()}

        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: 'rgba(226,232,240,0.40)' }}>
          Already a member? <button onClick={goSignupFree} style={{ background: 'none', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Sign in</button>
        </p>
      </section>

      {/* ── Bottom CTA (full-bleed arrival moment) ── */}
      <section className="se-section" style={{
        textAlign: 'center', padding: '140px 24px 160px',
        background: 'linear-gradient(180deg, transparent 0%, rgba(8,8,28,0.5) 30%, rgba(12,12,38,0.65) 70%, transparent 100%)',
      }}>
        {/* Layered washes */}
        <div aria-hidden="true" className="se-wash" style={{
          background:
            'radial-gradient(1100px 640px at 50% 45%, rgba(99,102,241,0.22), transparent 65%),' +
            'radial-gradient(800px 540px at 50% 100%, rgba(79,70,229,0.18), transparent 60%),' +
            'radial-gradient(500px 360px at 18% 30%, rgba(124,92,252,0.10), transparent 60%),' +
            'radial-gradient(500px 360px at 82% 70%, rgba(45,212,191,0.06), transparent 60%)',
        }} />
        <div aria-hidden="true" className="se-grid" />

        {/* Trust strip directly above headline */}
        <div data-reveal style={{
          display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '8px 16px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          fontSize: 12.5, color: 'rgba(226,232,240,0.7)',
          letterSpacing: '-0.005em', marginBottom: 32,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            No credit card
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />
          <span>3-day free trial</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />
          <span>Cancel anytime</span>
        </div>

        <h2 data-reveal data-reveal-delay="1" style={{
          fontSize: 'clamp(40px, 6.5vw, 78px)', fontWeight: 700,
          color: '#fff', letterSpacing: '-0.04em', lineHeight: 0.98,
          marginBottom: 18, position: 'relative',
          maxWidth: 820, marginLeft: 'auto', marginRight: 'auto',
        }}>
          Stop studying harder.<br />
          <span style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.03em',
            background: 'linear-gradient(180deg, #ffffff 0%, #c7c8ff 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>Study what actually moves your grade</span><span style={{ color: '#6366F1' }}>.</span>
        </h2>
        <p data-reveal data-reveal-delay="2" style={{
          fontSize: 17.5, color: 'rgba(226,232,240,0.55)',
          marginBottom: 40, lineHeight: 1.55, letterSpacing: '-0.005em',
          maxWidth: 580, marginLeft: 'auto', marginRight: 'auto',
        }}>
          Your AI study system builds the plan, scores every session, and tells you exactly what to study next — for every course, all semester.
        </p>
        <div data-reveal data-reveal-delay="3" style={{
          display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          justifyContent: 'center', position: 'relative',
        }}>
          <button
            onClick={goTrial}
            className="se-magnetic se-shimmer"
            {...magneticHandlers(0.32, 12)}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none', color: '#fff', borderRadius: 14,
              padding: '16px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 18px 48px rgba(99,102,241,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
              letterSpacing: '-0.01em',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              position: 'relative',
            }}
          >
            <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              Start your free 3-day trial
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
          <button
            onClick={scrollToHow}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#e2e8f0', borderRadius: 14,
              padding: '15px 26px', fontSize: 15.5, fontWeight: 600, cursor: 'pointer',
              letterSpacing: '-0.01em',
              transition: 'border-color 0.2s ease, background 0.2s ease',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            }}
          >
            See how it works
          </button>
        </div>

        {/* Subtle closer line */}
        <div data-reveal data-reveal-delay="3" style={{
          marginTop: 28, fontSize: 13, color: 'rgba(226,232,240,0.4)',
          letterSpacing: '-0.005em',
        }}>
          Built for the GPA grinder, the comeback kid, and the high-achiever optimizing for an A.
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: 'rgba(226,232,240,0.25)',
      }}>
        <span>© 2026 StudyEdge AI. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="mailto:support@getstudyedge.com" style={{ color: 'rgba(226,232,240,0.35)', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>
    </div>
  )
}
