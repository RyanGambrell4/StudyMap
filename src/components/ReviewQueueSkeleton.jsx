/**
 * ReviewQueueSkeleton - the loading state for the Review Queue.
 *
 * Lives in its own module, and is imported eagerly, because it is the Suspense
 * fallback for ReviewQueueView's lazy chunk. Importing it from the view itself
 * would pull that chunk in ahead of time and there would be nothing left to
 * wait for.
 *
 * The wait it covers is real: the queue's own data is a synchronous local
 * storage read, but the component behind it is code split, so the gap between
 * tapping Review Queue and seeing rows is the chunk fetch. That is what this
 * fills, rather than a timer sitting on top of an instant read.
 *
 * Every measurement here is copied from TopicRow in ReviewQueueView. If the row
 * layout changes, this changes with it.
 */

import { KNOWLEDGE_MAP as C, PRACTICE_EXAMS as PE, SANS } from '../theme/tokens'
import { useIsMobile } from '../utils/useIsMobile'

const SHEET = `
@keyframes rqs-shimmer { from { background-position: -220px 0; } to { background-position: 340px 0; } }
.rqs-bar {
  background: linear-gradient(90deg, ${C.rowRule} 0%, ${PE.barTrack} 50%, ${C.rowRule} 100%);
  background-size: 560px 100%;
  animation: rqs-shimmer 1.25s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .rqs-bar { animation: none; background: ${C.rowRule}; }
}
`

function Bar({ w, h = 11, style }) {
  return <div className="rqs-bar" style={{ width: w, height: h, borderRadius: 999, ...style }} />
}

export function ReviewRowSkeleton({ mobile, first }) {
  const ring = mobile ? 48 : 54
  return (
    <div style={{
      display: 'flex', gap: mobile ? 14 : 24,
      alignItems: mobile ? 'flex-start' : 'center',
      flexDirection: mobile ? 'column' : 'row',
      padding: mobile ? '18px 18px' : '20px 28px',
      borderTop: first ? 'none' : `1px solid ${C.rowRule}`,
    }}>
      <div style={{
        display: 'flex', gap: mobile ? 14 : 20, alignItems: 'center',
        flex: 1, minWidth: 0, width: mobile ? '100%' : 'auto',
      }}>
        {/* Ring and its caption */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 'none' }}>
          <Bar w={ring} h={ring} style={{ borderRadius: 999 }} />
          <Bar w={38} h={7} />
        </div>
        {/* Two title lines, the ranked metadata, the faint history line */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bar w="88%" h={13} />
          <Bar w="54%" h={13} />
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <Bar w={96} /><Bar w={72} />
          </div>
          <Bar w={140} h={9} />
        </div>
      </div>
      {/* Quiet action, then the primary button, on one line as in TopicRow */}
      <div style={{
        display: 'flex', gap: mobile ? 10 : 6, flex: 'none',
        alignItems: 'center', justifyContent: mobile ? 'stretch' : 'flex-end',
        width: mobile ? '100%' : 'auto',
      }}>
        <Bar w={96} h={44} style={{ borderRadius: 10, flex: 'none' }} />
        <Bar w={mobile ? undefined : 126} h={44} style={{ borderRadius: 10, flex: mobile ? 1 : 'none' }} />
      </div>
    </div>
  )
}

export default function ReviewQueueSkeleton() {
  const mobile = useIsMobile()
  return (
    <div
      role="status"
      aria-label="Loading your review queue"
      style={{
        minHeight: '100vh', background: C.pageBg,
        padding: mobile ? '28px 18px 80px' : '56px 100px 96px',
        overflowX: 'hidden', fontFamily: SANS,
      }}
    >
      <style>{SHEET}</style>

      {/* Header: eyebrow, headline, subline, primary button */}
      <div style={{
        display: 'flex',
        flexDirection: mobile ? 'column' : 'row',
        alignItems: mobile ? 'stretch' : 'flex-end',
        justifyContent: 'space-between',
        gap: mobile ? 22 : 40,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Bar w={92} h={9} />
          <Bar w={mobile ? '86%' : 420} h={mobile ? 30 : 40} style={{ marginTop: 14, borderRadius: 8 }} />
          <Bar w={mobile ? '96%' : 520} h={13} style={{ marginTop: 16 }} />
        </div>
        <Bar
          w={mobile ? undefined : 160}
          h={48}
          style={{ borderRadius: 10, flex: 'none', width: mobile ? '100%' : 160 }}
        />
      </div>

      {/* Controls: segmented tabs, course filter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        margin: mobile ? '26px 0 0' : '32px 0 0', flexWrap: 'wrap',
      }}>
        <Bar w={mobile ? '100%' : 218} h={mobile ? 52 : 44} style={{ borderRadius: 12 }} />
        <Bar w={mobile ? '100%' : 168} h={44} style={{ borderRadius: 10 }} />
      </div>

      {/* Rows */}
      <div style={{
        margin: mobile ? '16px 0 0' : '20px 0 0',
        background: C.card, border: `1px solid ${C.cardBorder}`,
        borderRadius: 16, boxShadow: C.cardShadow, overflow: 'hidden',
      }}>
        {[0, 1, 2].map(i => <ReviewRowSkeleton key={i} mobile={mobile} first={i === 0} />)}
      </div>
    </div>
  )
}
