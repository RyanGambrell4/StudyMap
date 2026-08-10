/**
 * Step 3: "When is your next exam in this class?"
 *
 * The single highest-leverage answer in Act 2 after the target grade. From this
 * point forward a live countdown sits in the header and never leaves, through
 * the paywall and into the dashboard. Urgency is the cheapest honest motivator
 * we have, and "18 days" at the top of every screen does more work than copy.
 */

import { useState, useMemo, useCallback } from 'react'
import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import { toDateStr, daysBetween } from '../../../utils/dateUtils'
import { T, RADIUS } from '../../../theme/tokens'

const QUICK = [
  { label: 'This week',   days: 5 },
  { label: 'In 2 weeks',  days: 14 },
  { label: 'In a month',  days: 30 },
]

export default function Step03ExamDate({ state, setAnswer, onAdvance }) {
  const today = useMemo(() => toDateStr(new Date()), [])
  const [value, setValue] = useState(state.examDate ?? '')

  const daysAway = useMemo(() => {
    if (!value) return null
    const d = daysBetween(today, value)
    return Number.isFinite(d) ? d : null
  }, [value, today])

  const commit = useCallback((dateStr) => {
    const chosen = dateStr ?? value
    if (!chosen) return
    setAnswer('examDate', chosen)
    onAdvance()
  }, [value, setAnswer, onAdvance])

  const pickRelative = useCallback((days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const s = toDateStr(d)
    setValue(s)
    setAnswer('examDate', s)
  }, [setAnswer])

  return (
    <QuestionShell
      title="When is your next exam in this class?"
      subtitle="This sets the whole schedule. A rough date is fine."
      footer={<ContinueButton enabled={!!value} onClick={() => commit()}>Continue</ContinueButton>}
    >
      <div>
        <input
          type="date"
          value={value}
          min={today}
          onChange={(e) => { setValue(e.target.value); setAnswer('examDate', e.target.value) }}
          aria-label="Next exam date"
          style={{
            width: '100%',
            minHeight: 54,
            padding: '15px 16px',
            borderRadius: RADIUS.md,
            border: `1.5px solid ${value ? T.blue : T.border}`,
            background: T.card,
            color: T.text,
            fontSize: 16,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => pickRelative(q.days)}
              style={{
                padding: '9px 14px',
                minHeight: 40,
                borderRadius: RADIUS.pill,
                border: `1px solid ${T.border}`,
                background: T.neutralBg,
                color: T.text,
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>

        {daysAway !== null && daysAway >= 0 ? (
          <div aria-live="polite" style={{ marginTop: 16, fontSize: 14.5, color: T.text, fontWeight: 600 }}>
            {daysAway === 0
              ? 'That is today. We will build you an emergency plan.'
              : `${daysAway} ${daysAway === 1 ? 'day' : 'days'} from now.`}
          </div>
        ) : null}
      </div>
    </QuestionShell>
  )
}
