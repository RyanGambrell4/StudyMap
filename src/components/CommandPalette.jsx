import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../lib/analytics'

const D = {
  bg:      '#FFFFFF',
  text:    '#111111',
  muted:   '#6B6B6B',
  dim:     '#9B9B9B',
  border:  'rgba(0,0,0,0.07)',
  brand:   '#3B61C4',
  brandSoft: 'rgba(59,97,196,0.10)',
}

// Fuzzy-ish match: every character in query must appear in order in target.
// Score = distance between matched characters (lower is better).
function fuzzyMatch(query, target) {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return { score: 0, matched: true }
  let ti = 0, qi = 0, lastMatch = -1, gaps = 0
  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) {
      if (lastMatch !== -1) gaps += ti - lastMatch - 1
      lastMatch = ti
      qi++
    }
    ti++
  }
  if (qi < q.length) return { matched: false, score: Infinity }
  return { matched: true, score: gaps }
}

// Group icon components — one per section, all filled color-glyphs.
function GroupIcon({ group }) {
  const props = { width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' }
  if (group === 'Start')  return <svg {...props}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/></svg>
  if (group === 'Navigate') return <svg {...props}><path d="M3 12l9-9 9 9"/><path d="M9 21V12h6v9"/></svg>
  if (group === 'Tools')  return <svg {...props}><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>
  if (group === 'Courses') return <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
  return null
}

export default function CommandPalette({ actions = [], onClose }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)

  const openPalette = useCallback(() => {
    setOpen(true)
    setQuery('')
    setSelected(0)
    track('command_palette_open')
  }, [])

  // Global Cmd/Ctrl + K opens the palette; Esc closes.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(v => !v)
        setQuery('')
        setSelected(0)
        if (!open) track('command_palette_open', { source: 'shortcut' })
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Autofocus input when the palette opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim()
    const scored = actions
      .map(a => {
        const label = fuzzyMatch(q, a.label)
        const keyword = a.keywords ? fuzzyMatch(q, a.keywords) : { matched: false, score: Infinity }
        const bestScore = Math.min(label.score, keyword.score)
        const matched = label.matched || keyword.matched
        return { ...a, matched, score: bestScore }
      })
      .filter(a => a.matched)
      .sort((a, b) => a.score - b.score)
    // Cap to 12 for keyboardability.
    return scored.slice(0, 12)
  }, [actions, query])

  // Keep selection in bounds when the filtered list changes.
  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1))
  }, [filtered.length, selected])

  const runAction = (action) => {
    setOpen(false)
    onClose?.()
    track('command_palette_run', { id: action.id, group: action.group })
    // Defer so palette unmount doesn't collide with navigation state changes.
    setTimeout(() => action.run?.(), 0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(filtered.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && filtered[selected]) { e.preventDefault(); runAction(filtered[selected]) }
  }

  // Group by section for headers.
  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach(a => {
      if (!map.has(a.group)) map.set(a.group, [])
      map.get(a.group).push(a)
    })
    return Array.from(map.entries())
  }, [filtered])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => { setOpen(false); onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 20px 20px',
      }}
    >
      <style>{`
        @keyframes cp-in { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .cp-item { transition: background 100ms ease; }
        .cp-item:hover { background: ${D.brandSoft}; }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: D.bg,
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          animation: 'cp-in 180ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${D.border}` }}>
          <svg width="16" height="16" fill="none" stroke={D.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search commands, courses, tools..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, color: D.text, background: 'transparent',
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 10.5, fontWeight: 700, color: D.dim,
            background: '#FAFAF8', border: `1px solid ${D.border}`,
            borderRadius: 5, padding: '2px 6px',
            fontFamily: 'ui-monospace, monospace', letterSpacing: 0,
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: D.muted }}>
              No commands match "{query}"
            </div>
          )}
          {(() => {
            let renderedIndex = 0
            return grouped.map(([group, items]) => (
              <div key={group}>
                <div style={{ padding: '10px 16px 4px', fontSize: 10.5, fontWeight: 700, color: D.dim, letterSpacing: '0.07em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: D.brand }}><GroupIcon group={group}/></span>
                  {group}
                </div>
                {items.map(a => {
                  const isSelected = renderedIndex === selected
                  const idx = renderedIndex
                  renderedIndex++
                  return (
                    <button
                      key={a.id}
                      className="cp-item"
                      onClick={() => runAction(a)}
                      onMouseEnter={() => setSelected(idx)}
                      style={{
                        width: '100%', border: 'none',
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px', minHeight: 44,
                        background: isSelected ? D.brandSoft : 'transparent',
                        color: D.text, cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: D.text, letterSpacing: '-0.005em' }}>{a.label}</div>
                        {a.hint && (
                          <div style={{ fontSize: 11.5, color: D.muted, marginTop: 2 }}>{a.hint}</div>
                        )}
                      </div>
                      {a.shortcut && (
                        <kbd style={{
                          fontSize: 10.5, fontWeight: 700, color: D.dim,
                          background: '#FAFAF8', border: `1px solid ${D.border}`,
                          borderRadius: 5, padding: '2px 6px',
                          fontFamily: 'ui-monospace, monospace',
                        }}>{a.shortcut}</kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          })()}
        </div>

        {/* Footer hints */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: `1px solid ${D.border}`,
          background: '#FAFAF8',
          fontSize: 11, color: D.dim, fontWeight: 600,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <kbd style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>↑↓</kbd>
              navigate
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <kbd style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>⏎</kbd>
              select
            </span>
          </span>
          <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
