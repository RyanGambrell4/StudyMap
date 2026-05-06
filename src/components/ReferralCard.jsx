import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getReferralLink } from '../lib/referral'
import { getCachedSubscription } from '../lib/subscription'

export default function ReferralCard() {
  const [userId, setUserId] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id)
    })
  }, [])

  if (!userId) return null

  const link = getReferralLink(userId)
  const sub = getCachedSubscription()
  const referralCount = sub?.referralCount ?? 0

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(79,126,247,0.08), rgba(124,92,250,0.08))',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 16,
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #4F7EF7, #7C5CFA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>
            🎁
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text, #f1f5f9)' }}>
              Refer a friend
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Both of you get 1 month free
            </p>
          </div>
        </div>
        {referralCount > 0 && (
          <div style={{
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 999,
            padding: '3px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: '#818cf8',
          }}>
            {referralCount} reward{referralCount !== 1 ? 's' : ''} earned
          </div>
        )}
      </div>

      {/* Description */}
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
        Share your link. When a friend upgrades to Pro, they get their first month free —
        and so do you. No limit on how many friends you can refer.
      </p>

      {/* Link + Copy */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1,
          background: 'rgba(15,23,42,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 12,
          color: '#94a3b8',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}>
          {link}
        </div>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0,
            background: copied
              ? 'rgba(16,185,129,0.15)'
              : 'linear-gradient(135deg, #4F7EF7, #7C5CFA)',
            border: copied ? '1px solid rgba(16,185,129,0.4)' : 'none',
            borderRadius: 10,
            padding: '10px 18px',
            color: copied ? '#34d399' : '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied!' : 'Copy link'}
        </button>
      </div>

      {/* Share options */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I've been using StudyEdge AI to build my study schedule and it's actually helped. Try it free: ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '6px 12px',
            fontSize: 12, color: '#94a3b8', textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Share on X
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Use my link to try StudyEdge AI free — it builds your entire study schedule in 60 seconds: ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '6px 12px',
            fontSize: 12, color: '#94a3b8', textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Share on WhatsApp
        </a>
      </div>
    </div>
  )
}
