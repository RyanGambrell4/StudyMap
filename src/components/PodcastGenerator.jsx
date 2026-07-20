import { useState, useRef, useEffect } from 'react'
import { getActivePlan, getCachedSubscription, hasUsedTrial } from '../lib/subscription'
import { getAccessToken } from '../lib/supabase'
import { track } from '../lib/analytics'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#3B61C4', teal: '#0D9488',
}

const PROGRESS_MESSAGES = [
  'Writing your study podcast script...',
  'Generating audio for both hosts...',
  'Encoding the final audio file...',
]

function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function daysUntil(isoString) {
  if (!isoString) return null
  const diff = new Date(isoString).getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  return Math.max(0, days)
}

function timeUntil(isoString) {
  if (!isoString) return null
  const diff = new Date(isoString).getTime() - Date.now()
  if (diff <= 0) return null
  const totalHours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days === 0 && hours === 0) return 'less than an hour'
  if (days === 0) return `${hours}h`
  if (days === 1 && hours > 0) return `1 day, ${hours}h`
  if (hours === 0) return `${days} day${days !== 1 ? 's' : ''}`
  return `${days} day${days !== 1 ? 's' : ''}, ${hours}h`
}

function AudioPlayer({ url }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => setCurrent(el.currentTime)
    const onLoad = () => setDuration(el.duration)
    const onEnd = () => setPlaying(false)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onLoad)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onLoad)
      el.removeEventListener('ended', onEnd)
    }
  }, [url])

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play(); setPlaying(true) }
  }

  function seek(e) {
    const el = audioRef.current
    if (!el || !duration) return
    el.currentTime = parseFloat(e.target.value)
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div style={{ background: D.bg, borderRadius: 14, padding: '16px 18px', border: `1px solid ${D.border}` }}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={togglePlay}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: D.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
          )}
        </button>
        <div style={{ flex: 1 }}>
          <input
            type="range" min="0" max={duration || 0} step="0.1"
            value={current} onChange={seek}
            style={{ width: '100%', accentColor: D.accent, cursor: 'pointer', height: 4 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: D.textMuted }}>{formatTime(current)}</span>
            <span style={{ fontSize: 11, color: D.textMuted }}>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PodcastGenerator({ courses, userId, onClose, onShowPaywall }) {
  const plan = getActivePlan()
  const isUnlimited = plan === 'unlimited'

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [step, setStep] = useState('setup') // setup | generating | done | error
  const [msgIdx, setMsgIdx] = useState(0)
  const [error, setError] = useState('')
  const [podcast, setPodcast] = useState(null)
  const [resetAt, setResetAt] = useState(null)
  const timerRef = useRef(null)

  const hasNoCourses = courses.length === 0
  const selectedCourse = courses[selectedIdx] ?? null

  // Load existing state from subscription cache
  useEffect(() => {
    if (!isUnlimited) return
    const sub = getCachedSubscription()
    const usage = sub?.feature_usage?.podcast ?? {}
    const expired = !usage.resetAt || Date.now() >= new Date(usage.resetAt).getTime()
    const count = expired ? 0 : (usage.count ?? 0)
    if (count >= 1) {
      setResetAt(usage.resetAt)
      const existing = (sub?.podcasts ?? [])[0]
      if (existing) { setPodcast(existing); setStep('done') }
      else { setStep('limited') }
    }
  }, [isUnlimited])

  async function generate() {
    if (!selectedCourse) return
    setStep('generating')
    setError('')
    setMsgIdx(0)

    timerRef.current = setInterval(() => {
      setMsgIdx(i => Math.min(i + 1, PROGRESS_MESSAGES.length - 1))
    }, 8000)

    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courseId: selectedCourse.id, courseName: selectedCourse.name }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.upgrade) { onClose(); onShowPaywall?.('unlimited'); return }
        if (res.status === 429) { setResetAt(data.resetAt); setStep('limited'); return }
        throw new Error(data.error ?? 'Something went wrong.')
      }

      setPodcast(data.podcast)
      setResetAt(data.usage?.resetAt ?? null)
      setStep('done')
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'podcast' } }))
      track('podcast_generated', { plan: getActivePlan() })
    } catch (e) {
      setError(e.message || 'Generation failed. Please try again.')
      setStep('error')
    } finally {
      clearInterval(timerRef.current)
    }
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  // ── Not unlimited ─────────────────────────────────────────────────────────────
  if (!isUnlimited) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Podcast Generator" style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <div style={{
          background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 460,
          boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(13,148,136,0.10)', border: '1px solid rgba(13,148,136,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke={D.teal} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
            </div>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: D.text }}>Study Podcast</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: D.textDim }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" fill="none" stroke={D.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: D.text, marginBottom: 8 }}>Unlimited plan required</div>
            <div style={{ fontSize: 14, color: D.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
              Study podcasts are a premium feature. Upgrade to Unlimited to generate a weekly audio review built from your course material.
            </div>
            <button
              onClick={() => { onClose(); onShowPaywall?.('unlimited') }}
              style={{
                background: D.teal, color: '#fff', border: 'none', borderRadius: 10,
                padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                width: '100%', transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              {hasUsedTrial() ? 'Upgrade to Unlimited' : 'Start 7-day free trial'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Shared header ─────────────────────────────────────────────────────────────
  const header = (subtitle) => (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(13,148,136,0.10)', border: '1px solid rgba(13,148,136,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="16" height="16" fill="none" stroke={D.teal} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>Study Podcast</div>
        {subtitle && <div style={{ fontSize: 11.5, color: D.textMuted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: D.textDim }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )

  const wrapper = (subtitle, children) => (
    <div role="dialog" aria-modal="true" aria-label="Podcast Generator" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 500,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden',
      }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        {header(subtitle)}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )

  // ── Generating ────────────────────────────────────────────────────────────────
  if (step === 'generating') {
    return wrapper('This takes about 30 seconds',
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
          border: `3px solid ${D.border}`, borderTopColor: D.teal,
          animation: 'spin 0.9s linear infinite',
        }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: D.text, marginBottom: 8 }}>
          {PROGRESS_MESSAGES[msgIdx]}
        </div>
        <div style={{ fontSize: 13, color: D.textMuted }}>
          Your hosts Alex and Jordan are preparing your review
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
          {PROGRESS_MESSAGES.map((_, i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i === msgIdx ? D.teal : D.border,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  if (step === 'done' && podcast) {
    const days = daysUntil(resetAt)
    const timeLeft = timeUntil(resetAt)
    return wrapper('Unlimited plan',
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'rgba(13,148,136,0.05)', border: '1px solid rgba(13,148,136,0.15)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: D.teal, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            This week's podcast
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>{podcast.courseName}</div>
          {podcast.createdAt && (
            <div style={{ fontSize: 12, color: D.textMuted, marginTop: 2 }}>
              Generated {new Date(podcast.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>

        <AudioPlayer url={podcast.url} />

        <div style={{ background: D.bg, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="14" height="14" fill="none" stroke={D.textMuted} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span style={{ fontSize: 12.5, color: D.textMuted }}>
            {timeLeft
              ? `Next podcast available in ${timeLeft}`
              : 'Your next podcast is available now'}
          </span>
        </div>

        <div style={{ fontSize: 12.5, color: D.textDim, lineHeight: 1.6, padding: '0 2px' }}>
          Hosts Alex and Jordan cover the key concepts from your recent study sessions. Listen on your commute, at the gym, or whenever you need a quick review.
        </div>
      </div>
    )
  }

  // ── Limited (used this week, no cached audio) ─────────────────────────────────
  if (step === 'limited') {
    const timeLeft = timeUntil(resetAt)
    const resetDate = resetAt ? new Date(resetAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : null
    return wrapper('Unlimited plan',
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="22" height="22" fill="none" stroke={D.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8 }}>Podcast used this week</div>
        <div style={{ fontSize: 14, color: D.textMuted, lineHeight: 1.6, marginBottom: timeLeft ? 12 : 0 }}>
          You get one study podcast per week. Come back{' '}
          {timeLeft ? `in ${timeLeft}` : 'soon'} for a fresh one.
        </div>
        {timeLeft && resetDate && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)', borderRadius: 999, padding: '5px 13px', fontSize: 12.5, fontWeight: 600, color: D.teal }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Resets {resetDate}
          </div>
        )}
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return wrapper(null,
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>Generation failed</div>
        <div style={{ fontSize: 13.5, color: D.textMuted, marginBottom: 20, lineHeight: 1.6 }}>{error}</div>
        <button
          onClick={() => setStep('setup')}
          style={{ background: D.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Setup ─────────────────────────────────────────────────────────────────────
  return wrapper('1 podcast per week, Unlimited plan',
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 14, color: D.textMuted, lineHeight: 1.65 }}>
        Two AI hosts review your study notes as a conversation you can listen to anywhere. Each podcast is ~5 minutes and covers the key material from your recent sessions.
      </div>

      {hasNoCourses ? (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, color: '#92400E' }}>
          Add a course first, then come back to generate a podcast.
        </div>
      ) : (
        <>
          {courses.length > 1 && (
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: D.textMuted, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Course
              </label>
              <select
                value={selectedIdx}
                onChange={e => setSelectedIdx(Number(e.target.value))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                  border: `1px solid ${D.borderStrong}`, background: D.bgCard, color: D.text,
                  cursor: 'pointer', outline: 'none',
                }}
              >
                {courses.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ background: D.bg, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Hosts', value: 'Alex and Jordan (two distinct voices)' },
              { label: 'Length', value: '~5 minutes' },
              { label: 'Content', value: 'Key concepts from your recent study sessions' },
              { label: 'Limit', value: '1 per week' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 12.5, color: D.textMuted, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: D.text, fontWeight: 500, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>

          <button
            onClick={generate}
            style={{
              background: D.teal, color: '#fff', border: 'none', borderRadius: 12,
              padding: '13px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              width: '100%', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            Generate podcast
            {selectedCourse && courses.length > 0 && (
              <span style={{ fontWeight: 400, opacity: 0.8, marginLeft: 6, fontSize: 13 }}>
                {selectedCourse.name}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  )
}
