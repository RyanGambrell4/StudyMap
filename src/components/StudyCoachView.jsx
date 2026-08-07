import { useState, useEffect, useRef, useMemo } from 'react'
import Spinner from './ui/spinner'
import { getCachedCoachPlan, saveCoachPlan as dbSaveCoachPlan, saveCoachPlanStruggles, saveCoachPlanObject, saveCoachPlanPushedAt } from '../lib/db'
import StudyCoachPlanView from './StudyCoachPlanView'
import { buildScheduleBlocks } from '../utils/pushPlanToSchedule'
import { catchUpReschedule, nextSession, flattenSessions } from '../../lib/shared/coachPlan.js'
import StudyCoachHubView from './StudyCoachHubView'
import StudyCoachIntakeStep from './StudyCoachIntakeStep'
import { toHubEntry } from '../utils/coachHub'
import { routeHash, routeState, parseRoute } from '../utils/coachRoute'
import { extractText } from '../utils/extractText'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, canUseFeature, incrementFeatureUsage, getActivePlan } from '../lib/subscription'
import { getCurrentGrade, letterGrade, TARGET_OPTIONS } from '../utils/gradeCalc'
import { track } from '../lib/analytics'

// ── DB helpers ────────────────────────────────────────────────────────────────
function loadCoachPlan(courseId) { return getCachedCoachPlan(courseId) }

// Where an in-progress wizard draft lives so a refresh does not lose it. The
// finished plan goes to user_data; this is only the unsubmitted form.
const DRAFT_KEY = 'se_coach_draft'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function saveCoachPlan(courseId, plan, formData) { dbSaveCoachPlan(courseId, plan, formData) }

// ── Design tokens ─────────────────────────────────────────────────────────────
const EXAM_COURSE_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i

const D = {
  bg: '#F7F8FA', bgCard: '#FFFFFF', bgEl: '#F0EFEC',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', muted: '#6B6B6B', dim: '#9B9B9B',
  accent: '#3B61C4', glow: 'rgba(59,97,196,0.2)',
  indigo: '#3B61C4', violet: '#111111',
  mint: '#16A34A', orange: '#E8531A', sky: '#2563EB',
  pink: '#DC2626', amber: '#D97706', cyan: '#0891B2',
}

const SC_STYLE = `
  @keyframes sc-fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes sc-pulse { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
  .sc-input { -webkit-appearance:none; background:#FFFFFF; border:1px solid rgba(0,0,0,0.12); color:#111111; border-radius:9px; padding:11px 14px; font-size:13.5px; outline:none; transition:border-color 0.15s; width:100%; font-family:inherit; box-sizing:border-box; }
  .sc-input:focus { border-color:rgba(59,97,196,0.5); background:#FFFFFF; }
  .sc-input::placeholder { color:#9B9B9B; }
  textarea.sc-input { resize:vertical; min-height:68px; line-height:1.5; }
  input[type="date"].sc-input { color-scheme:light; }
  @media (max-width:1200px) { .sc-grid { grid-template-columns:1fr !important; } .sc-rail { position:static !important; } }
  @media (max-width:768px) { .sc-grid { grid-template-columns:1fr !important; } .sc-rail { position:static !important; top:auto !important; } }
  @media (max-width:640px) {
    .sc-header-pad { padding:16px 14px 12px !important; }
    .sc-page-pad { padding:14px 14px 90px !important; }
    .sc-stepper { gap:3px !important; padding:4px !important; }
    .sc-step-btn { padding:8px 8px !important; min-width:0 !important; }
    .sc-step-label { display:none !important; }
    .sc-2col { grid-template-columns:1fr !important; }
    .sc-days-row { flex-wrap:wrap !important; }
    .sc-plan-ring { display:none !important; }
    .sc-plan-text { min-width:0 !important; }
    .sc-plan-header-row { flex-direction:column !important; }
    .sc-roadmap-hint { display:none !important; }
    .sc-page-pad { overflow-x: hidden !important; max-width: 100vw !important; }
    * { min-width: 0; }
    .sc-plan-title { font-size:18px !important; line-height:1.3 !important; word-break:break-word !important; }
    .sc-session-grid { grid-template-columns:1fr !important; }
    .sc-topics-grid { grid-template-columns:1fr !important; }
    .sc-techniques-grid { grid-template-columns:1fr !important; }
    .sc-week-hint { display:none !important; }
    .sc-topic-struggles-hint { display:none !important; }
  }
  .sc-plans-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;}
  .sc-plans-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  @media(max-width:900px){.sc-plans-cards{grid-template-columns:repeat(2,1fr)!important;}}
  @media(max-width:640px){.sc-plans-stats{grid-template-columns:repeat(2,1fr)!important;}.sc-plans-cards{grid-template-columns:1fr!important;}.sc-plans-back{flex-direction:column!important;align-items:flex-start!important;}}
`

// ── Icons ─────────────────────────────────────────────────────────────────────
function Icon({ name, size = 16, color, stroke = 1.8 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color || 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    home: <path d="M3 10l9-7 9 7v11a2 2 0 0 1-2 2h-3v-8h-8v8H5a2 2 0 0 1-2-2z"/>,
    book: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/>,
    sparkles: <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    x: <path d="M6 6l12 12M6 18L18 6"/>,
    check: <path d="M20 6L9 17l-5-5"/>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6"/>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    warn: <><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.7 3h16.96a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></>,
    edit: <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>,
    msg: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    lightbulb: <><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></>,
    refresh: <><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    zap: <path d="M13 2L3 14h7l-1 8 10-12h-7z"/>,
    flag: <><path d="M4 21V4M4 4h14l-2 5 2 5H4"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></>,
    bookmark: <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>,
  }
  return <svg {...p}>{paths[name] || paths.book}</svg>
}

