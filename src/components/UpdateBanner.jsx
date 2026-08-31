import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { T, SANS } from '../theme/tokens'
import { watchForUpdates, applyUpdate } from '../lib/appVersion'

/**
 * "A new version is available" bar.
 *
 * Deliberately visible rather than a silent background swap. Three bugs were
 * reported in one week that were already fixed, because the browser was serving
 * days-old code, so the whole point is that going stale becomes obvious instead
 * of invisible. See src/lib/appVersion.js for why detection and application are
 * two separate mechanisms.
 *
 * Mounted outside the error boundary in main.jsx on purpose: if stale code is
 * what crashed the app, the refresh button is the fix, and it has to survive the
 * crash to be reachable.
 */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => watchForUpdates(() => setAvailable(true)), [])

  if (!available) return null

  const onRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    applyUpdate()
  }

  // Bottom rather than top: the top of the app is the nav, and covering it is
  // what the checkout-cancelled bar got wrong. Bottom-centre is out of the way
  // of content and lands near the thumb on a phone.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 'calc(100vw - 24px)',
        padding: '12px 14px 12px 18px',
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: '0 8px 28px rgba(28,27,24,0.16)',
        fontFamily: SANS,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1.35, color: T.text }}>
        A new version is available.
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          flexShrink: 0,
          padding: '8px 16px',
          borderRadius: 9,
          border: 'none',
          background: T.blue,
          color: '#FFFFFF',
          fontFamily: SANS,
          fontSize: 14,
          fontWeight: 600,
          cursor: refreshing ? 'default' : 'pointer',
          opacity: refreshing ? 0.65 : 1,
        }}
        onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.background = T.blueHov }}
        onMouseLeave={(e) => { if (!refreshing) e.currentTarget.style.background = T.blue }}
      >
        {refreshing ? 'Refreshing' : 'Refresh'}
      </button>
    </div>,
    document.body,
  )
}
