// Visual harness for the Review Queue. Renders the real ReviewQueueView
// against each state so it can be screenshotted without a session, a paid plan,
// or a real practice history.
//
//   npx vite --config harness/vite.harness.config.js
//   http://localhost:5199/review-queue.html?state=due&w=1440
//
//   states: due | cleared | caught-up | upcoming | upcoming-empty | empty | loading
//
// Note on width: ReviewQueueView restructures through useIsMobile(760), which
// reads window.matchMedia, not the artboard. To capture the mobile tree the
// browser window itself has to be narrow; ?w= only pins the artboard so a wide
// window still produces a deterministic desktop shot.
//
// This directory is never part of the app build.
import React from 'react'
import { createRoot } from 'react-dom/client'
import ReviewQueueView from '../src/components/ReviewQueueView'
import ReviewQueueSkeleton from '../src/components/ReviewQueueSkeleton'

const DAY = 86400000
const now = Date.now()

const courses = [
  { id: 'bio', name: 'Cell Biology' },
  { id: 'psych', name: 'Cognitive Psychology' },
  { id: 'chem', name: 'Organic Chemistry' },
]

// Written straight into the store the view reads, in the shape updateMastery
// produces, so nothing here is a mock of the data layer.
//   dueDays: how long ago it was last practiced, in days.
//   The interval masteryStore applies is 1d under 40, 2d under 60, 4d under 75,
//   7d at or above, so score plus age is what decides due versus upcoming.
const record = (topic, courseId, score, agedDays, count, prevScore = null) => ({
  topic,
  courseId,
  score,
  prevScore,
  lastUpdated: now - agedDays * DAY,
  source: 'brain_dump',
  count,
  history: [score],
})

const DUE_SET = [
  // Long, wrapping title: the one that used to truncate mid word.
  record('Phospholipid bilayer structure and membrane fluidity', 'bio', 12, 14, 1),
  record('Action potential propagation along myelinated axons', 'bio', 34, 6, 3, 28),
  record('SN1 versus SN2 reaction mechanisms', 'chem', 58, 4, 5, 63),
  record('Working memory and the phonological loop', 'psych', 71, 8, 2, 66),
]

const UPCOMING_SET = [
  record('Krebs cycle intermediates', 'bio', 82, 4, 6, 77),
  record('Classical conditioning and extinction', 'psych', 78, 5, 4),
  record('Stereochemistry and chirality', 'chem', 91, 3, 7, 88),
]

const STATES = {
  // 4 due, one of them 13 days overdue. The screen the brief is about.
  due: DUE_SET,
  // Nothing due, nothing upcoming, but practice history exists.
  'caught-up': [record('Krebs cycle intermediates', 'bio', 88, 1, 6)],
  // Due tab with a queue that was just brought to zero.
  cleared: [],
  // Coming up tab with rows in it.
  upcoming: UPCOMING_SET,
  // Coming up tab with nothing in the next 7 days, but due items exist.
  'upcoming-empty': DUE_SET,
  // First run: no practice at all.
  empty: [],
  loading: [],
}

const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'due'
const width = Number(params.get('w') ?? 1440)

// useIsMobile reads window.matchMedia, which tracks the real window and not the
// artboard, so a wide screenshot window would always render the desktop tree.
// Answer max-width queries from the artboard width instead. This is a harness
// concern only; the app's own matchMedia is untouched.
{
  const real = window.matchMedia.bind(window)
  window.matchMedia = (query) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query)
    if (!max) return real(query)
    const matches = width <= Number(max[1])
    return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
  }
}

// The upcoming-empty case needs due rows present but nothing inside the 7-day
// window, which DUE_SET already satisfies: every record in it is past due.
const rows = STATES[state] ?? STATES.due

const store = {}
for (const r of rows) store[`${r.courseId}::${r.topic.toLowerCase()}`] = r
localStorage.setItem('se_mastery_v2', JSON.stringify(store))

// The cleared state is the transition from >0 due to 0 due, which the view only
// enters through its own effect. Seed a clear history so the weekly counter has
// something to say, then hand it an empty store and flip the count.
// countThisWeek counts from Monday, so seed within the current week rather
// than "a couple of days ago", which lands in last week for most of Monday.
if (state === 'cleared') {
  const weekStart = (() => {
    const d = new Date()
    const dow = d.getDay()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    return d.getTime()
  })()
  const inWeek = ms => Math.max(weekStart + 60000, now - ms)
  localStorage.setItem('se_review_clears_v1', JSON.stringify([inWeek(6 * 3600000), inWeek(3 * 3600000)]))
} else {
  localStorage.removeItem('se_review_clears_v1')
}

const initialTab = state === 'upcoming' || state === 'upcoming-empty' ? 'upcoming' : 'due'

// The cleared state is a transition, not a snapshot: the view enters it when
// its due list goes from >0 to 0 on a live instance. Reproduce it the way the
// app does rather than by remounting, which would reset the ref that guards it.
// Mount with rows in the store, then empty the store and fire the same
// tool-session-complete event a finished Brain Dump fires.
if (state === 'cleared') {
  localStorage.setItem('se_mastery_v2', JSON.stringify({
    'bio::krebs cycle intermediates': record('Krebs cycle intermediates', 'bio', 30, 5, 1),
    'psych::classical conditioning': record('Classical conditioning', 'psych', 45, 6, 2),
  }))
  setTimeout(() => {
    localStorage.setItem('se_mastery_v2', '{}')
    window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'brainDump' } }))
  }, 120)
}

export function Harness() {
  if (state === 'loading') return <ReviewQueueSkeleton />
  return <ReviewQueueView courses={courses} onOpenBrainDump={() => {}} onOpenQuizBurst={() => {}} />
}

// The view opens on the Due tab. For the two upcoming states, click the tab
// once the tree is up so the screenshot lands on the right panel.
if (initialTab === 'upcoming') {
  requestAnimationFrame(() => {
    setTimeout(() => document.getElementById('rq-tab-upcoming')?.click(), 0)
  })
}

createRoot(document.getElementById('root')).render(
  <div id="artboard" style={{ width, overflow: 'hidden' }}>
    <Harness />
  </div>
)
