// Visual harness for the Grade Hub. Renders the real GradeHubView against each
// state in design/grade-hub/ so it can be screenshotted and compared to the
// approved mockups without needing a session or a paid plan.
//
//   npx vite --config harness/vite.harness.config.js
//   http://localhost:5199/?state=2a&w=1280     (2a 2b 2d 2e weights; w=390 mobile)
//
// This directory is never part of the app build: it has its own Vite config and
// nothing in src/ imports it.
import React from 'react'
import { createRoot } from 'react-dom/client'
import GradeHubView from '../src/components/GradeHubView'

const day = 86400000
const iso = ms => new Date(Date.now() + ms).toISOString().split('T')[0]

const TEAL   = { dot: '#0E9AA8', halo: 'rgba(14,154,168,0.15)' }
const BLUE   = { dot: '#3452D9', halo: 'rgba(52,82,217,0.15)' }
const PURPLE = { dot: '#7C5CFA', halo: 'rgba(124,92,250,0.15)' }
const AMBER  = { dot: '#D97706', halo: 'rgba(217,119,6,0.15)' }

// Filler courses so the GPA badge and the inactive chips have real data.
const psych = {
  id: 'psych', name: 'Cognitive Psychology', color: BLUE,
  gradeData: {
    targetGrade: 85,
    components: [
      { id: 'p1', component: 'Midterm', weight: 50, grade: 79, graded: true },
      { id: 'p2', component: 'Final', weight: 50, grade: 78, graded: true },
    ],
  },
}
const bio = {
  id: 'bio', name: 'Cell Biology', color: PURPLE,
  gradeData: {
    targetGrade: 85,
    components: [
      { id: 'b1', component: 'Lab', weight: 50, grade: 84, graded: true },
      { id: 'b2', component: 'Final', weight: 50, grade: 82, graded: true },
    ],
  },
}

const history = (components, targetGrade = 90) => ({
  id: 'hist', name: 'Modern World History', color: TEAL,
  examDate: iso(18 * day),
  gradeData: { targetGrade, components, scenarios: [] },
})

const STATES = {
  // 2a — fully set up
  '2a': [history([
    { id: 'm', component: 'Midterm',       weight: 30, grade: 93, graded: true },
    { id: 'f', component: 'Final Exam',    weight: 40, grade: null, graded: false },
    { id: 'q', component: 'Quizzes',       weight: 15, grade: null, graded: false },
    { id: 'g', component: 'Group Project', weight: 15, grade: null, graded: false },
  ]), psych, bio],

  // 2b — impossible target
  '2b': [history([
    { id: 'm', component: 'Midterm',       weight: 30, grade: 68, graded: true },
    { id: 'f', component: 'Final Exam',    weight: 40, grade: null, graded: false },
    { id: 'q', component: 'Quizzes',       weight: 15, grade: 78, graded: true },
    { id: 'g', component: 'Group Project', weight: 15, grade: null, graded: false },
  ]), psych, bio],

  // 2d — all graded
  '2d': [history([
    { id: 'm', component: 'Midterm',       weight: 30, grade: 93, graded: true },
    { id: 'f', component: 'Final Exam',    weight: 40, grade: 90, graded: true },
    { id: 'q', component: 'Quizzes',       weight: 15, grade: 96, graded: true },
    { id: 'g', component: 'Group Project', weight: 15, grade: 94, graded: true },
  ]), psych, bio],

  // 2e — empty, brand new course
  '2e': [
    { id: 'stat', name: 'Intro to Statistics', color: AMBER, gradeData: null },
    history([
      { id: 'm', component: 'Midterm', weight: 30, grade: 93, graded: true },
      { id: 'f', component: 'Final Exam', weight: 70, grade: 91, graded: true },
    ]),
    psych, bio,
  ],

  // Weight total not 100 — the amber counter state, spec'd in prose only.
  'weights': [history([
    { id: 'm', component: 'Midterm',    weight: 30, grade: 93, graded: true },
    { id: 'f', component: 'Final Exam', weight: 40, grade: null, graded: false },
    { id: 'q', component: 'Quizzes',    weight: 15, grade: null, graded: false },
  ]), psych, bio],
}

const params = new URLSearchParams(location.search)
const state = params.get('state') ?? '2a'
const courses = STATES[state] ?? STATES['2a']

// Fixed artboard so screenshots are deterministic and directly comparable to
// the export, which draws desktop at 1280 and mobile at 390.
const width = Number(params.get('w') ?? 1280)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div id="artboard" style={{ width, overflow: 'hidden' }}>
      <GradeHubView
        courses={courses}
        onEditCourse={() => {}}
        onShowPaywall={() => {}}
        initialCourseIdx={0}
        onSyncToCalendar={() => {}}
      />
    </div>
  </React.StrictMode>
)
