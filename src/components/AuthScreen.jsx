import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen({ initialMode, onBack }) {
  const [mode, setMode] = useState(() =>
    initialMode || (new URLSearchParams(window.location.search).get('signup') === '1' ? 'signup' : 'login')
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    // Surface OAuth errors redirected back from Supabase (e.g. "Unable to exchange external code")
    const sp = new URLSearchParams(window.location.search)
    const raw = sp.get('error_description') || sp.get('error')
    if (!raw) return ''
    // Clean up the URL so the error doesn't persist on refresh
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

  // After a successful email+password signup, flip into a dedicated
  // "Check your inbox" confirmation screen so the user can't miss it.
  const [signupPendingEmail, setSignupPendingEmail] = useState('')
  const [resendStatus, setResendStatus] = useState('') // '' | 'sending' | 'sent' | 'error'

  const handleGoogleSignIn = async () => {
    setError('')
    // Preserve checkout intent (plan + billing) across the OAuth round-trip
    // so users who came from landing page pricing still land in Stripe checkout.
    const src = new URLSearchParams(window.location.search)
    const preserve = new URLSearchParams()
    const plan = src.get('plan')
    const billing = src.get('billing')
    if (plan === 'pro' || plan === 'unlimited') preserve.set('plan', plan)
    if (['monthly', 'semester', 'yearly'].includes(billing)) preserve.set('billing', billing)
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
        // Preserve checkout intent (plan + billing + trial) through email verification redirect
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        })
        if (error) throw error
        // Flip into the dedicated "Check your inbox" screen instead of showing
        // a tiny green banner under the form. Remember the email so the user
        // sees exactly where the link was sent, and so we can resend it.
        setSignupPendingEmail(email)
        setPassword('')
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // App.jsx listens for auth state change — no need to do anything here
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
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
        const { error: resendErr } = await supabase.auth.resend({
          type: 'signup',
          email: signupPendingEmail,
        })
        if (resendErr) throw resendErr
        setResendStatus('sent')
        setTimeout(() => setResendStatus(''), 4000)
      } catch {
        setResendStatus('error')
        setTimeout(() => setResendStatus(''), 4000)
      }
    }

    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 py-10"
        style={{ backgroundColor: '#0a0f1e' }}
      >
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <img
              src="/favicon.png"
              alt="StudyEdge"
              className="w-9 h-9 rounded-xl"
              style={{ objectFit: 'contain' }}
            />
            <span className="text-white font-bold text-xl tracking-tight">StudyEdge</span>
          </div>

          {/* Confirmation card */}
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
          >
            {/* Icon */}
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(79,70,229,0.15))',
                border: '1px solid rgba(99,102,241,0.35)',
              }}
            >
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <h1 className="text-white font-bold text-2xl mb-2 tracking-tight">Check your inbox</h1>
            <p className="text-slate-400 text-sm leading-relaxed mb-1">
              We sent a confirmation link to
            </p>
            <p className="text-white font-semibold text-sm mb-5 break-all">
              {signupPendingEmail}
            </p>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Click the link in that email to verify your account and finish signing up. The email may take up to a minute to arrive.
            </p>

            {/* Hint box */}
            <div
              className="rounded-xl px-4 py-3 text-left mb-5 text-xs text-slate-300 leading-relaxed"
              style={{ backgroundColor: '#0d1424', border: '1px solid #1e293b' }}
            >
              <span className="font-bold text-slate-200">Can't find it?</span> Check your Spam or Promotions folder, and search for "StudyEdge".
            </div>

            {/* Resend button */}
            <button
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
            >
              {resendStatus === 'sending'
                ? 'Resending…'
                : resendStatus === 'sent'
                  ? '✓ Email resent'
                  : resendStatus === 'error'
                    ? 'Try again'
                    : 'Resend confirmation email'}
            </button>

            {/* Footer actions */}
            <div className="mt-5 text-center space-y-2">
              <button
                onClick={() => {
                  setSignupPendingEmail('')
                  setMode('login')
                  setError('')
                  setSuccess('')
                }}
                className="block w-full text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                Already verified? <span className="text-indigo-400">Sign in</span>
              </button>
              <button
                onClick={() => {
                  setSignupPendingEmail('')
                  setError('')
                  setSuccess('')
                }}
                className="block w-full text-slate-600 hover:text-slate-400 text-sm transition-colors"
              >
                Use a different email
              </button>
            </div>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="block w-full text-slate-600 hover:text-slate-400 text-sm transition-colors mt-4"
            >
              ← Back to home
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0a0f1e' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <img
            src="/favicon.png"
            alt="StudyEdge"
            className="w-9 h-9 rounded-xl"
            style={{ objectFit: 'contain' }}
          />
          <span className="text-white font-bold text-xl tracking-tight">StudyEdge</span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7"
          style={{ backgroundColor: '#111827', border: '1px solid #1e293b' }}
        >
          <h1 className="text-white font-bold text-xl mb-1">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h1>
          <p className="text-slate-500 text-sm mb-6">
            {mode === 'login' ? 'Sign in to access your study plans.' : mode === 'signup' ? 'Your data will sync across all your devices.' : 'We\'ll send a reset link to your email.'}
          </p>

          {mode !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-semibold text-slate-200 transition-all hover:border-slate-500"
                style={{ backgroundColor: '#0d1424', border: '1px solid #1e293b' }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px" style={{ backgroundColor: '#1e293b' }} />
                <span className="text-slate-600 text-xs">or</span>
                <div className="flex-1 h-px" style={{ backgroundColor: '#1e293b' }} />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-sm"
                style={{ backgroundColor: '#0d1424', border: '1px solid #1e293b' }}
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-sm"
                  style={{ backgroundColor: '#0d1424', border: '1px solid #1e293b' }}
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl px-4 py-3 text-red-300 text-sm" style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d' }}>
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-xl px-4 py-3 text-emerald-300 text-sm" style={{ backgroundColor: '#052e16', border: '1px solid #14532d' }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 0 24px #6366f130' }}
            >
              {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div className="mt-5 text-center space-y-2">
          {mode === 'login' && (
            <>
              <button onClick={() => { setMode('forgot'); setError(''); setSuccess('') }} className="block w-full text-slate-600 hover:text-slate-400 text-sm transition-colors">
                Forgot password?
              </button>
              <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }} className="block w-full text-slate-500 hover:text-slate-300 text-sm transition-colors">
                Don't have an account? <span className="text-indigo-400">Sign up</span>
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              Already have an account? <span className="text-indigo-400">Sign in</span>
            </button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              Back to sign in
            </button>
          )}
        </div>

        {onBack && (
          <button
            onClick={onBack}
            className="block w-full text-slate-600 hover:text-slate-400 text-sm transition-colors mt-2"
          >
            ← Back to home
          </button>
        )}
      </div>
    </div>
  )
}
