import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
          <span className="text-white font-bold text-xl tracking-tight">StudyMap</span>
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

      </div>
    </div>
  )
}
