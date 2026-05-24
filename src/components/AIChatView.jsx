import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getCachedCoachPlan, saveCoachPlanStruggles } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial, incrementAIQuery } from '../lib/subscription'
import { transcribeAudio, createRecorder } from '../lib/deepgram'

export default function AIChatView({ courseId, courseName, examDate, targetGrade, userId, learningStyle, onShowPaywall, onNavigateToCoach }) {
  const plan = getActivePlan()
  const isFree = plan === 'free'

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

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setMessages([])
    setInput('')
    setError('')
    setFlagBanner(null)
    if (courseId == null) return
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const { allowed } = canUseFeature('aiTutor')
    if (!allowed) {
      onShowPaywall?.('ai')
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
      const res = await fetch('/api/chat-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: newMessages.slice(-10),
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

      if (finalFlaggedTopic) {
        const updatedStruggles = struggles.includes(finalFlaggedTopic)
          ? struggles
          : [...struggles, finalFlaggedTopic]
        setStruggles(updatedStruggles)
        await saveCoachPlanStruggles(courseId, updatedStruggles)
        setFlagBanner(finalFlaggedTopic)
        setTimeout(() => setFlagBanner(null), 5000)
      }
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please try again.' }])
      setError(e.message)
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
          }
        } catch {
          // transcription failed silently
        }
      })
      recorderRef.current = recorder
      await recorder.start()
    } catch {
      setRecording(false)
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

      {/* Flag banner */}
      {flagBanner && (
        <div style={{ margin: '12px 16px 0', flexShrink: 0, padding: '12px 14px', borderRadius: 12, background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <svg style={{ width: 16, height: 16, color: '#D97706', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          <span style={{ flex: 1, fontSize: 13, color: '#92400E', fontWeight: 500, minWidth: 0 }}>
            <strong style={{ color: '#B45309' }}>{flagBanner}</strong> flagged as a struggle — added to your coach plan focus areas.
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center py-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(59,97,196,0.1)', border: '1px solid rgba(59,97,196,0.2)' }}>
              <svg className="w-5 h-5" style={{ color: '#3B61C4' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
              Ask me anything about <span className="font-semibold text-slate-700">{courseName}</span>. I can explain concepts, quiz you, or work through practice problems. If you're struggling with a topic, tell me and I'll update your study plan.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white rounded-br-md whitespace-pre-wrap'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
              }`}
              style={msg.role === 'user' ? { backgroundColor: '#3B61C4' } : undefined}
            >
              {msg.role === 'user' ? msg.content : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>,
                    code: ({ inline, children }) => inline
                      ? <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                      : <pre className="bg-slate-100 rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs font-mono whitespace-pre">{children}</pre>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 italic text-slate-600 my-1" style={{ borderColor: '#3B61C4' }}>{children}</blockquote>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    hr: () => <hr className="border-slate-200 my-2" />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 shrink-0 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-slate-100">
      {isFree && (() => { const { remaining } = canUseFeature('aiTutor'); return remaining !== null && (
        <p className="text-xs text-slate-400 mb-1.5">
          {2 - remaining} of 2 AI messages used today
          {remaining === 0 && <> · <button onClick={() => onShowPaywall?.('ai')} className="underline hover:text-slate-600">{hasUsedTrial() ? 'Upgrade to Pro' : 'Start free trial'}</button></>}
        </p>
      )})()}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${courseName}…`}
          rows={1}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none text-sm resize-none leading-relaxed"
          style={{ maxHeight: 120 }}
          onFocus={e => { e.target.style.borderColor = '#3B61C4'; e.target.style.boxShadow = '0 0 0 3px rgba(59,97,196,0.15)' }}
          onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = '' }}
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
