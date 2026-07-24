import { useEffect, useMemo, useRef, useState } from 'react'
import PlansIndex from './PlansIndex'
import PlanDetail from './PlanDetail'
import CoachCreateModal from './CoachCreateModal'
import {
  getV2Plan,
  rebalanceIfNeeded,
  todayIso,
} from './planStore'
import { T } from '../../tokens'

// Coach v2 root — index ↔ detail switcher + modal host.
// Reads plans synchronously from the db.js cache; rebalances on plan-detail
// mount when scheduled dates have slipped.
export default function CoachRoot({
  courses,
  assignments = [],
  scheduleHasData = false,
  onEditCourse,          // (idx, updatedCourse) => void
  onStartFocus,          // (sessionForFocusMode) => void — parent handles blueprint/paywall
  planTick,              // number — parent bumps this after cross-credit fires
}) {
  const [view, setView] = useState('index')            // 'index' | 'plan'
  const [openCourseId, setOpenCourseId] = useState(null)
  const [modal, setModal] = useState(null)             // { courseIdx } | null
  const [, forceRerender] = useState(0)

  // Read plans reactively when courses change or planTick bumps.
  const plansById = useMemo(() => {
    const out = {}
    courses.forEach(c => { out[c.id] = getV2Plan(c.id) })
    return out
    // planTick intentionally in deps to refresh after external mutations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, planTick])

  const openCourse = useMemo(() => courses.find(c => c.id === openCourseId) ?? null, [courses, openCourseId])
  const openPlan = openCourse ? plansById[openCourse.id] : null

  const openPlanView = (courseId) => {
    setOpenCourseId(courseId)
    setView('plan')
    window.scrollTo(0, 0)
  }
  const backToIndex = () => { setView('index'); setOpenCourseId(null) }

  const openCreate = (courseIdx) => setModal({ courseIdx })
  const openNewPlan = () => {
    // First course without a plan; if all have plans, first course.
    const firstUnplanned = courses.findIndex(c => !plansById[c.id])
    setModal({ courseIdx: firstUnplanned >= 0 ? firstUnplanned : 0 })
  }

  // Auto-replan on plan-detail mount when incomplete sessions have slipped
  // into the past. Runs once per (courseId, dayStamp) to avoid loops.
  const rebalancedRef = useRef({})
  useEffect(() => {
    if (view !== 'plan' || !openCourseId) return
    const stamp = `${openCourseId}:${todayIso()}`
    if (rebalancedRef.current[stamp]) return
    rebalancedRef.current[stamp] = true
    ;(async () => {
      const r = await rebalanceIfNeeded(openCourseId, todayIso())
      if (r.moved > 0) forceRerender(n => n + 1)
    })()
  }, [view, openCourseId])

  // Build the focus-session object from a plan session. `planSessionId` marks
  // it as plan-originated so OutputView's cross-credit skips it.
  const buildFocusSession = (course, planSession) => ({
    id: `plan-${planSession.id}`,
    planSessionId: planSession.id,   // ← origin marker
    planCourseId: course.id,         // ← lets completion route back to the plan
    dateStr: todayIso(),
    courseId: courses.findIndex(c => c.id === course.id),
    courseName: course.name,
    sessionType: planSession.toolLabel,
    studyMethod: planSession.method,
    focusArea: planSession.title,
    topic: planSession.topic,
    duration: planSession.durationMin,
    fromCoachPlan: true,
  })

  return (
    <>
      {view === 'index' && (
        <PlansIndex
          courses={courses}
          plansById={plansById}
          todayIso={todayIso()}
          onOpenPlan={openPlanView}
          onBuildPlan={openCreate}
          onNewPlan={openNewPlan}
        />
      )}
      {view === 'plan' && openCourse && openPlan && (
        <PlanDetail
          course={openCourse}
          plan={openPlan}
          todayIso={todayIso()}
          scheduleHasData={scheduleHasData}
          onBack={backToIndex}
          onStartSession={(s) => onStartFocus(buildFocusSession(openCourse, s))}
          onRefine={() => openCreate(courses.findIndex(c => c.id === openCourse.id))}
        />
      )}
      {view === 'plan' && openCourse && !openPlan && (
        <div style={{ padding: 48, textAlign: 'center', color: T.muted }}>
          Plan not found. <a onClick={(e) => { e.preventDefault(); backToIndex() }} href="#" style={{ color: T.accent }}>Back to My Plans</a>
        </div>
      )}
      {modal && (
        <CoachCreateModal
          courses={courses}
          assignments={assignments}
          scheduleHasData={scheduleHasData}
          initialCourseIdx={modal.courseIdx}
          onClose={() => setModal(null)}
          onSaveCourse={onEditCourse}
          onPlanSaved={(courseId) => {
            setModal(null)
            openPlanView(courseId)
          }}
        />
      )}
    </>
  )
}
