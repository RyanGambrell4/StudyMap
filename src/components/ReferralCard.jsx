import { useState, useEffect } from 'react'
import { supabase, getAccessToken } from '../lib/supabase'
import { getReferralLink } from '../lib/referral'
import { track } from '../lib/analytics'

export default function ReferralCard() {
  const [userId, setUserId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [referralCount, setReferralCount] = useState(0)
  const [convertedCount, setConvertedCount] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.id) return
      setUserId(session.user.id)
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/referral-stats', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const d = await res.json()
          setReferralCount(d.total ?? 0)
          setConvertedCount(d.converted ?? 0)
        }
      } catch { /* non-critical */ }
    })
  }, [])

  if (!userId) return null

  const link = getReferralLink(userId)

  const handleCopy = () => {
    track('referral_link_copied')
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Clipboard denied - select the link text so user can copy manually
      const el = document.querySelector('[data-referral-link]')
      if (el) { const range = document.createRange(); range.selectNode(el); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range) }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Refer a Friend</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B6B6B' }}>Both of you get 1 month free</p>
        </div>
        {referralCount > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#3B61C4', background: 'rgba(59,97,196,0.08)', padding: '3px 10px', borderRadius: 999 }}>
            {referralCount} joined{convertedCount > 0 ? ` · ${convertedCount} converted` : ''}
          </span>
        )}
      </div>

      <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#9B9B9B', lineHeight: 1.6 }}>
        Share your link. When a friend upgrades to Pro, they get their first month free, and so do you.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{
          flex: 1, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)',
          borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#9B9B9B',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} data-referral-link>
          {link}
        </div>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0,
            background: copied ? 'rgba(5,150,105,0.08)' : '#3B61C4',
            border: copied ? '1px solid rgba(5,150,105,0.3)' : 'none',
            borderRadius: 8, padding: '9px 16px',
            color: copied ? '#059669' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          {copied ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Copied!</span>) : 'Copy link'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I've been using StudyEdge AI to build my study schedule and it's actually helped. Try it free: ${link}`)}`}
          target="_blank" rel="noopener noreferrer"
          onClick={() => track('referral_shared', { channel: 'twitter' })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#6B6B6B', textDecoration: 'none',
          }}
        >
          Share on X
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Use my link to try StudyEdge AI free. It builds your entire study schedule in 60 seconds: ${link}`)}`}
          target="_blank" rel="noopener noreferrer"
          onClick={() => track('referral_shared', { channel: 'whatsapp' })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#6B6B6B', textDecoration: 'none',
          }}
        >
          Share on WhatsApp
        </a>
      </div>
    </div>
  )
}
