/**
 * Step 12: "How serious are you about hitting that grade?"
 *
 * Commitment escalation, and a clean segmentation signal for the paywall.
 * Anyone answering 'low' sees the softer paywall variant. Progress bar hits
 * 100% here and the button reads "Build my plan".
 */

import QuestionShell from '../primitives/QuestionShell'
import ChoiceGrid from '../primitives/ChoiceGrid'

export const COMMITMENT_OPTIONS = [
  { value: 'high',   label: 'I will do whatever it takes' },
  { value: 'medium', label: 'Pretty serious' },
  { value: 'low',    label: 'Just seeing what this is' },
]

export default function Step12Commitment({ state, setAnswer, onAdvance }) {
  return (
    <QuestionShell
      eyebrow="Last one"
      title="How serious are you about hitting that grade?"
    >
      <ChoiceGrid
        options={COMMITMENT_OPTIONS}
        value={state.commitment}
        onChange={(v) => setAnswer('commitment', v)}
        onAdvance={onAdvance}
        label="Commitment level"
      />
    </QuestionShell>
  )
}
