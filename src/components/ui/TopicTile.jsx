/**
 * TopicTile - a selectable topic chip.
 *
 * Shared by the Knowledge Map's empty state and the Brain Dump pick screen so
 * the two topic pickers cannot drift. Lives here rather than in either screen
 * so neither has to import the other, which would collapse the map's lazy
 * chunk into the Brain Dump bundle.
 */
import { useState } from 'react'
import { KNOWLEDGE_MAP as C } from '../../theme/tokens'

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

export default function TopicTile({ label, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...btnReset,
        padding: '10px 16px', borderRadius: 10, fontSize: 14,
        border: `1px solid ${active ? C.blue : hover ? C.tileHover : C.cardBorder}`,
        background: active ? C.blue : C.card,
        color: active ? '#fff' : C.ink,
        fontWeight: active ? 500 : 400,
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  )
}
