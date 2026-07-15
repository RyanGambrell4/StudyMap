import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

export default function AuthScreen({ initialMode, onBack }) {
  const isMobile = window.innerWidth <= 767
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
    const billingLabel =
      billing === 'yearly' ? 'annually' :
      billing === 'weekly' ? 'weekly' :
      billing === 'semester' ? 'per semester' :
      'monthly'
    if (trial === '1') return { text: `7-day free trial · ${planLabel}`, sub: `Full access included. $0 today, then $2.99/wk. Cancel anytime in your account.` }
    return { text: `${planLabel} plan`, sub: `Billed ${billingLabel}. Cancel anytime.` }
  })()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailFormVisible, setEmailFormVisible] = useState(() => mode !== 'signup')
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
  const [magicLinkMode, setMagicLinkMode] = useState(false)

  const handleGoogleSignIn = async () => {
    setError('')
    const src = new URLSearchParams(window.location.search)
    const preserve = new URLSearchParams()
    const plan = src.get('plan')
    const billing = src.get('billing')
    const trial = src.get('trial')
    if (plan === 'pro' || plan === 'unlimited') preserve.set('plan', plan)
    if (['weekly', 'monthly', 'yearly', 'semester'].includes(billing)) preserve.set('billing', billing)
    if (trial === '1') preserve.set('trial', '1')
    const qs = preserve.toString()
    const redirectTo = `${window.location.origin}/app${qs ? '?' + qs : ''}`
    track('oauth_clicked', { provider: 'google', mode, plan_context: planContext?.plan ?? null })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) {
      track('oauth_failed', { provider: 'google', reason: error.message })
      setError('Something went wrong. Please try again.')
    }
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
        if (['weekly', 'monthly', 'yearly', 'semester'].includes(billing)) preserve.set('billing', billing)
        if (trial === '1') preserve.set('trial', '1')
        const qs = preserve.toString()
        const emailRedirectTo = `${window.location.origin}/app${qs ? '?' + qs : ''}`

        if (magicLinkMode) {
          track('signup_started', { method: 'magic_link', plan_context: plan ?? null, trial_context: trial === '1' })
          const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo } })
          if (error) throw error
          track('signup_email_sent', { method: 'magic_link' })
          setSignupPendingEmail(email)
          return
        }

        track('signup_started', { method: 'email', plan_context: plan ?? null, billing_context: billing ?? null, trial_context: trial === '1' })
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
        if (error) throw error
        // Supabase silently returns success for already-registered emails to
        // prevent email enumeration. The signal is data.user.identities === [].
        // Without this check the user gets parked on ConfirmationPending forever
        // because no confirmation email is sent for an already-confirmed account.
        const alreadyRegistered = data?.user && (!data.user.identities || data.user.identities.length === 0)
        if (alreadyRegistered) {
          track('signup_already_registered', { method: 'email' })
          setMode('login')
          setError('You already have an account with this email. Sign in below.')
          setPassword('')
          return
        }
        track('signup_email_sent', { method: 'email' })
        setSignupPendingEmail(email)
        setPassword('')
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        track('login_completed', { method: 'email' })
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/app`,
        })
        if (error) throw error
        track('password_reset_requested')
        setSuccess('Password reset email sent. Check your inbox.')
      }
    } catch (err) {
      track(mode === 'signup' ? 'signup_failed' : mode === 'login' ? 'login_failed' : 'password_reset_failed', { method: 'email', reason: err.message })
      console.error('Auth error:', err.message)
      const msg = err.message?.toLowerCase() ?? ''
      if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
        setError('__email_not_confirmed__')
      } else if (msg.includes('invalid login credentials')) {
        setError('Incorrect email or password.')
      } else if (mode === 'signup' && msg.includes('email')) {
        setError("Couldn't create your account. Please try again, or use 'Continue with Google' above.")
      } else if (msg.includes('password')) {
        setError('Password must be at least 6 characters.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Post-signup confirmation screen ──
  if (signupPendingEmail) {
    const handleResend = async () => {
      track('email_confirmation_resend_clicked', { source: 'auth_screen' })
      setResendStatus('sending')
      try {
        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: signupPendingEmail })
        if (resendErr) {
          const msg = (resendErr.message ?? '').toLowerCase()
          if (msg.includes('rate') || msg.includes('limit') || msg.includes('seconds')) {
            setResendStatus('ratelimited')
          } else {
            setResendStatus('error')
          }
          setTimeout(() => setResendStatus('cooldown'), 4000)
          return
        }
        setResendStatus('sent')
        // 60s cooldown - Supabase's own rate limit is 1 every 60s anyway
        setTimeout(() => setResendStatus('cooldown'), 4000)
        setTimeout(() => setResendStatus(''), 64000)
      } catch {
        setResendStatus('error')
        setTimeout(() => setResendStatus('cooldown'), 4000)
        setTimeout(() => setResendStatus(''), 64000)
      }
    }

    return (
      <ConfirmationPending email={signupPendingEmail} onResend={handleResend} resendStatus={resendStatus} onSwitchEmail={() => { setSignupPendingEmail(''); setError(''); setSuccess('') }} onSignIn={() => { setSignupPendingEmail(''); setMode('login'); setError(''); setSuccess('') }} onBack={onBack} isMobile={isMobile} onGoogleSignIn={handleGoogleSignIn} isMagicLink={magicLinkMode} />
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {!isMobile && <LeftPanel />}

      {/* Right panel */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F7F6F3', padding: '40px 24px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Mobile logo */}
          <style>{`@media (max-width: 767px) { .auth-mobile-logo { display: flex !important; } }`}</style>
          <div className="auth-mobile-logo" style={{ display: 'none', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
            <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: '#1A1A1A' }}>StudyEdge AI</span>
          </div>

          {/* Header */}
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px' }}>
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Two minutes to your first study plan' : 'Reset password'}
          </h1>
          <p style={{ fontSize: 14, color: '#6B6B6B', margin: '0 0 24px' }}>
            {mode === 'login' ? 'Sign in to access your study plans.' : mode === 'signup' ? 'Tell us what you\'re studying. We\'ll build the rest.' : "We'll send a reset link to your email."}
          </p>


          {mode === 'signup' && !planContext && (
            <div style={{
              backgroundColor: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="5 12 10 17 20 7"/></svg>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#059669' }}>Free forever, no credit card required</p>
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
                  padding: '13px', borderRadius: 12,
                  backgroundColor: mode === 'signup' ? '#3B61C4' : '#fff',
                  border: mode === 'signup' ? 'none' : '1px solid rgba(0,0,0,0.12)',
                  fontSize: 14, fontWeight: 600,
                  color: mode === 'signup' ? '#fff' : '#1A1A1A',
                  cursor: 'pointer', marginBottom: 4,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {mode === 'signup' ? 'Sign up with Google - instant access' : 'Continue with Google'}
              </button>
              {mode === 'signup' && (
                <p style={{ fontSize: 12, color: '#059669', textAlign: 'center', margin: '4px 0 2px', fontWeight: 500 }}>
                  ✓ No email verification needed, get in instantly
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <span style={{ fontSize: 12, color: '#9B9B9B' }}>{mode === 'signup' ? 'or' : 'or'}</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
              </div>

              {/* On signup: hide email form behind a toggle to reduce friction and push Google */}
              {mode === 'signup' && !emailFormVisible && (
                <button
                  type="button"
                  onClick={() => setEmailFormVisible(true)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.12)',
                    fontSize: 14, fontWeight: 600, color: '#6B6B6B',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Sign up with email instead
                </button>
              )}
            </>
          )}

          {/* Form — hidden on signup until user chooses email */}
          <form onSubmit={handleSubmit} style={{ display: mode === 'signup' && !emailFormVisible ? 'none' : 'flex', flexDirection: 'column', gap: 14 }}>
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

            {mode === 'signup' && !magicLinkMode && (
              <button
                type="button"
                onClick={() => { setMagicLinkMode(true); track('magic_link_mode_selected') }}
                style={{ background: 'none', border: 'none', fontSize: 12, color: '#3B61C4', cursor: 'pointer', fontWeight: 500, padding: '0 0 4px', textAlign: 'left' }}
              >
                Prefer a one-click login link? Skip the password →
              </button>
            )}
            {mode === 'signup' && magicLinkMode && (
              <div style={{ backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#3730A3', lineHeight: 1.5 }}>
                We'll email you a one-click link. No password needed. Click it to confirm and sign in instantly.
                <button type="button" onClick={() => setMagicLinkMode(false)} style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', fontSize: 12, color: '#6366F1', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                  ← Set a password instead
                </button>
              </div>
            )}
            {mode !== 'forgot' && !magicLinkMode && (
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

            {error && error !== '__email_not_confirmed__' && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                {error}
              </div>
            )}
            {error === '__email_not_confirmed__' && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#dc2626' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Confirm your email first.</p>
                <p style={{ margin: '0 0 10px', color: '#b91c1c', lineHeight: 1.5 }}>
                  We sent a confirmation link to <strong>{email}</strong>. Check your inbox (and spam folder).
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    track('email_confirmation_resend_clicked', { source: 'login_error' })
                    setResendStatus('sending')
                    try {
                      await supabase.auth.resend({ type: 'signup', email })
                      setResendStatus('sent')
                    } catch {
                      setResendStatus('error')
                    }
                  }}
                  disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                  style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#dc2626', cursor: resendStatus === 'sent' ? 'default' : 'pointer', fontWeight: 600 }}
                >
                  {resendStatus === 'sending' ? 'Sending...' : resendStatus === 'sent' ? 'Confirmation sent' : 'Resend confirmation email'}
                </button>
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
                width: '100%', padding: '13px', borderRadius: 12,
                border: mode === 'signup' ? '1.5px solid rgba(59,97,196,0.3)' : 'none',
                backgroundColor: mode === 'signup' ? '#fff' : '#3B61C4',
                color: mode === 'signup' ? '#3B61C4' : '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 2,
              }}
            >
              {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? (magicLinkMode ? 'Email me a login link' : 'Create account') : 'Send reset link'}
            </button>
          </form>

          {/* Clickwrap consent - shown only on signup when email form is visible */}
          {mode === 'signup' && emailFormVisible && (
            <p style={{ fontSize: 12, color: '#9B9B9B', textAlign: 'center', marginTop: 14, lineHeight: 1.55 }}>
              By creating an account you agree to our{' '}
              <a href="/terms.html" target="_blank" rel="noopener" style={{ color: '#6B6B6B', textDecoration: 'underline' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy.html" target="_blank" rel="noopener" style={{ color: '#6B6B6B', textDecoration: 'underline' }}>Privacy Policy</a>.
            </p>
          )}

          {/* Footer links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center', marginTop: 20 }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('forgot'); setError(''); setSuccess('') }} style={{ background: 'none', border: 'none', fontSize: 13, color: '#9B9B9B', cursor: 'pointer' }}>
                  Forgot password?
                </button>
                <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); setEmailFormVisible(false) }} style={{ background: 'none', border: 'none', fontSize: 14, color: '#6B6B6B', cursor: 'pointer' }}>
                  Don't have an account? <span style={{ color: '#3B61C4', fontWeight: 600 }}>Sign up</span>
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess(''); setEmailFormVisible(true) }} style={{ background: 'none', border: 'none', fontSize: 14, color: '#6B6B6B', cursor: 'pointer' }}>
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
          AI-powered study plans, grade tracking, and an always-on tutor. All in one place.
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

// ── Confirmation pending: auto-polls for verified status every 5s ─────────────
function ConfirmationPending({ email, onResend, resendStatus, onSwitchEmail, onSignIn, onBack, isMobile, onGoogleSignIn, isMagicLink }) {
  const [pollCount, setPollCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-poll: every 5s, refresh the user. When email_confirmed_at is set,
  // onAuthStateChange in App.jsx fires SIGNED_IN and the gate falls away.
  useEffect(() => {
    let cancelled = false
    let fired = false
    track('email_confirmation_screen_shown', { source: 'auth_screen' })
    const tick = async () => {
      if (cancelled) return
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user?.email_confirmed_at && !fired) {
          fired = true
          track('email_confirmed', { source: 'auth_screen', user_id: data.user.id })
          // Force a session refresh so onAuthStateChange picks up confirmation
          await supabase.auth.refreshSession()
        }
      } catch {}
      if (!cancelled) setPollCount(c => c + 1)
    }
    const interval = setInterval(tick, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const VALUE_PROPS = [
    { title: 'AI Study Coach', body: 'Builds your week-by-week plan for every course' },
    { title: 'Session Blueprints', body: 'A specific plan before every study block' },
    { title: 'Focus Mode', body: 'Timed sessions that lock you in and track streaks' },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {!isMobile && <LeftPanel />}

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F7F6F3', padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <style>{`@keyframes pulse-ring { 0%,100% { box-shadow: 0 0 0 0 rgba(59,97,196,0.4) } 50% { box-shadow: 0 0 0 8px rgba(59,97,196,0) } }`}</style>

          {/* Mobile logo */}
          <div style={{ display: isMobile ? 'flex' : 'none', alignItems: 'center', gap: 10, marginBottom: 28, justifyContent: 'center' }}>
            <img src="/favicon.png" alt="StudyEdge AI" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: '#1A1A1A' }}>StudyEdge AI</span>
          </div>

          {/* Live pulse icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(59,97,196,0.1)',
            border: '1px solid rgba(59,97,196,0.2)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', marginBottom: 20,
            animation: 'pulse-ring 1.8s ease-in-out infinite',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3B61C4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px' }}>
            {isMagicLink ? "You're one click away" : "Check your email. You're almost in"}
          </h1>
          <p style={{ fontSize: 14, color: '#6B6B6B', margin: '0 0 4px', lineHeight: 1.5 }}>
            {isMagicLink ? 'We sent a one-click login link to' : 'We sent a confirmation link to'}
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', margin: '0 0 14px', wordBreak: 'break-all' }}>{email}</p>

          <div style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '11px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <p style={{ margin: 0, fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
              <strong>Check Spam or Promotions first.</strong> Confirmation emails often land there. Search your inbox for <strong>"StudyEdge"</strong>.
            </p>
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.15)',
            borderRadius: 999, padding: '5px 12px',
            fontSize: 12, color: '#3B61C4', fontWeight: 600,
            marginBottom: 18,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B61C4', animation: 'pulse-ring 1.4s ease-in-out infinite' }} />
            Sent {elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`} ago · checking automatically
          </div>

          <div style={{
            backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12,
            padding: '16px 18px', marginBottom: 18,
          }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              What unlocks once you verify
            </p>
            {VALUE_PROPS.map(v => (
              <div key={v.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(59,97,196,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <svg width="10" height="10" fill="none" stroke="#3B61C4" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{v.title}</div>
                  <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 1 }}>{v.body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Open inbox shortcut - deep-link to the user's webmail provider */}
          {(() => {
            const domain = (email?.split('@')[1] ?? '').toLowerCase()
            const inboxUrl =
              domain === 'gmail.com' || domain === 'googlemail.com' ? 'https://mail.google.com/' :
              domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com' ? 'https://outlook.live.com/mail/' :
              domain === 'yahoo.com' || domain === 'ymail.com' ? 'https://mail.yahoo.com/' :
              domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com' ? 'https://www.icloud.com/mail' :
              null
            const inboxName =
              domain === 'gmail.com' || domain === 'googlemail.com' ? 'Gmail' :
              inboxUrl?.includes('outlook') ? 'Outlook' :
              inboxUrl?.includes('yahoo') ? 'Yahoo Mail' :
              inboxUrl?.includes('icloud') ? 'iCloud Mail' :
              null
            return inboxUrl ? (
              <a
                href={inboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '12px', borderRadius: 12,
                  backgroundColor: '#3B61C4', color: '#fff',
                  fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  marginBottom: 12, boxSizing: 'border-box',
                }}
              >
                Open {inboxName}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </a>
            ) : null
          })()}

          {onGoogleSignIn && (
            <>
              <button
                type="button"
                onClick={onGoogleSignIn}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  padding: '12px', borderRadius: 12, backgroundColor: '#fff',
                  border: '1px solid rgba(0,0,0,0.12)', fontSize: 14, fontWeight: 600, color: '#1A1A1A',
                  cursor: 'pointer', marginBottom: 10, boxSizing: 'border-box',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Sign in with Google instead
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <span style={{ fontSize: 12, color: '#9B9B9B' }}>or wait for the email</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
              </div>
            </>
          )}

          <button
            onClick={onResend}
            disabled={resendStatus === 'sending' || resendStatus === 'cooldown'}
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              backgroundColor: '#fff', color: '#3B61C4',
              border: '1px solid rgba(59,97,196,0.3)', fontSize: 14, fontWeight: 600,
              cursor: (resendStatus === 'sending' || resendStatus === 'cooldown') ? 'default' : 'pointer',
              opacity: (resendStatus === 'sending' || resendStatus === 'cooldown') ? 0.55 : 1,
              marginBottom: 14,
            }}
          >
            {resendStatus === 'sending' ? 'Resending…'
              : resendStatus === 'sent' ? 'Email resent ✓'
              : resendStatus === 'cooldown' ? 'Wait a moment before resending'
              : resendStatus === 'ratelimited' ? 'Too many tries. Try again in a minute'
              : resendStatus === 'error' ? 'Resend failed. Try again'
              : 'Resend confirmation email'}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center' }}>
            <button onClick={onSignIn} style={{ background: 'none', border: 'none', fontSize: 13, color: '#6B6B6B', cursor: 'pointer' }}>
              Already verified? <span style={{ color: '#3B61C4', fontWeight: 600 }}>Sign in</span>
            </button>
            <button onClick={onSwitchEmail} style={{ background: 'none', border: 'none', fontSize: 12, color: '#9B9B9B', cursor: 'pointer' }}>
              Use a different email
            </button>
          </div>

          {onBack && (
            <button onClick={onBack} style={{ display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none', fontSize: 12, color: '#9B9B9B', cursor: 'pointer', textAlign: 'center' }}>
              ← Back to home
            </button>
          )}

          {/* Hidden tick render so pollCount triggers re-render */}
          <span style={{ display: 'none' }}>{pollCount}</span>
        </div>
      </div>
    </div>
  )
}
