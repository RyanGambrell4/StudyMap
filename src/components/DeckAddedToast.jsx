import { useState, useEffect, useRef } from 'react'

// DeckAddedToast — global singleton at OutputView level. Listens for the
// studyedge:deck-updated event fired by deckAdditions.js and shows a
// consolidated "N cards added to your deck · Review now →" toast. Batches
// bursts from the same session (e.g. a Session Bundle firing multiple
// tools) so students see one summary, not five overlapping toasts.

const AUTO_DISMISS_MS = 6000
const BATCH_WINDOW_MS = 1200

const SOURCE_LABEL = {
  quiz_miss: 'Quiz Burst',
  connection_miss: 'Connections',
  brain_dump_gap: 'Brain Dump',
  practice_exam_miss: 'Practice Exam',
  problem_solver: 'Problem Solver',
  gap_closer: 'Gap Closer',
}

export default function DeckAddedToast({ onReview }) {
  const [visible, setVisible] = useState(false)
  const [totalAdded, setTotalAdded] = useState(0)
  const [source, setSource] = useState(null)
  const batchTimer = useRef(null)
  const hideTimer = useRef(null)
  const pending = useRef({ added: 0, source: null })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const flush = () => {
      if (!mounted.current) return
      if (pending.current.added === 0) return
      setTotalAdded(pending.current.added)
      setSource(pending.current.source)
      setVisible(true)
      pending.current = { added: 0, source: null }
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => { if (mounted.current) setVisible(false) }, AUTO_DISMISS_MS)
    }

    const handler = (e) => {
      const detail = e.detail ?? {}
      pending.current.added += (detail.added ?? 0)
      pending.current.source = detail.source ?? pending.current.source
      if (batchTimer.current) clearTimeout(batchTimer.current)
      batchTimer.current = setTimeout(flush, BATCH_WINDOW_MS)
    }

    window.addEventListener('studyedge:deck-updated', handler)
    return () => {
      mounted.current = false
      window.removeEventListener('studyedge:deck-updated', handler)
      if (batchTimer.current) clearTimeout(batchTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  if (!visible) return null

  const sourceLabel = SOURCE_LABEL[source] ?? 'a study session'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 700,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px 10px 16px',
        background: '#111111',
        color: '#fff',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
        border: '1px solid rgba(255,255,255,0.10)',
        maxWidth: 'calc(100vw - 32px)',
        animation: 'toast-in 220ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 8px rgba(74,222,128,0.7)' }} />
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        {totalAdded} card{totalAdded === 1 ? '' : 's'} added from {sourceLabel}
      </div>
      {onReview && (
        <button
          onClick={() => { setVisible(false); onReview() }}
          style={{
            marginLeft: 4, padding: '5px 11px', borderRadius: 7,
            background: '#E8531A', color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Review now →
        </button>
      )}
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer', padding: 4, marginLeft: 2, display: 'flex',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )
}
