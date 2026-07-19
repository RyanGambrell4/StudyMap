import { useState, useEffect, useRef, useMemo } from 'react'
import Spinner from './ui/spinner'
import { jsPDF } from 'jspdf'
import { getCachedCoachPlan, saveCoachPlan as dbSaveCoachPlan, saveCoachPlanStruggles, saveCoachPlanHardNote, clearCoachPlanHardNotes } from '../lib/db'
import { extractText } from '../utils/extractText'
import { clean } from '../utils/strings'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, canUseFeature, incrementFeatureUsage, hasUsedTrial, getActivePlan } from '../lib/subscription'
import { getCurrentGrade, letterGrade, TARGET_OPTIONS } from '../utils/gradeCalc'
import { track } from '../lib/analytics'

// ── DB helpers ────────────────────────────────────────────────────────────────
function loadCoachPlan(courseId) { return getCachedCoachPlan(courseId) }
function saveCoachPlan(courseId, plan, formData) { dbSaveCoachPlan(courseId, plan, formData) }

// ── Design tokens ─────────────────────────────────────────────────────────────
const EXAM_COURSE_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF', bgEl: '#F0EFEC',
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

// ── Chip input ────────────────────────────────────────────────────────────────
function ChipInput({ values, onChange, placeholder, color = D.indigo }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...values, v]); setDraft('')
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" className="sc-input" value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button onClick={add} style={{ padding: '0 16px', borderRadius: 9, flexShrink: 0, background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.25)', color: D.indigo, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {values.map((v, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px', borderRadius: 7, background: `${color}18`, border: `1px solid ${color}35`, color, fontSize: 12, fontWeight: 500 }}>
              {v}
              <button onClick={() => onChange(values.filter((_, j) => j !== i))} style={{ width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', color, opacity: 0.7, cursor: 'pointer' }}>
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── File drop zone ────────────────────────────────────────────────────────────
function FileDropZone({ files, onChange, onExtract, loading }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const addFiles = (fs) => {
    Array.from(fs).forEach(f => {
      onChange(prev => [...prev, { name: f.name, size: f.size }])
      onExtract?.(f)
    })
  }
  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
        style={{ padding: 20, borderRadius: 11, cursor: 'pointer', background: drag ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.03)', border: `1px dashed ${drag ? D.cyan : D.borderStrong}`, textAlign: 'center', transition: 'all 0.15s' }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: D.muted, fontSize: 13 }}>
            <Spinner size="sm" color={D.accent} track="transparent" />
            Extracting text…
          </div>
        ) : (
          <>
            <Icon name="upload" size={20} color={D.muted} />
            <div style={{ fontSize: 13, color: D.text, marginTop: 8, fontWeight: 500 }}>Drop files or click to upload</div>
            <div style={{ fontSize: 11.5, color: D.dim, marginTop: 3 }}>PDF, DOCX, PNG, JPG</div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => e.target.files && addFiles(e.target.files)} accept=".pdf,.docx,.doc,.png,.jpg,.jpeg" />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `rgba(34,211,238,0.06)`, border: `1px solid rgba(34,211,238,0.2)` }}>
              <Icon name="file" size={13} color={D.cyan} />
              <span style={{ fontSize: 12.5, flex: 1, color: D.text }}>{f.name}</span>
              <button onClick={() => onChange(files.filter((_, j) => j !== i))} style={{ width: 20, height: 20, borderRadius: 5, color: D.muted, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Field block ───────────────────────────────────────────────────────────────
function FieldBlock({ icon, color, label, hint, required, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Icon name={icon} size={12} color={color} />
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase' }}>
          {label}{required && <span style={{ color: D.orange, marginLeft: 4 }}>*</span>}
        </span>
      </div>
      {hint && <div style={{ fontSize: 12, color: D.dim, marginBottom: 10, lineHeight: 1.45 }}>{hint}</div>}
      {children}
    </div>
  )
}

// ── Coach rail ────────────────────────────────────────────────────────────────
function CoachRail({ form, confidence, course }) {
  const topics = form.topics || []
  const dates = (form.dates || []).filter(d => d.date && d.label)
  return (
    <div className="sc-rail" style={{ position: 'sticky', top: 20 }}>
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.55, marginBottom: 14 }}>
          {!form.courseId && form.courseIdx === undefined ? (
            'Pick a course to get started.'
          ) : !form.goal?.trim() && !topics.length ? (
            <><strong style={{ color: D.text }}>{course?.name}</strong>: add a goal or topics to start building.</>
          ) : (
            <>Working with <strong style={{ color: D.text }}>{topics.length}</strong> topic{topics.length === 1 ? '' : 's'}{dates.length > 0 && <> and <strong style={{ color: D.text }}>{dates.length}</strong> date{dates.length === 1 ? '' : 's'}</>}.</>
          )}
        </div>
        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: D.muted }}>Plan confidence</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: confidence >= 6 ? D.mint : confidence >= 3 ? D.indigo : D.dim }}>{Math.round(confidence / 9 * 100)}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ width: `${(confidence / 9) * 100}%`, height: '100%', background: confidence >= 6 ? D.mint : D.accent, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11.5, color: D.dim, lineHeight: 1.45, marginBottom: 14 }}>
          {confidence < 3 && 'Add topics or a goal to strengthen the plan.'}
          {confidence >= 3 && confidence < 6 && 'Good start. Dates and materials improve pacing.'}
          {confidence >= 6 && 'Strong inputs. The plan will be specific to what you shared.'}
        </div>
        <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 12, fontSize: 11.5, color: D.dim, lineHeight: 1.5 }}>
          Only plans from what you tell me. No invented topics or dates.
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Intake ────────────────────────────────────────────────────────────
function IntakeStep({ form, setForm, courses, cachedStruggles, materialLoading, onMaterialFile, onNext }) {
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const course = courses[form.courseIdx]
  const _EXAM_PAT = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i
  const isExamMode = form.courseIdx >= 0 && _EXAM_PAT.test(courses[form.courseIdx]?.name ?? '')
  const dates = form.dates || []
  const addDate = () => update('dates', [...dates, { label: '', date: '' }])
  const updateDate = (i, patch) => update('dates', dates.map((d, j) => j === i ? { ...d, ...patch } : d))
  const removeDate = (i) => update('dates', dates.filter((_, j) => j !== i))

  const canProceed = form.courseIdx >= 0 && (form.goal?.trim() || form.topics?.length > 0)
  const confidence = [
    form.goal?.trim(), form.topics?.length > 0, form.struggles?.trim(),
    dates.some(d => d.date && d.label), form.strengths?.trim(), form.struggles?.trim(),
    form.materials?.length > 0, form.daysPerWeek, form.sessionLen,
  ].filter(Boolean).length

  return (
    <div className="sc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Course selector */}
        <FieldBlock icon="book" color={D.accent} label="Course" required hint="Which class is this plan for?">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {courses.map((c, i) => {
              const active = form.courseIdx === i
              const color = c.color?.dot || D.accent
              return (
                <button key={i} onClick={() => setForm({ courseIdx: i, goal: '', topics: [], strengths: '', struggles: '', dates: [], materials: [], daysPerWeek: 3, sessionLen: 60, style: [] })} style={{ padding: '10px 14px', borderRadius: 10, background: active ? `linear-gradient(135deg, ${color}22, ${color}0a)` : 'rgba(0,0,0,0.03)', border: active ? `1px solid ${color}55` : `1px solid ${D.border}`, boxShadow: active ? `0 0 0 3px ${color}12` : 'none', color: active ? D.text : D.muted, fontSize: 12.5, fontWeight: active ? 600 : 500, display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.15s', cursor: 'pointer' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}90` }} />
                  {c.name}
                </button>
              )
            })}
          </div>
        </FieldBlock>

        {/* Struggles from AI Tutor */}
        {cachedStruggles.length > 0 && (
          <div style={{ padding: '12px 16px', borderRadius: 11, background: 'rgba(59,97,196,0.05)', border: `1px solid ${D.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="bookmark" size={14} color={D.indigo} />
            <div style={{ fontSize: 12.5, color: D.indigo }}>
              <span style={{ fontWeight: 600 }}>Topics flagged from AI Tutor: </span>
              {cachedStruggles.join(', ')}: these will be emphasized in your plan.
            </div>
          </div>
        )}

        {/* Goal */}
        <FieldBlock
          icon="flag"
          color={D.pink}
          label={isExamMode ? 'Target score & biggest weakness' : 'Your goal'}
          hint={isExamMode ? 'What score are you aiming for, and which area of this section gives you the most trouble?' : 'What does success look like to you? Be as specific as possible.'}
        >
          <textarea className="sc-input" value={form.goal || ''} onChange={e => update('goal', e.target.value)}
            placeholder={isExamMode
              ? `e.g. "Target 130 in this section. Struggling most with timing and discrete questions"`
              : `e.g. "Score 90%+ on the final" · "Truly understand derivatives, not memorize them" · "Pass with a B+"`}
          />
        </FieldBlock>

        {/* Topics */}
        <FieldBlock icon="target" color={D.indigo} label="Topics your professor emphasizes" hint="Chapters, concepts, or themes - only what you actually know from lectures or the syllabus.">
          <ChipInput values={form.topics || []} onChange={v => update('topics', v)} placeholder="e.g. Memory encoding, Cognitive biases, Research methods…" />
        </FieldBlock>

        {/* Strengths / Struggles */}
        <div className="sc-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FieldBlock icon="check" color={D.mint} label="What feels solid" hint="Optional: topics you're comfortable with">
            <textarea className="sc-input" value={form.strengths || ''} onChange={e => update('strengths', e.target.value)} placeholder={`e.g. "Chapter 1–3 readings, classical conditioning"`} />
          </FieldBlock>
          <FieldBlock icon="warn" color={D.orange} label="What you're struggling with" hint="Optional: where I should spend extra time">
            <textarea className="sc-input" value={form.struggles || ''} onChange={e => update('struggles', e.target.value)} placeholder={`e.g. "Statistical significance, research design"`} />
          </FieldBlock>
        </div>

        {/* Dates */}
        <FieldBlock icon="calendar" color={D.violet} label="Upcoming deadlines" hint="Exam, quiz, or project dates. Add them and I'll anchor the plan around them.">
          {dates.length === 0 && (
            <div style={{ fontSize: 12.5, color: D.dim, fontStyle: 'italic', marginBottom: 8 }}>None yet. The plan will simply cover the weeks you tell me to.</div>
          )}
          {dates.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 32px', gap: 8, marginBottom: 8 }}>
              <input type="text" className="sc-input" placeholder="e.g. Midterm, Essay 1 due" value={d.label} onChange={e => updateDate(i, { label: e.target.value })} />
              <input type="date" className="sc-input" value={d.date} onChange={e => updateDate(i, { date: e.target.value })} />
              <button onClick={() => removeDate(i)} style={{ width: 32, height: 40, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, color: D.muted, cursor: 'pointer' }}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button onClick={addDate} style={{ fontSize: 12.5, color: D.indigo, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 0', cursor: 'pointer', background: 'none', border: 'none' }}>
            <Icon name="plus" size={12} /> Add {dates.length > 0 ? 'another' : 'a date'}
          </button>
        </FieldBlock>

        {/* Materials */}
        <FieldBlock icon="file" color={D.cyan} label="Course materials" hint="Syllabus, notes, readings - optional but makes everything sharper.">
          <FileDropZone
            files={form.materials || []}
            onChange={v => typeof v === 'function' ? setForm(f => ({ ...f, materials: v(f.materials || []) })) : update('materials', v)}
            onExtract={onMaterialFile}
            loading={materialLoading}
          />
        </FieldBlock>

        {/* Cadence */}
        <div className="sc-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FieldBlock icon="clock" color={D.amber} label="Study days / week">
            <div style={{ display: 'flex', gap: 4 }}>
              {[1,2,3,4,5,6,7].map(n => {
                const active = form.daysPerWeek === n
                return (
                  <button key={n} onClick={() => update('daysPerWeek', n)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: active ? '#3B61C4' : 'rgba(0,0,0,0.03)', border: `1px solid ${active ? '#3B61C4' : D.border}`, color: active ? '#fff' : D.muted }}>{n}</button>
                )
              })}
            </div>
          </FieldBlock>
          <FieldBlock icon="clock" color={D.amber} label="Session length">
            <div style={{ display: 'flex', gap: 4 }}>
              {[30,45,60,75,90].map(m => {
                const active = form.sessionLen === m
                return (
                  <button key={m} onClick={() => update('sessionLen', m)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: active ? '#3B61C4' : 'rgba(0,0,0,0.03)', border: `1px solid ${active ? '#3B61C4' : D.border}`, color: active ? '#fff' : D.muted }}>{m}m</button>
                )
              })}
            </div>
          </FieldBlock>
        </div>

        {/* Include weekends */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: form.includeWeekends ? 'rgba(59,97,196,0.08)' : 'rgba(0,0,0,0.02)', border: `1px solid ${form.includeWeekends ? '#3B61C4' : D.border}`, cursor: 'pointer' }} onClick={() => update('includeWeekends', !form.includeWeekends)}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: form.includeWeekends ? '#3B61C4' : D.text }}>Include weekends</div>
            <div style={{ fontSize: 11.5, color: D.muted, marginTop: 2 }}>Schedule sessions on Saturday &amp; Sunday too</div>
          </div>
          <div style={{ width: 38, height: 22, borderRadius: 11, background: form.includeWeekends ? '#3B61C4' : D.border, position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: form.includeWeekends ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
        </div>

        {/* Learning style */}
        <FieldBlock icon="lightbulb" color={D.mint} label="How you learn best" hint="Pick any that apply. I'll lean into them.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Active recall','Spaced repetition','Practice problems','Teaching others','Visual diagrams','Reading + notes','Flashcards','Watching lectures'].map(t => {
              const list = form.style || []
              const active = list.includes(t)
              return (
                <button key={t} onClick={() => update('style', active ? list.filter(x => x !== t) : [...list, t])} style={{ padding: '7px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', background: active ? 'rgba(22,163,74,0.1)' : 'rgba(0,0,0,0.03)', border: `1px solid ${active ? 'rgba(22,163,74,0.25)' : D.border}`, color: active ? D.mint : D.muted, fontWeight: active ? 600 : 500, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {active && (<svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>)}
                  {t}
                </button>
              )
            })}
          </div>
        </FieldBlock>

        {/* CTA */}
        <button
          disabled={!canProceed}
          onClick={onNext}
          style={{ width: '100%', padding: '14px 20px', borderRadius: 11, background: canProceed ? '#3B61C4' : 'rgba(0,0,0,0.04)', color: canProceed ? '#fff' : D.dim, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: canProceed ? 'pointer' : 'not-allowed', border: 'none' }}
        >
          Review what I've got <Icon name="arrow" size={14} />
        </button>
        {!canProceed && (
          <div style={{ fontSize: 11.5, color: D.dim, textAlign: 'center' }}>Pick a course and share at least one goal or topic so I have something to work with.</div>
        )}
      </div>

      <CoachRail form={form} confidence={confidence} course={courses[form.courseIdx]} />
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
      {answered && <div style={{ fontSize: 11.5, color: D.mint, marginLeft: 32, marginTop: 4 }}>{draft.trim() ? 'Saved' : 'Skipped, noted'}</div>}
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
    <div className="sc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'flex-start' }}>
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
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.indigo, textTransform: 'uppercase' }}>Before I build: a few gaps</span>
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
              <><Icon name="sparkles" size={14} /> Build my plan, only from what I've shared</>
            )}
          </button>
        </div>
      </div>
      <CoachRail form={form} confidence={9} course={courses[form.courseIdx]} />
    </div>
  )
}

// ── Step 3: Plan ──────────────────────────────────────────────────────────────
function PlanStepWrapper({ plan, form, courses, pushed, onPush, onRefine, error, onStartFocus, struggles, onSaveStruggles, pendingHardNotes, onWeekCheckIn }) {
  const course = courses[form.courseIdx]
  const color = course?.color?.dot || D.accent
  const sessionLen = form.sessionLen || 60
  const allSessions = plan?.weeklyFocus?.flatMap(w => w.sessions || []) || []
  const totalSessions = allSessions.length
  const totalHours = ((totalSessions * sessionLen) / 60).toFixed(1)
  const weeks = plan?.weeklyFocus?.length || 0
  const priorityTopicsCount = plan?.priorityTopics?.length || 0
  const deadlinesCount = (form?.dates || []).filter(d => d.date && d.label).length
  const firstSession = plan?.weeklyFocus?.[0]?.sessions?.[0]
  const [hardNoteDismissed, setHardNoteDismissed] = useState(false)

  const handleBannerDismiss = async () => {
    setHardNoteDismissed(true)
    try {
      const courseId = course?.id ?? form.courseIdx
      await clearCoachPlanHardNotes(courseId)
    } catch {}
  }

  const handleBannerUpdate = async () => {
    try {
      const courseId = course?.id ?? form.courseIdx
      await clearCoachPlanHardNotes(courseId)
    } catch {}
    onRefine()
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14 }}>
        <Icon name="warn" size={28} color={D.orange} />
        <div style={{ fontSize: 16, fontWeight: 600, color: D.text, marginTop: 12, marginBottom: 6 }}>Couldn't generate plan</div>
        <div style={{ fontSize: 13, color: D.muted, marginBottom: 18 }}>{error}</div>
        <button onClick={onRefine} style={{ padding: '11px 20px', borderRadius: 10, background: '#3B61C4', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Go back and try again</button>
      </div>
    )
  }

  if (!plan) return null

  const showBanner = !hardNoteDismissed && pendingHardNotes?.length > 0

  return (
    <div className="sc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'flex-start' }}>
      <div>
        {showBanner && (
          <AdaptiveFeedbackBanner
            notes={pendingHardNotes}
            onUpdate={handleBannerUpdate}
            onDismiss={handleBannerDismiss}
          />
        )}
        {onSaveStruggles && (
          <StruggleTracker
            struggles={struggles ?? []}
            courseId={course?.id ?? form.courseIdx}
            courseName={course?.name ?? ''}
            dot={color}
            onSave={onSaveStruggles}
            courseIdx={form.courseIdx}
          />
        )}
        <PlanView plan={plan} course={course} dot={color} pushed={pushed} onPush={onPush} onReset={onRefine} form={form} onStartFocus={onStartFocus} onWeekCheckIn={onWeekCheckIn} />
      </div>
      {/* Right rail */}
      <div className="sc-rail" style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase', marginBottom: 12 }}>At a Glance</div>
          <StatRow label="Total sessions" value={totalSessions} color={D.indigo} />
          <StatRow label="Hours of study" value={`${totalHours}h`} color={D.mint} />
          <StatRow label="Weeks" value={weeks} color={D.violet} />
          <StatRow label="Your cadence" value={`${form.daysPerWeek || 3}×${sessionLen}m`} color={D.amber} />
          {priorityTopicsCount > 0 && <StatRow label="Priority topics" value={priorityTopicsCount} color={D.orange} />}
          {deadlinesCount > 0 && <StatRow label="Deadlines tracked" value={deadlinesCount} color={D.pink} last />}
        </div>
        {firstSession && (
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase' }}>Start Here</span>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: D.text, marginBottom: 4, lineHeight: 1.4 }}>{firstSession.focusArea}</div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 14 }}>{(firstSession.goal || '').split('.')[0]} · {firstSession.duration || sessionLen}m</div>
            <button
              onClick={() => {
                if (!onStartFocus || !course) return
                const todayStr = new Date().toISOString().split('T')[0]
                onStartFocus({
                  id: `coach-${todayStr}-0-0`,
                  courseId: form.courseIdx,
                  courseName: course.name,
                  color: course.color,
                  sessionType: firstSession.sessionLabel || 'Review',
                  duration: firstSession.duration || sessionLen,
                  dateStr: todayStr,
                  isManual: true,
                  focusArea: firstSession.focusArea,
                  keyTopics: firstSession.keyTopics ?? [],
                  goal: firstSession.goal ?? '',
                })
              }}
              style={{ width: '100%', padding: '11px', borderRadius: 10, background: '#3B61C4', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none' }}
            >
              Start first session →
            </button>
          </div>
        )}
        <div style={{ padding: 14, borderRadius: 11, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="check" size={13} color={D.mint} stroke={2.5} />
            <span style={{ fontSize: 12, fontWeight: 600, color: D.mint }}>Grounded in your inputs</span>
          </div>
          <div style={{ fontSize: 11.5, color: D.muted, lineHeight: 1.5 }}>Every session references a topic, date, or learning style you provided. Nothing has been invented.</div>
        </div>
        {!canUseFeature('coachPlan').allowed && (
          <div style={{ padding: 14, borderRadius: 11, background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.20)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: D.accent, marginBottom: 4 }}>You've used your free plan.</div>
            <div style={{ fontSize: 11.5, color: D.muted, lineHeight: 1.5, marginBottom: 10 }}>Upgrade to regenerate, add more courses, and build plans for every class.</div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'coach-plan-result' } }))}
              style={{ width: '100%', padding: '9px', borderRadius: 8, background: D.accent, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none' }}
            >
              {hasUsedTrial() ? 'Upgrade to Pro →' : 'Start free trial →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, value, color, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', alignItems: 'center', borderBottom: last ? 'none' : `1px solid ${D.border}` }}>
      <span style={{ fontSize: 12, color: D.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

// ── My Plans landing view ─────────────────────────────────────────────────────
function MyPlansView({ courses, onBuildPlan, onViewPlan }) {
  const savedPlans = useMemo(() => courses.map((c, i) => loadCoachPlan(c.id ?? i)), [courses])
  const withPlans = useMemo(() => courses.map((c, i) => ({ course: c, idx: i, saved: savedPlans[i] })).filter(x => x.saved?.plan), [courses, savedPlans])
  const withoutPlans = useMemo(() => courses.map((c, i) => ({ course: c, idx: i, saved: savedPlans[i] })).filter(x => !x.saved?.plan), [courses, savedPlans])

  const totalHours = useMemo(() => savedPlans.reduce((acc, p) => {
    if (!p?.plan) return acc
    const sessions = p.plan.weeklyFocus?.flatMap(w => w.sessions || []).length || 0
    const sessionLen = p.formData?.sessionLen || p.formData?.sessionMinutes || 60
    return acc + (sessions * sessionLen / 60)
  }, 0), [savedPlans])

  const nextDeadline = useMemo(() => {
    const today = new Date()
    let earliest = null; let earliestCourse = null
    savedPlans.forEach((p, i) => {
      const dates = p?.formData?.dates || p?.formData?.importantDates || []
      dates.forEach(d => {
        if (!d.date) return
        const dt = new Date(d.date + 'T12:00:00')
        if (dt >= today && (!earliest || dt < earliest)) { earliest = dt; earliestCourse = courses[i] }
      })
    })
    if (!earliest) return null
    return { days: Math.ceil((earliest - today) / 86400000), course: earliestCourse }
  }, [savedPlans, courses])

  const getNearestDeadline = (formData) => {
    if (!formData) return null
    const today = new Date()
    const dates = formData.dates || formData.importantDates || []
    let nearest = null
    dates.forEach(d => {
      if (!d.date) return
      const dt = new Date(d.date + 'T12:00:00')
      if (!nearest || dt < nearest.dt) nearest = { dt, label: d.label }
    })
    if (!nearest) return null
    return { days: Math.ceil((nearest.dt - today) / 86400000), label: nearest.label }
  }

  const Stat = ({ label, value, sub }) => (
    <div style={{ padding: '0 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: D.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: D.muted, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: D.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const parseName = (name) => {
    const idx = name.indexOf(':')
    if (idx > 0) return { code: name.slice(0, idx).trim(), title: name.slice(idx + 1).trim() }
    return { code: null, title: name }
  }

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${D.border}` }}>
        <Stat label="Plans Ready" value={withPlans.length} />
        <div style={{ width: 1, background: D.border, flexShrink: 0 }} />
        <Stat label="Without Plans" value={withoutPlans.length} />
        <div style={{ width: 1, background: D.border, flexShrink: 0 }} />
        <Stat label="Study Hours" value={`${Math.round(totalHours)}h`} />
        <div style={{ width: 1, background: D.border, flexShrink: 0 }} />
        <Stat label="Next Deadline"
          value={nextDeadline ? `${nextDeadline.days}d` : '-'}
          sub={nextDeadline ? nextDeadline.course.name : 'No deadlines'} />
      </div>

      {/* Ready to study */}
      {withPlans.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: D.text }}>Ready to study</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: D.muted, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, borderRadius: 999, padding: '2px 9px' }}>{withPlans.length}</span>
            <span style={{ fontSize: 12.5, color: D.dim }}>Plans built and anchored to your dates</span>
          </div>
          <div className="sc-plans-cards">
            {withPlans.map(({ course, idx, saved }) => {
              const sessions = saved.plan.weeklyFocus?.flatMap(w => w.sessions || []).length || 0
              const sessionLen = saved.formData?.sessionLen || saved.formData?.sessionMinutes || 60
              const weeks = saved.plan.weeklyFocus?.length || 0
              const hours = Math.round((sessions * sessionLen) / 60)
              const deadline = getNearestDeadline(saved.formData)
              const { code, title } = parseName(course.name)
              const dot = course.color?.dot || D.accent
              return (
                <div key={idx} style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code || title}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{code ? title : ''}</div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.mint, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: D.mint, whiteSpace: 'nowrap' }}>Plan ready</span>
                    </div>
                  </div>
                  {deadline && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="calendar" size={12} color={D.dim} />
                      <span style={{ fontSize: 12.5, color: D.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deadline.label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, flexShrink: 0, color: deadline.days <= 14 ? D.orange : D.muted }}>{deadline.days}d</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: D.muted }}>{weeks}w</span>
                    <span style={{ color: D.dim, fontSize: 11 }}>·</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: D.muted }}>{sessions} sessions</span>
                    <span style={{ color: D.dim, fontSize: 11 }}>·</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: D.muted }}>{hours}h</span>
                  </div>
                  <button onClick={() => onViewPlan(idx)} style={{ background: 'none', border: 'none', padding: 0, color: D.indigo, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    View Plan →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* No plan yet */}
      {withoutPlans.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: D.text }}>No plan yet</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: D.muted, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, borderRadius: 999, padding: '2px 9px' }}>{withoutPlans.length}</span>
            <span style={{ fontSize: 12.5, color: D.dim }}>Start a plan and I'll only use what you tell me</span>
          </div>
          <div className="sc-plans-cards">
            {withoutPlans.map(({ course, idx }) => {
              const { code, title } = parseName(course.name)
              const dot = course.color?.dot || D.accent
              return (
                <div key={idx} style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code || title}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{code ? title : ''}</div>
                    </div>
                    <div style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: D.dim }}>No plan</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12.5, color: D.dim, lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>
                    Share your topics, goals, and deadlines. I'll build a week-by-week plan from exactly what you give me.
                  </p>
                  <button onClick={() => onBuildPlan(idx)} style={{ background: 'none', border: 'none', padding: 0, color: D.indigo, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginTop: 'auto' }}>
                    Build Plan →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StudyCoachView({ courses, userId, onShowPaywall, googleEvents = [], preferredTime = 'Morning', onStartFocus, onNavigateToCourses, onPushToSchedule, learningStyle, completedSessions = [], scheduledSessions = [], restDays = [], onOpenExamRescue }) {
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
  const [cachedStruggles, setCachedStruggles] = useState([])
  const [uiMode, setUiMode] = useState('plans') // 'plans' | 'building' | 'viewing'

  // Material extraction
  const [materialText, setMaterialText] = useState('')
  const [materialLoading, setMaterialLoading] = useState(false)

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
    setPushed(false)
    setError('')
  }, [form.courseIdx])

  const handleMaterialFile = async (file) => {
    setMaterialLoading(true)
    try {
      const text = await extractText(file)
      setMaterialText(prev => prev + '\n' + text)
    } catch {
      setMaterialText(prev => prev)
      alert('Could not read that file. Try pasting the text directly.')
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
      track('study_plan_generated', { plan: getActivePlan(), weekCount: data.weeks?.length ?? 0 })
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

  const handlePush = () => {
    const course = courses[form.courseIdx]
    if (!plan || !course) return
    const courseId = course.id ?? form.courseIdx
    saveCoachPlan(courseId, plan, { ...form, sessionMinutes: form.sessionLen, importantDates: form.dates })

    const sessionLen = form.sessionLen || 60
    const daysPerWeek = form.daysPerWeek || 3
    const MIN_BREAK = 30      // minutes break required between any two study sessions
    const MAX_STUDY_PER_DAY = 2 // max study sessions per day across all plans

    // Time windows in minutes since midnight
    const TIME_WINDOWS = {
      Morning:   { start: 8 * 60,  end: 12 * 60 },
      Afternoon: { start: 13 * 60, end: 18 * 60 },
      Evening:   { start: 18 * 60, end: 22 * 60 },
    }
    const preferred = TIME_WINDOWS[preferredTime] ?? TIME_WINDOWS.Morning
    const windowOrder = [preferred, ...Object.values(TIME_WINDOWS).filter(w => w !== preferred)]

    const minsToTime = mins => {
      const h24 = Math.floor(mins / 60), m = mins % 60
      return `${h24 % 12 || 12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`
    }

    const parseTimeStr = t => {
      const match = t?.match(/(\d+):(\d+)\s*(AM|PM)/i)
      if (!match) return null
      let h = parseInt(match[1]), m = parseInt(match[2])
      if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12
      if (match[3].toUpperCase() === 'AM' && h === 12) h = 0
      return h * 60 + m
    }

    // Build busy map: gcal events (no break needed) + existing study sessions (MIN_BREAK needed)
    const busyByDate = {}  // dateKey -> [{startMin, endMin, isStudy}]
    const studyCountByDate = {}  // dateKey -> count of study sessions already there

    const addBusy = (dateKey, startMin, endMin, isStudy = false) => {
      if (!busyByDate[dateKey]) busyByDate[dateKey] = []
      busyByDate[dateKey].push({ startMin, endMin, isStudy })
    }

    googleEvents.forEach(e => {
      if (!e.start?.includes('T')) return
      const dateKey = e.start.split('T')[0]
      const parse = iso => { const dt = new Date(iso); return dt.getHours() * 60 + dt.getMinutes() }
      addBusy(dateKey, parse(e.start), e.end ? parse(e.end) : parse(e.start) + 60, false)
    })

    ;(scheduledSessions || []).forEach(s => {
      if (!s.dateStr || !s.startTime || !s.fromCoachPlan) return
      const startMin = parseTimeStr(s.startTime)
      if (startMin === null) return
      const dur = s.duration || sessionLen
      addBusy(s.dateStr, startMin, startMin + dur, true)
      studyCountByDate[s.dateStr] = (studyCountByDate[s.dateStr] || 0) + 1
    })

    // Find the first available slot on a date across all windows
    const findSlot = (dateKey) => {
      const busy = [...(busyByDate[dateKey] || [])].sort((a, b) => a.startMin - b.startMin)
      for (const window of windowOrder) {
        let s = window.start
        while (s + sessionLen <= window.end) {
          const e = s + sessionLen
          const conflict = busy.find(b => {
            const afterBreak = b.isStudy ? MIN_BREAK : 0
            return s < b.endMin + afterBreak && e > b.startMin
          })
          if (!conflict) return s
          const afterBreak = conflict.isStudy ? MIN_BREAK : 0
          s = conflict.endMin + afterBreak
        }
      }
      return null
    }

    // Spread sessions across days
    // includeWeekends: interleave Sat/Sun with weekdays so they're picked early
    const SPREAD_ORDER = form.includeWeekends
      ? [0, 5, 2, 6, 4, 1, 3]   // Mon, Sat, Wed, Sun, Fri, Tue, Thu
      : [0, 2, 4, 1, 3, 5, 6]   // Mon, Wed, Fri, Tue, Thu, Sat, Sun

    const totalSessions = (plan.weeklyFocus || []).reduce((sum, w) => sum + (w.sessions?.length || 0), 0)
    let sessionNum = 0
    const calSessions = []

    ;(plan.weeklyFocus || []).forEach((week, wi) => {
      const { startDate } = weekDateRange(wi)
      const weekSessions = week.sessions || []
      if (!weekSessions.length) return

      // Choose target days for this week: pick `daysPerWeek` spread days that aren't already at max and not rest days
      const targetDays = []
      for (const offset of SPREAD_ORDER) {
        if (targetDays.length >= Math.max(daysPerWeek, weekSessions.length)) break
        const d = new Date(startDate)
        d.setDate(d.getDate() + offset)
        const dateKey = d.toISOString().split('T')[0]
        if ((studyCountByDate[dateKey] || 0) < MAX_STUDY_PER_DAY && !restDays.includes(dateKey)) targetDays.push(dateKey)
      }
      // Fallback: add any remaining days if we ran out of options
      if (targetDays.length < weekSessions.length) {
        for (let offset = 0; offset <= 6; offset++) {
          if (targetDays.length >= weekSessions.length) break
          const d = new Date(startDate)
          d.setDate(d.getDate() + offset)
          const dateKey = d.toISOString().split('T')[0]
          if (!targetDays.includes(dateKey)) targetDays.push(dateKey)
        }
      }

      weekSessions.forEach((sess, si) => {
        sessionNum++
        // Try the target days in order, then any day in the week
        const fallbackDays = SPREAD_ORDER.map(o => {
          const d = new Date(startDate); d.setDate(d.getDate() + o); return d.toISOString().split('T')[0]
        })
        const candidates = [...new Set([...targetDays, ...fallbackDays])]

        for (const dateKey of candidates) {
          if ((studyCountByDate[dateKey] || 0) >= MAX_STUDY_PER_DAY) continue
          const startMin = findSlot(dateKey)
          if (startMin === null) continue

          const dur = sess.duration || sessionLen
          addBusy(dateKey, startMin, startMin + dur, true)
          studyCountByDate[dateKey] = (studyCountByDate[dateKey] || 0) + 1

          // Truncate focusArea at a word boundary so the calendar row never
          // ends mid-word (e.g. "Glycolysis: step-by-step enzy").
          const truncateAtWord = (s, max) => {
            if (!s || s.length <= max) return s
            const cut = s.slice(0, max)
            const lastSpace = cut.lastIndexOf(' ')
            return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[,:;\--]+$/, '') + '…'
          }
          const focusSuffix = sess.focusArea ? ` · ${truncateAtWord(sess.focusArea, 28)}` : ''
          calSessions.push({
            id: `coach-${courseId}-w${wi}-s${si}-${Date.now()}`,
            dateStr: dateKey,
            courseId: form.courseIdx,
            courseName: course.name,
            color: course.color,
            sessionType: `Session ${sessionNum} of ${totalSessions}${focusSuffix}`,
            duration: dur,
            startTime: minsToTime(startMin),
            endTime: minsToTime(startMin + dur),
            isManual: true,
            fromCoachPlan: true,
            planSessionNum: sessionNum,
            planTotalSessions: totalSessions,
          })
          break
        }
      })
    })

    if (onPushToSchedule && calSessions.length) onPushToSchedule(calSessions)
    track('study_plan_pushed', { sessionCount: calSessions.length })
    setPushed(true)
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
            <h2 style={{ color: '#111111', fontSize: 20, fontWeight: 700, letterSpacing: -0.4, margin: '0 0 10px' }}>Your AI study plan is one step away.</h2>
            <p style={{ color: '#6B6B6B', fontSize: 14, lineHeight: 1.65, margin: '0 0 28px' }}>Add at least one course, then come back here. The AI Coach builds a personalized week-by-week plan around your exam dates and schedule.</p>
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

  return (
    <>
      <style>{SC_STYLE}</style>
      <PageHeader
        step={step}
        uiMode={uiMode}
        onBack={uiMode !== 'plans' ? () => setUiMode('plans') : undefined}
        onNewPlan={uiMode === 'plans' ? handleNewPlan : undefined}
      />
      {uiMode === 'plans' ? (
        <div className="sc-page-pad" style={{ padding: '24px 32px 48px', overflowX: 'hidden', maxWidth: '100vw' }}>
          <MyPlansView courses={courses} onBuildPlan={handleBuildPlan} onViewPlan={handleViewPlan} />
        </div>
      ) : (
        <div className="sc-page-pad" style={{ padding: '24px 32px 48px', overflowX: 'hidden', maxWidth: '100vw' }}>
          <Stepper step={step} go={setStep} />
          {urgentExamBanner}
          {gradeGapBanner}
          {step === 1 && (
            <IntakeStep
              form={form} setForm={setForm} courses={courses}
              cachedStruggles={cachedStruggles}
              materialLoading={materialLoading}
              onMaterialFile={handleMaterialFile}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <ReviewStep
              form={form} setForm={setForm} courses={courses}
              onBack={() => setStep(1)}
              onBuild={handleBuild}
              loading={loading}
            />
          )}
          {step === 3 && (
            <PlanStepWrapper
              plan={plan} form={form} courses={courses}
              pushed={pushed}
              onPush={handlePush}
              onRefine={() => { setPlan(null); setError(''); setStep(1); setUiMode('building') }}
              error={error}
              onStartFocus={onStartFocus}
              struggles={cachedStruggles}
              onSaveStruggles={(updated) => {
                setCachedStruggles(updated)
                const courseId = courses[form.courseIdx]?.id ?? form.courseIdx
                saveCoachPlanStruggles(courseId, updated)
              }}
              pendingHardNotes={(() => {
                const course = courses[form.courseIdx]
                const courseId = course?.id ?? form.courseIdx
                const saved = loadCoachPlan(courseId)
                return saved?.pendingHardNotes?.filter(n => n.note?.trim()) ?? []
              })()}
              onWeekCheckIn={async (weekIdx, note) => {
                try {
                  const course = courses[form.courseIdx]
                  const courseId = course?.id ?? form.courseIdx
                  await saveCoachPlanHardNote(courseId, note, `Week ${weekIdx + 1} check-in`)
                } catch {}
              }}
            />
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
              Nothing logged yet. Add topics that felt hard or unclear -- the AI coach uses these to tailor your sessions.
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

// ── Adaptive feedback banner ──────────────────────────────────────────────────
function AdaptiveFeedbackBanner({ notes, onUpdate, onDismiss }) {
  const latest = notes[notes.length - 1]
  return (
    <div style={{
      background: 'rgba(245,158,11,0.06)',
      border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Session feedback</div>
        <div style={{ fontSize: 13, color: D.text, lineHeight: 1.5, marginBottom: 10 }}>
          You flagged <strong>"{latest.note}"</strong> as difficult. Regenerate to prioritize this in upcoming sessions.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onUpdate}
            style={{ padding: '7px 14px', borderRadius: 8, background: '#3B61C4', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none' }}
          >
            Update plan
          </button>
          <button
            onClick={onDismiss}
            style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', color: D.muted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', border: `1px solid ${D.border}` }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Plan display ──────────────────────────────────────────────────────────────
function getPhaseColor(label) {
  const l = (label || '').toUpperCase()
  if (l.includes('LEARN')) return '#F97316'
  if (l.includes('SYNTHESIZE') || l.includes('PRACTICE')) return '#34d399'
  if (l.includes('REVIEW') || l.includes('TEST') || l.includes('EXAM')) return '#D97706'
  return D.accent
}

function weekDateRange(weekIndex) {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekIndex * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { start: fmt(monday), end: fmt(sunday), startDate: new Date(monday) }
}

// Legacy placeholder - kept for safety, unused
function tv() { return {} }

function PlanView({ plan, course, dot, pushed, onPush, onReset, form, onStartFocus, onWeekCheckIn }) {
  const [checked, setChecked] = useState({})
  const [expandedWeek, setExpandedWeek] = useState(0)
  const [weekCheckIns, setWeekCheckIns] = useState({})
  const [weekCheckInInput, setWeekCheckInInput] = useState({})
  const [weekCheckInSubmitted, setWeekCheckInSubmitted] = useState({})
  const sessionLen = form?.sessionLen || 60
  const allSessions = plan?.weeklyFocus?.flatMap(w => w.sessions || []) || []
  const totalSessions = allSessions.length
  const doneCount = Object.values(checked).filter(Boolean).length
  const completePct = totalSessions > 0 ? Math.round((doneCount / totalSessions) * 100) : 0
  const totalHours = ((totalSessions * sessionLen) / 60).toFixed(1)
  const weeks = plan?.weeklyFocus?.length || 0
  const goal = form?.goal?.trim() || ''
  const struggles = form?.struggles?.trim() || ''
  const validDates = (form?.dates || []).filter(d => d.date && d.label)
  const techniquesList = form?.style?.length ? form.style : ['Active recall', 'Reading + notes']
  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const toggleCheck = (wi, si) => setChecked(prev => ({ ...prev, [`${wi}-${si}`]: !prev[`${wi}-${si}`] }))

  const shareLink = (() => {
    try {
      const payload = JSON.stringify({
        courseName: course?.name ?? 'Course',
        goal: form?.goal ?? '',
        weeks: plan.weeklyFocus?.map(w => ({ week: w.week, theme: w.theme, sessions: w.sessions?.length ?? 0 })) ?? [],
        topics: plan.priorityTopics?.slice(0, 8) ?? [],
      })
      const b64 = btoa(encodeURIComponent(payload))
      // utm_* tells PostHog this signup came from a user-shared coach plan,
      // distinct from organic / referral / paid.
      return `${window.location.origin}/shared-plan?utm_source=shared_plan&utm_medium=user_share&utm_campaign=coach_plan_share#${b64}`
    } catch { return null }
  })()

  function handleCopyShareLink() {
    if (!shareLink) return
    navigator.clipboard.writeText(shareLink).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    }).catch(() => {})
  }

  const buildPlanText = () => {
    const lines = []
    const courseName = course?.name || 'Course'
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    lines.push(`StudyEdge AI: ${courseName} Study Plan`)
    lines.push(`Generated ${dateStr}`)
    lines.push('')
    if (goal) lines.push(`Goal: ${goal}`)
    lines.push(`Duration: ${weeks} week${weeks !== 1 ? 's' : ''} · ${totalSessions} sessions · ${totalHours}h of focused study`)
    if (validDates.length) {
      lines.push('')
      lines.push('DEADLINES')
      validDates.forEach(d => {
        const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        lines.push(`  - ${d.label}: ${label}`)
      })
    }
    ;(plan.weeklyFocus || []).forEach((week, wi) => {
      const range = weekDateRange(wi)
      lines.push('')
      lines.push(`WEEK ${wi + 1}: ${week.theme || 'Foundation'} (${range.start} to ${range.end})`)
      ;(week.sessions || []).forEach((sess, si) => {
        lines.push(`  Session ${si + 1}: ${sess.sessionLabel || ''} - ${sess.focusArea || ''}`)
        if (sess.keyTopics?.length) lines.push(`    Topics: ${sess.keyTopics.join(', ')}`)
        if (sess.deliverable) lines.push(`    Deliverable: ${sess.deliverable}`)
      })
    })
    if (techniquesList.length) {
      lines.push('')
      lines.push('TECHNIQUES IN ROTATION')
      techniquesList.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`))
    }
    return lines.join('\n')
  }

  const handleDownload = () => {
    const text = buildPlanText()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(course?.name || 'study-plan').replace(/\s+/g, '-').toLowerCase()}-plan.txt`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlanText())
    } catch {
      const ta = document.createElement('textarea')
      ta.value = buildPlanText()
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setExportOpen(false)
  }

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const margin = 48
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const contentW = pageW - margin * 2
    let y = margin

    const checkPage = (needed = 20) => {
      if (y + needed > pageH - margin) { doc.addPage(); y = margin }
    }

    const text = (str, size, color, bold = false) => {
      doc.setFontSize(size)
      doc.setTextColor(...color)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      return str
    }

    const writeLine = (str, size, color, bold = false, extraY = 0) => {
      checkPage(size + extraY + 6)
      doc.setFontSize(size)
      doc.setTextColor(...color)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(str, contentW)
      doc.text(lines, margin, y)
      y += lines.length * (size * 1.35) + extraY
    }

    const courseName = course?.name || 'Course'
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    // Header bar
    doc.setFillColor(15, 10, 40)
    doc.rect(0, 0, pageW, 72, 'F')
    doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(232, 232, 240)
    doc.text(courseName + ': Study Plan', margin, 36)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(136, 136, 160)
    doc.text(`Generated ${dateStr} · StudyEdge AI`, margin, 54)
    y = 96

    // Summary line
    writeLine(`${weeks} week${weeks !== 1 ? 's' : ''} · ${totalSessions} sessions · ${totalHours}h of focused study`, 11, [136, 136, 160])
    y += 6

    if (goal) {
      writeLine('GOAL', 8, [99, 102, 241], true)
      writeLine(goal, 12, [232, 232, 240], false, 10)
    }

    if (validDates.length) {
      writeLine('DEADLINES', 8, [99, 102, 241], true)
      validDates.forEach(d => {
        const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        writeLine(`${d.label}: ${label}`, 11, [232, 232, 240])
      })
      y += 6
    }

    // Weeks
    ;(plan.weeklyFocus || []).forEach((week, wi) => {
      const range = weekDateRange(wi)
      y += 8
      checkPage(60)

      // Week header pill background
      doc.setFillColor(249, 115, 22, 0.12)
      doc.setDrawColor(249, 115, 22, 0.3)
      doc.roundedRect(margin, y - 14, contentW, 22, 4, 4, 'FD')
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(249, 115, 22)
      doc.text(`WEEK ${wi + 1}  ·  ${week.theme || 'Foundation'}  ·  ${range.start} – ${range.end}`, margin + 8, y + 2)
      y += 18

      ;(week.sessions || []).forEach((sess, si) => {
        checkPage(48)
        y += 8
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(232, 232, 240)
        doc.text(`Session ${si + 1}: ${sess.sessionLabel || ''}`, margin + 8, y)
        y += 16
        if (sess.focusArea) {
          const lines = doc.splitTextToSize(sess.focusArea, contentW - 16)
          doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(136, 136, 160)
          doc.text(lines, margin + 8, y)
          y += lines.length * 14
        }
        if (sess.keyTopics?.length) {
          doc.setFontSize(9.5); doc.setTextColor(85, 85, 110)
          const tLine = doc.splitTextToSize('Topics: ' + sess.keyTopics.join(', '), contentW - 16)
          doc.text(tLine, margin + 8, y)
          y += tLine.length * 13
        }
      })
    })

    // Techniques
    if (techniquesList.length) {
      y += 14
      checkPage(40)
      writeLine('TECHNIQUES IN ROTATION', 8, [99, 102, 241], true)
      techniquesList.forEach((t, i) => writeLine(`${i + 1}.  ${t}`, 11, [232, 232, 240]))
    }

    // Footer on every page
    const totalPages = doc.internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFontSize(8); doc.setTextColor(85, 85, 110); doc.setFont('helvetica', 'normal')
      doc.text(`StudyEdge AI · ${courseName}`, margin, pageH - 20)
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 20, { align: 'right' })
    }

    doc.save(`${(courseName).replace(/\s+/g, '-').toLowerCase()}-study-plan.pdf`)
    setExportOpen(false)
  }

  const TECHNIQUE_HINTS = {
    'Active recall': 'Self-quiz without notes', 'Spaced repetition': 'Review at growing intervals',
    'Practice problems': 'Solve, then check solutions', 'Teaching others': 'Explain it out loud',
    'Visual diagrams': 'Draw concept maps', 'Reading + notes': 'Read, summarize, annotate',
    'Flashcards': 'Key term card drills', 'Watching lectures': 'Re-watch key sections',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
      {/* Overview header */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '20px 22px', overflow: 'hidden', overflowX: 'hidden' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase', marginBottom: 10 }}>
          Your Personalized Plan
        </div>
        <div className="sc-plan-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div className="sc-plan-text" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}`, flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: D.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course?.name}</span>
            </div>
            <div className="sc-plan-title" style={{ fontSize: 22, fontWeight: 700, color: D.text, lineHeight: 1.3, marginBottom: 12 }}>
              <span style={{ color: D.accent }}>{weeks}</span> week{weeks !== 1 ? 's' : ''} &nbsp;·&nbsp; <span style={{ color: D.accent }}>{totalSessions}</span> sessions &nbsp;·&nbsp; <span style={{ color: D.accent }}>{totalHours}h</span> of focused study
            </div>
            <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.6 }}>
              {goal ? <><span style={{ color: D.text }}>Structured to aim for "{goal}"</span>, </> : ''}
              {validDates.length > 0 ? `hit ${validDates.length} deadline${validDates.length > 1 ? 's' : ''}, ` : ''}
              via {techniquesList.slice(0, 2).join(' + ').toLowerCase()}, rotating through the {plan?.priorityTopics?.length || 0} topic{plan?.priorityTopics?.length === 1 ? '' : 's'} you gave me. No topic, date, or recommendation has been invented.
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: completePct > 0 ? D.mint : D.dim }}>{completePct}%</div>
            <div style={{ fontSize: 11, color: D.dim }}>{doneCount}/{totalSessions} done</div>
          </div>
        </div>

        {/* Apply to Calendar CTA */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.4 }}>
            {pushed
              ? <span style={{ color: D.mint, fontWeight: 600 }}>✓ All {totalSessions} sessions added to your calendar with real times</span>
              : <span>Push all <strong style={{ color: D.text }}>{totalSessions} sessions</strong> to your calendar as timed study blocks</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setShareOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
                fontWeight: 600, fontSize: 13,
                background: 'rgba(59,97,196,0.08)', color: '#3B61C4',
                border: '1px solid rgba(59,97,196,0.25)', transition: 'all 0.15s',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share plan
            </button>
          </div>
        </div>
      </div>

      {/* Share modal */}
      {shareOpen && (
        <div
          onClick={() => setShareOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: '28px 28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Share your study plan</div>
                <div style={{ fontSize: 12.5, color: '#6B6B6B', marginTop: 3 }}>Anyone with this link can view a read-only snapshot.</div>
              </div>
              <button onClick={() => setShareOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, background: '#F7F6F3', border: '1px solid #E5E5E5', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#6B6B6B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shareLink}
              </div>
              <button
                onClick={handleCopyShareLink}
                style={{
                  flexShrink: 0, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13,
                  background: shareCopied ? 'rgba(5,150,105,0.1)' : '#3B61C4',
                  color: shareCopied ? '#059669' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                {shareCopied ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Copied!</span>) : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my ${course?.name || 'study'} plan on StudyEdge AI: ${shareLink}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', borderRadius: 10, border: '1px solid #E5E5E5', fontSize: 12.5, fontWeight: 600, color: '#374151', textDecoration: 'none', background: '#fff' }}
              >
                Share on X
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Here's my ${course?.name || ''} study plan, built with StudyEdge AI: ${shareLink}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', borderRadius: 10, border: '1px solid #E5E5E5', fontSize: 12.5, fontWeight: 600, color: '#374151', textDecoration: 'none', background: '#fff' }}
              >
                Share on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}



      {/* Priority topics */}
      {plan?.priorityTopics?.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase' }}>What You'll Master: Your {plan.priorityTopics?.length} Topic{plan.priorityTopics?.length !== 1 ? 's' : ''}</span>
            {struggles && <span className="sc-topic-struggles-hint" style={{ fontSize: 11, color: D.dim }}>From your list, nothing added</span>}
          </div>
          <div className="sc-topics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {plan.priorityTopics?.map((topic, i) => {
              const isStruggle = struggles && topic.toLowerCase().split(' ').some(w => w.length > 4 && struggles.toLowerCase().includes(w))
              return (
                <div key={i} style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: `${dot}50`, minWidth: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: D.text, lineHeight: 1.4 }}>{topic}</div>
                    {isStruggle && <span style={{ fontSize: 10, color: D.accent, background: 'rgba(59,97,196,0.1)', border: '1px solid rgba(59,97,196,0.25)', borderRadius: 4, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontWeight: 600 }}>+ Extra reps</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Struggles banner */}
      {struggles && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase', marginBottom: 8 }}>
            Extra focus from your struggles
          </div>
          <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.5, fontStyle: 'italic' }}>"{struggles}"</div>
        </div>
      )}

      {/* Missed sessions banner */}
      {(() => {
        const today = new Date().toISOString().split('T')[0]
        const missedSessions = []
        ;(plan.weeklyFocus || []).forEach((week, wi) => {
          if (!week.endDate || week.endDate >= today) return
          ;(week.sessions || []).forEach((sess, si) => {
            if (!checked[`${wi}-${si}`]) {
              missedSessions.push({ wi, si, focusArea: sess.focusArea, weekLabel: week.week })
            }
          })
        })
        if (!missedSessions.length) return null
        const count = missedSessions.length
        const firstMissed = missedSessions[0]
        return (
          <div style={{
            background: 'rgba(249,115,22,0.05)',
            border: '1px solid rgba(249,115,22,0.2)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F97316', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>
                {count} session{count !== 1 ? 's' : ''} behind
              </div>
              <div style={{ fontSize: 13, color: D.muted }}>
                {firstMissed.focusArea} and {count - 1 > 0 ? `${count - 1} other${count - 1 !== 1 ? 's' : ''}` : 'more'} from {firstMissed.weekLabel}
              </div>
            </div>
            {onStartFocus && (
              <button
                onClick={() => {
                  const todayStr = new Date().toISOString().split('T')[0]
                  const combinedTopics = [...new Set(missedSessions.slice(0, 3).map(m => m.focusArea).filter(Boolean))]
                  onStartFocus({
                    id: `catch-up-${todayStr}`,
                    courseId: course?.id ?? 0,
                    courseName: course?.name ?? '',
                    color: course?.color,
                    sessionType: 'Catch-up review',
                    duration: sessionLen,
                    dateStr: todayStr,
                    isManual: true,
                    fromCoachPlan: true,
                    focusArea: `Catch-up: ${combinedTopics.join(', ')}`,
                    keyTopics: combinedTopics,
                    goal: `Cover ${count} missed session${count !== 1 ? 's' : ''} with active recall`,
                    studyMethod: 'Cumulative review',
                  })
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: '#F97316',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Start catch-up
              </button>
            )}
          </div>
        )
      })()}

      {/* Week by week */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase' }}>Week by Week</span>
          <span className="sc-week-hint" style={{ fontSize: 11, color: D.dim }}>Check sessions as you complete them</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.weeklyFocus?.map((week, wi) => {
            const isOpen = expandedWeek === wi
            const range = weekDateRange(wi)
            const phase = week.theme || 'Foundation'
            const weekSessions = week.sessions || []
            const weekDone = weekSessions.filter((_, si) => checked[`${wi}-${si}`]).length
            const anchored = validDates.find(d => {
              const dt = new Date(d.date + 'T12:00:00')
              const rs = range.startDate
              const re = new Date(rs); re.setDate(rs.getDate() + 6)
              return dt >= rs && dt <= re
            })
            return (
              <div key={wi} style={{ borderRadius: 13, overflow: 'hidden', background: D.bgCard, border: `1px solid ${isOpen ? 'rgba(59,97,196,0.25)' : D.border}`, transition: 'all 0.15s' }}>
                <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none' }} onClick={() => setExpandedWeek(isOpen ? -1 : wi)}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(59,97,196,0.1)', display: 'grid', placeItems: 'center', color: '#3B61C4', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{wi + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: D.text }}>Week {wi + 1}</span>
                      <span style={{ fontSize: 12, color: D.dim }}>· {range.start} – {range.end}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 8px', borderRadius: 5, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, color: D.muted }}>{phase}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: D.dim, marginTop: 3 }}>
                      {weekSessions.length} session{weekSessions.length !== 1 ? 's' : ''}
                      {anchored && <> · anchored to <span style={{ color: D.violet }}>{anchored.label}</span></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: D.muted }}>{weekDone}/{weekSessions.length}</span>
                    <svg style={{ width: 16, height: 16, color: D.dim, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {weekSessions.map((sess, si) => (
                      <SessionCard key={si} session={sess} wi={wi} si={si} checked={!!checked[`${wi}-${si}`]} onCheck={() => toggleCheck(wi, si)} struggles={struggles} onStartFocus={onStartFocus} course={course} />
                    ))}
                    {/* Week check-in -- appears when all sessions in this week are marked done */}
                    {(() => {
                      const allDone = weekSessions.length > 0 && weekSessions.every((_, si) => checked[`${wi}-${si}`])
                      const alreadySubmitted = weekCheckInSubmitted[wi]
                      if (!allDone || alreadySubmitted || wi === (plan.weeklyFocus.length - 1)) return null
                      return (
                        <div style={{
                          marginTop: 10,
                          background: 'rgba(52,211,153,0.05)',
                          border: '1px solid rgba(52,211,153,0.2)',
                          borderRadius: 12,
                          padding: '14px 16px',
                        }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#34d399', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Week complete</div>
                          <div style={{ fontSize: 13, color: D.text, marginBottom: 10 }}>How did week {wi + 1} go? Note anything that was hard or unclear.</div>
                          <textarea
                            value={weekCheckInInput[wi] || ''}
                            onChange={e => setWeekCheckInInput(prev => ({ ...prev, [wi]: e.target.value }))}
                            placeholder="e.g. Struggled with oxidation states, concept mapping helped a lot..."
                            style={{
                              width: '100%',
                              minHeight: 64,
                              borderRadius: 8,
                              border: `1px solid ${D.border}`,
                              background: '#FFFFFF',
                              padding: '10px 12px',
                              fontSize: 13,
                              color: D.text,
                              resize: 'vertical',
                              fontFamily: 'inherit',
                              boxSizing: 'border-box',
                              outline: 'none',
                              marginBottom: 10,
                            }}
                          />
                          <button
                            disabled={!weekCheckInInput[wi]?.trim()}
                            onClick={() => {
                              const note = weekCheckInInput[wi]?.trim()
                              if (!note) return
                              setWeekCheckInSubmitted(prev => ({ ...prev, [wi]: true }))
                              setWeekCheckIns(prev => ({ ...prev, [wi]: note }))
                              onWeekCheckIn?.(wi, note)
                            }}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 8,
                              background: weekCheckInInput[wi]?.trim() ? '#3B61C4' : 'rgba(0,0,0,0.05)',
                              color: weekCheckInInput[wi]?.trim() ? '#fff' : D.muted,
                              fontSize: 12.5,
                              fontWeight: 600,
                              cursor: weekCheckInInput[wi]?.trim() ? 'pointer' : 'default',
                              border: 'none',
                            }}
                          >
                            Submit and update next sessions
                          </button>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Techniques in rotation */}
      {techniquesList.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: D.muted, textTransform: 'uppercase', marginBottom: 12 }}>Techniques in Rotation</div>
          <div className="sc-techniques-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {techniquesList.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}` }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: D.muted, flexShrink: 0 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{t}</div>
                  <div style={{ fontSize: 11, color: D.dim, marginTop: 2 }}>{TECHNIQUE_HINTS[t] || ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div style={{ position: 'sticky', bottom: 16, display: 'flex', gap: 10, padding: '14px 18px', background: D.bgEl, border: `1px solid ${D.border}`, borderRadius: 14, backdropFilter: 'blur(8px)' }}>
        <button onClick={onReset} style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="refresh" size={13} /> Refine inputs
        </button>
        <button onClick={onPush} disabled={pushed} style={{ flex: 2, padding: '12px 20px', borderRadius: 10, background: pushed ? 'rgba(52,211,153,0.15)' : '#3B61C4', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: pushed ? 'default' : 'pointer', border: pushed ? '1px solid rgba(52,211,153,0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {pushed ? <><Icon name="check" size={13} stroke={2.5} color={D.mint} /> Pushed to Schedule</> : <><Icon name="calendar" size={13} /> Push to Schedule</>}
        </button>
        <div style={{ flex: 1, position: 'relative' }}>
          <button onClick={() => setExportOpen(v => !v)} style={{ width: '100%', padding: '12px', borderRadius: 10, background: exportOpen ? 'rgba(59,97,196,0.07)' : 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="upload" size={13} /> Export
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 210, background: '#ffffff', border: `1px solid ${D.borderStrong}`, borderRadius: 11, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50 }}>
              <button onClick={handleDownloadPdf} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: D.text, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Icon name="file" size={14} color={D.pink} /> Download PDF
              </button>
              <div style={{ height: 1, background: D.border }} />
              <button onClick={handleDownload} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: D.text, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Icon name="file" size={14} color={D.indigo} /> Download .txt
              </button>
              <div style={{ height: 1, background: D.border }} />
              <button onClick={handleCopy} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: D.text, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Icon name="edit" size={14} color={D.indigo} /> Copy to clipboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SessionCard({ session, wi, si, checked, onCheck, struggles, onStartFocus, course }) {
  const phaseColor = getPhaseColor(session.sessionLabel)
  const sl = (struggles || '').toLowerCase()
  const isStruggle = sl && ((session.focusArea || '').toLowerCase().split(' ').some(w => w.length > 4 && sl.includes(w)) || (session.keyTopics || []).some(t => sl.includes(t.toLowerCase())))
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid rgba(0,0,0,0.07)`, borderLeft: `3px solid ${phaseColor}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 12 }}>
      <button onClick={onCheck} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? phaseColor : 'rgba(255,255,255,0.15)'}`, background: checked ? phaseColor : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2, cursor: 'pointer' }}>
        {checked && <Icon name="check" size={10} color="#fff" stroke={3} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 5, background: `${phaseColor}18`, border: `1px solid ${phaseColor}35`, color: phaseColor, flexShrink: 0 }}>{session.sessionLabel}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: checked ? D.muted : D.text, textDecoration: checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.focusArea}</span>
          </div>
          <span style={{ fontSize: 11.5, color: D.muted, flexShrink: 0 }}>{session.duration || 60}m</span>
        </div>
        <div className="sc-session-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: D.dim, textTransform: 'uppercase', marginBottom: 3 }}>Focus</div>
            <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.4 }}>{session.goal}</div>
          </div>
          {session.studyMethod && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: D.dim, textTransform: 'uppercase', marginBottom: 3 }}>Deliverable</div>
              <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.4 }}>{session.studyMethod}</div>
            </div>
          )}
        </div>
        {session.keyTopics?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: isStruggle ? 8 : 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: D.dim, textTransform: 'uppercase', marginRight: 2 }}>Technique</span>
            {session.keyTopics.map((t, i) => <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(0,0,0,0.04)', border: `1px solid rgba(255,255,255,0.1)`, color: D.muted }}>{t}</span>)}
          </div>
        )}
        {isStruggle && (
          <span style={{ fontSize: 10.5, color: D.orange, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 5, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Icon name="zap" size={9} color={D.orange} /> Priority: matches your struggles
          </span>
        )}
        {onStartFocus && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${D.border}` }}>
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                onStartFocus({
                  id: `coach-plan-${wi}-${si}-${today}`,
                  courseId: course?.id ?? 0,
                  courseName: course?.name ?? '',
                  color: course?.color,
                  sessionType: session.studyMethod || session.sessionLabel || 'Review',
                  duration: session.duration || 60,
                  dateStr: today,
                  isManual: true,
                  fromCoachPlan: true,
                  focusArea: session.focusArea,
                  keyTopics: session.keyTopics ?? [],
                  goal: session.goal ?? '',
                  studyMethod: session.studyMethod ?? '',
                })
              }}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 8,
                background: 'rgba(59,97,196,0.07)',
                border: `1px solid rgba(59,97,196,0.2)`,
                color: '#3B61C4',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Start session
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
