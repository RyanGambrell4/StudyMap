// ── Grade letter mapping ──────────────────────────────────────────────────────

export const TARGET_OPTIONS = [
  { label: 'A+', value: 90 },
  { label: 'A',  value: 85 },
  { label: 'A-', value: 80 },
  { label: 'B+', value: 77 },
  { label: 'B',  value: 73 },
  { label: 'B-', value: 70 },
  { label: 'C+', value: 67 },
  { label: 'C',  value: 63 },
  { label: 'C-', value: 60 },
  { label: 'D+', value: 55 },
  { label: 'D',  value: 50 },
]

export function letterGrade(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return '-'
  if (pct >= 90) return 'A+'
  if (pct >= 85) return 'A'
  if (pct >= 80) return 'A-'
  if (pct >= 77) return 'B+'
  if (pct >= 73) return 'B'
  if (pct >= 70) return 'B-'
  if (pct >= 67) return 'C+'
  if (pct >= 63) return 'C'
  if (pct >= 60) return 'C-'
  if (pct >= 55) return 'D+'
  if (pct >= 50) return 'D'
  return 'F'
}

// Status vs target - returns 'on-track' | 'at-risk' | 'needs-recovery'
export function gradeStatus(pct, target) {
  if (pct === null || pct === undefined) return 'unknown'
  const t = target ?? 73
  if (pct >= t) return 'on-track'
  if (pct >= t - 5) return 'at-risk'
  return 'needs-recovery'
}

