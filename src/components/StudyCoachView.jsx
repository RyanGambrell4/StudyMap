import { useState, useEffect, useRef, useMemo } from 'react'
import { getCachedCoachPlan, saveCoachPlan as dbSaveCoachPlan } from '../lib/db'
import { extractText } from '../utils/extractText'
import { clean } from '../utils/strings'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery } from '../lib/subscription'
import { getCurrentGrade, letterGrade, TARGET_OPTIONS } from '../utils/gradeCalc'

// ── DB helpers ────────────────────────────────────────────────────────────────
function loadCoachPlan(courseId) { return getCachedCoachPlan(courseId) }
function saveCoachPlan(courseId, plan, formData) { dbSaveCoachPlan(courseId, plan, formData) }

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg: '#060614', bgCard: '#0a0a1e', bgEl: '#0d0d22',
  border: 'rgba(255,255,255,0.06)', borderStrong: 'rgba(255,255,255,0.1)',
  text: '#e8e8f0', muted: '#8888a0', dim: '#55556e',
  accent: '#6366f1', glow: 'rgba(99,102,241,0.35)',
  indigo: '#818CF8', violet: '#8b5cf6',
  mint: '#34d399', orange: '#F97316', sky: '#38BDF8',
  pink: '#F472B6', amber: '#fbbf24', cyan: '#22d3ee',
}

