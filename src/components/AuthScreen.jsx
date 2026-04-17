import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen({ initialMode, onBack }) {
  const [mode, setMode] = useState(() =>
    initialMode || (new URLSearchParams(window.location.search).get('signup') === '1' ? 'signup' : 'login')
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleGoogleSignIn = async () => {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app' },
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
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccess('Check your email to confirm your account, then come back and log in.')
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

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0a0f1e' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
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
