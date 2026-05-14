import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen({ initialMode, onBack }) {
  const [mode, setMode] = useState(() =>
    initialMode || (new URLSearchParams(window.location.search).get('signup') === '1' ? 'signup' : 'login')
  )

  const planContext = (() => {
    const sp = new URLSearchParams(window.location.search)
    const plan = sp.get('plan')
    const billing = sp.get('billing')
    const trial = sp.get('trial')
    if (!plan) return null
    const planLabel = plan === 'pro' ? 'Pro' : 'Unlimited'
    const billingLabel = billing === 'yearly' ? 'yearly' : billing === 'semester' ? 'per semester' : 'monthly'
    if (trial === '1') return { text: `7-day free trial · ${planLabel}`, sub: `Full access included. Card charged ${billingLabel} after trial ends. Cancel anytime.` }
    return { text: `${planLabel} plan`, sub: `Billed ${billingLabel}. Cancel anytime.` }
  })()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    const sp = new URLSearchParams(window.location.search)
    const raw = sp.get('error_description') || sp.get('error')
    if (!raw) return ''
    const clean = new URLSearchParams()
    const plan = sp.get('plan'); const billing = sp.get('billing'); const signup = sp.get('signup')
    if (plan) clean.set('plan', plan)
    if (billing) clean.set('billing', billing)
    if (signup) clean.set('signup', signup)
    const qs = clean.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''))
    return `Sign in failed: ${decodeURIComponent(raw).replace(/\+/g, ' ')}`
  })
  const [success, setSuccess] = useState('')
  const [signupPendingEmail, setSignupPendingEmail] = useState('')
  const [resendStatus, setResendStatus] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleGoogleSignIn = async () => {
    setError('')
    const src = new URLSearchParams(window.location.search)
    const preserve = new URLSearchParams()
    const plan = src.get('plan')
    const billing = src.get('billing')
    const trial = src.get('trial')
    if (plan === 'pro' || plan === 'unlimited') preserve.set('plan', plan)
    if (['monthly', 'semester', 'yearly'].includes(billing)) preserve.set('billing', billing)
    if (trial === '1') preserve.set('trial', '1')
    const qs = preserve.toString()
    const redirectTo = `${window.location.origin}/app${qs ? '?' + qs : ''}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) setError(error.message)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const src = new URLSearchParams(window.location.search)
        const preserve = new URLSearchParams()
        const plan = src.get('plan')
        const billing = src.get('billing')
        const trial = src.get('trial')
        if (plan === 'pro' || plan === 'unlimited') preserve.set('plan', plan)
        if (['monthly', 'semester', 'yearly'].includes(billing)) preserve.set('billing', billing)
        if (trial === '1') preserve.set('trial', '1')
        const qs = preserve.toString()
        const emailRedirectTo = `${window.location.origin}/app${qs ? '?' + qs : ''}`
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
        if (error) throw error
        setSignupPendingEmail(email)
        setPassword('')
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/app`,
        })
        if (error) throw error
        setSuccess('Password reset email sent. Check your inbox.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Post-signup confirmation screen ──
  if (signupPendingEmail) {
    const handleResend = async () => {
      setResendStatus('sending')
      try {
        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: signupPendingEmail })
        if (resendErr) throw resendErr
        setResendStatus('sent')
        setTimeout(() => setResendStatus(''), 4000)
      } catch {
        setResendStatus('error')
        setTimeout(() => setResendStatus(''), 4000)
      }
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex' }}>
        <style>{`@media (max-width: 767px) { .auth-left-panel { display: none !important; } }`}</style>
        {/* Left panel */}
        <LeftPanel />

        {/* Right panel */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#F7F6F3', padding: '40px 24px',
        }}>
          <div style={{ width: '100%', maxWidth: 400 }}>
            {/* Mobile logo */}
            <div style={{ display: 'none', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}
              className="mobile-logo">
              <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }} />
              <span style={{ fontWeight: 700, fontSize: 18, color: '#1A1A1A' }}>StudyEdge AI</span>
            </div>

            {/* Icon */}
            <div style={{
              width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(59,97,196,0.1)',
              border: '1px solid rgba(59,97,196,0.2)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 20,
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3B61C4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px' }}>Check your inbox</h1>
            <p style={{ fontSize: 14, color: '#6B6B6B', margin: '0 0 4px', lineHeight: 1.5 }}>We sent a confirmation link to</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', margin: '0 0 16px', wordBreak: 'break-all' }}>{signupPendingEmail}</p>
            <p style={{ fontSize: 13, color: '#6B6B6B', margin: '0 0 20px', lineHeight: 1.6 }}>
              Click the link in that email to verify your account and finish signing up. The email may take up to a minute to arrive.
            </p>

            <div style={{
              backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12,
              padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#6B6B6B', lineHeight: 1.6,
            }}>
              <strong style={{ color: '#1A1A1A' }}>Can't find it?</strong> Check your Spam or Promotions folder, and search for "StudyEdge AI".
            </div>

            <button
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                backgroundColor: '#3B61C4', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: resendStatus === 'sending' ? 'default' : 'pointer', opacity: resendStatus === 'sending' ? 0.6 : 1,
                marginBottom: 16,
              }}
            >
              {resendStatus === 'sending' ? 'Resending…' : resendStatus === 'sent' ? '✓ Email resent' : resendStatus === 'error' ? 'Try again' : 'Resend confirmation email'}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
              <button
                onClick={() => { setSignupPendingEmail(''); setMode('login'); setError(''); setSuccess('') }}
                style={{ background: 'none', border: 'none', fontSize: 14, color: '#6B6B6B', cursor: 'pointer' }}
              >
                Already verified? <span style={{ color: '#3B61C4', fontWeight: 600 }}>Sign in</span>
              </button>
              <button
                onClick={() => { setSignupPendingEmail(''); setError(''); setSuccess('') }}
                style={{ background: 'none', border: 'none', fontSize: 13, color: '#9B9B9B', cursor: 'pointer' }}
              >
                Use a different email
              </button>
            </div>

            {onBack && (
              <button onClick={onBack} style={{ display: 'block', width: '100%', marginTop: 16, background: 'none', border: 'none', fontSize: 13, color: '#9B9B9B', cursor: 'pointer', textAlign: 'center' }}>
                ← Back to home
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Left panel */}
      <LeftPanel />

      {/* Right panel */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F7F6F3', padding: '40px 24px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Mobile logo (shown only on small screens via CSS) */}
          <style>{`
            @media (max-width: 767px) {
              .auth-left-panel { display: none !important; }
              .auth-mobile-logo { display: flex !important; }
            }
          `}</style>
          <div className="auth-mobile-logo" style={{ display: 'none', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
            <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: '#1A1A1A' }}>StudyEdge AI</span>
          </div>

          {/* Header */}
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px' }}>
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h1>
          <p style={{ fontSize: 14, color: '#6B6B6B', margin: '0 0 24px' }}>
            {mode === 'login' ? 'Sign in to access your study plans.' : mode === 'signup' ? 'Your data will sync across all your devices.' : "We'll send a reset link to your email."}
          </p>

          {/* Plan context banner */}
          {mode === 'signup' && planContext && (
            <div style={{
              backgroundColor: 'rgba(59,97,196,0.07)', border: '1px solid rgba(59,97,196,0.2)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 20, textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: '#3B61C4' }}>{planContext.text}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>{planContext.sub}</p>
            </div>
          )}
          {mode === 'signup' && !planContext && (
            <div style={{
              backgroundColor: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="5 12 10 17 20 7"/></svg>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#059669' }}>Free forever — no credit card required</p>
            </div>
          )}

          {/* Google button */}
          {mode !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  padding: '12px', borderRadius: 12, backgroundColor: '#fff',
                  border: '1px solid rgba(0,0,0,0.12)', fontSize: 14, fontWeight: 600, color: '#1A1A1A',
                  cursor: 'pointer', marginBottom: 4,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <span style={{ fontSize: 12, color: '#9B9B9B' }}>or</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 14, color: '#1A1A1A',
                  backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.12)', outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3B61C4'}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    style={{
                      width: '100%', padding: '11px 40px 11px 14px', borderRadius: 10, fontSize: 14, color: '#1A1A1A',
                      backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.12)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#3B61C4'}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', padding: 0, display: 'flex' }}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16a34a' }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                backgroundColor: '#3B61C4', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 2,
              }}
            >
              {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>
          </form>

          {/* Footer links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center', marginTop: 20 }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('forgot'); setError(''); setSuccess('') }} style={{ background: 'none', border: 'none', fontSize: 13, color: '#9B9B9B', cursor: 'pointer' }}>
                  Forgot password?
                </button>
                <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }} style={{ background: 'none', border: 'none', fontSize: 14, color: '#6B6B6B', cursor: 'pointer' }}>
                  Don't have an account? <span style={{ color: '#3B61C4', fontWeight: 600 }}>Sign up</span>
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} style={{ background: 'none', border: 'none', fontSize: 14, color: '#6B6B6B', cursor: 'pointer' }}>
                Already have an account? <span style={{ color: '#3B61C4', fontWeight: 600 }}>Sign in</span>
              </button>
            )}
            {mode === 'forgot' && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} style={{ background: 'none', border: 'none', fontSize: 14, color: '#6B6B6B', cursor: 'pointer' }}>
                Back to sign in
              </button>
            )}
          </div>

          {onBack && (
            <button onClick={onBack} style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', fontSize: 13, color: '#9B9B9B', cursor: 'pointer', textAlign: 'center' }}>
              ← Back to home
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <div
      className="auth-left-panel"
      style={{
        width: '45%',
        minWidth: 380,
        background: 'linear-gradient(145deg, #3B61C4 0%, #2D4FA8 45%, #1e3a7a 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 48px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />
      <div style={{
        position: 'absolute', top: '-10%', right: '-15%', width: 400, height: 400,
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '-10%', width: 300, height: 300,
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>StudyEdge AI</span>
      </div>

      {/* Headline */}
      <div style={{ position: 'relative' }}>
        <h2 style={{
          color: '#fff',
          fontSize: 36,
          fontWeight: 700,
          lineHeight: 1.2,
          margin: '0 0 16px',
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          letterSpacing: '-0.02em',
        }}>
          Study smarter.<br />Score higher.<br /><em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.75)' }}>Every semester.</em>
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.6, margin: 0, maxWidth: 300 }}>
          AI-powered study plans, grade tracking, and an always-on tutor — all in one place.
        </p>
      </div>

      {/* Social proof */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { quote: '"finally consistent with my studying for the first time ever"', name: 'Andy G.' },
            { quote: '"finished top of my cohort last semester"', name: 'Danny K.' },
          ].map(t => (
            <div key={t.name} style={{
              backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
              padding: '12px 16px', border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{t.quote}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
