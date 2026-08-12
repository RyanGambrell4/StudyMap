/**
 * Step 11: "When do you actually study?"
 *
 * Feeds the plan schedule and the notification timing. This answer is what
 * makes the day-one push permission ask feel earned rather than extractive:
 * "You said you study at night. Want a nudge at 8pm?"
 */

import QuestionShell from '../primitives/QuestionShell'
import ChoiceGrid from '../primitives/ChoiceGrid'

export const STUDY_TIME_OPTIONS = [
  { value: 'morning',   label: 'Morning',   sublabel: 'Before noon' },
  { value: 'afternoon', label: 'Afternoon', sublabel: 'Noon to 6pm' },
  { value: 'night',     label: 'Night',     sublabel: 'After 6pm' },
  { value: 'varies',    label: 'It varies' },
]

export default function Step11StudyTime({ state, setAnswer, onAdvance }) {
  return (
    <QuestionShell title="When do you actually study?">
      <ChoiceGrid
        options={STUDY_TIME_OPTIONS}
        value={state.studyTime}
        onChange={(v) => setAnswer('studyTime', v)}
        onAdvance={onAdvance}
        label="When you study"
      />
    </QuestionShell>
  )
}