const SC_STYLE = `
  @keyframes sc-fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes sc-pulse { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
  .sc-input { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); color:#e8e8f0; border-radius:9px; padding:11px 14px; font-size:13.5px; outline:none; transition:all 0.15s; width:100%; font-family:inherit; box-sizing:border-box; }
  .sc-input:focus { border-color:rgba(99,102,241,0.5); background:rgba(255,255,255,0.05); }
  .sc-input::placeholder { color:#55556e; }
  textarea.sc-input { resize:vertical; min-height:68px; line-height:1.5; }
  input[type="date"].sc-input { color-scheme:dark; }
  @media (max-width:1100px) { .sc-grid { grid-template-columns:1fr !important; } .sc-rail { position:static !important; } }
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
function PageHeader({ step }) {
  return (
    <div style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${D.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase' }}>Your AI Study Coach</span>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: D.dim }} />
        <span style={{ fontSize: 11.5, color: D.dim, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.mint, boxShadow: `0 0 6px ${D.mint}` }} />
          No-hallucination mode
        </span>
      </div>
      <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: -0.8, color: D.text }}>
        Study Coach
        <span style={{ marginLeft: 12, fontSize: 12.5, fontWeight: 500, color: D.indigo, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', padding: '4px 10px', borderRadius: 999, verticalAlign: 'middle' }}>Step {step}/3</span>
      </h1>
      <p style={{ margin: '6px 0 2px', fontSize: 14, color: D.muted, maxWidth: 680 }}>
        Built only from what <em>you</em> tell me — I won't invent topics, dates, or facts. The more you share, the sharper your plan.
      </p>
      <p style={{ margin: 0, fontSize: 13, color: D.indigo, fontWeight: 500 }}>
        Be as specific as possible for the best experience.
      </p>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderRadius: 12, marginBottom: 24 }}>
      {steps.map((s, i) => {
        const active = step === s.n
        const done = step > s.n
        return (
          <div key={s.n} style={{ display: 'contents' }}>
            <button
              disabled={!done && !active}
              onClick={() => done && go(s.n)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10, background: active ? 'rgba(99,102,241,0.15)' : 'transparent', border: active ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent', opacity: !active && !done ? 0.5 : 1, cursor: done ? 'pointer' : 'default' }}
            >
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: done ? D.mint : active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)', color: done || active ? '#fff' : D.muted, fontSize: 11, fontWeight: 700, boxShadow: active ? `0 0 10px ${D.glow}` : 'none' }}>
                {done ? <Icon name="check" size={12} stroke={3} /> : s.n}
              </div>
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? D.text : D.muted, whiteSpace: 'nowrap' }}>{s.label}</span>
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
        <button onClick={add} style={{ padding: '0 16px', borderRadius: 9, flexShrink: 0, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: D.indigo, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
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
        style={{ padding: 20, borderRadius: 11, cursor: 'pointer', background: drag ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)', border: `1px dashed ${drag ? D.cyan : D.borderStrong}`, textAlign: 'center', transition: 'all 0.15s' }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: D.muted, fontSize: 13 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${D.accent}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
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
    <div className="sc-rail" style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Coach card */}
      <div style={{ background: 'linear-gradient(155deg, rgba(139,92,246,0.14) 0%, rgba(99,102,241,0.05) 45%, #0a0a1e 100%)', border: '1px solid rgba(139,92,246,0.28)', borderRadius: 14, padding: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle, rgba(139,92,246,0.25), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, position: 'relative' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: `0 0 12px ${D.glow}`, flexShrink: 0 }}>
            <Icon name="sparkles" size={15} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>Your Coach</div>
            <div style={{ fontSize: 11, color: D.dim, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: D.mint, boxShadow: `0 0 6px ${D.mint}`, animation: 'sc-pulse 1.2s infinite' }} />
              Listening
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: D.text, lineHeight: 1.55, position: 'relative' }}>
          {!form.courseId && form.courseIdx === undefined ? (
            <>Pick a course above to get started — I'll only plan for what you confirm.</>
          ) : !form.goal?.trim() && !topics.length ? (
            <>Great, <strong>{course?.name}</strong>. Now tell me your goal or list topics your professor emphasizes. <span style={{ color: D.dim }}>I won't add any I don't see from you.</span></>
          ) : (
            <>Got it. Working with <strong>{topics.length || 0} topic{topics.length === 1 ? '' : 's'}</strong>{dates.length > 0 && <>, <strong>{dates.length} date{dates.length === 1 ? '' : 's'}</strong></>}, and your goal. The more you add, the more grounded the plan.</>
          )}
        </div>
      </div>

      {/* Confidence */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase', marginBottom: 10 }}>Plan Confidence</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: confidence >= 6 ? D.mint : confidence >= 3 ? D.indigo : D.dim, fontFamily: 'ui-monospace, monospace' }}>{Math.round(confidence / 9 * 100)}%</span>
          <span style={{ fontSize: 11, color: D.dim }}>based on {confidence}/9 signals</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(confidence / 9) * 100}%`, height: '100%', background: confidence >= 6 ? `linear-gradient(90deg, ${D.mint}, ${D.cyan})` : `linear-gradient(90deg, ${D.accent}, ${D.violet})`, transition: 'all 0.3s' }} />
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: D.muted, lineHeight: 1.45 }}>
          {confidence < 3 && 'A solid plan needs 3+ inputs. Add topics or a goal.'}
          {confidence >= 3 && confidence < 6 && 'Good foundation. Adding dates and materials sharpens week-by-week pacing.'}
          {confidence >= 6 && 'Strong inputs — the plan will be specific and grounded in what you shared.'}
        </div>
      </div>

      {/* No-invent pledge */}
      <div style={{ padding: 14, borderRadius: 11, background: `rgba(52,211,153,0.06)`, border: `1px solid rgba(52,211,153,0.2)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Icon name="check" size={13} color={D.mint} stroke={2.5} />
          <span style={{ fontSize: 12, fontWeight: 600, color: D.mint }}>No-invent pledge</span>
        </div>
        <div style={{ fontSize: 11.5, color: D.muted, lineHeight: 1.5 }}>I will never add topics, dates, or recommendations you didn't mention. If I need something, I'll ask.</div>
      </div>
    </div>
  )
}

// ── Step 1: Intake ────────────────────────────────────────────────────────────
function IntakeStep({ form, setForm, courses, cachedStruggles, materialLoading, onMaterialFile, onNext }) {
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const course = courses[form.courseIdx]
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
                <button key={i} onClick={() => update('courseIdx', i)} style={{ padding: '10px 14px', borderRadius: 10, background: active ? `linear-gradient(135deg, ${color}22, ${color}0a)` : 'rgba(255,255,255,0.02)', border: active ? `1px solid ${color}55` : `1px solid ${D.border}`, boxShadow: active ? `0 0 0 3px ${color}12` : 'none', color: active ? D.text : D.muted, fontSize: 12.5, fontWeight: active ? 600 : 500, display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.15s', cursor: 'pointer' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}90` }} />
                  {c.name}
                </button>
              )
            })}
          </div>
        </FieldBlock>

        {/* Struggles from AI Tutor */}
        {cachedStruggles.length > 0 && (
          <div style={{ padding: '12px 16px', borderRadius: 11, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="bookmark" size={14} color={D.indigo} />
            <div style={{ fontSize: 12.5, color: D.indigo }}>
              <span style={{ fontWeight: 600 }}>Topics flagged from AI Tutor: </span>
              {cachedStruggles.join(', ')} — these will be emphasized in your plan.
            </div>
          </div>
        )}

        {/* Goal */}
        <FieldBlock icon="flag" color={D.pink} label="Your goal" hint="What does success look like to you? Be as specific as possible.">
          <textarea className="sc-input" value={form.goal || ''} onChange={e => update('goal', e.target.value)}
            placeholder={`e.g. "Score 90%+ on the final" · "Truly understand derivatives, not memorize them" · "Pass with a B+"`} />
        </FieldBlock>

        {/* Topics */}
        <FieldBlock icon="target" color={D.indigo} label="Topics your professor emphasizes" hint="Chapters, concepts, or themes — only what you actually know from lectures or the syllabus.">
          <ChipInput values={form.topics || []} onChange={v => update('topics', v)} placeholder="e.g. Memory encoding, Cognitive biases, Research methods…" />
        </FieldBlock>

        {/* Strengths / Struggles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FieldBlock icon="check" color={D.mint} label="What feels solid" hint="Optional — topics you're comfortable with">
            <textarea className="sc-input" value={form.strengths || ''} onChange={e => update('strengths', e.target.value)} placeholder={`e.g. "Chapter 1–3 readings, classical conditioning"`} />
          </FieldBlock>
          <FieldBlock icon="warn" color={D.orange} label="What you're struggling with" hint="Optional — where I should spend extra time">
            <textarea className="sc-input" value={form.struggles || ''} onChange={e => update('struggles', e.target.value)} placeholder={`e.g. "Statistical significance, research design"`} />
          </FieldBlock>
        </div>

        {/* Dates */}
        <FieldBlock icon="calendar" color={D.violet} label="Upcoming deadlines" hint="Exam, quiz, or project dates — add them and I'll anchor the plan around them.">
          {dates.length === 0 && (
            <div style={{ fontSize: 12.5, color: D.dim, fontStyle: 'italic', marginBottom: 8 }}>None yet. The plan will simply cover the weeks you tell me to.</div>
          )}
          {dates.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 32px', gap: 8, marginBottom: 8 }}>
              <input type="text" className="sc-input" placeholder="e.g. Midterm, Essay 1 due" value={d.label} onChange={e => updateDate(i, { label: e.target.value })} />
              <input type="date" className="sc-input" value={d.date} onChange={e => updateDate(i, { date: e.target.value })} />
              <button onClick={() => removeDate(i)} style={{ width: 32, height: 40, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, color: D.muted, cursor: 'pointer' }}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button onClick={addDate} style={{ fontSize: 12.5, color: D.indigo, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 0', cursor: 'pointer', background: 'none', border: 'none' }}>
            <Icon name="plus" size={12} /> Add {dates.length > 0 ? 'another' : 'a date'}
          </button>
        </FieldBlock>

        {/* Materials */}
        <FieldBlock icon="file" color={D.cyan} label="Course materials" hint="Syllabus, notes, readings — optional but makes everything sharper.">
          <FileDropZone
            files={form.materials || []}
            onChange={v => typeof v === 'function' ? setForm(f => ({ ...f, materials: v(f.materials || []) })) : update('materials', v)}
            onExtract={onMaterialFile}
            loading={materialLoading}
          />
        </FieldBlock>

        {/* Cadence */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FieldBlock icon="clock" color={D.amber} label="Study days / week">
            <div style={{ display: 'flex', gap: 4 }}>
              {[1,2,3,4,5,6,7].map(n => {
                const active = form.daysPerWeek === n
                return (
                  <button key={n} onClick={() => update('daysPerWeek', n)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : D.border}`, color: active ? '#fff' : D.muted, boxShadow: active ? `0 0 10px ${D.glow}` : 'none' }}>{n}</button>
                )
              })}
            </div>
          </FieldBlock>
          <FieldBlock icon="clock" color={D.amber} label="Session length">
            <div style={{ display: 'flex', gap: 4 }}>
              {[30,45,60,75,90].map(m => {
                const active = form.sessionLen === m
                return (
                  <button key={m} onClick={() => update('sessionLen', m)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : D.border}`, color: active ? '#fff' : D.muted }}>{m}m</button>
                )
              })}
            </div>
          </FieldBlock>
        </div>

        {/* Learning style */}
        <FieldBlock icon="lightbulb" color={D.mint} label="How you learn best" hint="Pick any that apply — I'll lean into them.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Active recall','Spaced repetition','Practice problems','Teaching others','Visual diagrams','Reading + notes','Flashcards','Watching lectures'].map(t => {
              const list = form.style || []
              const active = list.includes(t)
              return (
                <button key={t} onClick={() => update('style', active ? list.filter(x => x !== t) : [...list, t])} style={{ padding: '7px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', background: active ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(52,211,153,0.4)' : D.border}`, color: active ? D.mint : D.muted, fontWeight: active ? 600 : 500 }}>
                  {active && '✓ '}{t}
                </button>
              )
            })}
          </div>
        </FieldBlock>

        {/* CTA */}
        <button
          disabled={!canProceed}
          onClick={onNext}
          style={{ width: '100%', padding: '14px 20px', borderRadius: 11, background: canProceed ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.04)', color: canProceed ? '#fff' : D.dim, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: canProceed ? `0 8px 24px ${D.glow}` : 'none', cursor: canProceed ? 'pointer' : 'not-allowed', border: 'none' }}
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
    <div style={{ padding: 14, borderRadius: 10, background: answered ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${answered ? 'rgba(52,211,153,0.25)' : D.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: answered ? 0 : 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: answered ? D.mint : 'rgba(99,102,241,0.2)', color: answered ? '#fff' : D.indigo, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>
          {answered ? <Icon name="check" size={11} stroke={3} /> : n}
        </div>
        <div style={{ fontSize: 13, color: D.text, lineHeight: 1.5 }}>{question}</div>
      </div>
      {!answered && (
        <div style={{ display: 'flex', gap: 8, paddingLeft: 32 }}>
          <input type="text" className="sc-input" placeholder={field === 'topics-chip' ? 'Comma-separated, or skip' : 'Type your answer, or skip'}
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          <button onClick={submit} disabled={!draft.trim()} style={{ padding: '0 14px', borderRadius: 8, flexShrink: 0, background: draft.trim() ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${draft.trim() ? 'rgba(99,102,241,0.4)' : D.border}`, color: draft.trim() ? '#fff' : D.dim, fontSize: 12.5, fontWeight: 600, cursor: draft.trim() ? 'pointer' : 'not-allowed' }}>Save</button>
          <button onClick={() => setAnswered(true)} style={{ padding: '0 12px', borderRadius: 8, flexShrink: 0, color: D.dim, fontSize: 12, cursor: 'pointer' }}>Skip</button>
        </div>
      )}
      {answered && <div style={{ fontSize: 11.5, color: D.mint, marginLeft: 32, marginTop: 4 }}>{draft.trim() ? 'Saved' : 'Skipped — noted'}</div>}
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
  if (!topics.length) questions.push({ id: 'topics', q: "I don't have any topics yet. Even one or two helps — what's on the exam or being covered?", field: 'topics-chip' })
  if (!form.struggles?.trim()) questions.push({ id: 'struggle', q: "Nothing noted for struggles. Is there a topic where you'd like extra reps?", field: 'struggles' })

  return (
    <div className="sc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary */}
        <div style={{ background: `linear-gradient(155deg, ${color}18 0%, ${color}05 40%, #0a0a1e 100%)`, border: `1px solid ${color}30`, borderRadius: 14, padding: 22, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, background: `radial-gradient(circle, ${color}25, transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase', marginBottom: 10 }}>Here's what you told me</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, color: D.text, marginBottom: 8, position: 'relative' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}` }} />
            {course?.name}
          </div>
          <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.6, position: 'relative' }}>
            {form.goal?.trim() ? <>Your goal: <span style={{ color: D.text }}>{form.goal}</span>. </> : 'No goal on file. '}
            {topics.length > 0 ? <>Emphasizing <span style={{ color: D.indigo, fontFamily: 'ui-monospace,monospace' }}>{topics.length}</span> topic{topics.length === 1 ? '' : 's'}. </> : 'No topics yet. '}
            {dates.length > 0 && <><span style={{ color: D.pink, fontFamily: 'ui-monospace,monospace' }}>{dates.length}</span> deadline{dates.length === 1 ? '' : 's'} noted. </>}
            Cadence: <span style={{ color: D.amber, fontFamily: 'ui-monospace,monospace' }}>{form.daysPerWeek || 3}</span> days × <span style={{ color: D.amber, fontFamily: 'ui-monospace,monospace' }}>{form.sessionLen || 60}m</span>.
          </div>
        </div>

        {/* Facts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                {dates.map((d, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: D.text }}>{d.label}</span><span style={{ color: D.violet, fontFamily: 'ui-monospace,monospace' }}>{d.date}</span></div>)}
              </div>
            ) : 'None'}
          </FactCard>
          <FactCard icon="warn" color={D.orange} title="Struggles" empty={!form.struggles?.trim()}>{form.struggles?.trim() || 'Not provided'}</FactCard>
          <FactCard icon="check" color={D.mint} title="Strong areas" empty={!form.strengths?.trim()}>{form.strengths?.trim() || 'Not provided'}</FactCard>
          <FactCard icon="lightbulb" color={D.mint} title="Learning style" empty={!form.style?.length}>{form.style?.length ? form.style.join(' · ') : 'Not specified'}</FactCard>
        </div>

        {/* Coach questions */}
        {questions.length > 0 && (
          <div style={{ background: 'linear-gradient(155deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.03) 50%, #0a0a1e 100%)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icon name="msg" size={14} color={D.indigo} />
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.indigo, textTransform: 'uppercase' }}>Before I build — a few gaps</span>
            </div>
            <div style={{ fontSize: 12.5, color: D.muted, marginBottom: 16 }}>You can skip any of these — the plan will just note they weren't provided.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {questions.map((q, i) => <CoachQuestion key={q.id} n={i+1} question={q.q} form={form} setForm={setForm} field={q.field} />)}
            </div>
          </div>
        )}

        {/* Nav */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} style={{ padding: '14px 18px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
            <Icon name="arrowLeft" size={13} /> Edit inputs
          </button>
          <button onClick={onBuild} disabled={loading} style={{ flex: 1, padding: '14px 20px', borderRadius: 11, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 8px 24px ${D.glow}`, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, border: 'none' }}>
            {loading ? (
              <>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                Building your plan…
              </>
            ) : (
              <><Icon name="sparkles" size={14} /> Build my plan — only from what I've shared</>
            )}
          </button>
        </div>
      </div>
      <CoachRail form={form} confidence={9} course={courses[form.courseIdx]} />
    </div>
  )
}

// ── Step 3: Plan ──────────────────────────────────────────────────────────────
function PlanStepWrapper({ plan, form, courses, pushed, onPush, onRefine, error }) {
  const course = courses[form.courseIdx]
  const color = course?.color?.dot || D.accent
  const sessionLen = form.sessionLen || 60

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14 }}>
        <Icon name="warn" size={28} color={D.orange} />
        <div style={{ fontSize: 16, fontWeight: 600, color: D.text, marginTop: 12, marginBottom: 6 }}>Couldn't generate plan</div>
        <div style={{ fontSize: 13, color: D.muted, marginBottom: 18 }}>{error}</div>
        <button onClick={onRefine} style={{ padding: '11px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${D.glow}`, cursor: 'pointer', border: 'none' }}>Go back and try again</button>
      </div>
    )
  }

  return (
    <div className="sc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'flex-start' }}>
      <div>
        <PlanView plan={plan} course={course} dot={color} pushed={pushed} onPush={onPush} onReset={onRefine} theme="dark" />
      </div>
      {/* Right rail for plan step */}
      <div className="sc-rail" style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase', marginBottom: 12 }}>At a glance</div>
          {plan?.weeklyFocus && (
            <>
              <StatRow label="Total sessions" value={plan.weeklyFocus.reduce((a, w) => a + (w.sessions?.length || 0), 0)} color={D.indigo} />
              <StatRow label="Hours of study" value={((plan.weeklyFocus.reduce((a, w) => a + (w.sessions?.length || 0), 0) * sessionLen) / 60).toFixed(1) + 'h'} color={D.mint} />
              <StatRow label="Weeks" value={plan.weeklyFocus.length} color={D.violet} />
            </>
          )}
          <StatRow label="Your cadence" value={`${form.daysPerWeek || 3}×${sessionLen}m`} color={D.amber} />
        </div>
        <div style={{ padding: 14, borderRadius: 11, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="check" size={13} color={D.mint} stroke={2.5} />
            <span style={{ fontSize: 12, fontWeight: 600, color: D.mint }}>Grounded in your inputs</span>
          </div>
          <div style={{ fontSize: 11.5, color: D.muted, lineHeight: 1.5 }}>Every session references a topic, date, or learning style you provided. Nothing has been invented.</div>
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', alignItems: 'center', borderBottom: `1px solid ${D.border}` }}>
      <span style={{ fontSize: 12, color: D.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'ui-monospace, monospace' }}>{value}</span>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StudyCoachView({ courses, userId, onShowPaywall, googleEvents = [], preferredTime = 'Morning' }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    courseIdx: courses.length > 0 ? 0 : -1,
    goal: '', topics: [], strengths: '', struggles: '',
    dates: [], materials: [], daysPerWeek: 3, sessionLen: 60, style: [],
  })
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pushed, setPushed] = useState(false)
  const [cachedStruggles, setCachedStruggles] = useState([])

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
    setPushed(false)
    setError('')
  }, [form.courseIdx])

  const handleMaterialFile = async (file) => {
    setMaterialLoading(true)
    try {
      const text = await extractText(file)
      setMaterialText(prev => prev + '\n' + text)
    } catch { /* ignore */ }
    finally { setMaterialLoading(false) }
  }

  const handleBuild = async () => {
    const course = courses[form.courseIdx]
    if (!course) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }

    setLoading(true)
    setError('')
    setPlan(null)
    setPushed(false)

    try {
      const token = await getAccessToken()
      const validDates = (form.dates || []).filter(d => d.label.trim() && d.date)
      const res = await fetch('/api/generate-study-coach-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course.name,
          goal: form.goal?.trim() || '',
          emphasisTopics: form.topics?.length ? form.topics.join(', ') : null,
          importantDates: validDates.length ? validDates : null,
          daysPerWeek: form.daysPerWeek || 3,
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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate plan')
      setPlan(data)
      const courseId = course.id ?? form.courseIdx
      saveCoachPlan(courseId, data, { ...form, sessionMinutes: form.sessionLen, importantDates: form.dates, emphasisTopics: form.topics?.join(', ') })
      await incrementAIQuery()
      setStep(3)
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
    setPushed(true)
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
    const col = isRecovery ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#fca5a5' } : { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', text: '#fde68a' }
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

  if (courses.length === 0) {
    return (
      <div style={{ padding: '64px 32px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(99,102,241,0.1)', border: `1px dashed ${D.border}`, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
          <Icon name="sparkles" size={28} color={D.muted} />
        </div>
        <p style={{ color: D.text, fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>No courses yet</p>
        <p style={{ color: D.muted, fontSize: 14, margin: 0 }}>Add your courses in the setup flow to start building a Study Coach plan.</p>
      </div>
    )
  }

  return (
    <>
      <style>{SC_STYLE}</style>
      <PageHeader step={step} />
      <div style={{ padding: '24px 32px 48px' }}>
        <Stepper step={step} go={setStep} />
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
            onRefine={() => { setPlan(null); setError(''); setStep(1) }}
            error={error}
          />
        )}
      </div>
    </>
  )
}

// ── Plan display (real API output) ────────────────────────────────────────────
function tv() {
  return {
    cardBg: '#0a0f1a', cardBorder: '#1e293b',
    strategyBg: 'linear-gradient(160deg, #0d1420 0%, #0a0f1a 100%)',
    labelColor: '#4b5563', topicText: '#e2e8f0', divider: '#111827',
    summaryText: '#cbd5e1', weekBgClosed: '#0a0f1a', weekBgOpen: '#0d1117',
    weekBorderClosed: '#141c2e', weekBorderOpen: '#1e293b',
    weekNumBg: '#111827', weekNumBorder: '#1e293b', weekNumText: '#475569',
    weekTitle: '#f1f5f9', weekTheme: '#475569',
    sessCountBg: '#0d1117', sessCountBorder: '#1e293b', sessCountText: '#2d3d55',
    chevron: '#2d4a6e', sessionBg: '#080d14', sessionBorder: '#141c2e',
    goalText: '#64748b', chipBg: '#0d1117', chipText: '#3d526e', chipBorder: '#1a2744',
    methodText: '#475569', warningText: '#94a3b8',
  }
}

function PlanView({ plan, course, dot, pushed, onPush, onReset }) {
  const [expandedWeek, setExpandedWeek] = useState(0)
  const t = tv()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Strategy */}
      <div style={{ background: t.strategyBg, border: `1px solid ${t.cardBorder}`, borderTop: `2px solid ${dot}`, borderRadius: '0.875rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <svg style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 16 16" fill="none"><path d="M8 1.5L10.163 5.88L15 6.573L11.5 9.983L12.326 14.8L8 12.52L3.674 14.8L4.5 9.983L1 6.573L5.837 5.88L8 1.5Z" fill={dot} fillOpacity="0.85" /></svg>
          <p style={{ color: dot, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>Study Strategy</p>
        </div>
        <p style={{ color: t.summaryText, fontSize: '13.5px', lineHeight: '1.7', margin: 0 }}>{plan.summary}</p>
      </div>

      {/* Priority Topics */}
      {plan.priorityTopics?.length > 0 && (
        <div style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: '0.875rem', padding: '1.5rem' }}>
          <p style={{ color: t.labelColor, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '1.25rem', margin: '0 0 1.25rem' }}>Priority Topics</p>
          {plan.priorityTopics.map((topic, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '0.875rem 0', borderBottom: i < plan.priorityTopics.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, color: `${dot}28`, minWidth: '2.25rem', textAlign: 'right', flexShrink: 0, paddingTop: '2px' }}>{i + 1}</span>
              <p style={{ color: t.topicText, fontSize: '13.5px', lineHeight: '1.55', paddingTop: '3px', margin: 0 }}>{topic}</p>
            </div>
          ))}
        </div>
      )}

      {/* Warning zones */}
      {plan.warningZones?.length > 0 && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.14)', borderRadius: '0.875rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <svg style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6.5V9" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="11.5" r="0.75" fill="#ef4444" /></svg>
            <p style={{ color: '#ef4444', fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>Watch Out For</p>
          </div>
          {plan.warningZones.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0.75rem 0', borderBottom: i < plan.warningZones.length - 1 ? '1px solid rgba(239,68,68,0.07)' : 'none' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ef4444' }} />
              </div>
              <p style={{ color: t.warningText, fontSize: '13px', lineHeight: '1.65', margin: 0 }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Weekly plan */}
      <div>
        <p style={{ color: t.labelColor, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 0.75rem' }}>Your Week-by-Week Plan</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plan.weeklyFocus?.map((week, wi) => {
            const isOpen = expandedWeek === wi
            return (
              <div key={wi} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: isOpen ? t.weekBgOpen : t.weekBgClosed, border: `1px solid ${isOpen ? t.weekBorderOpen : t.weekBorderClosed}`, transition: 'all 0.15s' }}>
                <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '16px', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none' }} onClick={() => setExpandedWeek(isOpen ? -1 : wi)}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isOpen ? `${dot}18` : t.weekNumBg, border: `1px solid ${isOpen ? `${dot}35` : t.weekNumBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isOpen ? dot : t.weekNumText }}>{wi + 1}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: t.weekTitle, fontWeight: 600, fontSize: 13.5, margin: 0 }}>{week.week}</p>
                    <p style={{ color: t.weekTheme, fontSize: 12, marginTop: 1, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{week.theme}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.sessCountText, backgroundColor: t.sessCountBg, border: `1px solid ${t.sessCountBorder}`, borderRadius: 6, padding: '2px 8px' }}>{week.sessions?.length}</span>
                    <svg style={{ width: 16, height: 16, color: t.chevron, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${t.divider}` }}>
                    {week.sessions?.map((sess, si) => <SessionCard key={si} session={sess} dot={dot} t={t} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
        <button onClick={onPush} disabled={pushed} style={{ width: '100%', padding: '16px', borderRadius: 16, fontWeight: 700, color: '#fff', fontSize: 15, backgroundColor: pushed ? '#065f46' : dot, boxShadow: pushed ? '0 0 24px #065f4650' : `0 0 28px ${dot}35`, opacity: pushed ? 0.8 : 1, cursor: 'pointer', border: 'none' }}>
          {pushed ? '✓ Plan saved. Sessions will use this as their starting point.' : 'Push to Sessions'}
        </button>
        {pushed && (
          <p style={{ textAlign: 'center', fontSize: 12, lineHeight: 1.5, color: t.weekTheme, margin: 0 }}>
            When you start a session for <span style={{ fontWeight: 500, color: t.weekTitle }}>{clean(course?.name || '')}</span>, the Blueprint screen will auto-fill the focus from this plan.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onReset} style={{ padding: '12px', borderRadius: 12, fontSize: 13.5, fontWeight: 500, color: t.weekTheme, border: `1px solid ${t.cardBorder}`, background: 'none', cursor: 'pointer' }}>Rebuild plan</button>
          <button onClick={onReset} style={{ padding: '12px', borderRadius: 12, fontSize: 13.5, fontWeight: 500, color: t.weekTheme, border: `1px solid ${t.cardBorder}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M23 4v6h-6M1 20v-6h6"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refine inputs
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionCard({ session, dot, t }) {
  return (
    <div style={{ backgroundColor: t.sessionBg, border: `1px solid ${t.sessionBorder}`, borderLeft: `2px solid ${dot}`, borderRadius: 10, padding: '1rem 1rem 1rem 1.125rem', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.1em', backgroundColor: `${dot}15`, color: dot, border: `1px solid ${dot}28`, flexShrink: 0, whiteSpace: 'nowrap' }}>{session.sessionLabel}</span>
          <p style={{ color: t.weekTitle, fontWeight: 600, fontSize: 13.5, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.focusArea}</p>
        </div>
        <span style={{ fontSize: 11, color: t.chevron, fontWeight: 600, flexShrink: 0 }}>{session.duration}m</span>
      </div>
      <p style={{ color: t.goalText, fontSize: 12.5, lineHeight: 1.6, margin: '0 0 12px' }}>{session.goal}</p>
      {session.keyTopics?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {session.keyTopics.map((topic, ti) => (
            <span key={ti} style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 5, fontWeight: 500, backgroundColor: t.chipBg, color: t.chipText, border: `1px solid ${t.chipBorder}` }}>{topic}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg style={{ width: 12, height: 12, flexShrink: 0 }} fill="none" stroke={dot} viewBox="0 0 24 24" strokeOpacity="0.7"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        <p style={{ fontSize: 11.5, fontStyle: 'italic', color: t.methodText, margin: 0 }}>{session.studyMethod}</p>
      </div>
    </div>
  )
}
