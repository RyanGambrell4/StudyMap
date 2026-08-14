// The Knowledge Map's data layer.
//
// One rule governs this file: the map shows what was recorded, and nothing
// else. Every row here comes from a tool the student actually used.
//
// Source of truth is public.topic_signals, the append-only row-per-event
// table. RLS is "owner all", so the browser reads its own rows directly with
// the anon client; no endpoint is needed.
//
// One read-only exception: Brain Dump scores written before the
// brain_dump_score signal type existed (migrations/20260810_...) live only in
// generated_artifacts.payload.score. Those are backfilled here so students
// with history do not open an empty map. Nothing is ever written back to
// generated_artifacts; all new writes go to topic_signals.

import { supabase } from './supabase'
import { getCachedCoachPlan } from './db'
import { flattenSessions } from '../../lib/shared/coachPlan.js'
import { normalizeEvidence } from '../utils/knowledgeMap'

/**
 * Topic names the coach plan names for a course.
 *
 * The only topic source on the Knowledge Map that is not recorded evidence.
 * A course with no plan returns an empty list and the UI says where a list
 * would come from; it never invents one.
 */
export function planTopicsFor(courseId) {
  try {
    const saved = getCachedCoachPlan(courseId)
    if (!saved?.plan) return []
    const fromSessions = flattenSessions(saved.plan).flatMap(f => f.session?.keyTopics ?? [])
    const priority = saved.plan.priorityTopics ?? []
    return [...new Set([...priority, ...fromSessions].filter(t => typeof t === 'string' && t.trim()))]
  } catch {
    return []
  }
}

// Matches the 180-day window lib/server/courseContext.js uses, so the map and
// the course brain agree about what counts as current evidence.
const WINDOW_DAYS = 180
const MAX_SIGNALS = 2000
const MAX_ARTIFACTS = 400

function windowStartISO() {
  return new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

function toMillis(iso) {
  const t = Date.parse(iso ?? '')
  return Number.isFinite(t) ? t : null
}

// topic_signals stores score as 0..1. The map speaks 0..100 everywhere, so the
// conversion happens once, here, at the boundary.
function toHundred(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

/**
 * Every evidence row for this user, normalized and ready for deriveStatus.
 * Returns { records, error }. On a read failure it returns an empty list and
 * the error rather than throwing: an unreachable database should render an
 * honest empty map, never a fabricated one.
 */
export async function loadEvidence() {
  const since = windowStartISO()

  const [signalsRes, artifactsRes] = await Promise.all([
    supabase
      .from('topic_signals')
      .select('course_id, course_name, topic, signal_type, score, metadata, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_SIGNALS),
    supabase
      .from('generated_artifacts')
      .select('course_id, course_name, topic, artifact_type, payload, created_at')
      .eq('artifact_type', 'brain_dump')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_ARTIFACTS),
  ])

  const error = signalsRes.error ?? artifactsRes.error ?? null

  const signals = (signalsRes.data ?? []).map(row => ({
    topic: row.topic,
    courseId: row.course_id ?? null,
    courseName: row.course_name ?? null,
    signalType: row.signal_type,
    score: toHundred(row.score),
    at: toMillis(row.created_at),
    detail: null,
  }))

  const backfill = backfillFromArtifacts(artifactsRes.data ?? [], signals)
  const { records } = normalizeEvidence([...signals, ...backfill])

  return { records, error }
}

/**
 * Brain Dump scores that predate the brain_dump_score signal type.
 *
 * Only artifacts that named a topic and carry a numeric score can become
 * evidence; the rest are skipped rather than guessed at. An artifact is
 * dropped when a real brain_dump_score signal already covers the same topic
 * at the same moment, so a dump scored after the migration is not counted
 * twice.
 */
export function backfillFromArtifacts(artifacts, existingSignals = []) {
  const claimed = new Set(
    existingSignals
      .filter(s => s.signalType === 'brain_dump_score' && s.at != null)
      .map(s => `${String(s.topic).trim().toLowerCase()}::${Math.floor(s.at / 60000)}`),
  )

  const out = []
  for (const row of artifacts ?? []) {
    const topic = typeof row?.topic === 'string' ? row.topic.trim() : ''
    if (!topic) continue
    const score = row?.payload?.score
    if (typeof score !== 'number' || !Number.isFinite(score)) continue
    const at = toMillis(row.created_at)
    if (at == null) continue
    if (claimed.has(`${topic.toLowerCase()}::${Math.floor(at / 60000)}`)) continue

    out.push({
      topic,
      courseId: row.course_id ?? null,
      courseName: row.course_name ?? null,
      signalType: 'brain_dump_score',
      score: Math.round(score),
      at,
      detail: null,
    })
  }
  return out
}

/**
 * Group evidence rows into the topic shape the map renders.
 *
 * Topics come from two places and nowhere else: anything with recorded
 * evidence, and the coach plan topics passed in by the caller. A topic with
 * no evidence still appears, reading Untested, which is the honest state.
 */
export function groupByCourse(records, courses = [], planTopicsByCourse = {}) {
  const byCourse = new Map()

  const ensureCourse = (courseId, courseName) => {
    const key = courseId ?? 'unassigned'
    if (!byCourse.has(key)) {
      byCourse.set(key, { courseId: courseId ?? null, courseName: courseName ?? null, topics: new Map() })
    }
    const entry = byCourse.get(key)
    if (!entry.courseName && courseName) entry.courseName = courseName
    return entry
  }

  const ensureTopic = (courseEntry, topic) => {
    const key = topic.trim().toLowerCase()
    if (!courseEntry.topics.has(key)) {
      courseEntry.topics.set(key, { topic: topic.trim(), evidence: [] })
    }
    return courseEntry.topics.get(key)
  }

  for (const r of records ?? []) {
    if (!r?.topic) continue
    ensureTopic(ensureCourse(r.courseId, r.courseName), r.topic).evidence.push(r)
  }

  // Coach plan topics with no evidence yet. They belong on the map as
  // Untested: the student has a plan that names them and has not proved
  // anything about them.
  for (const course of courses ?? []) {
    const id = course?.id ?? null
    if (id == null) continue
    const planTopics = planTopicsByCourse[id] ?? []
    if (!planTopics.length) continue
    const entry = ensureCourse(id, course?.name ?? null)
    for (const t of planTopics) {
      if (typeof t === 'string' && t.trim()) ensureTopic(entry, t)
    }
  }

  // Order courses the way the student's course list orders them, so the map
  // matches every other screen. Courses with evidence but no matching course
  // record fall to the end rather than disappearing.
  const orderOf = new Map((courses ?? []).map((c, i) => [String(c?.id ?? ''), i]))
  return [...byCourse.values()]
    .map(c => ({
      courseId: c.courseId,
      courseName: c.courseName || 'Unassigned',
      topics: [...c.topics.values()].sort((a, b) => a.topic.localeCompare(b.topic)),
    }))
    .filter(c => c.topics.length)
    .sort((a, b) => {
      const ai = orderOf.has(String(a.courseId)) ? orderOf.get(String(a.courseId)) : Number.MAX_SAFE_INTEGER
      const bi = orderOf.has(String(b.courseId)) ? orderOf.get(String(b.courseId)) : Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      return String(a.courseName).localeCompare(String(b.courseName))
    })
}
