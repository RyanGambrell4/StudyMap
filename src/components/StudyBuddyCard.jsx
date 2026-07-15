import { useState, useEffect } from 'react'
import { supabase, getAccessToken } from '../lib/supabase'
import { track } from '../lib/analytics'

const BUDDY_STORAGE_KEY = 'studyedge_buddy_id'

function getBuddyLink(userId) {
  return `https://getstudyedge.com/app?buddy=${userId}&utm_source=buddy_invite`
}

export default function StudyBuddyCard({ userId: propUserId }) {
  const [userId, setUserId] = useState(propUserId ?? null)
  const [linkedBuddyId, setLinkedBuddyId] = useState(() => localStorage.getItem(BUDDY_STORAGE_KEY) ?? '')
  const [inputCode, setInputCode] = useState('')
  const [buddy, setBuddy] = useState(null) // { displayName, streak, sessionCount, courseNames, daysSinceLastSession }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nudgeSent, setNudgeSent] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState(linkedBuddyId ? 'buddy' : 'invite') // 'invite' | 'link' | 'buddy'

  useEffect(() => {
    if (!propUserId) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) setUserId(session.user.id)
      })
    }
  }, [propUserId])

  // Handle ?buddy= query param on load (someone clicked an invite link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const incomingBuddy = params.get('buddy')
    if (incomingBuddy && incomingBuddy !== userId) {
      setInputCode(incomingBuddy)
      setView('link')
    }
  }, [userId])

  // Load existing buddy stats
  useEffect(() => {
    if (linkedBuddyId && userId) fetchBuddyStats(linkedBuddyId)
  }, [linkedBuddyId, userId])

  async function fetchBuddyStats(buddyId) {
    setLoading(true)
    setError('')
    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/buddy?code=${encodeURIComponent(buddyId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load buddy')
      setBuddy(data)
      setView('buddy')
    } catch (err) {
      setError(err.message ?? 'Failed to load buddy')
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkBuddy() {
    const code = inputCode.trim()
    if (!code) return
    // Accept full URL or bare UUID
    const uuidMatch = code.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    const buddyId = uuidMatch?.[0] ?? code
    if (buddyId === userId) { setError("That's your own code — share it with a friend instead."); return }
    localStorage.setItem(BUDDY_STORAGE_KEY, buddyId)
    setLinkedBuddyId(buddyId)
    await fetchBuddyStats(buddyId)
    setInputCode('')
    track('study_buddy_linked')
  }

  async function handleNudge() {
    if (!linkedBuddyId || nudging) return
    setNudging(true)
    try {
      const token = await getAccessToken()
      const myEmail = (await supabase.auth.getSession())?.data?.session?.user?.email ?? ''
      const fromName = myEmail.split('@')[0].split('.')?.[0]
      const fromNameCapped = fromName.charAt(0).toUpperCase() + fromName.slice(1)
      const res = await fetch('/api/buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'nudge', buddyId: linkedBuddyId, fromName: fromNameCapped }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send nudge')
      setNudgeSent(true)
      track('study_buddy_nudge_sent')
      setTimeout(() => setNudgeSent(false), 4000)
    } catch (err) {
      setError(err.message ?? 'Failed to send nudge')
    } finally {
      setNudging(false)
    }
  }

  function handleCopy() {
    if (!userId) return
    navigator.clipboard.writeText(getBuddyLink(userId)).then(() => {
      setCopied(true)
      track('study_buddy_link_copied')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const myLink = userId ? getBuddyLink(userId) : ''

  if (!userId) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Study Buddy</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6B6B6B' }}>Stay accountable with a friend</p>
        </div>
        {view === 'buddy' && buddy && (
          <button
            onClick={() => { localStorage.removeItem(BUDDY_STORAGE_KEY); setLinkedBuddyId(''); setBuddy(null); setView('invite') }}
            style={{ fontSize: 11.5, color: '#9B9B9B', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
          >
            Change
          </button>
        )}
      </div>

      {/* ── Buddy stats view ── */}
      {view === 'buddy' && (
        <div>
          {loading && <p style={{ fontSize: 13, color: '#9B9B9B', textAlign: 'center', padding: '12px 0' }}>Loading buddy…</p>}
          {buddy && !loading && (
            <div>
              <div style={{ background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.12)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#3B61C4,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {buddy.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#111' }}>{buddy.displayName}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B6B6B' }}>
                      {buddy.daysSinceLastSession === 0
                        ? 'Studied today ✓'
                        : buddy.daysSinceLastSession === 1
                          ? 'Studied yesterday'
                          : buddy.daysSinceLastSession != null
                            ? `Last studied ${buddy.daysSinceLastSession}d ago`
                            : 'No sessions yet'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: buddy.streak > 0 ? '#F97316' : '#9B9B9B', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      {buddy.streak > 0 && <svg width="18" height="18" viewBox="0 0 24 24" fill="#F97316" stroke="none"><path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32-2.59 2.11-3.66 5.65-2.37 8.83.04.1.08.2.08.33 0 .22-.15.42-.35.5-.23.1-.47.04-.66-.12a.58.58 0 01-.14-.17c-1.13-1.43-1.31-3.48-.55-5.12C5.78 9 4.87 10.3 4 11.19c-1.17 1.2-1.78 2.95-1.7 4.7.08 1.5.56 2.99 1.45 4.2 1.28 1.79 3.29 2.92 5.45 3.06 2.28.15 4.59-.5 6.19-2.1 1.65-1.66 2.33-4 1.7-6.2l-.13-.47c-.19-.77-.35-1.57-.4-2.38.21.2.42.42.59.68.31.49.52 1.05.62 1.62.3 1.72-.05 3.62-1.3 4.93z"/></svg>}
                      {buddy.streak}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9B9B9B' }}>day streak</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: '#fff', borderRadius: 8, padding: '8px 4px' }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111', letterSpacing: -0.3 }}>{buddy.sessionCount}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9B9B9B' }}>sessions</p>
                  </div>
                  {buddy.courseNames?.length > 0 && (
                    <div style={{ flex: 2, textAlign: 'center', background: '#fff', borderRadius: 8, padding: '8px 8px' }}>
                      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#3B61C4', lineHeight: 1.4 }}>
                        {buddy.courseNames.slice(0, 2).join(', ')}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: '#9B9B9B' }}>courses</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleNudge}
                disabled={nudging || nudgeSent}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  background: nudgeSent ? 'rgba(22,163,74,0.08)' : '#111',
                  border: nudgeSent ? '1px solid rgba(22,163,74,0.3)' : 'none',
                  color: nudgeSent ? '#16a34a' : '#fff',
                  fontWeight: 700, fontSize: 13, cursor: nudging || nudgeSent ? 'not-allowed' : 'pointer',
                  opacity: nudging ? 0.7 : 1, fontFamily: 'inherit', transition: 'all 0.2s',
                }}
              >
                {nudgeSent ? '✓ Nudge sent!' : nudging ? 'Sending…' : `Nudge ${buddy.displayName}`}
              </button>
              {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 6, textAlign: 'center' }}>{error}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Invite view ── */}
      {(view === 'invite' || view === 'link') && (
        <div>
          {/* My invite link */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#6B6B6B', lineHeight: 1.5 }}>
              Share your link — when your buddy opens it, they can link to you automatically.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: '#fff', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, padding: '9px 12px', fontSize: 11.5, color: '#9B9B9B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myLink}
              </div>
              <button
                onClick={handleCopy}
                style={{ flexShrink: 0, background: copied ? 'rgba(22,163,74,0.08)' : '#3B61C4', border: copied ? '1px solid rgba(22,163,74,0.3)' : 'none', borderRadius: 8, padding: '9px 14px', color: copied ? '#059669' : '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Enter buddy's code */}
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6B6B6B' }}>Have their link or code? Paste it below:</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={inputCode}
                onChange={e => { setInputCode(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && inputCode.trim() && handleLinkBuddy()}
                placeholder="Paste buddy invite link or code…"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E5E5', fontSize: 13, color: '#111', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = '#3B61C4'}
                onBlur={e => e.target.style.borderColor = '#E5E5E5'}
              />
              <button
                onClick={handleLinkBuddy}
                disabled={!inputCode.trim() || loading}
                style={{ flexShrink: 0, background: '#3B61C4', border: 'none', borderRadius: 8, padding: '9px 14px', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: inputCode.trim() && !loading ? 'pointer' : 'not-allowed', opacity: inputCode.trim() && !loading ? 1 : 0.5, fontFamily: 'inherit' }}
              >
                {loading ? '…' : 'Link'}
              </button>
            </div>
            {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