export const STATUS_COLORS = {
  'on-track':       { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)', label: 'On Track'       },
  'at-risk':        { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)', label: 'At Risk'        },
  'needs-recovery': { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',  label: 'Needs Recovery' },
  'unknown':        { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.35)', label: 'No Data'       },
}

// ── Pure math functions ───────────────────────────────────────────────────────

// Weighted average of graded components only
export function getCurrentGrade(components) {
  if (!components?.length) return null
  const graded = components.filter(c => c.graded && c.grade !== null && c.grade !== undefined)
  const totalWeight = graded.reduce((s, c) => s + (c.weight || 0), 0)
  if (totalWeight === 0) return null
  return graded.reduce((s, c) => s + c.grade * c.weight, 0) / totalWeight
}

// Projected grade: actual where graded, overrides (by component id) elsewhere, 0 for unset
export function getProjectedGrade(components, overrides = {}) {
  if (!components?.length) return null
  const total = components.reduce((s, c) => s + (c.weight || 0), 0)
  if (total === 0) return null
  const weighted = components.reduce((s, c) => {
    let grade = 0
    if (c.graded && c.grade !== null && c.grade !== undefined) grade = c.grade
    else if (overrides[c.id] !== undefined) grade = overrides[c.id]
    return s + grade * c.weight
  }, 0)
  return weighted / total
}

// Score needed uniformly on all remaining ungraded components to hit targetGrade
export function getNeededOnRemaining(components, targetGrade) {
  const empty = { needed: null, rawNeeded: null, impossible: false, remainingWeight: 0, totalWeight: 0, buffer: 0, bufferPts: 0 }
  if (!components?.length) return empty
  const graded = components.filter(c => c.graded && c.grade !== null && c.grade !== undefined)
  const ungraded = components.filter(c => !c.graded || c.grade === null || c.grade === undefined)
  const totalWeight = components.reduce((s, c) => s + (c.weight || 0), 0)
  if (totalWeight === 0) return empty
  const earnedPoints = graded.reduce((s, c) => s + c.grade * c.weight, 0)
  const remainingWeight = ungraded.reduce((s, c) => s + (c.weight || 0), 0)
  if (remainingWeight === 0) return { ...empty, totalWeight, remainingWeight: 0 }
  const rawNeeded = (targetGrade * totalWeight - earnedPoints) / remainingWeight
  const bufferPts = 100 - rawNeeded
  const buffer = bufferPts * remainingWeight / totalWeight
  return {
    needed: Math.min(Math.max(rawNeeded, 0), 100),
    rawNeeded,
    impossible: rawNeeded > 100,
    remainingWeight,
    totalWeight,
    buffer: Math.max(0, buffer),
    bufferPts: Math.max(0, bufferPts),
  }
}

// Minimum needed on remaining work to maintain currentGrade
export function getDefenseFloor(components, currentGrade) {
  const empty = { floor: null, rawFloor: null, impossible: false }
  if (!components?.length || currentGrade === null || currentGrade === undefined) return empty
  const graded = components.filter(c => c.graded && c.grade !== null && c.grade !== undefined)
  const totalWeight = components.reduce((s, c) => s + (c.weight || 0), 0)
  if (totalWeight === 0) return empty
  const earnedPoints = graded.reduce((s, c) => s + c.grade * c.weight, 0)
  const remainingWeight = components
    .filter(c => !c.graded || c.grade === null || c.grade === undefined)
    .reduce((s, c) => s + (c.weight || 0), 0)
  if (remainingWeight === 0) return empty
  const rawFloor = (currentGrade * totalWeight - earnedPoints) / remainingWeight
  return {
    floor: Math.max(0, Math.min(rawFloor, 100)),
    rawFloor,
    impossible: rawFloor > 100,
  }
}

// ── Grade Hub Plan tab math ───────────────────────────────────────────────────
//
// One pass over the components that produces every figure the Plan tab shows,
// so the hero number, the cushion bar and the footer stats can never disagree
// with each other. Formulas are transcribed from design/grade-hub/:
//
//   earned        = Σ graded   (grade × weight / 100)      points banked
//   lost          = Σ graded   ((100 − grade) × weight/100) points gone forever
//   remaining     = Σ ungraded (weight)                     points still on the table
//   maxAchievable = 100 − lost = earned + remaining
//   neededAvg     = (targetCutoff − earned) / remaining × 100
//   cushion       = maxAchievable − targetCutoff
//
// Cushion is measured against the best grade still reachable, not against 100.
// Target is reachable iff cushion >= 0.
//
// Point values are normalised onto a 100-point course so the cushion bar's
// segments always sum to 100 even when saved weights do not (older rows can
// pre-date the weights-must-total-100 rule). With weights summing to 100 the
// scale factor is 1 and the arithmetic is exactly as written above.
export function computeGradeMath(components, targetCutoff) {
  const comps = (components ?? []).filter(Boolean)
  const isGraded = c => c.graded && c.grade !== null && c.grade !== undefined

  const totalWeight = comps.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0)
  const graded   = comps.filter(isGraded)
  const ungraded = comps.filter(c => !isGraded(c))

  const empty = {
    hasComponents: comps.length > 0,
    totalWeight, componentCount: comps.length, gradedCount: graded.length,
    earned: 0, lost: 0, remaining: 0, maxAchievable: 0,
    neededAvg: null, rawNeededAvg: null, cushion: null, shortfall: 0,
    residualLost: 0, currentAverage: null, finalAverage: null,
    impossible: false, allGraded: false,
  }
  if (!comps.length || totalWeight <= 0) return empty

  const scale = 100 / totalWeight
  const earned    = graded.reduce((s, c) => s + (c.grade * c.weight / 100), 0) * scale
  const lost      = graded.reduce((s, c) => s + ((100 - c.grade) * c.weight / 100), 0) * scale
  const remaining = ungraded.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0) * scale
  const maxAchievable = 100 - lost

  const allGraded = remaining <= 0
  // Weighted average of graded work only. Equals the final grade once
  // everything is graded, which is what the all-graded hero shows.
  const currentAverage = getCurrentGrade(comps)

  const rawNeededAvg = allGraded ? null : (targetCutoff - earned) / remaining * 100
  const cushion      = maxAchievable - targetCutoff
  const impossible   = !allGraded && cushion < 0

  // In the impossible state the shortfall is carved out of the lost segment, so
  // earned + remaining + shortfall + residualLost still totals 100.
  const shortfall    = impossible ? -cushion : 0
  const residualLost = Math.max(0, lost - shortfall)

  return {
    hasComponents: true,
    totalWeight, componentCount: comps.length, gradedCount: graded.length,
    earned, lost, remaining, maxAchievable,
    // Displayed hero number is clamped to a sane range; rawNeededAvg keeps the
    // true value so callers can detect "over 100" without a second calculation.
    neededAvg: allGraded ? null : Math.min(Math.max(rawNeededAvg, 0), 100),
    rawNeededAvg,
    cushion, shortfall, residualLost,
    currentAverage,
    finalAverage: allGraded ? currentAverage : null,
    impossible, allGraded,
  }
}

