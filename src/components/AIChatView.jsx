import { useState, useEffect, useRef } from 'react'
import { getCachedCoachPlan, saveCoachPlanStruggles } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { getActivePlan, canUseAI, incrementAIQuery } from '../lib/subscription'

export default function AIChatView({ courseId, courseName, examDate, targetGrade, userId, onShowPaywall }) {
  const isFree = getActivePlan() === 'free'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [flagBanner, setFlagBanner] = useState(null)
  const [struggles, setStruggles] = useState([])
  const [coachPlan, setCoachPlan] = useState(null)

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
    } else {
      setCoachPlan(null)
      setStruggles([])
    }
  }, [courseId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    if (!canUseAI()) {
      onShowPaywall?.('ai')
      return
    }

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to get response')

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      await incrementAIQuery()

      if (data.flaggedTopic) {
        const updatedStruggles = struggles.includes(data.flaggedTopic)
          ? struggles
          : [...struggles, data.flaggedTopic]
        setStruggles(updatedStruggles)
        await saveCoachPlanStruggles(courseId, updatedStruggles)
        setFlagBanner(data.flaggedTopic)
        setTimeout(() => setFlagBanner(null), 5000)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (isFree) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center relative h-full overflow-hidden">
        {/* Blurred mock chat */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <div className="p-5 space-y-3 opacity-25 blur-sm">
            {[
              { role: 'user', content: 'Can you explain supply and demand curves?' },
              { role: 'assistant', content: 'Sure! Supply and demand curves show the relationship between price and quantity in a market. When price rises, demand typically falls while supply increases...' },
              { role: 'user', content: "I keep confusing elasticity with slope, can you help?" },
              { role: 'assistant', content: "Great question. This trips up a lot of students. Slope is a geometric property of the curve, while elasticity measures responsiveness as a percentage change..." },
            ].map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'}`}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="text-slate-900 dark:text-white font-bold text-lg mb-1">AI Tutor</p>
            <p className="text-slate-500 text-sm max-w-[260px] leading-relaxed">AI Tutor is available on Pro and Unlimited plans</p>
          </div>
          <button
            onClick={() => onShowPaywall?.('ai')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
          >
            Upgrade to unlock
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">

      {/* Flag banner */}
      {flagBanner && (
        <div className="mx-4 mt-3 shrink-0 flex items-center gap-2.5 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 rounded-xl px-4 py-2.5 text-sm">
          <span>📌</span>
          <span className="text-indigo-700 dark:text-indigo-300 font-medium flex-1">
            '<span className="font-bold">{flagBanner}</span>' added to your study plan focus areas
          </span>
          <button onClick={() => setFlagBanner(null)} className="text-indigo-400 hover:text-indigo-600 transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
              Ask me anything about <span className="font-semibold text-slate-700 dark:text-slate-300">{courseName}</span>. I can explain concepts, quiz you, or work through practice problems. If you're struggling with a topic, tell me and I'll update your study plan.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-md'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-md'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
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
        <div className="mx-4 mb-2 shrink-0 px-3 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 rounded-xl text-red-600 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-slate-100 dark:border-slate-800 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${courseName}…`}
          rows={1}
          className="flex-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500/60 text-sm resize-none leading-relaxed"
          style={{ maxHeight: 120 }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

    </div>
  )
}
