/**
 * PushPromptCard - the "turn on reminders" banner.
 *
 * Extracted from DashboardView (V1) because it was defined inline there and
 * nowhere else, and `se_dashboard_v2` defaults ON, so V1 never mounts. The
 * result was that no user on the default dashboard was ever asked to enable
 * notifications. Same failure as the streak: a finished retention feature
 * living in a component that does not render.
 *
 * Self-gating: renders nothing unless the browser can actually take a
 * subscription and the user has neither granted, denied nor dismissed.
 *
 * `earned` exists because a permission prompt is one-shot. A browser denial is
 * effectively permanent, so we do not spend it on someone who has not yet done
 * anything worth reminding them about. Callers pass true once the user has a
 * completed session behind them.
 */

import { usePushNotifications } from '../utils/usePushNotifications'
import { track } from '../lib/analytics'
import { T, RADIUS } from '../theme/tokens'

export default function PushPromptCard({ earned = true, wrapperStyle = null }) {
  // The hook ignores its argument; it reads permission state off the browser.
  const { shouldPrompt, requestAndSubscribe, dismiss } = usePushNotifications()

  if (!earned || !shouldPrompt) return null

  // Applied only when the card actually renders, so a caller's page padding
  // does not leave an empty gap on the far more common null path.
  const card = (
    <div style={{
      background: T.blueBg,
      border: `1px solid rgba(52,82,217,0.2)`,
      borderRadius: RADIUS.md,
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32,
        background: T.card, border: `1px solid rgba(52,82,217,0.25)`,
        borderRadius: RADIUS.sm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: T.text }}>
          Never miss a study session
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
          Get a daily nudge at 9 AM so your streak stays alive and exams do not sneak up on you.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <button
          onClick={() => { track('push_subscribe_clicked'); requestAndSubscribe() }}
          style={{
            background: T.blue, border: 'none', borderRadius: RADIUS.sm,
            padding: '8px 14px', fontSize: 12, fontWeight: 700,
            color: '#FFFFFF', cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'inherit', minHeight: 36,
          }}
        >
          Turn on reminders
        </button>
        <button
          onClick={() => { track('push_subscribe_dismissed'); dismiss() }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.dim, fontSize: 18, lineHeight: 1, padding: '0 2px',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )

  return wrapperStyle ? <div style={wrapperStyle}>{card}</div> : card
}