// ── Page header ───────────────────────────────────────────────────────────────
function PageHeader({ step, uiMode, onBack, onNewPlan }) {
  const isPlans = uiMode === 'plans'
  return (
    <div className="sc-header-pad" style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${D.border}` }}>
      <div className="sc-plans-back" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!isPlans && onBack && (
            <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '5px 12px 5px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, color: D.muted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
              <Icon name="arrowLeft" size={13} /> Back to My Plans
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: -0.8, color: D.text }}>
            Study Coach
            <span style={{ marginLeft: 12, fontSize: 12.5, fontWeight: 500, color: D.indigo, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.2)', padding: '4px 10px', borderRadius: 999, verticalAlign: 'middle' }}>
              {isPlans ? 'My Plans' : `Step ${step}/3`}
            </span>
          </h1>
          {isPlans ? (
            <p style={{ margin: '6px 0 0', fontSize: 14, color: D.muted, maxWidth: 680 }}>
              One plan per course, built only from what <em>you</em> tell me. Pick a course to view its plan, or start a new one.
            </p>
          ) : (
            <>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: D.muted, maxWidth: 680 }}>
                Built only from what <em>you</em> tell me. More topics and deadlines mean a more specific plan.
              </p>
            </>
          )}
        </div>
        {isPlans && onNewPlan && (
          <button onClick={onNewPlan} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 11, background: '#3B61C4', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}>
            <Icon name="plus" size={14} color="#fff" /> New Plan
          </button>
        )}
      </div>
    </div>
  )
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ step, go }) {
  const steps = [
    { n: 1, label: 'Tell me about the course', icon: 'msg' },
    { n: 2, label: 'Confirm & refine', icon: 'edit' },
    { n: 3, label: 'Your study plan', icon: 'sparkles' },
  ]
  return (
    <div className="sc-stepper" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, borderRadius: 12, marginBottom: 24 }}>
      {steps.map((s, i) => {
        const active = step === s.n
        const done = step > s.n
        return (
          <div key={s.n} style={{ display: 'contents' }}>
            <button
              disabled={!done && !active}
              onClick={() => done && go(s.n)}
              className="sc-step-btn"
              style={{ flex: 1, padding: '10px 14px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10, background: active ? 'rgba(59,97,196,0.07)' : 'transparent', border: active ? '1px solid rgba(59,97,196,0.2)' : '1px solid transparent', opacity: !active && !done ? 0.5 : 1, cursor: done ? 'pointer' : 'default' }}
            >
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: done ? D.mint : active ? '#3B61C4' : 'rgba(0,0,0,0.04)', color: done || active ? '#fff' : D.muted, fontSize: 11, fontWeight: 700 }}>
                {done ? <Icon name="check" size={12} stroke={3} /> : s.n}
              </div>
              <span className="sc-step-label" style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? D.text : D.muted, whiteSpace: 'nowrap' }}>{s.label}</span>
            </button>
            {i < steps.length - 1 && <div style={{ width: 16, height: 1, background: D.border, flexShrink: 0 }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Fact card ─────────────────────────────────────────────────────────────────
function FactCard({ icon, color, title, empty, children }) {
  return (
    <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 14, opacity: empty ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Icon name={icon} size={11} color={color} />
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: empty ? D.dim : D.text, fontStyle: empty ? 'italic' : 'normal', lineHeight: 1.45 }}>{children}</div>
    </div>
  )
}

// ── Coach question ────────────────────────────────────────────────────────────
function CoachQuestion({ n, question, form, setForm, field }) {
  const [draft, setDraft] = useState('')
  const [answered, setAnswered] = useState(false)
  const submit = () => {
    if (!draft.trim()) return
    if (field === 'goal') setForm(f => ({ ...f, goal: draft }))
    else if (field === 'struggles') setForm(f => ({ ...f, struggles: draft }))
    else if (field === 'topics-chip') setForm(f => ({ ...f, topics: [...(f.topics || []), ...draft.split(',').map(s => s.trim()).filter(Boolean)] }))
    setAnswered(true)
  }
  return (
    <div style={{ padding: 14, borderRadius: 10, background: answered ? 'rgba(52,211,153,0.06)' : 'rgba(0,0,0,0.03)', border: `1px solid ${answered ? 'rgba(52,211,153,0.25)' : D.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: answered ? 0 : 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: answered ? D.mint : 'rgba(232,83,26,0.12)', color: answered ? '#fff' : D.indigo, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>
          {answered ? <Icon name="check" size={11} stroke={3} /> : n}
        </div>
        <div style={{ fontSize: 13, color: D.text, lineHeight: 1.5 }}>{question}</div>
      </div>
      {!answered && (
        <div style={{ display: 'flex', gap: 8, paddingLeft: 32 }}>
          <input type="text" className="sc-input" placeholder={field === 'topics-chip' ? 'Comma-separated, or skip' : 'Type your answer, or skip'}
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          <button onClick={submit} disabled={!draft.trim()} style={{ padding: '0 14px', borderRadius: 8, flexShrink: 0, background: draft.trim() ? '#3B61C4' : 'rgba(0,0,0,0.03)', border: `1px solid ${draft.trim() ? '#3B61C4' : D.border}`, color: draft.trim() ? '#fff' : D.dim, fontSize: 12.5, fontWeight: 600, cursor: draft.trim() ? 'pointer' : 'not-allowed' }}>Save</button>
          <button onClick={() => setAnswered(true)} style={{ padding: '0 12px', borderRadius: 8, flexShrink: 0, color: D.dim, fontSize: 12, cursor: 'pointer' }}>Skip</button>
        </div>
      )}
      {answered && <div style={{ fontSize: 11.5, color: D.mint, marginLeft: 32, marginTop: 4 }}>{draft.trim() ? 'Saved' : 'Skipped'}</div>}
    </div>
  )
}

// ── Step 2: Review ────────────────────────────────────────────────────────────
function ReviewStep({ form, setForm, courses, onBack, onBuild, loading }) {
  const course = courses[form.courseIdx]
  const color = course?.color?.dot || D.accent
  const dates = (form.dates || []).filter(d => d.date && d.label)
  const topics = form.topics || []

  const questions = []
  if (!form.goal?.trim()) questions.push({ id: 'goal', q: "You didn't specify a target grade or goal. What does success look like?", field: 'goal' })
  if (!topics.length) questions.push({ id: 'topics', q: "I don't have any topics yet. Even one or two helps. What's on the exam or being covered?", field: 'topics-chip' })
  if (!form.struggles?.trim()) questions.push({ id: 'struggle', q: "Nothing noted for struggles. Is there a topic where you'd like extra reps?", field: 'struggles' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary */}
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase', marginBottom: 10 }}>Here's what you told me</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, color: D.text, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {course?.name}
          </div>
          <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.6 }}>
            {form.goal?.trim() ? <>Your goal: <span style={{ color: D.text }}>{form.goal}</span>. </> : 'No goal on file. '}
            {topics.length > 0 ? <>Emphasizing <span style={{ color: D.indigo }}>{topics.length}</span> topic{topics.length === 1 ? '' : 's'}. </> : 'No topics yet. '}
            {dates.length > 0 && <><span style={{ color: D.pink }}>{dates.length}</span> deadline{dates.length === 1 ? '' : 's'} noted. </>}
            Cadence: <span style={{ color: D.amber }}>{form.daysPerWeek || 3}</span> days x <span style={{ color: D.amber }}>{form.sessionLen || 60}m</span>.
          </div>
        </div>

        {/* Facts grid */}
        <div className="sc-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FactCard icon="flag" color={D.pink} title="Goal" empty={!form.goal?.trim()}>{form.goal?.trim() || 'Not provided'}</FactCard>
          <FactCard icon="target" color={D.indigo} title="Topics" empty={!topics.length}>
            {topics.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {topics.map((t, i) => <span key={i} style={{ padding: '3px 9px', borderRadius: 5, background: 'rgba(129,140,248,0.12)', color: D.indigo, fontSize: 11.5 }}>{t}</span>)}
              </div>
            ) : 'Not provided'}
          </FactCard>
          <FactCard icon="calendar" color={D.violet} title="Deadlines" empty={dates.length === 0}>
            {dates.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dates.map((d, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: D.text }}>{d.label}</span><span style={{ color: D.violet }}>{d.date}</span></div>)}
              </div>
            ) : 'None'}
          </FactCard>
          <FactCard icon="warn" color={D.orange} title="Struggles" empty={!form.struggles?.trim()}>{form.struggles?.trim() || 'Not provided'}</FactCard>
          <FactCard icon="check" color={D.mint} title="Strong areas" empty={!form.strengths?.trim()}>{form.strengths?.trim() || 'Not provided'}</FactCard>
          <FactCard icon="lightbulb" color={D.mint} title="Learning style" empty={!form.style?.length}>{form.style?.length ? form.style.join(' · ') : 'Not specified'}</FactCard>
        </div>

        {/* Coach questions */}
        {questions.length > 0 && (
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icon name="msg" size={14} color={D.indigo} />
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.indigo, textTransform: 'uppercase' }}>A few quick questions</span>
            </div>
            <div style={{ fontSize: 12.5, color: D.muted, marginBottom: 16 }}>You can skip any of these. The plan will just note they weren't provided.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {questions.map((q, i) => <CoachQuestion key={q.id} n={i+1} question={q.q} form={form} setForm={setForm} field={q.field} />)}
            </div>
          </div>
        )}

        {/* Nav */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} disabled={loading} style={{ padding: '14px 18px', borderRadius: 11, background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            <Icon name="arrowLeft" size={13} /> Edit inputs
          </button>
          <button onClick={onBuild} disabled={loading} style={{ flex: 1, padding: '14px 20px', borderRadius: 11, background: '#3B61C4', color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, border: 'none' }}>
            {loading ? (
              <>
                <Spinner size="sm" color="#fff" track="rgba(255,255,255,0.3)" />
                Building your plan…
              </>
            ) : (
              <><Icon name="sparkles" size={14} /> Build my plan</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StudyCoachView({ courses, userId, onShowPaywall, googleEvents = [], preferredTime = 'Morning', onStartFocus, onNavigateToCourses, onPushToSchedule, learningStyle, completedSessions = [], scheduledSessions = [], restDays = [], onOpenExamRescue, onStartSyllabusOnboarding, coachPlanVersion = 0, onOpenGradeHub }) {
  const [step, setStep] = useState(1)
  const defaultStyle = learningStyle ? [learningStyle] : []
  const [form, setForm] = useState({
    courseIdx: courses.length > 0 ? 0 : -1,
    goal: '', topics: [], strengths: '', struggles: '',
    dates: [], materials: [], daysPerWeek: 3, sessionLen: 60, style: defaultStyle, includeWeekends: false,
  })
  const [plan, setPlan] = useState(null)
  const isExamMode = form.courseIdx >= 0 && EXAM_COURSE_PATTERN.test(courses[form.courseIdx]?.name ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pushed, setPushed] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [catchUpBusy, setCatchUpBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [cachedStruggles, setCachedStruggles] = useState([])
  const [uiMode, setUiMode] = useState('plans') // 'plans' | 'building' | 'viewing'

  // Hub rows, read from the canonical plan store. `coachPlanVersion` bumps on
  // session completion, so finishing a session moves the hub's progress too.
  const hubEntries = useMemo(
    () => courses.map((c, i) => toHubEntry(c, i, loadCoachPlan(c.id ?? i))),
    [courses, coachPlanVersion, plan]
  )

  // ── Browser history ────────────────────────────────────────────────────────
  // Extends the section-level pushState in OutputView rather than inventing a
  // second mechanism: same history entry, one extra `coach` key. Back from
  // step 2 returns to step 1 with the form intact, and refresh lands on the
  // view you were looking at instead of the home screen.
  const routeReady = useRef(false)
  const fromPop = useRef(false)

  useEffect(() => {
    const state = routeState(uiMode, step)
    const hash = routeHash(uiMode, step)
    if (!routeReady.current) {
      routeReady.current = true
      window.history.replaceState(state, '', hash)
      return
    }
    if (fromPop.current) { fromPop.current = false; return }
    window.history.pushState(state, '', hash)
  }, [uiMode, step])

  useEffect(() => {
    const onPop = (e) => {
      const c = e.state?.coach
      if (!c) return
      fromPop.current = true
      setUiMode(c.uiMode)
      setStep(c.step)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Restore the route and the in-progress draft on a hard refresh. React state
  // survives Back on its own; only a reload needs the draft on disk.
  useEffect(() => {
    let draft = null
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch { /* ignore */ }
    const route = parseRoute(typeof window !== 'undefined' ? window.location.hash : '')
    if (!route || route.uiMode === 'plans') return
    if (route.uiMode === 'building' && draft?.form) {
      setForm(f => ({ ...f, ...draft.form }))
      setUiMode('building')
      setStep(route.step)
    } else if (route.uiMode === 'viewing' && draft?.courseIdx >= 0) {
      setForm(f => ({ ...f, courseIdx: draft.courseIdx }))
      setUiMode('viewing')
      setStep(3)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the draft on step changes rather than on every keystroke.
  useEffect(() => {
    if (uiMode === 'plans') return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, courseIdx: form.courseIdx }))
    } catch { /* quota, ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode, step])

  // Material extraction
  const [materialText, setMaterialText] = useState('')
  const [materialLoading, setMaterialLoading] = useState(false)
  const [materialError, setMaterialError] = useState('')
  const [syllabusHintFile, setSyllabusHintFile] = useState(null)

  // Load saved plan when course changes
  useEffect(() => {
    const idx = form.courseIdx
    if (idx < 0 || !courses[idx]) return
    const saved = loadCoachPlan(courses[idx].id ?? idx)
    if (saved) {
      setPlan(saved.plan)
      if (saved.formData) {
        setForm(f => ({
          ...f,
          goal: saved.formData.goal ?? '',
          topics: saved.formData.topics ?? (saved.formData.emphasisTopics ? saved.formData.emphasisTopics.split(',').map(s => s.trim()).filter(Boolean) : []),
          strengths: saved.formData.strengths ?? '',
          struggles: saved.formData.struggles ?? '',
          daysPerWeek: saved.formData.daysPerWeek ?? 3,
          sessionLen: saved.formData.sessionLen ?? saved.formData.sessionMinutes ?? 60,
          dates: saved.formData.dates ?? saved.formData.importantDates ?? [],
          style: saved.formData.style ?? [],
        }))
        if (saved.plan) setStep(3)
      }
      setCachedStruggles(saved.struggles ?? [])
      setPushed(!!saved.pushedAt)
    } else {
      setPlan(null)
      setStep(1)
    }
    // Auto-populate exam date from course if not already present
    const course = courses[idx]
    if (course?.examDate) {
      setForm(f => {
        const alreadyHas = f.dates.some(d => d.date === course.examDate && d.label === 'Exam Day')
        if (alreadyHas) return f
        const filtered = f.dates.filter(d => d.label !== 'Exam Day')
        return { ...f, dates: [{ label: 'Exam Day', date: course.examDate }, ...filtered] }
      })
    }
    setError('')
    setNotice(null)
  }, [form.courseIdx])

  // Completion happens in Focus Mode, which writes back to the stored plan and
  // bumps this counter. Re-reading here is what makes the hero advance, the bar
  // move and "X of 12" tick up when the student comes back from a session.
  useEffect(() => {
    const idx = form.courseIdx
    if (idx < 0 || !courses[idx]) return
    const saved = loadCoachPlan(courses[idx].id ?? idx)
    if (saved?.plan) {
      setPlan(saved.plan)
      setPushed(!!saved.pushedAt)
      setCachedStruggles(saved.struggles ?? [])
    }
  }, [coachPlanVersion])

  const handleMaterialFile = async (file) => {
    setMaterialLoading(true)
    setMaterialError('')
    setSyllabusHintFile(null)
    try {
      const text = await extractText(file)
      setMaterialText(prev => prev + '\n' + text)
      // Detect syllabus-like documents, only when the flag is on
      const syllabusFlag = typeof localStorage !== 'undefined' && localStorage.getItem('se_syllabus_onboarding') !== '0'
      if (syllabusFlag && onStartSyllabusOnboarding) {
        const lower = text.toLowerCase()
        const syllabusSignals = ['course syllabus', 'grading policy', 'office hours', 'course schedule', 'learning objectives', 'exam date', 'midterm', 'final exam', 'due date', 'assignment weight', 'grade breakdown', 'credit hours']
        const matchCount = syllabusSignals.filter(s => lower.includes(s)).length
        if (matchCount >= 2) setSyllabusHintFile(file)
      }
    } catch {
      setMaterialError('Could not read that file. Try pasting the text directly.')
    } finally { setMaterialLoading(false) }
  }

  const handleBuild = async () => {
    const course = courses[form.courseIdx]
    if (!course) return
    const { allowed: coachAllowed } = canUseFeature('coachPlan')
    if (!coachAllowed) { onShowPaywall?.('coach'); return }
    if (!canUseAI()) { onShowPaywall?.('ai'); return }

    setLoading(true)
    setError('')
    setPlan(null)
    setPushed(false)

    try {
      const token = await getAccessToken()
      const validDates = (form.dates || []).filter(d => d.label.trim() && d.date)

      const courseRecallScores = {}
      courses.forEach(c => {
        const recalls = completedSessions
          .filter(s => s.courseName === c.name && s.recallScore != null)
          .map(s => s.recallScore * 100)
        courseRecallScores[c.name] = recalls.length
          ? Math.round(recalls.reduce((a, b) => a + b, 0) / recalls.length)
          : null
      })

      const res = await fetch('/api/generate-study-coach-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course.name,
          goal: form.goal?.trim() || '',
          emphasisTopics: form.topics?.length ? form.topics.join(', ') : null,
          importantDates: validDates.length ? validDates : null,
          daysPerWeek: form.daysPerWeek || 3,
          includeWeekends: form.includeWeekends || false,
          sessionMinutes: form.sessionLen || 60,
          calendarEvents: googleEvents.length ? googleEvents : null,
          timePreference: preferredTime,
          courseMaterials: materialText || null,
          struggles: [
            ...(cachedStruggles.length ? cachedStruggles : []),
            ...(form.struggles?.trim() ? [form.struggles.trim()] : []),
          ].filter(Boolean) || null,
          strengths: form.strengths?.trim() || null,
          learningStyle: form.style?.length ? form.style.join(', ') : null,
          gradeGap: (() => {
            const comps = course?.gradeData?.components ?? []
            const target = course?.gradeData?.targetGrade ?? null
            const current = getCurrentGrade(comps)
            return current !== null && target !== null ? current - target : null
          })(),
          weakAreas: (() => {
            const comps = course?.gradeData?.components ?? []
            const weak = comps.filter(c => c.graded && c.grade !== null && c.grade < 70).map(c => c.component)
            return weak.length ? weak : null
          })(),
          courseRecallScores,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate plan')
      setPlan(data)
      const courseId = course.id ?? form.courseIdx
      saveCoachPlan(courseId, data, { ...form, sessionMinutes: form.sessionLen, importantDates: form.dates, emphasisTopics: form.topics?.join(', ') })
      // Regenerating replaces the plan, so the old calendar blocks no longer
      // correspond to anything. Clear the pushed flag: the student is asked to
      // push again rather than being shown a green dot for a stale schedule.
      await saveCoachPlanPushedAt(courseId, null)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      setPushed(false)
      setNotice(null)
      // Drop the previous plan's calendar blocks. Their session ids belong to a
      // plan that no longer exists, so leaving them would orphan them on the
      // Schedule page with nothing to complete them against.
      onPushToSchedule?.([], courseId)
      // weekCount read `data.weeks`, which this endpoint has never returned,
      // so every event since launch reported 0.
      track('study_plan_generated', { plan: getActivePlan(), weekCount: data.weeklyFocus?.length ?? 0 })
      await incrementAIQuery()
      await incrementFeatureUsage('coachPlan')
      setStep(3)
      setUiMode('viewing')
    } catch (e) {
      setError(e.message)
      setStep(3) // Show error in step 3
    } finally {
      setLoading(false)
    }
  }

  // Push and Update both run this. Session dates come from the plan itself, so
  // pushing twice replaces the same blocks rather than inventing a new spread.
  const handlePush = async () => {
    const course = courses[form.courseIdx]
    if (!plan || !course) return
    const courseId = course.id ?? form.courseIdx
    setPushBusy(true)
    try {
      const { sessions, skipped } = buildScheduleBlocks({
        plan,
        course,
        courseKey: courseId,
        courseIdx: form.courseIdx,
        preferredTime,
        googleEvents,
        existingSessions: scheduledSessions,
        restDays,
        sessionLen: form.sessionLen || 60,
      })

      if (!sessions.length) {
        setNotice('Every remaining session is already done, so there was nothing to put on your schedule.')
        return
      }

      onPushToSchedule?.(sessions, courseId)
      await saveCoachPlanPushedAt(courseId, Date.now())
      setPushed(true)
      setNotice(
        skipped.length
          ? `${sessions.length} sessions are on your schedule. ${skipped.length} could not fit around your existing commitments, so they stayed in the plan only.`
          : null
      )
      track('study_plan_pushed', { sessionCount: sessions.length, skipped: skipped.length })
    } finally {
      setPushBusy(false)
    }
  }

  // Catch up is deterministic and runs entirely on the client: no AI call.
  // It rewrites the stored plan, then re-pushes if the plan was already pushed
  // so the calendar cannot disagree with the plan.
  const handleCatchUp = async () => {
    const course = courses[form.courseIdx]
    if (!plan || !course) return
    const courseId = course.id ?? form.courseIdx
    setCatchUpBusy(true)
    try {
      const { plan: next, changed, shortened, merged } = catchUpReschedule(plan, {
        today: new Date().toISOString().split('T')[0],
        examDate: plan.examDate ?? null,
      })
      if (!changed) {
        setNotice('There is no time left before the exam to redistribute these sessions.')
        return
      }

      setPlan(next)
      await saveCoachPlanObject(courseId, next)

      if (pushed) {
        const { sessions } = buildScheduleBlocks({
          plan: next,
          course,
          courseKey: courseId,
          courseIdx: form.courseIdx,
          preferredTime,
          googleEvents,
          existingSessions: scheduledSessions,
          restDays,
          sessionLen: form.sessionLen || 60,
        })
        onPushToSchedule?.(sessions, courseId)
        await saveCoachPlanPushedAt(courseId, Date.now())
      }

      const bits = []
      if (shortened) bits.push(`${shortened} review${shortened === 1 ? '' : 's'} shortened`)
      if (merged) bits.push(`${merged} overlapping session${merged === 1 ? '' : 's'} merged`)
      setNotice(
        bits.length
          ? `Plan reworked to fit the time before your exam: ${bits.join(', ')}.`
          : 'Plan reworked to fit the time before your exam.'
      )
      track('coach_plan_caught_up', { shortened, merged })
    } finally {
      setCatchUpBusy(false)
    }
  }

  // Start session. The blueprint stays in the loop (it is the signature moment)
  // but arrives preloaded from the coach session, so the student presses Start
  // once and lands in a ready session without retyping anything.
  const handleStartSession = (entry) => {
    const course = courses[form.courseIdx]
    if (!course) return
    const target = entry ?? nextSession(plan)
    const courseId = course.id ?? form.courseIdx
    const todayStr = new Date().toISOString().split('T')[0]

    if (!target) {
      // Complete state: a final review over the whole plan's topics.
      const topics = [...new Set(flattenSessions(plan).flatMap(f => f.session.keyTopics || []))].slice(0, 6)
      onStartFocus?.({
        id: `coach-${courseId}-final-review`,
        courseId: form.courseIdx,
        courseName: course.name,
        color: course.color,
        sessionType: 'Final review',
        duration: form.sessionLen || 60,
        dateStr: todayStr,
        isManual: true,
        fromCoachPlan: true,
        focusArea: 'Final review',
        goal: plan?.goal || 'Light review of everything the plan covered.',
        keyTopics: topics,
        studyMethod: 'Spaced retrieval',
      })
      return
    }

    onStartFocus?.({
      id: `coach-${courseId}-${target.session.id}`,
      planSessionId: target.session.id,
      planCourseKey: courseId,
      courseId: form.courseIdx,
      courseName: course.name,
      color: course.color,
      sessionType: `Session ${target.ordinal} · ${target.session.focusArea}`,
      duration: target.session.duration || form.sessionLen || 60,
      dateStr: target.session.scheduledDate || todayStr,
      isManual: true,
      fromCoachPlan: true,
      // Everything the blueprint needs to build itself without asking again.
      focusArea: target.session.focusArea,
      goal: target.session.goal,
      keyTopics: target.session.keyTopics,
      studyMethod: target.session.studyMethod,
    })
  }


  const handleBuildPlan = (idx) => {
    setPlan(null)
    setError('')
    setStep(1)
    setPushed(false)
    setForm({ courseIdx: idx, goal: '', topics: [], strengths: '', struggles: '', dates: [], materials: [], daysPerWeek: 3, sessionLen: 60, style: [] })
    setUiMode('building')
  }

  const handleViewPlan = (idx) => {
    const course = courses[idx]
    const saved = loadCoachPlan(course?.id ?? idx)
    if (saved?.plan) setPlan(saved.plan)
    setForm(f => ({ ...f, courseIdx: idx }))
    setStep(3)
    setUiMode('viewing')
  }

  const handleNewPlan = () => {
    const firstWithout = courses.findIndex((c, i) => !loadCoachPlan(c.id ?? i)?.plan)
    handleBuildPlan(firstWithout >= 0 ? firstWithout : 0)
  }

  // Grade gap banner
  const gradeGapBanner = (() => {
    const course = courses[form.courseIdx]
    const comps = course?.gradeData?.components ?? []
    const target = course?.gradeData?.targetGrade ?? null
    if (!target || !comps.length) return null
    const current = getCurrentGrade(comps)
    if (current === null) return null
    const gap = current - target
    if (gap >= -2) return null
    const isRecovery = gap < -10
    const weakAreas = comps.filter(c => c.graded && c.grade !== null && c.grade < 70).map(c => c.component)
    const targetLabel = TARGET_OPTIONS.find(o => o.value === target)?.label ?? `${target}%`
    const col = isRecovery ? { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: '#dc2626' } : { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.2)', text: '#d97706' }
    return (
      <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 11, background: col.bg, border: `1px solid ${col.border}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name={isRecovery ? 'warn' : 'info'} size={14} color={col.text} />
        <div style={{ fontSize: 12.5, color: col.text, lineHeight: 1.5 }}>
          <strong>{isRecovery ? 'Grade recovery needed: ' : 'Grade gap detected: '}</strong>
          Current {letterGrade(current)} ({current.toFixed(1)}%), target {targetLabel}, {Math.abs(gap).toFixed(1)} points below. This plan will prioritize closing the gap.
          {weakAreas.length > 0 && <> Focus areas: {weakAreas.join(', ')}.</>}
        </div>
      </div>
    )
  })()

  // Show Exam Rescue nudge when exam is < 7 days away and no plan has been generated yet
  const urgentExamBanner = (() => {
    if (!onOpenExamRescue) return null
    const course = courses[form.courseIdx]
    if (!course?.examDate || plan) return null // skip if plan already generated
    const daysLeft = Math.ceil((new Date(course.examDate) - new Date()) / (1000 * 60 * 60 * 24))
    if (daysLeft > 7 || daysLeft < 0) return null
    return (
      <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 11, background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 700, color: '#DC2626' }}>
            {daysLeft === 0 ? 'Exam is today.' : daysLeft === 1 ? 'Exam is tomorrow.' : `Exam in ${daysLeft} days.`}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
            Not enough time for a full study plan. Exam Rescue builds a targeted last-minute attack plan in under a minute.
          </p>
        </div>
        <button
          onClick={onOpenExamRescue}
          style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Open Exam Rescue
        </button>
      </div>
    )
  })()

  if (courses.length === 0) {
    const G = { card: 'rgba(0,0,0,0.04)', border: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.65)', muted: 'rgba(255,255,255,0.28)', accent: 'rgba(99,102,241,0.5)' }
    const GhostBar = ({ w, color = G.accent }) => (
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: w, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    )
    const fakeWeeks = [
      { label: 'Week 1–2', title: 'Content Foundation', tasks: ['Read Ch. 1–4', 'Active recall drills', 'Concept mapping'], pct: '100%', color: '#4ade80' },
      { label: 'Week 3–4', title: 'Practice Problems',  tasks: ['Problem sets A–C', 'Timed quizzes x3', 'Review mistakes'],  pct: '60%',  color: '#6366f1' },
      { label: 'Week 5–6', title: 'Exam Prep',          tasks: ['Past papers x2', 'Weak-area review', 'Formula sheet'],     pct: '20%',  color: '#f59e0b' },
    ]
    return (
      <div style={{ position: 'relative', minHeight: '100vh', background: D.bg, overflow: 'hidden' }}>
        {/* Ghost preview */}
        <div style={{ filter: 'blur(3px)', opacity: 0.45, pointerEvents: 'none', userSelect: 'none', padding: '28px 32px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>8-Week Study Plan</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: G.text, letterSpacing: -0.5, marginBottom: 4 }}>Organic Chemistry · 83% on track</div>
            <GhostBar w="62%" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fakeWeeks.map(w => (
              <div key={w.label} style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: G.muted, fontWeight: 600, marginBottom: 2 }}>{w.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: G.text }}>{w.title}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: w.color }}>{w.pct}</div>
                </div>
                <GhostBar w={w.pct} color={w.color} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {w.tasks.map(t => (
                    <div key={t} style={{ fontSize: 11, color: G.muted, background: 'rgba(0,0,0,0.04)', border: `1px solid ${G.border}`, borderRadius: 6, padding: '3px 8px' }}>{t}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,6,20,0.6)', backdropFilter: 'blur(1px)', padding: 24 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 20, padding: '40px 36px', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(232,83,26,0.1)', border: '1px solid rgba(232,83,26,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Icon name="sparkles" size={24} color="#3B61C4" />
            </div>
            <h2 style={{ color: '#111111', fontSize: 20, fontWeight: 700, letterSpacing: -0.4, margin: '0 0 10px' }}>Your study plan is one step away.</h2>
            <p style={{ color: '#6B6B6B', fontSize: 14, lineHeight: 1.65, margin: '0 0 28px' }}>Add at least one course, then come back here. The coach builds a week-by-week plan around your exam dates and schedule.</p>
            <button
              onClick={onNavigateToCourses}
              style={{ width: '100%', background: D.accent, color: '#fff', fontSize: 14, fontWeight: 700, padding: '13px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(59,97,196,0.3)', letterSpacing: -0.2 }}
            >
              Add Your First Course →
            </button>
            <p style={{ color: '#6B6B6B', fontSize: 12, margin: '14px 0 0' }}>Takes about 30 seconds</p>
          </div>
        </div>
      </div>
    )
  }

  // Refine keeps the existing plan and the existing answers in place: the form
  // was hydrated from storage on load, so step 1 opens pre-filled. Regenerating
  // from there replaces the plan; backing out leaves it untouched.
  const handleRefine = () => {
    setError('')
    setNotice(null)
    setStep(1)
    setUiMode('building')
    track('coach_plan_refine_opened', {})
  }

  const handleExport = () => {
    const course = courses[form.courseIdx]
    if (!plan || !course) return
    const lines = [`StudyEdge AI: ${course.name} study plan`, '']
    if (plan.goal) lines.push(`Goal: ${plan.goal}`, '')
    if (plan.examDate) lines.push(`Exam: ${plan.examDate}`, '')
    ;(plan.weeklyFocus || []).forEach((week, wi) => {
      lines.push(`${week.week || `Week ${wi + 1}`}: ${week.theme || ''}`.trim())
      ;(week.sessions || []).forEach(s => {
        lines.push(`  ${s.done ? '[x]' : '[ ]'} ${s.scheduledDate || ''} ${s.focusArea || ''}`.trimEnd())
        if (s.goal) lines.push(`      ${s.goal}`)
        lines.push(`      ${[s.studyMethod, `${s.duration} min`].filter(Boolean).join(' · ')}`)
      })
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${course.name.replace(/\s+/g, '-').toLowerCase()}-study-plan.txt`
    a.click()
    URL.revokeObjectURL(url)
    track('coach_plan_exported', {})
  }

  // The plan screen is its own page: no stepper, no step badge, no app-level
  // page padding. It renders full bleed with the background the export calls for.
  // ── The hub. Its own full bleed page: no PageHeader, no Stepper. ──
  if (uiMode === 'plans') {
    return (
      <StudyCoachHubView
        entries={hubEntries}
        today={todayISO()}
        onNewPlan={handleNewPlan}
        onOpenPlan={(entry) => handleViewPlan(entry.idx)}
        onBuildPlan={(entry) => handleBuildPlan(entry.idx)}
      />
    )
  }

  // ── Intake step 1. Also full bleed: it carries its own step indicator. ──
  if (step === 1) {
    return (
      <StudyCoachIntakeStep
        form={form} setForm={setForm} courses={courses}
        cachedStruggles={cachedStruggles}
        materialLoading={materialLoading}
        materialError={materialError}
        onMaterialFile={handleMaterialFile}
        onNext={() => setStep(2)}
        onSaveStruggles={(updated) => {
          setCachedStruggles(updated)
          const courseId = courses[form.courseIdx]?.id ?? form.courseIdx
          saveCoachPlanStruggles(courseId, updated)
        }}
        syllabusHintFile={syllabusHintFile}
        onSyllabusHint={onStartSyllabusOnboarding ? (file) => {
          const courseIdx = form.courseIdx >= 0 ? form.courseIdx : null
          onStartSyllabusOnboarding(file, courseIdx)
          setSyllabusHintFile(null)
        } : null}
        StruggleTracker={StruggleTracker}
      />
    )
  }

  if (uiMode !== 'plans' && step === 3 && plan) {
    return (
      <StudyCoachPlanView
        plan={plan}
        course={courses[form.courseIdx]}
        courseIdx={form.courseIdx}
        pushed={pushed}
        pushBusy={pushBusy}
        catchUpBusy={catchUpBusy}
        notice={notice}
        onBack={() => { setUiMode('plans'); setNotice(null); try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }}
        onStart={handleStartSession}
        onCatchUp={handleCatchUp}
        onPush={handlePush}
        onRefine={handleRefine}
        onExport={handleExport}
        onOpenStruggleTracker={handleRefine}
        onOpenGradeHub={onOpenGradeHub}
      />
    )
  }

  return (
    <>
      <style>{SC_STYLE}</style>
      <PageHeader
        step={step}
        uiMode={uiMode}
        onBack={uiMode !== 'plans' ? () => setUiMode('plans') : undefined}
        onNewPlan={uiMode === 'plans' ? handleNewPlan : undefined}
      />
      {uiMode !== 'plans' && (
        <div className="sc-page-pad" style={{ padding: '24px 32px 48px', overflowX: 'hidden', maxWidth: '100vw' }}>
          <Stepper step={step} go={setStep} />
          {urgentExamBanner}
          {gradeGapBanner}
          {step === 2 && (
            <ReviewStep
              form={form} setForm={setForm} courses={courses}
              onBack={() => setStep(1)}
              onBuild={handleBuild}
              loading={loading}
            />
          )}
          {step === 3 && (
            /* Reached only when generation failed: a successful plan renders
               the plan screen above, before this tree. */
            <div style={{ maxWidth: 560, margin: '32px auto', background: '#fff', border: '1px solid #e7e8ec', borderRadius: 16, padding: '28px 30px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1C1B18' }}>
                We could not build this plan.
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: '#55565c' }}>
                {error || 'Something went wrong while generating your plan.'}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={handleBuild} disabled={loading} style={{ background: '#3452D9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Building…' : 'Try again'}
                </button>
                <button onClick={handleRefine} style={{ background: 'none', border: '1.5px solid #3452D9', color: '#3452D9', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Refine inputs
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </>
  )
}

// ── Struggle Tracker ──────────────────────────────────────────────────────────
function uid8() { return Math.random().toString(36).slice(2, 10) }

function StruggleTracker({ struggles, courseId, courseName, dot, onSave, courseIdx }) {
  const [open, setOpen] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [text, setText] = useState('')

  const active   = struggles.filter(s => !s.resolved)
  const resolved = struggles.filter(s => s.resolved)

  const handleAdd = () => {
    const t = text.trim()
    if (!t) return
    const newStruggle = { id: uid8(), text: t, courseId, createdAt: Date.now(), resolved: false }
    onSave([newStruggle, ...struggles])
    setText('')
  }

  const handleResolve = (id) => {
    onSave(struggles.map(s => s.id === id ? { ...s, resolved: !s.resolved } : s))
  }

  const fmtDate = ts => {
    const d = new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active.length ? D.orange : D.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
        </svg>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: D.text }}>Struggle Tracker</span>
        {active.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: D.orange, background: 'rgba(232,83,26,0.1)', border: '1px solid rgba(232,83,26,0.2)', padding: '2px 8px', borderRadius: 999 }}>
            {active.length} active
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${D.border}` }}>
          {/* Input */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: active.length ? 16 : 0 }}>
            <input
              type="text"
              className="sc-input"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Can't remember reaction mechanisms..."
              style={{ flex: 1 }}
            />
            <button
              onClick={handleAdd}
              style={{ padding: '0 16px', borderRadius: 9, background: '#3B61C4', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Log it
            </button>
          </div>

          {/* Active struggles */}
          {active.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {active.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'rgba(232,83,26,0.04)', border: '1px solid rgba(232,83,26,0.12)', borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: D.text, lineHeight: 1.4 }}>{s.text}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: dot, padding: '2px 7px', borderRadius: 999 }}>{courseName}</span>
                      <span style={{ fontSize: 10.5, color: D.dim }}>{fmtDate(s.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleResolve(s.id)}
                      style={{ fontSize: 11.5, fontWeight: 600, color: D.mint, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
                    >
                      Resolved ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {active.length === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: D.dim, fontSize: 13 }}>
              Nothing logged yet. Add topics that felt hard or unclear -- the coach uses these to tailor your sessions.
            </div>
          )}

          {/* Resolved toggle */}
          {resolved.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setShowResolved(v => !v)}
                style={{ fontSize: 12, color: D.muted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showResolved ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
                {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
              </button>
              {showResolved && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {resolved.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(0,0,0,0.02)', border: `1px solid ${D.border}`, borderRadius: 9, opacity: 0.6 }}>
                      <div style={{ flex: 1, fontSize: 13, color: D.muted, textDecoration: 'line-through' }}>{s.text}</div>
                      <button
                        onClick={() => handleResolve(s.id)}
                        style={{ fontSize: 11, color: D.dim, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Reopen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
