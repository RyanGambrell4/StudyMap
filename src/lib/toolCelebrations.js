/**
 * toolCelebrations - one listener that turns finishing a tool into a reward.
 *
 * Every tool already dispatches `studyedge:tool-session-complete` when a
 * session lands. Until now the only subscriber was the streak store, so twelve
 * of the fourteen tools ended in silence: you did the work, the modal changed
 * screens, and nothing acknowledged it.
 *
 * The fix is one subscriber here rather than a celebrate() call pasted into
 * twelve files. That keeps the frequency caps meaningful (the controller can
 * only enforce a budget it can see all the spending against), keeps the tier
 * choices in one table where they can be compared, and means any tool added
 * later is covered the moment it dispatches the event.
 *
 * Payload:
 *   { tool: string, score?: number, total?: number }
 *
 * `score`/`total` are optional. When present the reward scales with how well
 * the session went, so a clean run feels different from a rough one. When
 * absent the tool gets its flat tier, which is the honest outcome for tools
 * that produce an artifact rather than a grade.
 */

// TIER comes from the constants module, not the controller, so celebrationFor
// stays testable in plain node. The controller itself is imported lazily inside
// the listener for the same reason.
import { TIER } from './celebrationTiers.js'

/**
 * Tools that raise their own celebration, at a moment or a tier this listener
 * cannot work out from the event alone. Listed so they are skipped rather than
 * celebrated twice.
 *
 *   focusMode     celebrates when its completion screen appears, which is not
 *                 the same instant the event fires.
 *   practiceExam  owns a score-dependent moment with a share card.
 */
const SELF_CELEBRATING = new Set(['focusMode', 'practiceExam'])

/**
 * Flat tier and copy per tool. Two rules held the whole table:
 *
 *   1. Say what the student now has, not that an action succeeded. "Cheat
 *      sheet ready" beats "Generated successfully".
 *   2. Nothing is MEDIUM by default. Confetti is for a result, not for a
 *      request completing. Scored tools earn their way up to it below.
 */
const TOOLS = {
  quizBurst:      { tier: TIER.SMALL, title: 'Quiz done' },
  timeAttack:     { tier: TIER.SMALL, title: 'Time attack done' },
  teachItBack:    { tier: TIER.SMALL, title: 'Explanation marked' },
  brainDump:      { tier: TIER.SMALL, title: 'Brain dump marked' },
  connections:    { tier: TIER.SMALL, title: 'Connections done' },
  diagnostic:     { tier: TIER.SMALL, title: 'Diagnostic done' },
  cheatSheet:     { tier: TIER.SMALL, title: 'Cheat sheet ready' },
  examRescue:     { tier: TIER.SMALL, title: 'Rescue plan ready' },
  podcast:        { tier: TIER.SMALL, title: 'Episode ready' },
  essayArchitect: { tier: TIER.SMALL, title: 'Essay plan ready' },
  diagrams:       { tier: TIER.SMALL, title: 'Diagram ready' },
  problemSolver:  { tier: TIER.SMALL, title: 'Worked through' },
}

/** Percent correct at or above which a scored session earns confetti. */
const STRONG_PCT = 90

/**
 * Resolve the celebration for one completion event. Exported for tests; the
 * listener below is the only caller in product code.
 */
export function celebrationFor(detail = {}) {
  const { tool, score, total } = detail
  if (!tool || SELF_CELEBRATING.has(tool)) return null

  const base = TOOLS[tool]
  if (!base) return null

  // Scores arrive two ways: out of a total (quizzes) or already as a percent
  // (the marked tools return 0-100). Both collapse to a percentage here.
  let pct = null
  const hasTotal = typeof total === 'number'
  if (typeof score === 'number') {
    if (hasTotal && total > 0) {
      pct = Math.round((score / total) * 100)
    } else if (!hasTotal && score >= 0 && score <= 100) {
      // A bare score is only a percentage when no total came with it. A total
      // of zero means the caller had a denominator and it was unusable, so the
      // score is not a percentage either; reporting "0 percent" there would be
      // inventing a result out of a broken payload.
      pct = Math.round(score)
    }
  }

  if (pct == null) return { tier: base.tier, title: base.title, body: null }

  // A strong run is a result worth confetti. The controller caps MEDIUM at two
  // a day, so a student on a hot streak gets the first two and is quietly
  // downgraded after, which is the intended behaviour rather than a shortfall.
  const tier = pct >= STRONG_PCT ? TIER.MEDIUM : base.tier
  const body = typeof total === 'number' && total > 0
    ? `${score} of ${total} correct.`
    : `${pct} percent.`

  return { tier, title: base.title, body }
}

let started = false

/**
 * Subscribe once, near the app root. Idempotent, so a second call from a
 * remount is a no-op rather than a doubled celebration.
 *
 * @returns {() => void} unsubscribe
 */
export function startToolCelebrations() {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  const onComplete = async (e) => {
    const plan = celebrationFor(e?.detail ?? {})
    if (!plan) return
    // Imported here rather than at module scope so this file stays free of the
    // controller's DOM and analytics dependencies. The module is already in the
    // bundle by the time any tool can complete, so this resolves immediately.
    const { celebrate } = await import('./celebration')
    celebrate({
      tier: plan.tier,
      trigger: `tool_completed_${e.detail.tool}`,
      meta: { title: plan.title, body: plan.body },
    })
  }

  window.addEventListener('studyedge:tool-session-complete', onComplete)
  return () => {
    window.removeEventListener('studyedge:tool-session-complete', onComplete)
    started = false
  }
}

export default startToolCelebrations
