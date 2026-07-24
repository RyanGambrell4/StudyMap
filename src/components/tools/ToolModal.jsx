import { useState, useEffect } from 'react'
import { T, SERIF, SANS, courseColor } from '../../theme/tokens'
import { getBestPickTopic } from './toolBestPick'

// One reusable entry modal for every tool.
// - Header: icon square, name, one-line description, close X
// - "Best pick for you right now" card: course pill + change, topic headline,
//   one context line, CTA button, one muted cost/limit line
// - "or pick something else" link at the bottom
//
// Props:
//   tool: { id, name, desc, icon (JSX), color }
//   courses: array (for the course picker)
//   defaultCourseIdx, defaultTopic, contextLine, ctaLabel, costLine, urgencyRed
//   onStart({ courseIdx, topic })
//   onClose()
//   onPickManual() — used by the "or pick something else" link.
export default function ToolModal({
  tool,
  courses,
  defaultCourseIdx = 0,
  defaultTopic = '',
  contextLine = '',
  ctaLabel,
  costLine = '',
  urgencyRed = false,
  disabled = false,
  disabledReason = '',
  onStart,
  onClose,
  onPickManual,
}) {
  const [courseIdx, setCourseIdx] = useState(defaultCourseIdx)
  const [topic, setTopic] = useState(defaultTopic)
  const [showPicker, setShowPicker] = useState(false)

  // Re-sync when a different tool opens with a different default.
  useEffect(() => {
    setCourseIdx(defaultCourseIdx)
    setTopic(defaultTopic)
    setShowPicker(false)
  }, [tool?.id, defaultCourseIdx, defaultTopic])

  const course = courses?.[courseIdx] ?? null
  const c = course?.color ?? courseColor(courseIdx)
  const buttonBg = urgencyRed ? T.red : T.blue
  const buttonHov = urgencyRed ? T.redHov : T.blueHov

  // Backdrop click closes.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tool?.name ?? 'Study tool'}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(28,27,24,0.42)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: SANS,
        animation: 'tm-fade 180ms ease both',
      }}
    >
      <style>{`
        @keyframes tm-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tm-in { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
        .tm-btn { transition: background 0.15s, transform 0.1s }
        .tm-btn:hover { background: ${buttonHov} !important }
        .tm-btn:active { transform: scale(0.98) }
        .tm-link { color: ${T.blue}; text-decoration: none; font-weight: 600 }
        .tm-link:hover { text-decoration: underline }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: T.card,
          borderRadius: 20, border: `1px solid ${T.border}`,
          boxShadow: '0 32px 80px rgba(28,27,24,0.18)',
          padding: 24, animation: 'tm-in 240ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: `${tool?.color ?? T.blue}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: tool?.color ?? T.blue, flexShrink: 0,
          }}>
            {tool?.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
              {tool?.name}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: T.muted, lineHeight: 1.4 }}>
              {tool?.desc}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer', color: T.dim,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* "Best pick" section */}
        <div style={{
          fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em',
          color: T.dim, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Best pick for you right now
        </div>

        <div style={{
          background: T.neutralBg, borderRadius: 16, padding: 20,
          border: `1px solid ${T.border}`,
        }}>
          {/* Course pill + change link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 12px', borderRadius: 999,
              background: c.halo, color: c.dot,
              fontSize: 13, fontWeight: 700,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot }} />
              {course?.name ?? 'No course'}
            </div>
            {courses?.length > 1 && (
              <button
                onClick={() => setShowPicker(v => !v)}
                className="tm-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
              >
                change
              </button>
            )}
          </div>

          {/* Inline course picker */}
          {showPicker && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {courses.map((cc, i) => {
                const active = i === courseIdx
                const cc2 = cc.color ?? courseColor(i)
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setCourseIdx(i)
                      setShowPicker(false)
                      // Refresh topic when course changes.
                      const t = getBestPickTopic(cc?.id ?? null)
                      if (t.topic) setTopic(t.topic)
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 999,
                      background: active ? cc2.halo : T.card,
                      color: active ? cc2.dot : T.muted,
                      border: `1px solid ${active ? cc2.dot + '40' : T.border}`,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cc2.dot }} />
                    {cc.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Topic headline */}
          <h3 style={{
            margin: 0, fontSize: 24, fontWeight: 700, color: T.text,
            letterSpacing: '-0.015em', lineHeight: 1.15,
          }}>
            {topic || 'Your course material'}
          </h3>

          {/* Context line */}
          {contextLine && (
            <p style={{ margin: '4px 0 18px', fontSize: 14, color: T.muted, lineHeight: 1.4 }}>
              {contextLine}
            </p>
          )}
          {!contextLine && <div style={{ height: 18 }} />}

          {/* CTA */}
          <button
            className="tm-btn"
            onClick={() => onStart?.({ courseIdx, topic })}
            disabled={disabled}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 12,
              background: disabled ? T.neutral : buttonBg, color: '#FFFFFF',
              border: 'none', fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.005em',
              boxShadow: disabled ? 'none' : `0 6px 18px ${urgencyRed ? 'rgba(214,69,69,0.28)' : 'rgba(52,82,217,0.28)'}`,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {ctaLabel ?? 'Start'}
          </button>

          {/* Cost / limit line */}
          {(costLine || (disabled && disabledReason)) && (
            <p style={{
              margin: '10px 0 0', fontSize: 12.5, color: T.dim,
              textAlign: 'center',
            }}>
              {disabled ? disabledReason : costLine}
            </p>
          )}
        </div>

        {/* "or pick something else" */}
        {onPickManual && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button
              onClick={onPickManual}
              className="tm-link"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, padding: '4px 8px', fontFamily: 'inherit',
                textDecoration: 'underline', textUnderlineOffset: 4,
              }}
            >
              or pick something else
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
