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

// Status vs target — returns 'on-track' | 'at-risk' | 'needs-recovery'
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

// Auto-generate three scenario paths to hit targetGrade
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

  const needed = Math.max(0, rawNeeded)
  const clamp = v => Math.max(0, Math.min(100, Math.round(v * 10) / 10))

  // Path 1: Consistent — same score on everything
  const consistent = {}
  ungraded.forEach(c => { consistent[c.id] = clamp(needed) })

  // Path 2: Strong Finish — lower on early, higher on last component
  const strong = {}
  if (ungraded.length === 1) {
    strong[ungraded[0].id] = clamp(needed)
  } else {
    const last = ungraded[ungraded.length - 1]
    const rest = ungraded.slice(0, -1)
    const restWeight = rest.reduce((s, c) => s + c.weight, 0)
    const lastBoost = Math.min(needed + 12, 100)
    const restNeeded = restWeight > 0 ? (targetGrade * totalWeight - earnedPoints - lastBoost * last.weight) / restWeight : needed
    last && (strong[last.id] = clamp(lastBoost))
    rest.forEach(c => { strong[c.id] = clamp(restNeeded) })
  }

  // Path 3: Front-Loaded — higher on first, lower on last
  const front = {}
  if (ungraded.length === 1) {
    front[ungraded[0].id] = clamp(needed)
  } else {
    const first = ungraded[0]
    const rest = ungraded.slice(1)
    const restWeight = rest.reduce((s, c) => s + c.weight, 0)
    const firstBoost = Math.min(needed + 12, 100)
    const restNeeded = restWeight > 0 ? (targetGrade * totalWeight - earnedPoints - firstBoost * first.weight) / restWeight : needed
    front[first.id] = clamp(firstBoost)
    rest.forEach(c => { front[c.id] = clamp(restNeeded) })
  }

  return [
    { name: 'Consistent',     icon: '→', description: 'Same effort across all remaining work', scores: consistent, possible: true },
    { name: 'Strong Finish',  icon: '↑', description: 'Build early, dominate the final',        scores: strong,     possible: true },
    { name: 'Front-Loaded',   icon: '⚡', description: 'Bank points now, less pressure later',   scores: front,      possible: true },
  ]
}
