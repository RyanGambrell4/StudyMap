/**
 * toolCelebrations - one listener that turns finishing a tool into a response.
 *
 * Every tool dispatches `studyedge:tool-session-complete` when a session lands.
 * This is the single subscriber that decides what the student sees, rather than
 * a celebrate() call pasted into twelve files. That keeps the frequency caps
 * meaningful (the controller can only enforce a budget it can see all the
 * spending against), keeps the tier choices in one comparable table, and means
 * any tool added later is covered the moment it dispatches the event.
 *
 * Payload:
 *   {
 *     tool: string,
 *     score?: number, total?: number,
 *     topic?: string, courseName?: string, courseId?: string,
 *     gaps?: string[],          // concepts the session showed she does not have
 *   }
 *
 * There are three possible responses, not one:
 *
 *   null      the tool celebrates itself, or we do not know it.
 *   reward    she did fine or better. Name what she did, then her trajectory.
 *   repair    she scored below WEAK_PCT. No celebration of any size fires.
 *             She gets the concept she lost and one button that drills it.
 *
 * The repair branch is the point of this module. A bad score and a good score
 * used to produce the same shape of message at different volumes, which is the
 * coldest thing the app could do to someone studying at midnight.
 */

import { TIER, WEAK_PCT, STRONG_PCT } from './celebrationTiers.js'

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
 * The six scored tools. `subject` is how the result reads when we know the
 * topic ("8 of 8 on enzyme kinetics"), `bare` when we do not.
 */
const SCORED = {
  quizBurst:   { bare: 'correct' },
  timeAttack:  { bare: 'correct' },
  teachItBack: { bare: 'on your explanation' },
  brainDump:   { bare: 'of it back' },
  connections: { bare: 'of the links' },
  diagnostic:  { bare: 'on the diagnostic' },
}

/**
 * The six artifact tools. These have no score, so the reward cannot report a
 * result. It points forward at what she can now do instead of backward at what
 * the server generated. "Cheat sheet ready" is a build log line; what she needs
 * is the next move.
 */
const ARTIFACT = {
  cheatSheet: {
    title: 'Cheat sheet ready',
    forward: t => t ? `Everything on ${t}, one page. Read it, close it, then rebuild it from memory.`
                    : 'Read it once, close it, then rebuild it from memory.',
  },
  examRescue: {
    title: 'Rescue plan ready',
    forward: t => t ? `It opens on ${t}, because that is where you are thinnest.`
                    : 'It opens on your thinnest topic. Start there, not at the beginning.',
  },
  podcast: {
    title: 'Episode ready',
    forward: t => t ? `${t}, start to finish. Put it on while you walk over.`
                    : 'Put it on while you walk over.',
  },
  essayArchitect: {
    title: 'Essay plan ready',
    forward: () => 'Structure is set. Start on a body paragraph, the intro is easier once the middle exists.',
  },
  diagrams: {
    title: 'Diagram ready',
    forward: t => t ? `${t}, drawn out. Cover the labels and name them yourself.`
                    : 'Cover the labels and name them back before you move on.',
  },
  problemSolver: {
    title: 'Worked through',
    forward: () => 'Now do the next one with the steps hidden.',
  },
}

const ORDINALS = [
  null, 'First', 'Second', 'Third', 'Fourth', 'Fifth',
  'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
]

function ordinal(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null
  const whole = Math.floor(n)
  return ORDINALS[whole] ?? `Number ${whole}`
}

