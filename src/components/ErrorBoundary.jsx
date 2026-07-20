import { Component } from 'react'
import { captureError } from '../lib/sentry'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorId: null }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      /Loading chunk \d+ failed/.test(error?.message ?? '') ||
      /Failed to fetch dynamically imported module/.test(error?.message ?? '') ||
      /error loading dynamically imported module/.test(error?.message ?? '')

    if (isChunkError) {
      const key = 'studyedge_chunk_reload_at'
      const last = Number(sessionStorage.getItem(key) ?? 0)
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
        return
      }
    }

    captureError(error, { componentStack: info.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh',
          background: '#F7F6F3', padding: 24, textAlign: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '32px 28px',
            maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 20 }}>
              This error has been reported. Try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%', padding: '11px',
                background: '#3B61C4', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
