/**
 * Step 5: "What grade do you need?"
 *
 * The single most important answer in the flow. Act 4's entire payoff is the
 * gap between step 4 and this answer being visualised and closed.
 */

import QuestionShell from '../primitives/QuestionShell'
import ChoiceGrid from '../primitives/ChoiceGrid'

const OPTIONS = [
  { value: 'A',    label: 'A' },
  { value: 'B',    label: 'B' },
  { value: 'C',    label: 'C' },
  { value: 'pass', label: 'I just need to pass' },
]

export default function Step05TargetGrade({ state, setAnswer, onAdvance }) {
  return (
    <QuestionShell
      title="What grade do you need?"
      subtitle="Be honest. This sets your whole plan."
    >
      <ChoiceGrid
        options={OPTIONS}
        value={state.targetGrade}
        onChange={(v) => setAnswer('targetGrade', v)}
        onAdvance={onAdvance}
        label="Target grade"
      />
    </QuestionShell>
  )
}
