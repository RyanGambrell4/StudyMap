/**
 * Step 2: "Where do you go to school?"
 *
 * Skippable by design. Feeds later social proof ("312 students at your school
 * use StudyEdge") only when we actually have that data, and is silently dropped
 * when we do not. Never blocks the funnel.
 */

import { useState, useCallback } from 'react'
import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import { T, RADIUS } from '../../../theme/tokens'

export default function Step02School({ state, setAnswer, onAdvance }) {
  const [value, setValue] = useState(state.school ?? '')
  const [focused, setFocused] = useState(false)

  const commit = useCallback(() => {
    setAnswer('school', value.trim() || null)
    onAdvance()
  }, [value, setAnswer, onAdvance])

  const skip = useCallback(() => {
    setAnswer('school', null)
    onAdvance()
  }, [setAnswer, onAdvance])

  return (
    <QuestionShell
      title="Where do you go to school?"
      subtitle="Optional. It helps us compare you to students taking the same course."
      footer={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ContinueButton enabled onClick={commit}>Continue</ContinueButton>
          <button
            type="button"
            onClick={skip}
            style={{
              minHeight: 44,
              background: 'none',
              border: 'none',
              color: T.muted,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
        </div>
      )}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        placeholder="School name"
        aria-label="School name"
        autoComplete="organization"
        style={{
          width: '100%',
          minHeight: 54,
          padding: '15px 16px',
          borderRadius: RADIUS.md,
          border: `1.5px solid ${focused ? T.blue : T.border}`,
          background: T.card,
          color: T.text,
          fontSize: 16,
          fontFamily: 'inherit',
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${T.blueBg}` : 'none',
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
        }}
      />
    </QuestionShell>
  )
}
