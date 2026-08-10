/**
 * Step 9: "How do you actually learn best?"
 *
 * Pure IKEA effect, but not theatre: this genuinely changes which tools we
 * surface on day one, and the user will notice on day one that we listened.
 * If that stops being true, delete this screen rather than keeping a lie in it.
 */

import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import ChoiceGrid from '../primitives/ChoiceGrid'

export const LEARNING_STYLE_OPTIONS = [
  { value: 'visual',    label: 'Visual diagrams' },
  { value: 'practice',  label: 'Practice problems' },
  { value: 'explain',   label: 'Explaining it out loud' },
  { value: 'flashcard', label: 'Flashcards and repetition' },
]

export default function Step09LearningStyle({ state, setAnswer, onAdvance }) {
  const selected = state.learningStyles ?? []

  return (
    <QuestionShell
      title="How do you actually learn best?"
      subtitle="This changes which tools we put in front of you first."
      footer={<ContinueButton enabled={selected.length >= 1} onClick={onAdvance}>Continue</ContinueButton>}
    >
      <ChoiceGrid
        multi
        options={LEARNING_STYLE_OPTIONS}
        value={selected}
        onChange={(next) => setAnswer('learningStyles', next)}
        label="How you learn best"
      />
    </QuestionShell>
  )
}
