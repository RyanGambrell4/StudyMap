/**
 * MasteryMapView - the Knowledge Map.
 *
 * Matches design/knowledge-map/ ("1 Map Populated", "2 Map Empty",
 * "8 Topic Detail"). All derivation lives in src/utils/knowledgeMap.js so the
 * rules can be tested without a DOM; this file renders and nothing else.
 *
 * The contract this screen keeps: every number on it was recorded by a tool
 * the student used, and every claim names the event and the date behind it.
 * There is no modelling and no projection. A topic with no scored evidence
 * says so.
 *
 * The export has no mobile artboard, so the responsive rules follow the ones
 * the Study Coach hub already uses: the hero stacks, list rows drop to two
 * lines, and the page never scrolls sideways.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { KNOWLEDGE_MAP as C, KM_SERIF, courseColor } from '../theme/tokens'
import { deriveStatus, selectHero, courseAggregate } from '../utils/knowledgeMap'
import { NO_PLAN_TOPICS_HINT } from '../utils/brainDumpFlow'
import { loadEvidence, groupByCourse, planTopicsFor } from '../lib/knowledgeEvidence'
import { useIsMobile } from '../utils/useIsMobile'
import { track } from '../lib/analytics'
import TopicDetailPanel from './TopicDetailPanel'
import TopicTile from './ui/TopicTile'

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

const EYEBROW = {
  fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
  textTransform: 'uppercase', color: C.secondary,
}

const STATUS_WORD = { solid: 'Solid', shaky: 'Shaky', untested: 'Untested' }
const STATUS_COLOR = { solid: C.solid, shaky: C.shaky, untested: C.untested }

// The rows shown before "Show all N topics".
const COLLAPSED_ROWS = 5

function StatusDot({ status, stale }) {
  const color = STATUS_COLOR[status]
  // Hollow means "not currently proven": untested always, and any status
  // whose evidence has aged out.
  const hollow = status === 'untested' || stale
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', flex: 'none',
      ...(hollow
        ? { border: `1.5px solid ${status === 'untested' ? C.hollow : color}` }
        : { background: color }),
    }} />
  )
}

function Chevron() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ flex: 'none' }} aria-hidden="true">
      <path d="M1 1l5 5-5 5" stroke={C.hollow} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EvidenceLine({ line }) {
  return (
    <div style={{ fontSize: 13, color: C.secondary, marginTop: 4 }}>
      {line.text}
      {line.staleSuffix && <span style={{ color: C.stale }}> {line.staleSuffix}</span>}
    </div>
  )
}

function TopicRow({ entry, mobile, selected, onOpen }) {
  const [hover, setHover] = useState(false)
  const { status, stale } = entry.derived

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...btnReset,
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: mobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', gap: mobile ? 12 : 24,
        padding: mobile ? '14px 18px' : '15px 28px',
        borderTop: `1px solid ${C.rowRule}`,
        background: selected ? C.selectedRow : hover ? C.rowHover : 'transparent',
        flexDirection: mobile ? 'column' : 'row',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{entry.topic}</div>
        <EvidenceLine line={entry.derived.evidenceLine} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: mobile ? 8 : 28,
        flex: 'none', width: mobile ? 'auto' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: mobile ? 'auto' : 96 }}>
          <StatusDot status={status} stale={stale} />
          <span style={{ fontSize: 13, fontWeight: 500, color: STATUS_COLOR[status] }}>
            {STATUS_WORD[status]}
          </span>
        </div>
        {!mobile && <Chevron />}
      </div>
    </button>
  )
}

function HeroCard({ hero, mobile, onStart }) {
  const congratulating = hero.mode === 'congratulate'
  return (
    <div style={{
      margin: '20px 0 0',
      background: C.card, border: `1px solid ${C.cardBorder}`,
      borderRadius: 16, boxShadow: C.cardShadow,
      padding: mobile ? '24px 22px' : '30px 32px',
      display: 'flex',
      flexDirection: mobile ? 'column' : 'row',
      alignItems: mobile ? 'stretch' : 'flex-end',
      justifyContent: 'space-between',
      gap: mobile ? 20 : 40,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={EYEBROW}>{congratulating ? 'Where you stand' : 'Check this next'}</div>
        <div style={{
          fontFamily: KM_SERIF, fontSize: mobile ? 24 : 30, fontWeight: 500,
          lineHeight: 1.2, margin: '10px 0 0',
          color: congratulating ? C.solid : C.ink,
        }}>
          {hero.headline}
        </div>
        {hero.evidence && (
          <div style={{ fontSize: 14, color: C.secondary, margin: '8px 0 0' }}>
            {congratulating ? `${hero.topic.topic}. ${hero.evidence}` : hero.evidence}
          </div>
        )}
      </div>
      <PrimaryButton
        label="Brain Dump this topic"
        full={mobile}
        onClick={() => onStart(hero.topic)}
      />
    </div>
  )
}

function PrimaryButton({ label, onClick, full = false, disabled = false }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...btnReset,
        background: disabled ? C.disabled : hover ? C.blueHover : C.blue,
        color: '#fff', fontSize: 14, fontWeight: 600,
        padding: '13px 22px', borderRadius: 10,
        whiteSpace: 'nowrap', cursor: disabled ? 'not-allowed' : 'pointer',
        width: full ? '100%' : 'auto', textAlign: 'center', flex: 'none',
      }}
    >
      {label}
    </button>
  )
}

function CourseChip({ label, dot, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...btnReset,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 999,
        fontSize: 13, fontWeight: 500,
        background: active ? C.blue : C.card,
        color: active ? '#fff' : C.ink,
        border: `1px solid ${active ? C.blue : hover ? C.chipHover : C.cardBorder}`,
      }}
    >
      {dot && !active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />}
      {label}
    </button>
  )
}

function CourseCard({ course, idx, mobile, selectedKey, onOpenTopic }) {
  const [expanded, setExpanded] = useState(false)
  const agg = courseAggregate(course.topics)
  const dot = courseColor(idx).dot
  const shown = expanded ? course.topics : course.topics.slice(0, COLLAPSED_ROWS)
  const hidden = course.topics.length - shown.length

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.cardBorder}`,
      borderRadius: 16, boxShadow: C.cardShadow, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: mobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', gap: 12,
        flexDirection: mobile ? 'column' : 'row',
        padding: mobile ? '18px 18px 14px' : '22px 28px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flex: 'none' }} />
          <span style={{ fontFamily: KM_SERIF, fontSize: mobile ? 20 : 22, fontWeight: 500, color: C.ink }}>
            {course.courseName}
          </span>
        </div>
        <div style={{ fontSize: 13, color: C.secondary }}>
          {agg.solid} of {agg.total} {agg.total === 1 ? 'topic' : 'topics'} solid
        </div>
      </div>

      {shown.map(entry => (
        <TopicRow
          key={entry.key}
          entry={entry}
          mobile={mobile}
          selected={selectedKey === entry.key}
          onOpen={onOpenTopic}
        />
      ))}

      {(hidden > 0 || expanded) && (
        <div style={{ padding: mobile ? '14px 18px' : '14px 28px', borderTop: `1px solid ${C.rowRule}` }}>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{ ...btnReset, fontSize: 13, fontWeight: 500, color: C.blue }}
          >
            {expanded ? 'Show fewer topics' : `Show all ${course.topics.length} topics`}
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ courses, mobile, onStart }) {
  const [courseIdx, setCourseIdx] = useState(0)
  const [topic, setTopic] = useState('')
  const course = courses[courseIdx] ?? null
  const suggestions = useMemo(() => planTopicsFor(course?.id).slice(0, 6), [course?.id])

  return (
    <div style={{
      margin: '32px 0 0', maxWidth: 760,
      background: C.card, border: `1px solid ${C.cardBorder}`,
      borderRadius: 16, boxShadow: C.cardShadow,
      padding: mobile ? '26px 22px' : '36px 40px 34px',
    }}>
      <div style={{ fontFamily: KM_SERIF, fontSize: mobile ? 22 : 26, fontWeight: 500, lineHeight: 1.3, color: C.ink }}>
        Nothing recorded yet<span style={{ color: C.blue }}>.</span>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, color: C.secondary }}>
        Every Brain Dump, quiz, and Teach It Back session records what you proved you know. This page collects
        the evidence per topic so you can see what is solid and what is shaky.
      </p>

      <div style={{ height: 1, background: C.rowRule, margin: '28px 0' }} />

      <div style={EYEBROW}>Pick a topic to start with</div>

      {courses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, margin: '14px 0 0', flexWrap: 'wrap' }}>
          {courses.map((c, i) => (
            <CourseChip
              key={c.id ?? i}
              label={c.name}
              dot={courseColor(i).dot}
              active={courseIdx === i}
              onClick={() => { setCourseIdx(i); setTopic('') }}
            />
          ))}
        </div>
      )}

      {suggestions.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, margin: '18px 0 0', flexWrap: 'wrap' }}>
          {suggestions.map(t => (
            <TopicTile key={t} label={t} active={topic === t} onClick={() => setTopic(t)} />
          ))}
        </div>
      ) : (
        <p style={{ margin: '18px 0 0', fontSize: 13, color: C.stale }}>{NO_PLAN_TOPICS_HINT}</p>
      )}

      <input
        type="text"
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="Or type any topic"
        style={{
          margin: '16px 0 0', width: mobile ? '100%' : 340, maxWidth: '100%',
          padding: '11px 14px', border: `1px solid ${C.cardBorder}`, borderRadius: 10,
          font: 'inherit', fontSize: 14, color: C.ink, background: C.card, outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      <div style={{
        display: 'flex', alignItems: mobile ? 'stretch' : 'center', gap: 16,
        margin: '26px 0 0', flexDirection: mobile ? 'column' : 'row',
      }}>
        <PrimaryButton
          label="Start your first Brain Dump"
          full={mobile}
          disabled={!topic.trim()}
          onClick={() => onStart({ topic: topic.trim(), courseId: course?.id ?? null, courseIdx })}
        />
        <div style={{ fontSize: 13, color: C.secondary }}>
          Pick or type a topic first. You will get 3 minutes.
        </div>
      </div>
    </div>
  )
}

export default function MasteryMapView({ courses = [], onOpenBrainDump, onUploadNotes }) {
  const mobile = useIsMobile()
  const [records, setRecords] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [courseFilter, setCourseFilter] = useState('all')
  const [openTopic, setOpenTopic] = useState(null)
  // Captured when evidence loads rather than read during render, so ages and
  // staleness stay stable across re-renders instead of drifting mid-paint.
  const [now, setNow] = useState(0)

  const refresh = useCallback(async () => {
    const { records: rows, error } = await loadEvidence()
    setNow(Date.now())
    setRecords(rows)
    setLoadError(Boolean(error))
  }, [])

  useEffect(() => {
    track('mastery_map_viewed')
    // Subscribing to an external system: every setState inside refresh runs
    // after the database read resolves, never synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // A dump scored elsewhere in the app lands on the map without a reload.
  useEffect(() => {
    const onComplete = () => { refresh() }
    window.addEventListener('studyedge:tool-session-complete', onComplete)
    return () => window.removeEventListener('studyedge:tool-session-complete', onComplete)
  }, [refresh])

  const planTopicsByCourse = useMemo(() => {
    const out = {}
    for (const c of courses) {
      if (c?.id == null) continue
      out[c.id] = planTopicsFor(c.id)
    }
    return out
  }, [courses])

  const grouped = useMemo(() => {
    if (!records) return []
    return groupByCourse(records, courses, planTopicsByCourse).map(course => ({
      ...course,
      topics: course.topics.map(t => ({
        ...t,
        key: `${course.courseId ?? 'unassigned'}::${t.topic.toLowerCase()}`,
        courseId: course.courseId,
        courseName: course.courseName,
        derived: deriveStatus(t.evidence, { now }),
      })),
    }))
  }, [records, courses, planTopicsByCourse, now])

  const visible = useMemo(
    () => (courseFilter === 'all' ? grouped : grouped.filter(c => String(c.courseId) === courseFilter)),
    [grouped, courseFilter],
  )

  const hero = useMemo(
    () => selectHero(visible.flatMap(c => c.topics), { now }),
    [visible, now],
  )

  const startDump = useCallback((entry) => {
    if (!entry) return
    const courseIdx = courses.findIndex(c => String(c.id) === String(entry.courseId))
    track('knowledge_map_brain_dump_started', { topic: entry.topic })
    onOpenBrainDump?.({
      topic: entry.topic,
      courseId: entry.courseId ?? null,
      courseIdx: courseIdx >= 0 ? courseIdx : 0,
    })
  }, [courses, onOpenBrainDump])

  const header = (
    <>
      <div style={EYEBROW}>Knowledge Map</div>
      <h1 style={{
        fontFamily: KM_SERIF, fontWeight: 500, fontSize: mobile ? 32 : 44,
        lineHeight: 1.1, margin: '10px 0 0', color: C.ink,
      }}>
        What you know<span style={{ color: C.blue }}>.</span>
      </h1>
      <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.5, color: C.secondary, maxWidth: 620 }}>
        Evidence from your Brain Dumps, quizzes, and Teach It Back sessions. Nothing here is guessed.
      </p>
    </>
  )

  const hasAnything = grouped.some(c => c.topics.length > 0)

  return (
    <div style={{
      minHeight: '100vh', background: C.pageBg,
      padding: mobile ? '28px 18px 80px' : '56px 100px 96px',
      overflowX: 'hidden',
    }}>
      {header}

      {records === null ? (
        <p style={{ margin: '32px 0 0', fontSize: 14, color: C.secondary }}>Reading your evidence.</p>
      ) : loadError ? (
        <div style={{
          margin: '32px 0 0', maxWidth: 620,
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 16, boxShadow: C.cardShadow, padding: '24px 26px',
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>Could not read your evidence just now</div>
          <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, color: C.secondary }}>
            Nothing is lost. Reload the page and the map will rebuild from what is recorded.
          </p>
        </div>
      ) : !hasAnything ? (
        <EmptyState
          courses={courses}
          mobile={mobile}
          onStart={({ topic, courseId, courseIdx }) => {
            track('knowledge_map_brain_dump_started', { topic, source: 'empty_state' })
            onOpenBrainDump?.({ topic, courseId, courseIdx })
          }}
        />
      ) : (
        <>
          {grouped.length > 1 && (
            <div style={{ display: 'flex', gap: 8, margin: '28px 0 0', flexWrap: 'wrap' }}>
              <CourseChip label="All courses" active={courseFilter === 'all'} onClick={() => setCourseFilter('all')} />
              {grouped.map((c, i) => (
                <CourseChip
                  key={c.courseId ?? i}
                  label={c.courseName}
                  dot={courseColor(i).dot}
                  active={courseFilter === String(c.courseId)}
                  onClick={() => setCourseFilter(String(c.courseId))}
                />
              ))}
            </div>
          )}

          {hero && <HeroCard hero={hero} mobile={mobile} onStart={startDump} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, margin: '32px 0 0' }}>
            {visible.map((course, i) => (
              <CourseCard
                key={course.courseId ?? i}
                course={course}
                idx={i}
                mobile={mobile}
                selectedKey={openTopic?.key ?? null}
                onOpenTopic={(entry) => { track('knowledge_map_topic_opened', { topic: entry.topic }); setOpenTopic(entry) }}
              />
            ))}
          </div>
        </>
      )}

      {openTopic && (
        <TopicDetailPanel
          entry={openTopic}
          now={now}
          mobile={mobile}
          onClose={() => setOpenTopic(null)}
          onStartDump={() => { const e = openTopic; setOpenTopic(null); startDump(e) }}
          onUploadNotes={onUploadNotes}
        />
      )}
    </div>
  )
}
