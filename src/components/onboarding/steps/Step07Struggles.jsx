/**
 * Step 7: "What actually happens when you sit down to study?"
 *
 * The agitate step. The user articulates their own pain in our words, and every
 * selected item gets quoted back on the reveal screen. That quoting is what
 * makes Act 4 feel written for them rather than generated at them.
 *
 * The `value` keys here are a contract with `onboardingInsights.js`. Renaming
 * one silently breaks an insight card. Add, do not rename.
 */

import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import ChoiceGrid from '../primitives/ChoiceGrid'

export const STRUGGLE_OPTIONS = [
  { value: 'reread',   label: 'I reread my notes and none of it sticks' },
  { value: 'time',     label: 'I run out of time before the exam' },
  { value: 'start',    label: 'I have no idea where to start' },
  { value: 'distract', label: 'I get distracted within ten minutes' },
  { value: 'cram',     label: 'I cram the night before and hope' },
]

export default function Step07Struggles({ state, setAnswer, onAdvance }) {
  const selected = state.struggles ?? []
  const enabled = selected.length >= 1

  return (
    <QuestionShell
      title="What actually happens when you sit down to study?"
      subtitle="Pick everything that sounds like you."
      footer={<ContinueButton enabled={enabled} onClick={onAdvance}>Continue</ContinueButton>}
    >
      <ChoiceGrid
        multi
        options={STRUGGLE_OPTIONS}
        value={selected}
        onChange={(next) => setAnswer('struggles', next)}
        label="What happens when you study"
      />
    </QuestionShell>
  )
}
