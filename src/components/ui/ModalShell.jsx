import { useEffect } from 'react'
import { T } from '../../tokens'

// Shared overlay + card. New Coach v2 uses it; existing tool modals are
// intentionally not migrated in this PR.
export default function ModalShell({
  ariaLabel,
  onClose,
  width = 520,
  children,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stop = (e) => e.stopPropagation()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: T.overlay,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '9vh 20px 20px',
        animation: 'coach-modal-in 180ms ease-out both',
      }}
    >
      <style>{`
        @keyframes coach-modal-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes coach-card-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div
        onClick={stop}
        style={{
          background: T.bgCard,
          borderRadius: T.radius.xl - 4,
          boxShadow: T.shadow.modal,
          width, maxWidth: '100%',
          overflow: 'hidden',
          animation: 'coach-card-in 220ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {children}
      </div>
    </div>
  )
}
