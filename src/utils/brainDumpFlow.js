// Brain Dump flow rules: screens, navigation, timer, and the submit invariant.
//
// Pure so the parts that are easy to get wrong, and expensive to get wrong,
// can be tested without a DOM. The component holds state and paints; every
// decision about what a given action means is made here.

// Fixed at three minutes, per the approved design. There are no duration
// options: the old modal offered 60, 90, and 120 seconds and defaulted to 60,
// which is why the copy everywhere else in the app said "15-min recall drill"
// and meant one minute.
export const DUMP_SECONDS = 180

// The last stretch, where the countdown, the bar, and the label all turn amber.
export const FINAL_STRETCH_SECONDS = 30

export const SCREENS = {
  PICK: 'pick',
  WRITING: 'writing',
  SCORING: 'scoring',
  RESULT: 'result',
}

// Each screen gets its own history entry, so browser Back walks the flow
// rather than jumping out of the section. The value is the hash written by
// the section-level pushState pattern in OutputView.
export const SCREEN_HASH = {
  [SCREENS.PICK]: 'brain-dump',
  [SCREENS.WRITING]: 'brain-dump-writing',
  [SCREENS.SCORING]: 'brain-dump-scoring',
  [SCREENS.RESULT]: 'brain-dump-result',
}

export function isFinalStretch(timeLeft) {
  return typeof timeLeft === 'number' && timeLeft > 0 && timeLeft <= FINAL_STRETCH_SECONDS
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Fraction of time remaining, for the slim progress bar. Clamped so a clock
// that overruns by a tick cannot paint a bar wider than its track.
export function progressFraction(timeLeft, total = DUMP_SECONDS) {
  if (!total) return 0
  return Math.max(0, Math.min(1, (timeLeft ?? 0) / total))
}

// The submit invariant. A dump with no topic has nowhere to land on the map,
// so the old flow silently scored it and recorded nothing. Now the topic is
// chosen before the timer starts and Submit is impossible without one.
export function canSubmit({ topic, text }) {
  return Boolean(String(topic ?? '').trim()) && Boolean(String(text ?? '').trim())
}

// Whether the pick screen's primary button is live.
export function canStart({ topic }) {
  return Boolean(String(topic ?? '').trim())
}

// What browser Back means on each screen.
//
//   writing  -> always the same confirm as the Discard link, so Back can
//               never silently destroy what the student typed. This holds
//               even with an empty textarea: the student is mid-exercise and
//               a running clock is state worth confirming away.
//   scoring  -> ignored. The request is in flight and there is nothing to
//               return to; the result screen will push its own entry.
//   result   -> the dump is already recorded, so Back just returns to the map.
//   pick     -> leaving the flow, nothing to lose.
export function resolveBackAction(screen) {
  switch (screen) {
    case SCREENS.WRITING: return 'confirm-discard'
    case SCREENS.SCORING: return 'ignore'
    case SCREENS.RESULT:  return 'exit-to-map'
    case SCREENS.PICK:    return 'exit-to-map'
    default:              return 'exit-to-map'
  }
}

export const DISCARD_CONFIRM_MESSAGE =
  'Discard this Brain Dump? Nothing will be recorded and what you wrote is lost.'

// Topics offered on the pick screen for a course, in the order a student
// would want them: things with evidence that needs work, then everything the
// coach plan lists. Deduped case-insensitively, never invented.
export function pickerTopics({ planTopics = [], evidenceTopics = [] } = {}) {
  const seen = new Set()
  const out = []
  for (const t of [...evidenceTopics, ...planTopics]) {
    const name = String(t ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

// Shown when a course has no coach plan to draw topics from. The map does not
// invent a topic list; it says where one would come from.
export const NO_PLAN_TOPICS_HINT =
  'Build a Study Coach plan for this course to get suggested topics here.'