/** Trim, collapse whitespace, and reject anything that is not usable prose. */
function clean(value, maxLen = 60) {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1).trimEnd()}...` : trimmed
}

/**
 * One line of trajectory, or null. Only ever states something we can actually
 * count, and only the strongest available fact, so the reward never pads.
 */
function trajectoryLine(context = {}, { strong }) {
  const { topicsLockedThisWeek, sessionsThisWeek, streakDays } = context

  // Only claim a topic is "locked" off the back of a session that locked one.
  if (strong && typeof topicsLockedThisWeek === 'number' && topicsLockedThisWeek >= 2) {
    const word = ordinal(topicsLockedThisWeek)
    if (word) return `${word} topic you have locked this week.`
  }
  if (typeof sessionsThisWeek === 'number' && sessionsThisWeek >= 3) {
    return `${sessionsThisWeek} sessions this week.`
  }
  if (typeof streakDays === 'number' && streakDays >= 3) {
    return `Day ${streakDays} of your streak.`
  }
  return null
}

/**
 * Collapse a payload's score into a percentage, or null when it does not carry
 * a usable one.
 *
 * Scores arrive two ways: out of a total (quizzes) or already as a percent (the
 * marked tools return 0-100). A total of zero means the caller had a
 * denominator and it was unusable, so the score is not a percentage either.
 * Reporting "0 percent" there would be inventing a result from a broken payload.
 */
function toPercent(score, total) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  const hasTotal = typeof total === 'number' && Number.isFinite(total)
  if (hasTotal) return total > 0 ? Math.round((score / total) * 100) : null
  if (score >= 0 && score <= 100) return Math.round(score)
  return null
}

/**
 * Resolve the response for one completion event.
 *
 * @param {object} detail   the dispatched event payload
 * @param {object} context  cheap local facts: topicsLockedThisWeek,
 *                          sessionsThisWeek, streakDays, fallbackConcept
 * @returns {null | {kind:'reward',...} | {kind:'repair',...}}
 */
export function celebrationFor(detail = {}, context = {}) {
  const d = detail ?? {}
  const { tool, score, total } = d
  if (!tool || SELF_CELEBRATING.has(tool)) return null
  // Re-dispatches that exist to feed the streak, not to report a new result.
  // Brain Dump's evidence-write retry is the current one.
  if (d.silent) return null

  const topic = clean(d.topic)
  const courseName = clean(d.courseName, 40)
  const artifact = ARTIFACT[tool]
  const scored = SCORED[tool]
  if (!artifact && !scored) return null

  // ── Artifact tools: no score exists, so there is nothing to grade. ────────
  if (artifact) {
    return {
      kind: 'reward',
      tier: TIER.SMALL,
      title: artifact.title,
      body: artifact.forward(topic),
    }
  }

  const pct = toPercent(score, total)

  // No usable score. Acknowledge the session without inventing a result.
  if (pct == null) {
    return {
      kind: 'reward',
      tier: TIER.SMALL,
      title: topic ? `Session done on ${topic}.` : 'Session done.',
      body: trajectoryLine(context, { strong: false }),
    }
  }

  // ── Below the floor: no celebration of any size. ──────────────────────────
  if (pct < WEAK_PCT) {
    // Name something specific or say nothing. A vague "keep going" is exactly
    // the consolation copy this branch exists to avoid.
    const gaps = Array.isArray(d.gaps)
      ? d.gaps.map(g => clean(g, 44)).filter(Boolean).slice(0, 2)
      : []
    const concept = gaps[0] ?? topic ?? clean(context.fallbackConcept, 44) ?? null
    if (!concept) return null

    return {
      kind: 'repair',
      concept,
      // A second gap is worth naming; a third is a list, and a list is homework.
      alsoConcept: gaps[1] && gaps[1] !== concept ? gaps[1] : null,
      courseName,
      pct,
      actionLabel: 'Six minutes on just that',
    }
  }

  // ── At or above the floor: a real result, stated plainly. ─────────────────
  const strong = pct >= STRONG_PCT
  const outOf = typeof total === 'number' && total > 0
  const head = outOf
    ? `${score} of ${total}`
    : `${pct} percent`
  const title = topic
    ? `${head} on ${topic}.`
    : `${head} ${scored.bare}.`

  return {
    kind: 'reward',
    // A strong run is a result worth confetti. The controller caps MEDIUM at
    // two a day, so a student on a hot streak gets the first two and is quietly
    // downgraded after, which is intended rather than a shortfall.
    tier: strong ? TIER.MEDIUM : TIER.SMALL,
    title,
    body: trajectoryLine(context, { strong }),
  }
}

// ── Listener ────────────────────────────────────────────────────────────────

let started = false

/**
 * Build the trajectory facts from local stores. Kept out of celebrationFor so
 * that function stays pure and testable in plain node, and kept cheap because
 * it runs on every tool completion.
 */
async function readContext(detail) {
  const out = {}
  try {
    const { getStudyHistory } = await import('./studyHistory')
    const history = getStudyHistory()
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recent = history.filter(s => {
      const t = Date.parse(s?.date ?? '')
      return Number.isFinite(t) && t >= weekAgo
    })
    out.sessionsThisWeek = recent.length
    // A topic counts as locked once, however many times she scored well on it.
    const locked = new Set()
    for (const s of recent) {
      if (typeof s?.score === 'number' && s.score >= STRONG_PCT && s.topic) {
        locked.add(String(s.topic).toLowerCase().trim())
      }
    }
    out.topicsLockedThisWeek = locked.size
  } catch { /* history unavailable, trajectory line is simply omitted */ }

  // Only needed to keep a repair prompt from going dead when the tool did not
  // send a topic. Scoped to the course when we have one.
  try {
    const { getWeakestTopics } = await import('./masteryStore')
    out.fallbackConcept = getWeakestTopics(detail?.courseId ?? null, 1)?.[0]?.topic ?? null
  } catch { /* ignore */ }

  return out
}

/**
 * Subscribe once, near the app root. Idempotent, so a second call from a
 * remount is a no-op rather than a doubled response.
 *
 * @returns {() => void} unsubscribe
 */
export function startToolCelebrations() {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  const onComplete = async (e) => {
    const detail = e?.detail ?? {}
    // Cheap pre-check so an unknown tool never pays for a context read.
    if (!detail.tool || SELF_CELEBRATING.has(detail.tool)) return
    if (!SCORED[detail.tool] && !ARTIFACT[detail.tool]) return

    const context = await readContext(detail)
    const plan = celebrationFor(detail, context)
    if (!plan) return

    // Imported here rather than at module scope so this file stays free of the
    // controller's DOM and analytics dependencies. The module is already in the
    // bundle by the time any tool can complete, so this resolves immediately.
    const { celebrate, showRepair } = await import('./celebration')

    if (plan.kind === 'repair') {
      showRepair({
        trigger: `tool_weak_${detail.tool}`,
        concept: plan.concept,
        alsoConcept: plan.alsoConcept,
        courseName: plan.courseName,
        courseId: detail.courseId ?? null,
        pct: plan.pct,
        actionLabel: plan.actionLabel,
      })
      return
    }

    celebrate({
      tier: plan.tier,
      trigger: `tool_completed_${detail.tool}`,
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
