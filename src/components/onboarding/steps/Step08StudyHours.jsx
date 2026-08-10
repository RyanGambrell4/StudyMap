/**
 * Step 8: "How many hours a week do you actually study for this class?"
 *
 * Slider, no numeric input. The live response to the drag is the reward.
 */

import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import ValueSlider from '../primitives/ValueSlider'

export default function Step08StudyHours({ state, setAnswer, onAdvance }) {
  return (
    <QuestionShell
      title="How many hours a week do you actually study for this class?"
      subtitle="Actually, not ideally."
      footer={<ContinueButton enabled onClick={onAdvance}>Continue</ContinueButton>}
    >
      <ValueSlider
        value={state.studyHours ?? 4}
        onChange={(v) => setAnswer('studyHours', v)}
      />
    </QuestionShell>
  )
}
