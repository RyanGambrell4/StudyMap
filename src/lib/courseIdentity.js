// Shared client-side helper for resolving a course to its stable string id
// at write time. Used by every writer that persists a courseId onto a
// completed_sessions[], session_recalls[], or syllabus_events[] row so
// the persisted value survives a later course reorder or rename.
//
// The rule: never trust a numeric array index without a cross-check
// against courseName, because the whole reason the historical bug exists
// is that the index was trusted. If the name at the resolved index
// disagrees with the name we already have, we fall back to a name match
// before giving up.

function normalizeName(s) {
  return String(s || '').trim().toLowerCase()
}

// Resolve a course identity at write time.
//
// Inputs:
//   candidate: the courseId already in scope. May be a stable string id
//     from plan.courses[].id, or a numeric array index (legacy), or null.
//   candidateName: the courseName in scope (best-effort at write time).
//   courses: plan.courses[] as currently loaded.
//
// Returns:
//   {
//     id:              string | null   the stable course.id, or null
//     method:          'string-id' | 'index-with-name-cross-check' | 'name-match' | 'unresolvable'
//     resolvedName:    string | null   the current name on file for id
//     legacyCourseIndex: number | null the numeric index that was passed in, when applicable
//   }
export function resolveStableCourseId(candidate, candidateName, courses) {
  const list = Array.isArray(courses) ? courses : []
  const legacyIndex = typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null

  // Strategy 1: candidate is already a string. Trust it if it exists in the plan.
  if (typeof candidate === 'string' && candidate) {
    const hit = list.find(c => c && String(c.id) === candidate)
    if (hit) {
      return {
        id: hit.id,
        method: 'string-id',
        resolvedName: hit.name || null,
        legacyCourseIndex: null,
      }
    }
    // String candidate does not resolve. Do not silently accept it; fall
    // through to name matching, then unresolvable. Prevents a stale or
    // garbage string id from being written to a fresh row.
  }

  // Strategy 2: candidate is a numeric index. Resolve against the current
  // courses[] BUT cross-check the name at that index against candidateName.
  // If they disagree, the index has probably been reordered under us; try
  // a name match instead of trusting the index blindly.
  if (legacyIndex !== null && legacyIndex >= 0 && legacyIndex < list.length) {
    const atIndex = list[legacyIndex]
    if (atIndex && atIndex.id) {
      const nameHere = normalizeName(atIndex.name)
      const nameGiven = normalizeName(candidateName)
      if (!nameGiven || nameHere === nameGiven) {
        return {
          id: atIndex.id,
          method: 'index-with-name-cross-check',
          resolvedName: atIndex.name || null,
          legacyCourseIndex: legacyIndex,
        }
      }
    }
  }

  // Strategy 3: name match. Case-insensitive, trimmed, must be unique.
  const target = normalizeName(candidateName)
  if (target) {
    const matches = list.filter(c => c && normalizeName(c.name) === target && c.id)
    if (matches.length === 1) {
      return {
        id: matches[0].id,
        method: 'name-match',
        resolvedName: matches[0].name || null,
        legacyCourseIndex: legacyIndex,
      }
    }
  }

  return {
    id: null,
    method: 'unresolvable',
    resolvedName: null,
    legacyCourseIndex: legacyIndex,
  }
}

// Convenience wrapper for the common write-site pattern:
// take the sess/entry's (courseId, courseName), return an object suitable
// to spread onto the persisted row.
//
// Shape of the returned patch:
//   { courseId: string | null, courseName: string, legacyCourseIndex?: number }
//
// Callers should spread this over the record they were going to write.
// courseName is preserved verbatim from the input (kept as a cross-check
// and as a fallback for downstream readers on rows that fail to resolve).
export function courseIdentityPatch(candidate, candidateName, courses) {
  const resolved = resolveStableCourseId(candidate, candidateName, courses)
  const patch = {
    courseId: resolved.id,
    courseName: candidateName || resolved.resolvedName || null,
  }
  if (resolved.legacyCourseIndex !== null) {
    patch.legacyCourseIndex = resolved.legacyCourseIndex
  }
  return patch
}
