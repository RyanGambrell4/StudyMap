/**
 * CelebrationOverlay - every surface the celebration controller can raise.
 *
 * Mounted ONCE, at the AppShell level. Features never mount their own copy;
 * they request a tier from the controller and this listens. That is what keeps
 * the frequency caps meaningful: there is exactly one place that can paint a
 * celebration, so there is exactly one place to audit.
 *
 * Handles four controller events:
 *   overlay  MAJOR  full screen takeover, 1400ms, offers a share card
 *   toast    MEDIUM non-blocking strip, 700ms, never interrupts input
 *   badge    reduced-motion substitute for either of the above
 *   repair   NOT a reward. Raised when a scored session came in under the
 *            floor. Names the concept she lost and offers one button that
 *            drills it. Deliberately shares none of the reward vocabulary:
 *            no green, no check mark, no confetti, no tone, and it waits to be
 *            dismissed instead of expiring, because it carries an action.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { subscribeCelebration } from '../../lib/celebration'
import { DURATION, SPRING, EASE, useReducedMotion } from '../../lib/motion'
import { track } from '../../lib/analytics'
import { T, RADIUS, SERIF } from '../../theme/tokens'

const CheckMark = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function ShareCard({ title, body, onShared }) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const text = body ? `${title}. ${body}` : title
    track('celebration_share_tapped', { title })
    try {
      if (navigator.share) {
        await navigator.share({ title: 'StudyEdge AI', text })
        onShared?.()
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* user dismissed the sheet, nothing to do */ }
  }, [title, body, onShared])

  return (
    <button
      type="button"
      onClick={handleShare}
      style={{
        marginTop: 18,
        padding: '10px 18px',
        minHeight: 44,
        borderRadius: RADIUS.pill,
        border: `1px solid ${T.border}`,
        background: T.card,
        color: T.text,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {copied ? 'Copied' : 'Share this'}
    </button>
  )
}

/**
 * The under-the-floor response. One sentence naming what she lost, one button
 * that fixes only that, and a way out. No praise, no consolation, no "keep
 * going". Competence is the comfort here.
 */
function RepairPrompt({ data, onDismiss }) {
  const reduced = useReducedMotion()

  const startDrill = useCallback(() => {
    track('repair_prompt_accepted', { concept: data.concept, trigger: data.trigger })
    // Handled by OutputView, which owns section routing and the drill topic.
    window.dispatchEvent(new CustomEvent('studyedge:repair-topic', {
      detail: { topic: data.concept, courseId: data.courseId ?? null, courseName: data.courseName ?? null },
    }))
    onDismiss()
  }, [data, onDismiss])

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduced ? { opacity: 0 } : { y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { y: 12, opacity: 0 }}
      transition={reduced ? { duration: DURATION.micro } : SPRING.ui}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 26,
        transform: 'translateX(-50%)',
        zIndex: 113,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        padding: '14px 16px 14px 18px',
        borderRadius: RADIUS.lg,
        background: T.card,
        border: `1px solid ${T.border}`,
        boxShadow: '0 10px 34px rgba(0,0,0,0.12)',
        maxWidth: 'min(460px, calc(100vw - 32px))',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, lineHeight: 1.45 }}>
          You lost most of it on {data.concept}.
        </div>
        {data.alsoConcept ? (
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>
            {/* Sentence-initial, so it needs a capital. Concept strings come
                back from the model in whatever case it felt like, and
                "oxidative phosphorylation slipped too." reads like a typo. */}
            {data.alsoConcept.charAt(0).toUpperCase() + data.alsoConcept.slice(1)} slipped too.
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={startDrill}
          style={{
            padding: '9px 14px',
            minHeight: 40,
            borderRadius: RADIUS.pill,
            border: 'none',
            background: T.blue,
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {data.actionLabel ?? 'Six minutes on just that'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            width: 34, height: 34,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: RADIUS.pill,
            border: 'none', background: 'transparent',
            color: T.dim, fontSize: 17, lineHeight: 1,
            fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </motion.div>
  )
}

export default function CelebrationOverlay() {
  const [overlay, setOverlay] = useState(null)
  const [toast, setToast] = useState(null)
  const [badge, setBadge] = useState(null)
  const [repair, setRepair] = useState(null)
  const reduced = useReducedMotion()

  useEffect(() => subscribeCelebration((e) => {
    if (e.type === 'overlay') setOverlay({ ...e, key: Date.now() })
    else if (e.type === 'toast') setToast({ ...e, key: Date.now() })
    else if (e.type === 'badge') setBadge({ ...e, key: Date.now() })
    else if (e.type === 'repair') setRepair({ ...e, key: Date.now() })
  }), [])

  // Auto-dismiss. Each surface owns its own timer so they can overlap safely.
  useEffect(() => {
    if (!overlay) return
    const timer = setTimeout(() => setOverlay(null), overlay.durationMs ?? 1400)
    return () => clearTimeout(timer)
  }, [overlay])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), Math.max(1600, toast.durationMs ?? 700))
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!badge) return
    const timer = setTimeout(() => setBadge(null), Math.max(1600, badge.durationMs ?? 700))
    return () => clearTimeout(timer)
  }, [badge])

  // Escape dismisses the full screen moment early. Never trap the user in a reward.
  useEffect(() => {
    if (!overlay) return
    const onKey = (e) => { if (e.key === 'Escape') setOverlay(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay])

  // The repair prompt carries an action, so it does not expire on a timer the
  // way a reward does. Escape and its own dismiss button are the ways out.
  useEffect(() => {
    if (!repair) return
    const onKey = (e) => { if (e.key === 'Escape') setRepair(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [repair])

  const dismissRepair = useCallback(() => setRepair(null), [])

  const dismissOverlay = useCallback(() => setOverlay(null), [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* MAJOR: full screen. The second and last big moment in the whole flow. */}
      <AnimatePresence>
        {overlay ? (
          <motion.div
            key={overlay.key}
            role="status"
            aria-live="polite"
            onClick={dismissOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? DURATION.micro : DURATION.standard }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 130,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
              background: 'rgba(247,248,250,0.94)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <motion.div
              initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              transition={reduced ? { duration: DURATION.micro } : SPRING.celebration}
              style={{
                width: 74,
                height: 74,
                borderRadius: RADIUS.pill,
                background: T.green,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 40px rgba(16,165,110,0.35)',
              }}
            >
              <CheckMark />
            </motion.div>

            <motion.h2
              initial={reduced ? { opacity: 0 } : { y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: reduced ? DURATION.micro : DURATION.standard, delay: reduced ? 0 : 0.12, ease: EASE.out }}
              style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 600, color: T.text, margin: '20px 0 0', maxWidth: 340, lineHeight: 1.2 }}
            >
              {overlay.title ?? 'You are in.'}
            </motion.h2>

            {overlay.body ? (
              <motion.p
                initial={reduced ? { opacity: 0 } : { y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: reduced ? DURATION.micro : DURATION.standard, delay: reduced ? 0 : 0.2, ease: EASE.out }}
                style={{ fontSize: 15, color: T.muted, margin: '10px 0 0', maxWidth: 320, lineHeight: 1.5 }}
              >
                {overlay.body}
              </motion.p>
            ) : null}

            {overlay.shareCard ? (
              <ShareCard title={overlay.title ?? 'Milestone reached'} body={overlay.body} onShared={dismissOverlay} />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* MEDIUM: non-blocking. Must never sit on top of an input. */}
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.key}
            role="status"
            aria-live="polite"
            initial={reduced ? { opacity: 0 } : { y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: 10, opacity: 0 }}
            transition={reduced ? { duration: DURATION.micro } : SPRING.reward}
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 26,
              transform: 'translateX(-50%)',
              zIndex: 112,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 16px',
              borderRadius: RADIUS.pill,
              background: T.card,
              border: `1px solid ${T.border}`,
              boxShadow: '0 10px 34px rgba(0,0,0,0.12)',
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: T.green, flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>
              {toast.title ?? 'Nice work'}
            </span>
            {toast.body ? (
              <span style={{ fontSize: 13, color: T.muted }}>{toast.body}</span>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Under the floor. Not a reward, and styled so it cannot be mistaken
          for one. Sits above the toast so the two can never stack. */}
      <AnimatePresence>
        {repair ? (
          <RepairPrompt key={repair.key} data={repair} onDismiss={dismissRepair} />
        ) : null}
      </AnimatePresence>

      {/* Reduced motion substitute. The reward information still arrives. */}
      <AnimatePresence>
        {badge ? (
          <motion.div
            key={badge.key}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.micro }}
            style={{
              position: 'fixed',
              left: '50%',
              top: 26,
              transform: 'translateX(-50%)',
              zIndex: 132,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              borderRadius: RADIUS.lg,
              background: T.card,
              border: `1px solid ${T.border}`,
              boxShadow: '0 10px 34px rgba(0,0,0,0.12)',
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 999, background: T.green,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>
              {badge.title ?? 'Milestone reached'}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
    document.body,
  )
}
