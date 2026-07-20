import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getCachedCoachPlan, saveCoachPlanStruggles } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial, incrementAIQuery, canUseUnlimitedFeature } from '../lib/subscription'
import { transcribeAudio, createRecorder } from '../lib/deepgram'
import { track } from '../lib/analytics'

export default function AIChatView({ courseId, courseName, examDate, targetGrade, userId, learningStyle, onShowPaywall, onNavigateToCoach, initialMessage = null, paywallTrigger = 'ai', courseIdx = 0 }) {
  const plan = getActivePlan()
  const isFree = plan === 'free'

  // Namespace by userId so switching accounts on the same device doesn't leak
  // the previous user's chat. Falls back to `anon` for pre-login screens.
  const chatKey = courseId != null ? `se_chat_v2_${userId ?? 'anon'}_${courseId}` : null
  const legacyChatKey = courseId != null ? `se_chat_${courseId}` : null

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [flagBanner, setFlagBanner] = useState(null)
  const [struggles, setStruggles] = useState([])
  const [coachPlan, setCoachPlan] = useState(null)
  const [professorEmphasis, setProfessorEmphasis] = useState(null)
  const [strengths, setStrengths] = useState(null)

  const [recording, setRecording] = useState(false)
  const [recorderRef] = useState(() => ({ current: null }))
  const [tutorMemoryNudgeDismissed, setTutorMemoryNudgeDismissed] = useState(false)
  const [isResumedSession, setIsResumedSession] = useState(false)

  const hasTutorMemory = canUseUnlimitedFeature('tutorMemory')

  // Fire a PostHog event the first time the nudge becomes visible
  useEffect(() => {
    if (!hasTutorMemory && messages.length === 8) {
      track('tutor_memory_nudge_shown', { messageCount: messages.length })
    }
  }, [messages.length, hasTutorMemory])

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setInput('')
    setError('')
    setFlagBanner(null)
    if (courseId == null) {
      setMessages([])
      return
    }
    // Restore chat history — prefer persistent localStorage, migrate any
    // leftover sessionStorage entries from the pre-persistence build.
    try {
      let raw = localStorage.getItem(chatKey)
      if (!raw && legacyChatKey) {
        const legacy = sessionStorage.getItem(legacyChatKey)
        if (legacy) {
          raw = legacy
          try { localStorage.setItem(chatKey, legacy) } catch {}
          try { sessionStorage.removeItem(legacyChatKey) } catch {}
        }
      }
      const parsed = raw ? JSON.parse(raw) : []
      setMessages(Array.isArray(parsed) ? parsed : [])
      setIsResumedSession(Array.isArray(parsed) && parsed.length > 0)
    } catch {
      setMessages([])
      setIsResumedSession(false)
    }
    if (initialMessage) setInput(initialMessage)
    const cached = getCachedCoachPlan(courseId)
    if (cached) {
      setCoachPlan(cached.plan ?? null)
      setStruggles(cached.struggles ?? [])
      setProfessorEmphasis(cached.formData?.emphasisTopics ?? cached.formData?.topics?.join(', ') ?? null)
      setStrengths(cached.formData?.strengths ?? null)
    } else {
      setCoachPlan(null)
      setStruggles([])
      setProfessorEmphasis(null)
      setStrengths(null)
    }
  }, [courseId])

  // Persist messages to localStorage after each completed exchange so
  // history survives refresh. Cap at ~50 messages to bound storage.
  useEffect(() => {
    if (!loading && messages.length > 0 && chatKey) {
      try {
        localStorage.setItem(chatKey, JSON.stringify(messages.slice(-50)))
      } catch {}
    }
  }, [messages, loading, chatKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (overrideText) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    const { allowed } = canUseFeature('aiTutor')
    if (!allowed) {
      onShowPaywall?.(paywallTrigger)
      return
    }

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

    // Add empty assistant message that will be filled in during streaming
    setMessages([...newMessages, { role: 'assistant', content: '' }])

    try {
      const token = await getAccessToken()
      // Unlimited plan ships full session memory so the tutor never asks for
      // context the student already gave earlier in the conversation. Pro and
      // Free fall back to the trailing 10 messages to keep prompt cost bounded.
      const messagesForApi = hasTutorMemory ? newMessages : newMessages.slice(-10)
      const res = await fetch('/api/chat-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: messagesForApi,
          tutorMemory: hasTutorMemory,
          courseName,
          examDate: examDate ?? null,
          targetGrade: targetGrade ?? null,
          coachPlan,
          struggles: struggles.length ? struggles : null,
          professorEmphasis: professorEmphasis ?? null,
          strengths: strengths ?? null,
          learningStyle: learningStyle ?? null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setMessages([...newMessages, { role: 'assistant', content: err.error ?? 'Something went wrong.' }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let finalReply = null
      let finalFlaggedTopic = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.error) {
                setMessages([...newMessages, { role: 'assistant', content: data.error }])
                return
              }
              if (data.text) {
                fullText += data.text
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: fullText }
                  return updated
                })
              }
              if (data.done) {
                finalReply = data.reply ?? fullText
                finalFlaggedTopic = data.flaggedTopic ?? null
                // Replace streaming text with the cleaned parsed reply
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: finalReply }
                  return updated
                })
              }
            } catch {}
          }
        }
      }

      await incrementAIQuery()

      track('ai_message_sent', {
        course_name: courseName,
        message_count: newMessages.filter(m => m.role === 'user').length,
        flagged_topic: finalFlaggedTopic ?? null,
      })

      if (finalFlaggedTopic) {
        track('ai_topic_flagged', { topic: finalFlaggedTopic, course_name: courseName })
        const updatedStruggles = struggles.includes(finalFlaggedTopic)
          ? struggles
          : [...struggles, finalFlaggedTopic]
        setStruggles(updatedStruggles)
        await saveCoachPlanStruggles(courseId, updatedStruggles)
        setFlagBanner(finalFlaggedTopic)
        setTimeout(() => setFlagBanner(null), 5000)
        getAccessToken().then(token => {
          fetch('/api/log-struggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ courseName, topic: finalFlaggedTopic }),
          }).catch(() => {})
        })
      }
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please try again.' }])
      setError(e.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleMicToggle = async () => {
    if (recording) {
      recorderRef.current?.stop()
      setRecording(false)
      return
    }

    try {
      setRecording(true)
      const recorder = createRecorder(async (blob) => {
        try {
          const transcript = await transcribeAudio(blob)
          if (transcript) {
            setInput(prev => prev ? prev + ' ' + transcript : transcript)
            track('voice_input_used', { course_name: courseName })
          } else {
            setError('Could not transcribe audio. Try again.')
          }
        } catch {
          setError('Transcription failed. Try again.')
        }
      })
      recorderRef.current = recorder
      await recorder.start()
    } catch {
      setRecording(false)
      setError('Could not access microphone. Check your browser permissions.')
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <style>{`
        @keyframes bounce { 0%,100% { transform: translateY(-30%); animation-timing-function: cubic-bezier(0.8,0,1,1); } 50% { transform: translateY(0); animation-timing-function: cubic-bezier(0,0,0.2,1); } }
        @keyframes chat-in { from { opacity: 0; transform: translateY(5px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      {/* Flag banner */}
      {flagBanner && (
        <div style={{ margin: '12px 16px 0', flexShrink: 0, padding: '12px 14px', borderRadius: 12, background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <svg style={{ width: 16, height: 16, color: '#D97706', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          <span style={{ flex: 1, fontSize: 13, color: '#92400E', fontWeight: 500, minWidth: 0 }}>
            <strong style={{ color: '#B45309' }}>{flagBanner}</strong> flagged as a struggle. Added to your coach plan focus areas.
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            {onNavigateToCoach && (
              <button
                onClick={() => { setFlagBanner(null); onNavigateToCoach() }}
                style={{ fontSize: 12, fontWeight: 700, color: '#B45309', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Rebuild coach plan →
              </button>
            )}
            <button onClick={() => setFlagBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', padding: 2, display: 'flex' }}>
              <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isResumedSession && messages.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: hasTutorMemory ? 'rgba(5,150,105,0.05)' : 'rgba(0,0,0,0.03)', border: `1px solid ${hasTutorMemory ? 'rgba(5,150,105,0.15)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 10, marginBottom: 4 }}>
            <svg width="12" height="12" fill="none" stroke={hasTutorMemory ? '#059669' : '#9B9B9B'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span style={{ fontSize: 12, color: hasTutorMemory ? '#059669' : '#9B9B9B', fontWeight: 500, flex: 1 }}>
              {hasTutorMemory
                ? `Tutor remembers this full session (${messages.length} messages)`
                : messages.length > 10
                  ? `Continuing session · tutor sees the last 10 of ${messages.length} messages`
                  : `Continuing from your last session`}
            </span>
            {!hasTutorMemory && messages.length > 10 && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'tutorMemory' } }))}
                style={{ fontSize: 11, fontWeight: 700, color: '#3B61C4', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
              >
                Upgrade for full memory
              </button>
            )}
          </div>
        )}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 200, textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,97,196,0.1)', border: '1px solid rgba(59,97,196,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <svg width="20" height="20" style={{ color: '#3B61C4' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 4 }}>Your AI tutor for {courseName}</p>
            <p style={{ fontSize: 12, color: '#9B9B9B', maxWidth: 220, lineHeight: 1.6, marginBottom: 20 }}>
              Explain concepts, quiz me, work through problems, or build my study plan.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300 }}>
              {[
                `Explain the most important concept in ${courseName} that I need to master`,
                `Quiz me on ${courseName} with 3 practice questions`,
                `What should I focus on most to do well on my exam?`,
                `I'm struggling with ${courseName}. What's the best way to study it?`,
              ].map(prompt => (
                <button
                  key={prompt}
                  onClick={() => { track('tutor_suggestion_tapped', { courseName }); sendMessage(prompt) }}
                  style={{
                    textAlign: 'left', padding: '9px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.4,
                    background: 'rgba(59,97,196,0.05)', border: '1px solid rgba(59,97,196,0.15)',
                    color: '#3B4B6B', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,97,196,0.10)'; e.currentTarget.style.borderColor = 'rgba(59,97,196,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,97,196,0.05)'; e.currentTarget.style.borderColor = 'rgba(59,97,196,0.15)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'chat-in 200ms ease both' }}>
            <div
              style={{
                maxWidth: '82%', padding: '10px 14px', borderRadius: 18, fontSize: 14, lineHeight: 1.6,
                ...(msg.role === 'user'
                  ? { background: '#3B61C4', color: '#fff', borderBottomRightRadius: 4, whiteSpace: 'pre-wrap' }
                  : { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', color: '#111111', borderBottomLeftRadius: 4 }
                )
              }}
            >
              {msg.role === 'user' ? msg.content : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ listStyleType: 'disc', paddingLeft: 18, marginBottom: 8 }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ listStyleType: 'decimal', paddingLeft: 18, marginBottom: 8 }}>{children}</ol>,
                    li: ({ children }) => <li style={{ lineHeight: 1.6, marginBottom: 2 }}>{children}</li>,
                    h1: ({ children }) => <h1 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, marginTop: 8 }}>{children}</h1>,
                    h2: ({ children }) => <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, marginTop: 8 }}>{children}</h2>,
                    h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, marginTop: 6 }}>{children}</h3>,
                    code: ({ inline, children }) => inline
                      ? <code style={{ background: '#F7F6F3', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{children}</code>
                      : <pre style={{ background: '#F7F6F3', borderRadius: 8, padding: '10px 12px', margin: '8px 0', overflowX: 'auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre' }}>{children}</pre>,
                    blockquote: ({ children }) => <blockquote style={{ borderLeft: '2px solid #3B61C4', paddingLeft: 10, fontStyle: 'italic', color: '#6B6B6B', margin: '4px 0' }}>{children}</blockquote>,
                    strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                    hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.07)', margin: '8px 0' }} />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 18, borderBottomLeftRadius: 4, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 5 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 6, height: 6, background: '#9B9B9B', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.2s infinite', animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {!hasTutorMemory && !tutorMemoryNudgeDismissed && messages.length >= 8 && (
          <div style={{
            margin: '8px 0',
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(59,97,196,0.06)',
            border: '1px solid rgba(59,97,196,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <span style={{ fontSize: 12.5, color: '#3B61C4', lineHeight: 1.4 }}>
              Long conversations drop early context. Unlimited keeps the full session in memory.
            </span>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'tutorMemory' } }))
                }}
                style={{ padding: '5px 10px', borderRadius: 6, background: '#3B61C4', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}
              >
                Upgrade
              </button>
              <button
                onClick={() => setTutorMemoryNudgeDismissed(true)}
                style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 16px 8px', flexShrink: 0, padding: '8px 12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, fontSize: 12, color: '#DC2626' }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '8px 16px 16px', flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
      {isFree && (() => { const { remaining } = canUseFeature('aiTutor'); return remaining !== null && (
        <p style={{ fontSize: 12, marginBottom: 6, color: remaining <= 1 ? '#D97706' : '#9B9B9B', fontWeight: remaining <= 1 ? 600 : 400 }}>
          {remaining === 0
            ? <>Out of free AI questions · <button onClick={() => onShowPaywall?.(paywallTrigger)} style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit' }}>{hasUsedTrial() ? 'Upgrade to Pro - 100/month' : 'Start 7-day trial - 100/month'}</button></>
            : remaining === 1
            ? <>1 free AI question left · <button onClick={() => onShowPaywall?.(paywallTrigger)} style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit' }}>{hasUsedTrial() ? 'Upgrade to Pro' : 'Start 7-day free trial'}</button></>
            : <>{remaining} free AI questions left · Pro gives you 100/month</>
          }
        </p>
      )})()}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${courseName}…`}
          rows={1}
          style={{
            flex: 1, background: '#F7F6F3', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 12,
            padding: '10px 14px', color: '#111111', fontSize: 14, resize: 'none',
            lineHeight: 1.5, outline: 'none', maxHeight: 120, fontFamily: 'inherit',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#3B61C4'; e.target.style.boxShadow = '0 0 0 3px rgba(59,97,196,0.15)' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
        />
        <button
          onClick={handleMicToggle}
          title={recording ? 'Stop recording' : 'Voice input'}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none',
            background: recording ? 'rgba(239,68,68,0.1)' : 'rgba(59,97,196,0.08)',
            color: recording ? '#EF4444' : '#3B61C4',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            animation: recording ? 'pulse 1s infinite' : 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {recording
              ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
              : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
            }
          </svg>
        </button>
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl disabled:opacity-40 text-white transition-colors"
          style={{ backgroundColor: '#3B61C4' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#3155b3' }}
          onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#3B61C4' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
      </div>

    </div>
  )
}
