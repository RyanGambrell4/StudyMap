import { useState, useEffect } from 'react'
import { getAccessToken } from '../lib/supabase'
import { incrementAIQuery } from '../lib/subscription'
import { track } from '../lib/analytics'

// ExplainAs — the "explanation choice" surface. Wraps a default explanation
// with 3 mode-swap buttons (30-sec / Visual / Worked example) plus a
// "That confused me" button that asks the AI for a fundamentally different
// angle. Every explanation in the app becomes a learning surface instead of
// a dead-end.
//
// Props:
//   concept         (required) - what to re-teach
//   defaultText     (required) - the explanation the student already sees
//   contextText     - what the student answered / question stem, for grounding
//   courseContext   - hydrated CourseContext (passed straight to the API)
//   preferredMode   - optional 'short' | 'visual' | 'example' — if set, the
//                     matching button pre-selects and requests on mount so
//                     learning style auto-personalizes without a click.
//   compact         - render smaller for use inside dense lists
//   analyticsLabel  - string tag for tracking (e.g. 'quiz-burst-q')

const MODES = [
  { id: 'short',   label: '30-sec',     hint: 'Two or three sentences' },
  { id: 'visual',  label: 'Visual',     hint: 'Mental image + mapping' },
  { id: 'example', label: 'Worked example', hint: 'Step-by-step scenario' },
]

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  blue: '#3B61C4', amber: '#D97706',
}

export default function ExplainAs({
  concept,
  defaultText,
  contextText = '',
  courseContext = null,
  preferredMode = null,
  compact = false,
  analyticsLabel = 'explain',
}) {
  const [activeMode, setActiveMode] = useState(null) // null = show defaultText
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)             // { explanation, keyTakeaway, checkYourself }
  const [error, setError] = useState('')
  const [historyByMode, setHistoryByMode] = useState({}) // { mode: data } — cache so re-taps are instant

  useEffect(() => {
    if (preferredMode && !activeMode) {
      fetchMode(preferredMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredMode])

  async function fetchMode(mode) {
    // Fast path: reuse cached response for this mode.
    if (historyByMode[mode]) {
      setActiveMode(mode)
      setData(historyByMode[mode])
      return
    }
    setLoading(true)
    setError('')
    setActiveMode(mode)
    track(`${analyticsLabel}_reteach`, { mode })
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/reteach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          concept,
          context: contextText,
          mode,
          courseContext,
          priorExplanation: mode === 'confused' ? (data?.explanation ?? defaultText) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Reteach failed')
      incrementAIQuery()
      setData(json)
      setHistoryByMode(prev => ({ ...prev, [mode]: json }))
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const shown = activeMode ? data?.explanation : defaultText
  const padding = compact ? '10px 12px' : '12px 14px'
  const fontSize = compact ? 12.5 : 13

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${D.border}`, background: 'rgba(59,97,196,0.03)', overflow: 'hidden' }}>
      <div style={{ padding, borderBottom: `1px solid ${D.border}`, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {MODES.map(m => {
          const isActive = activeMode === m.id
          return (
            <button
              key={m.id}
              onClick={() => fetchMode(m.id)}
              disabled={loading}
              title={m.hint}
              style={{
                fontSize: 11.5, fontWeight: 700,
                padding: '4px 10px', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
                border: `1px solid ${isActive ? D.blue : D.border}`,
                background: isActive ? 'rgba(59,97,196,0.08)' : 'transparent',
                color: isActive ? D.blue : D.textMuted,
                fontFamily: 'inherit',
              }}
            >
              {m.label}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => fetchMode('confused')}
          disabled={loading}
          title="Explain again from a totally different angle"
          style={{
            fontSize: 11.5, fontWeight: 700,
            padding: '4px 10px', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
            border: `1px solid ${activeMode === 'confused' ? D.amber : D.border}`,
            background: activeMode === 'confused' ? 'rgba(217,119,6,0.08)' : 'transparent',
            color: activeMode === 'confused' ? D.amber : D.textDim,
            fontFamily: 'inherit',
          }}
        >
          That confused me
        </button>
      </div>
      <div style={{ padding, fontSize, color: D.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {loading ? (
          <span style={{ color: D.textDim, fontStyle: 'italic' }}>Re-explaining…</span>
        ) : error ? (
          <span style={{ color: '#DC2626' }}>{error}</span>
        ) : (
          shown
        )}
      </div>
      {data?.keyTakeaway && !loading && (
        <div style={{ padding: `0 ${compact ? 12 : 14}px 10px`, fontSize: fontSize - 0.5, color: D.textMuted }}>
          <strong style={{ color: D.blue, fontSize: 10.5, letterSpacing: '0.06em' }}>TAKEAWAY · </strong>
          {data.keyTakeaway}
        </div>
      )}
      {data?.checkYourself && !loading && (
        <div style={{ padding: `0 ${compact ? 12 : 14}px 10px`, fontSize: fontSize - 0.5, color: D.textMuted, fontStyle: 'italic' }}>
          Check yourself: {data.checkYourself}
        </div>
      )}
    </div>
  )
}
