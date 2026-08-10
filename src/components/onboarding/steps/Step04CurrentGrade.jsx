/**
 * Step 4: "What grade do you have in this class right now?"
 *
 * The baseline for the Act 4 projection chart. "Not sure" maps to a C+
 * internally (see onboardingInsights) and quietly flags a Grade Hub prompt for
 * day one rather than blocking the flow here.
 */

import QuestionShell from '../primitives/QuestionShell'
import ChoiceGrid from '../primitives/ChoiceGrid'

const OPTIONS = [
  { value: 'A',      label: 'A' },
  { value: 'B',      label: 'B' },
  { value: 'C',      label: 'C' },
  { value: 'D',      label: 'D or lower' },
  { value: 'unsure', label: 'Not sure' },
]

export default function Step04CurrentGrade({ state, setAnswer, onAdvance }) {
  return (
    <QuestionShell title="What grade do you have in this class right now?">
      <ChoiceGrid
        options={OPTIONS}
        value={state.currentGrade}
        onChange={(v) => setAnswer('currentGrade', v)}
        onAdvance={onAdvance}
        label="Current grade"
      />
    </QuestionShell>
  )
}