// Highest target from TARGET_OPTIONS that is still reachable, with the average
// it would take. Powers the "Retarget to B" action on the impossible state.
export function bestAchievableTarget(components, maxAchievable) {
  const reachable = TARGET_OPTIONS
    .filter(o => o.value <= maxAchievable)
    .sort((a, b) => b.value - a.value)[0]
  if (!reachable) return null
  const math = computeGradeMath(components, reachable.value)
  return { ...reachable, neededAvg: math.neededAvg }
}

// Auto-generate three ways to spend the remaining work and still land on the
// target. All three hit the same weighted average; they differ only in how the
// effort is distributed, which is the whole point of showing three.
//
// Each shaped path trades against an anchor: the heaviest outstanding
// component, which is nearly always the final. Weight is a proxy for "the big
// one at the end" and is the best signal available, because components carry no
// due date today. Once they do, the anchor should be the chronologically last
// component instead, so a light final does not get treated as the main event.
export function generateScenarioPaths(components, targetGrade) {
  const graded = components.filter(c => c.graded && c.grade !== null && c.grade !== undefined)
  const ungraded = components.filter(c => !c.graded || c.grade === null || c.grade === undefined)
  const totalWeight = components.reduce((s, c) => s + (c.weight || 0), 0)
  if (!ungraded.length || totalWeight === 0) return []

  const earnedPoints = graded.reduce((s, c) => s + c.grade * c.weight, 0)
  const remainingWeight = ungraded.reduce((s, c) => s + (c.weight || 0), 0)
  if (remainingWeight === 0) return []

  const rawNeeded = (targetGrade * totalWeight - earnedPoints) / remainingWeight
  if (rawNeeded > 100) return [{ name: 'Target Unreachable', scores: {}, possible: false, description: 'Mathematically impossible to hit this target.' }]

  const flat = Math.max(0, rawNeeded)
  const round1 = v => Math.round(v * 10) / 10
  const clamp01 = v => Math.max(0, Math.min(100, v))

  const anchor = ungraded.reduce((best, c) => ((c.weight || 0) >= (best.weight || 0) ? c : best), ungraded[0])
  const rest = ungraded.filter(c => c.id !== anchor.id)
  const restWeight = rest.reduce((s, c) => s + (c.weight || 0), 0)

  const flatScores = () => {
    const s = {}
    ungraded.forEach(c => { s[c.id] = round1(clamp01(flat)) })
    return s
  }

  // Move every non-anchor component `offset` points off the flat average and
  // let the anchor absorb the difference, so the weighted total still lands
  // exactly on target. Negative offset finishes strong, positive front-loads.
  //
  //   anchorScore = flat - offset * (restWeight / anchorWeight)
  //
  // The offset is capped so neither side is asked for a score below 0 or above
  // 100: a path that requires a perfect paper is not a strategy.
  const shaped = offset => {
    if (!rest.length || restWeight === 0 || !anchor.weight) return flatScores()
    const k = restWeight / anchor.weight
    const lo = Math.max(-flat, (flat - 100) / k)
    const hi = Math.min(100 - flat, flat / k)
    const o = Math.min(Math.max(offset, lo), hi)
    const scores = { [anchor.id]: round1(clamp01(flat - o * k)) }
    rest.forEach(c => { scores[c.id] = round1(clamp01(flat + o)) })
    return scores
  }

  // Points of spread between the anchor and everything else. Enough to make the
  // three paths visibly different strategies, small enough to stay realistic.
  const OFFSET = 5

  return [
    { name: 'Consistent',    description: 'Same effort everywhere. Steady and predictable.', scores: flatScores(),    possible: true },
    { name: 'Strong Finish', description: 'Coast on the small stuff, deliver on the final.', scores: shaped(-OFFSET), possible: true },
    { name: 'Front-Loaded',  description: 'Bank points now, less pressure later.',           scores: shaped(OFFSET),  possible: true },
  ]
}
