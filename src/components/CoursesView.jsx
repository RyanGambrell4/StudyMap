import { useState, useMemo, useRef, useEffect } from 'react'
import { canAddCourse, getActivePlan, getPlanLimits } from '../lib/subscription'
import { clean } from '../utils/strings'

// ── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg: '#060614', bgCard: '#0a0a1e', bgEl: '#0d0d22',
  border: 'rgba(255,255,255,0.06)', borderStrong: 'rgba(255,255,255,0.1)',
  text: '#e8e8f0', muted: '#8888a0', dim: '#55556e',
  accent: '#6366f1', glow: 'rgba(99,102,241,0.35)',
  indigo: '#818CF8', violet: '#8b5cf6',
  mint: '#34d399', orange: '#F97316', sky: '#38BDF8',
  pink: '#F472B6', amber: '#fbbf24', cyan: '#22d3ee',
}

const COURSES_STYLE = `
  @keyframes cv-fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes cv-slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  .cv-input { -webkit-appearance:none; background:#0d0d22; border:1px solid rgba(255,255,255,0.08); color:#e8e8f0; border-radius:8px; padding:10px 12px; font-size:13px; outline:none; transition:border-color 0.15s; width:100%; font-family:inherit; box-sizing:border-box; }
  .cv-input:focus { border-color:rgba(99,102,241,0.5); background:#10102a; }
  .cv-input::placeholder { color:#55556e; }
  input[type="date"].cv-input, input[type="time"].cv-input { color-scheme:dark; }
  .cv-seg-btn { padding:8px 10px; border-radius:7px; font-size:12.5px; font-weight:600; transition:all 0.15s; cursor:pointer; font-family:inherit; }
  .cv-icon-btn { width:30px; height:30px; border-radius:7px; display:grid; place-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); color:#8888a0; transition:all 0.15s; cursor:pointer; }
  .cv-icon-btn:hover { background:rgba(99,102,241,0.12); border-color:rgba(99,102,241,0.4); color:#818CF8; }
  .cv-icon-btn.danger:hover { background:rgba(244,114,182,0.12); border-color:rgba(244,114,182,0.4); color:#F472B6; }
  .cv-row { background:#0a0a1e; border-radius:14px; overflow:hidden; transition:border 0.15s; }
  .cv-expanded { animation:cv-fadeUp 0.25s ease-out; }
  .cv-modal { animation:cv-slideIn 0.25s; }
  .cv-import-band { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:22px; }
  @media (max-width:640px) {
    .cv-import-band { grid-template-columns:1fr !important; }
    .cv-header-pad { padding:18px 16px 14px !important; }
    .cv-page-pad { padding:14px 14px 48px !important; }
    .cv-modal { width:calc(100vw - 32px) !important; max-width:none !important; }
  }
`

// ── Constants ─────────────────────────────────────────────────────────────────
const TARGET_THRESHOLDS = { A: 80, B: 70, C: 60, 'Pass/Fail': 50 }
const COURSE_COLORS = [
  '#6366f1', '#c084fc', '#34d399', '#F97316',
  '#F472B6', '#38BDF8', '#fbbf24', '#22d3ee',
]
const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard']
const GRADE_OPTIONS = ['A', 'B', 'C', 'Pass/Fail']
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
function Icon({ name, size = 16, color, stroke = 1.8 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color || 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>,
    x: <path d="M6 6l12 12M6 18L18 6"/>,
    chevron: <path d="M6 9l6 6 6-6"/>,
    edit: <><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 13h4M10 17h4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sparkles: <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    sync: <><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    award: <><circle cx="12" cy="8" r="6"/><path d="M9 13l-2 8 5-3 5 3-2-8"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  }
  return <svg {...p}>{paths[name] || paths.file}</svg>
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ value, color }) {
  const c = 2 * Math.PI * 18
  const off = c - (value / 100) * c
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle cx="22" cy="22" r="18" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 0.4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: D.text, fontFamily: 'ui-monospace, monospace' }}>
        {value}%
      </div>
    </div>
  )
}

// ── Syllabus event type color ─────────────────────────────────────────────────
function typeColor(type) {
  const m = { Quiz: D.sky, Assignment: D.indigo, Midterm: D.pink, Exam: D.pink, Lab: D.mint, Other: D.muted }
  return m[type] || D.indigo
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, icon, color, action, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <Icon name={icon} size={12} color={color} />
        <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.muted, textTransform: 'uppercase' }}>{title}</span>
        <div style={{ flex: 1 }} />
        {action && (
          <button onClick={action.onClick} style={{
            fontSize: 11.5, color: D.indigo,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 8px', borderRadius: 6,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            cursor: 'pointer',
          }}>
            <Icon name={action.icon} size={11} /> {action.label}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

// ── Label ─────────────────────────────────────────────────────────────────────
function Label({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 500, color: D.muted, marginBottom: 8, ...style }}>{children}</div>
}

// ── Segmented control ─────────────────────────────────────────────────────────
function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 4,
      padding: 4, background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${D.border}`, borderRadius: 9,
    }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} className="cv-seg-btn" style={{
          background: value === o ? 'rgba(99,102,241,0.2)' : 'transparent',
          border: value === o ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
          color: value === o ? '#fff' : D.muted,
        }}>{o}</button>
      ))}
    </div>
  )
}

// ── Addon toggle ──────────────────────────────────────────────────────────────
function AddonToggle({ active, onToggle, icon, color, title, subtitle, badge, children }) {
  return (
    <div style={{
      borderRadius: 11,
      background: active ? `linear-gradient(155deg, ${color}18, transparent 60%)` : 'rgba(255,255,255,0.015)',
      border: `1px solid ${active ? color + '40' : D.border}`,
      overflow: 'hidden', transition: 'all 0.2s',
    }}>
      <button onClick={onToggle} style={{ width: '100%', padding: 14, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: 'none', border: 'none' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: D.text }}>{title}</span>
            {badge && (
              <span style={{ fontSize: 10, fontWeight: 600, color: D.indigo, padding: '2px 7px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}>{badge}</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: D.muted, marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ width: 34, height: 20, borderRadius: 10, flexShrink: 0, background: active ? color : 'rgba(255,255,255,0.08)', position: 'relative', transition: 'all 0.15s', boxShadow: active ? `0 0 10px ${color}80` : 'none' }}>
          <div style={{ position: 'absolute', top: 2, left: active ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'all 0.15s' }} />
        </div>
      </button>
      {children}
    </div>
  )
}

// ── Class schedule section (restyled) ─────────────────────────────────────────
function ClassScheduleSection({ value, onChange }) {
  const [open, setOpen] = useState(!!value)
  const blank = { isDE: false, days: [], startTime: '09:00', endTime: '10:15', semesterStart: '', semesterEnd: '' }
  const cs = value ?? blank
  const set = (key, val) => onChange({ ...cs, [key]: val })
  const toggleDay = day => set('days', cs.days.includes(day) ? cs.days.filter(d => d !== day) : [...cs.days, day])

  return (
    <AddonToggle
      active={open}
      onToggle={() => { const next = !open; setOpen(next); if (!next) onChange(null); else if (!value) onChange(blank) }}
      icon="calendar" color={D.indigo}
      title="Add class schedule"
      subtitle="Sync to your calendar so you never miss a lecture"
      badge="Recommended"
    >
      {open && (
        <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* DE toggle */}
          <div>
            <Label>Attendance type</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {['In-Person', 'DE / Online'].map((label, i) => {
                const isActive = i === 0 ? !cs.isDE : cs.isDE
                return (
                  <button key={label} onClick={() => set('isDE', i === 1)} style={{
                    padding: '9px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    background: isActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? 'rgba(99,102,241,0.5)' : D.border}`,
                    color: isActive ? '#fff' : D.muted, transition: 'all 0.15s',
                  }}>{label}</button>
                )
              })}
            </div>
          </div>
          {/* Days */}
          <div>
            <Label>Meeting days</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {WEEK_DAYS.map(d => {
                const active = cs.days.includes(d)
                return (
                  <button key={d} onClick={() => toggleDay(d)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 7, cursor: 'pointer',
                    background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : D.border}`,
                    color: active ? '#fff' : D.muted, fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  }}>{d.slice(0, 1)}</button>
                )
              })}
            </div>
          </div>
          {/* Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><Label>Start</Label><input type="time" className="cv-input" value={cs.startTime} onChange={e => set('startTime', e.target.value)} /></div>
            <div><Label>End</Label><input type="time" className="cv-input" value={cs.endTime} onChange={e => set('endTime', e.target.value)} /></div>
          </div>
          {/* Semester dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><Label>First class date</Label><input type="date" className="cv-input" value={cs.semesterStart} onChange={e => set('semesterStart', e.target.value)} /></div>
            <div><Label>Last class date</Label><input type="date" className="cv-input" value={cs.semesterEnd} onChange={e => set('semesterEnd', e.target.value)} /></div>
          </div>
          {cs.days.length > 0 && cs.startTime && (
            <div style={{ fontSize: 11, color: D.muted, background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '8px 12px' }}>
              {cs.days.join(', ')} · {fmt12(cs.startTime)} – {fmt12(cs.endTime)}{cs.isDE ? ' · DE (not on calendar)' : ' · shown on calendar'}
            </div>
          )}
        </div>
      )}
    </AddonToggle>
  )
}

// ── Import band ───────────────────────────────────────────────────────────────
function ImportCard({ icon, color, eyebrow, title, desc, accept, onFile, gradient, secondary }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile?.(e.dataTransfer.files[0]) }}
      style={{
        position: 'relative', overflow: 'hidden',
        background: gradient,
        border: `1px solid ${drag ? color : color + '30'}`,
        borderRadius: 14, padding: 20, transition: 'all 0.2s',
        boxShadow: drag ? `0 0 0 3px ${color}15, 0 8px 24px ${color}25` : 'none',
      }}>
      <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, background: `radial-gradient(circle, ${color}20, transparent 70%)`, pointerEvents: 'none' }} />
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={e => e.target.files[0] && onFile?.(e.target.files[0])} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: `0 4px 14px ${color}60`, flexShrink: 0 }}>
          <Icon name={icon} size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color, opacity: 0.9, marginBottom: 4, textTransform: 'uppercase' }}>{eyebrow}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D.text, marginBottom: 5 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => inputRef.current?.click()} style={{ padding: '8px 14px', borderRadius: 8, background: `${color}18`, border: `1px solid ${color}40`, color: '#fff', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Icon name="upload" size={12} /> Choose file
            </button>
            {secondary && (
              <button style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <Icon name={secondary.icon} size={12} color={color} /> {secondary.label}
              </button>
            )}
            <div style={{ fontSize: 11, color: D.dim, alignSelf: 'center', marginLeft: 4 }}>or drag & drop</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImportBand({ onImportSyllabus }) {
  return (
    <div className="cv-import-band">
      <ImportCard
        icon="file" color="#6366f1" eyebrow="Quick Import"
        title="Import syllabus"
        desc="Drop a PDF or paste a link — we'll extract dates, weights, and topics."
        accept=".pdf,.docx,.png,.jpg"
        onFile={() => onImportSyllabus?.(null)}
        gradient="linear-gradient(155deg, rgba(99,102,241,0.14) 0%, rgba(99,102,241,0.04) 45%, #0a0a1e 100%)"
      />
      <ImportCard
        icon="calendar" color="#8b5cf6" eyebrow="Sync calendar"
        title="Import class schedule"
        desc="Connect Google Calendar or upload an .ics — we'll sync to your Schedule."
        accept=".ics"
        onFile={() => {}}
        gradient="linear-gradient(155deg, rgba(139,92,246,0.14) 0%, rgba(139,92,246,0.04) 45%, #0a0a1e 100%)"
        secondary={{ label: 'Connect Google Calendar', icon: 'sync' }}
      />
    </div>
  )
}

// ── Add course modal ──────────────────────────────────────────────────────────
function AddCoursePanel({ courseCount, onClose, onAdd }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [examDate, setExamDate] = useState('')
  const [difficulty, setDifficulty] = useState('Medium')
  const [targetGrade, setTargetGrade] = useState('A')
  const [color, setColor] = useState(COURSE_COLORS[courseCount % COURSE_COLORS.length])
  const [classSchedule, setClassSchedule] = useState(null)
  const [syllabusFile, setSyllabusFile] = useState(null)
  const [syllabusOpen, setSyllabusOpen] = useState(false)
  const syllabusRef = useRef(null)
  const [error, setError] = useState('')

  const handleAdd = () => {
    if (!name.trim()) { setError('Enter a course name'); return }
    if (examDate && examDate <= todayStr) { setError('Exam date must be in the future'); return }
    const colorObj = { name: 'custom', dot: color }
    const courseId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
    onAdd({ id: courseId, name: name.trim(), code: code.trim(), examDate, difficulty, targetGrade, color: colorObj, classSchedule: classSchedule || undefined })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(4,4,14,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px 20px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="cv-modal" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: 'linear-gradient(180deg, #0e0e24, #0a0a1e)', border: `1px solid ${D.borderStrong}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', background: 'linear-gradient(180deg, rgba(99,102,241,0.06), transparent)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${color}aa)`, boxShadow: `0 4px 14px ${color}50`, display: 'grid', placeItems: 'center', color: '#fff' }}>
            <Icon name="plus" size={16} />
          </div>
          <div style={{ marginLeft: 12, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: D.text }}>New course</div>
            <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>Add the basics — syllabus and schedule can come later.</div>
          </div>
          <button onClick={onClose} className="cv-icon-btn"><Icon name="x" size={13} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Code + Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
            <div>
              <Label>Code</Label>
              <input type="text" className="cv-input" placeholder="e.g. PSYC 101" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div>
              <Label>Course name <span style={{ color: D.orange }}>*</span></Label>
              <input type="text" className="cv-input" placeholder="e.g. Introduction to Psychology…" value={name} onChange={e => { setName(e.target.value); setError('') }} autoFocus />
            </div>
          </div>

          {/* Exam date */}
          <div>
            <Label>Exam / finals date <span style={{ color: D.dim, fontWeight: 400 }}>(optional)</span></Label>
            <input type="date" className="cv-input" value={examDate} min={todayStr} onChange={e => { setExamDate(e.target.value); setError('') }} />
          </div>

          {/* Color */}
          <div>
            <Label>Color</Label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COURSE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', boxShadow: color === c ? `0 0 0 2px ${c}, 0 0 12px ${c}80` : 'none', transition: 'all 0.15s', cursor: 'pointer' }} />
              ))}
            </div>
          </div>

          {/* Difficulty + target */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><Label>Difficulty</Label><SegmentedControl options={DIFFICULTY_LABELS} value={difficulty} onChange={setDifficulty} /></div>
            <div><Label>Target grade</Label><SegmentedControl options={GRADE_OPTIONS} value={targetGrade} onChange={setTargetGrade} /></div>
          </div>

          {/* Import syllabus */}
          <input ref={syllabusRef} type="file" accept=".pdf,.docx,.png,.jpg" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) setSyllabusFile(e.target.files[0]) }} />
          <AddonToggle
            active={syllabusOpen}
            onToggle={() => { setSyllabusOpen(x => !x); if (syllabusFile && syllabusOpen) setSyllabusFile(null) }}
            icon="file" color="#6366f1"
            title="Import syllabus"
            subtitle="Drop a PDF or paste a link — we'll extract dates, weights, and topics"
          >
            {syllabusOpen && (
              <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => syllabusRef.current?.click()} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: D.text, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <Icon name="upload" size={14} color={D.indigo} />
                  {syllabusFile ? syllabusFile.name : 'Choose file (PDF, DOCX, image)'}
                </button>
                <div style={{ fontSize: 11.5, color: D.dim }}>You can also import after adding the course from the Courses page.</div>
              </div>
            )}
          </AddonToggle>

          {/* Class schedule */}
          <ClassScheduleSection value={classSchedule} onChange={setClassSchedule} />

          {error && <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${D.border}`, display: 'flex', gap: 10, background: 'rgba(255,255,255,0.015)' }}>
          <button onClick={onClose} style={{ padding: '12px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleAdd} style={{ flex: 1, padding: '12px 22px', borderRadius: 10, background: name.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.04)', color: name.trim() ? '#fff' : D.dim, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: name.trim() ? '0 6px 20px rgba(99,102,241,0.35)' : 'none', cursor: name.trim() ? 'pointer' : 'not-allowed', border: 'none' }}>
            <Icon name="plus" size={13} /> Add course
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit course modal ─────────────────────────────────────────────────────────
function EditCoursePanel({ course, onClose, onSave }) {
  const [name, setName] = useState(course.name)
  const [code, setCode] = useState(course.code || '')
  const [examDate, setExamDate] = useState(course.examDate)
  const [difficulty, setDifficulty] = useState(course.difficulty)
  const [targetGrade, setTargetGrade] = useState(course.targetGrade)
  const [color, setColor] = useState(course.color?.dot || COURSE_COLORS[0])
  const [classSchedule, setClassSchedule] = useState(course.classSchedule ?? null)
  const [syllabusFile, setSyllabusFile] = useState(null)
  const [syllabusOpen, setSyllabusOpen] = useState(false)
  const syllabusRef = useRef(null)
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!name.trim()) { setError('Enter a course name'); return }
    const colorObj = { ...course.color, dot: color }
    onSave({ ...course, name: name.trim(), code: code.trim(), examDate, difficulty, targetGrade, color: colorObj, classSchedule: classSchedule || undefined })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(4,4,14,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px 20px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="cv-modal" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: 'linear-gradient(180deg, #0e0e24, #0a0a1e)', border: `1px solid ${D.borderStrong}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', background: 'linear-gradient(180deg, rgba(99,102,241,0.06), transparent)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${color}aa)`, boxShadow: `0 4px 14px ${color}50`, display: 'grid', placeItems: 'center', color: '#fff' }}>
            <Icon name="edit" size={14} />
          </div>
          <div style={{ marginLeft: 12, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: D.text }}>Edit course</div>
            <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>{clean(course.name)}</div>
          </div>
          <button onClick={onClose} className="cv-icon-btn"><Icon name="x" size={13} /></button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
            <div><Label>Code</Label><input type="text" className="cv-input" placeholder="e.g. PSYC 101" value={code} onChange={e => setCode(e.target.value)} /></div>
            <div>
              <Label>Course name <span style={{ color: D.orange }}>*</span></Label>
              <input type="text" className="cv-input" value={name} onChange={e => { setName(e.target.value); setError('') }} autoFocus />
            </div>
          </div>
          <div>
            <Label>Exam / finals date <span style={{ color: D.dim, fontWeight: 400 }}>(optional)</span></Label>
            <input type="date" className="cv-input" value={examDate} onChange={e => { setExamDate(e.target.value); setError('') }} />
          </div>
          <div>
            <Label>Color</Label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COURSE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', boxShadow: color === c ? `0 0 0 2px ${c}, 0 0 12px ${c}80` : 'none', transition: 'all 0.15s', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><Label>Difficulty</Label><SegmentedControl options={DIFFICULTY_LABELS} value={difficulty} onChange={setDifficulty} /></div>
            <div><Label>Target grade</Label><SegmentedControl options={GRADE_OPTIONS} value={targetGrade} onChange={setTargetGrade} /></div>
          </div>
          <input ref={syllabusRef} type="file" accept=".pdf,.docx,.png,.jpg" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) setSyllabusFile(e.target.files[0]) }} />
          <AddonToggle
            active={syllabusOpen}
            onToggle={() => { setSyllabusOpen(x => !x); if (syllabusFile && syllabusOpen) setSyllabusFile(null) }}
            icon="file" color="#6366f1"
            title="Import syllabus"
            subtitle="Drop a PDF or paste a link — we'll extract dates, weights, and topics"
          >
            {syllabusOpen && (
              <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => syllabusRef.current?.click()} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: D.text, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <Icon name="upload" size={14} color={D.indigo} />
                  {syllabusFile ? syllabusFile.name : 'Choose file (PDF, DOCX, image)'}
                </button>
                <div style={{ fontSize: 11.5, color: D.dim }}>You can also import after adding the course from the Courses page.</div>
              </div>
            )}
          </AddonToggle>
          <ClassScheduleSection value={classSchedule} onChange={setClassSchedule} />
          {error && <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 24px', borderTop: `1px solid ${D.border}`, display: 'flex', gap: 10, background: 'rgba(255,255,255,0.015)' }}>
          <button onClick={onClose} style={{ padding: '12px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ flex: 1, padding: '12px 22px', borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 6px 20px rgba(99,102,241,0.35)', cursor: 'pointer', border: 'none' }}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Expanded course content ───────────────────────────────────────────────────
function CourseExpanded({ course, idx, sessions, completedIds, syllabusEvts, grades, todayStr, threshold, onImportSyllabus, onOpenStudyCoach, onNavigateToGradeHub }) {
  const completed = sessions.filter(s => completedIds.has(s.id)).length
  const loggedGrades = grades.filter(g => g.loggedGrade !== null)
  const avgGrade = loggedGrades.length
    ? Math.round(loggedGrades.reduce((s, g) => s + g.loggedGrade * g.weight, 0) / loggedGrades.reduce((s, g) => s + g.weight, 0) * 10) / 10
    : null
  const color = course.color?.dot || D.accent

  return (
    <div className="cv-expanded" style={{ padding: '4px 20px 20px', borderTop: `1px solid ${D.border}` }}>
      {/* Generate study plan CTA */}
      {onOpenStudyCoach && (
        <button
          onClick={() => onOpenStudyCoach(idx)}
          style={{ width: '100%', padding: 14, background: `linear-gradient(135deg, ${color}14, ${color}08)`, border: `1px dashed ${color}40`, borderRadius: 10, marginTop: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon name="sparkles" size={14} /> Generate study plan <Icon name="arrow" size={12} />
        </button>
      )}

      {/* Upcoming sessions */}
      {sessions.length > 0 && (
        <Section title="Upcoming sessions" icon="clock" color={color}>
          {sessions.slice(0, 5).map(s => {
            const done = completedIds.has(s.id)
            const dateLabel = new Date(s.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderRadius: 9, opacity: done ? 0.45 : 1 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: D.text, fontWeight: 500, textDecoration: done ? 'line-through' : 'none' }}>{s.sessionType}</span>
                <span style={{ fontSize: 12, color: D.muted, fontFamily: 'ui-monospace, monospace' }}>{dateLabel}</span>
                <span style={{ fontSize: 11.5, color: D.dim, width: 44, textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{s.duration}m</span>
              </div>
            )
          })}
        </Section>
      )}

      {/* Syllabus events */}
      {syllabusEvts.length > 0 ? (
        <Section title="Syllabus events" icon="file" color={color} action={{ label: 'Re-import', icon: 'sync', onClick: () => onImportSyllabus?.(idx) }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {syllabusEvts.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderLeft: `3px solid ${typeColor(ev.type)}`, borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: D.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</div>
                  <div style={{ fontSize: 11, color: typeColor(ev.type), marginTop: 2, fontWeight: 500 }}>{ev.type}</div>
                </div>
                <div style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 5, background: ev.date ? 'rgba(99,102,241,0.1)' : 'rgba(244,114,182,0.08)', color: ev.date ? D.indigo : D.pink, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>
                  {ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Set date'}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <div style={{ padding: 20, borderRadius: 11, background: 'rgba(99,102,241,0.05)', border: '1px dashed rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(99,102,241,0.12)', display: 'grid', placeItems: 'center', color: D.indigo }}>
            <Icon name="file" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: D.text, marginBottom: 2 }}>No syllabus yet</div>
            <div style={{ fontSize: 12, color: D.muted }}>Import one and we'll pull in every date, weight, and deadline.</div>
          </div>
          <button onClick={() => onImportSyllabus?.(idx)} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: D.text, fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <Icon name="upload" size={12} /> Import syllabus
          </button>
        </div>
      )}

      {/* Grades */}
      <Section title="Grades" icon="award" color={color}>
        <div style={{ padding: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', gap: 12 }}>
          {grades.length === 0 ? (
            <>
              <div style={{ flex: 1, fontSize: 13, color: D.muted }}>No assignments logged. Head to Grade Hub to configure weights and log grades.</div>
              <button onClick={() => onNavigateToGradeHub?.()} style={{ padding: '7px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, color: D.text, fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Open Grade Hub <Icon name="arrow" size={11} />
              </button>
            </>
          ) : (
            <div style={{ width: '100%' }}>
              {avgGrade !== null && (
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 8 }}>
                  Current avg: <span style={{ fontWeight: 700, color: avgGrade >= threshold ? D.mint : avgGrade >= threshold - 10 ? D.amber : D.pink }}>{avgGrade}%</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grades.slice(0, 4).map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                    <span style={{ fontSize: 11, color: D.muted }}>{g.weight}%</span>
                    {g.loggedGrade !== null
                      ? <span style={{ fontWeight: 700, color: g.loggedGrade >= threshold ? D.mint : g.loggedGrade >= threshold - 10 ? D.amber : D.pink, minWidth: 40, textAlign: 'right' }}>{g.loggedGrade}%</span>
                      : <span style={{ fontSize: 11, color: D.dim, minWidth: 40, textAlign: 'right' }}>—</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

// ── Course row ────────────────────────────────────────────────────────────────
function CourseRow({ course, idx, expanded, onToggle, sessions, completedIds, syllabusEvts, grades, todayStr, threshold, onImportSyllabus, onOpenStudyCoach, onEdit, onDelete, onNavigateToGradeHub }) {
  const color = course.color?.dot || D.accent
  const completed = sessions.filter(s => completedIds.has(s.id)).length
  const pct = sessions.length ? Math.round((completed / sessions.length) * 100) : 0
  const daysLeft = Math.round((new Date(course.examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const displayName = course.code ? `${course.code} — ${course.name}` : course.name

  return (
    <div className="cv-row" style={{ border: `1px solid ${expanded ? color + '40' : D.border}` }}>
      {/* Header row */}
      <div onClick={onToggle} style={{ width: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
        {/* Color bar */}
        <div style={{ width: 4, height: 40, borderRadius: 4, background: `linear-gradient(180deg, ${color}, ${color}cc)`, boxShadow: `0 0 10px ${color}80`, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: D.text, marginBottom: 4 }}>{clean(displayName)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: D.muted, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', color: daysLeft <= 3 ? D.orange : D.muted }}>{daysLeft > 0 ? `${daysLeft}d to exam` : 'Exam passed'}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: D.dim }} />
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{completed}/{sessions.length} sessions</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: D.dim }} />
            <span>Target: <span style={{ fontFamily: 'ui-monospace, monospace', color: D.mint, fontWeight: 600 }}>{course.targetGrade}</span></span>
            {course.classSchedule?.days?.length > 0 && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: D.dim }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="clock" size={11} /> {course.classSchedule.days.join('')} {fmt12(course.classSchedule.startTime)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <ProgressRing value={pct} color={color} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="cv-icon-btn" onClick={e => { e.stopPropagation(); onEdit() }}><Icon name="edit" size={13} /></button>
            <button className="cv-icon-btn danger" onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}><Icon name="trash" size={13} /></button>
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', background: expanded ? `${color}18` : 'rgba(255,255,255,0.03)', border: expanded ? `1px solid ${color}40` : `1px solid ${D.border}`, color: expanded ? color : D.muted, transition: 'all 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            <Icon name="chevron" size={14} />
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={{ borderTop: '1px solid rgba(244,114,182,0.2)', background: 'rgba(244,114,182,0.04)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#fca5a5' }}>Delete <strong>{clean(course.name)}</strong>? This can't be undone.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, color: D.muted, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', background: 'none' }}>Cancel</button>
            <button onClick={() => { onDelete(); setConfirmDelete(false) }} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#dc2626', borderRadius: 8, cursor: 'pointer', border: 'none' }}>Delete</button>
          </div>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <CourseExpanded
          course={course} idx={idx} sessions={sessions} completedIds={completedIds}
          syllabusEvts={syllabusEvts} grades={grades} todayStr={todayStr} threshold={threshold}
          onImportSyllabus={onImportSyllabus} onOpenStudyCoach={onOpenStudyCoach}
          onNavigateToGradeHub={onNavigateToGradeHub}
        />
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CoursesView({
  courses,
  allSessions,
  syllabusEventsByDate,
  completedIds,
  assignments,
  onLogGrade,
  onImportSyllabus,
  onAddCourse,
  onEditCourse,
  onDeleteCourse,
  onShowPaywall,
  onOpenStudyCoach,
  onNavigateToGradeHub,
}) {
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [editingIdx, setEditingIdx] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  const plan = getActivePlan()
  const { courses: courseLimit } = getPlanLimits()
  const atLimit = !canAddCourse(courses.length)
  const limitLabel = courseLimit === Infinity ? null : `${courses.length} / ${courseLimit} courses`

  const todayStr = new Date().toISOString().split('T')[0]

  const syllabusForCourse = useMemo(() => {
    const map = {}
    Object.values(syllabusEventsByDate).flat().forEach(e => {
      if (e.courseIdx !== null && e.courseIdx !== undefined) {
        if (!map[e.courseIdx]) map[e.courseIdx] = []
        map[e.courseIdx].push(e)
      }
    })
    return map
  }, [syllabusEventsByDate])

  const sessionsByCourse = useMemo(() => {
    const map = {}
    courses.forEach((_, i) => {
      map[i] = allSessions.filter(s => s.courseId === i).sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    })
    return map
  }, [courses, allSessions])

  const gradesByCourse = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      if (!map[a.courseIdx]) map[a.courseIdx] = []
      map[a.courseIdx].push(a)
    })
    return map
  }, [assignments])

  const flashToast = (msg, color = D.mint) => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2600)
  }

  const handleAddCourse = (course) => {
    onAddCourse?.(course)
    flashToast(`${course.name} added`)
  }

  const filtered = courses.filter((c, i) =>
    (c.name + (c.code || '')).toLowerCase().includes(search.toLowerCase())
  )

  const totalSessions = courses.reduce((a, _, i) => a + (sessionsByCourse[i]?.length || 0), 0)

  return (
    <>
      <style>{COURSES_STYLE}</style>

      <div className="cv-header-pad" style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.5px', color: D.accent, textTransform: 'uppercase' }}>Academic Control</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: D.dim }} />
            <span style={{ fontSize: 11.5, color: D.dim }}>Spring 2026 · {courses.length} course{courses.length !== 1 ? 's' : ''} tracked{limitLabel ? ` (${limitLabel})` : ''}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: -0.8, color: D.text }}>Courses</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: D.muted, maxWidth: 640 }}>
            Organize every class — pull in syllabi, schedules, and let the AI map your semester.
          </p>
        </div>
        <button
          onClick={() => { if (atLimit) { onShowPaywall?.('courses'); return } setShowAddPanel(true) }}
          style={{ padding: '11px 18px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: '0 6px 20px rgba(99,102,241,0.35)', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="plus" size={14} /> {atLimit ? 'Upgrade to Add' : 'Add Course'}
        </button>
      </div>

      <div className="cv-page-pad" style={{ padding: '24px 32px 48px' }}>
        {courses.length === 0 && (
          <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 22 }}>
            <svg style={{ width: 20, height: 20, color: D.amber, flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div>
              <p style={{ margin: 0, color: D.amber, fontWeight: 700, fontSize: 14 }}>Courses are required to use StudyEdge</p>
              <p style={{ margin: '4px 0 0', color: `${D.amber}99`, fontSize: 12 }}>Add each course you're taking this semester. Then import your syllabi to unlock your study schedule, deadlines, and AI tools.</p>
            </div>
          </div>
        )}

        <ImportBand onImportSyllabus={onImportSyllabus} />

        {/* Search + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: '0 1 320px' }}>
            <input type="text" placeholder="Search courses…" value={search} onChange={e => setSearch(e.target.value)} className="cv-input" style={{ paddingLeft: 34 }} />
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: D.dim, pointerEvents: 'none' }}>
              <Icon name="search" size={14} />
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11.5, color: D.dim, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span><span style={{ fontFamily: 'ui-monospace, monospace', color: D.text, fontWeight: 600 }}>{courses.length}</span> courses</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: D.dim }} />
            <span><span style={{ fontFamily: 'ui-monospace, monospace', color: D.mint, fontWeight: 600 }}>{totalSessions}</span> sessions planned</span>
          </div>
        </div>

        {/* Course list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((course, filteredI) => {
            const idx = courses.indexOf(course)
            const sessions = sessionsByCourse[idx] ?? []
            const syllabusEvts = syllabusForCourse[idx] ?? []
            const grades = gradesByCourse[idx] ?? []
            const threshold = TARGET_THRESHOLDS[course.targetGrade] ?? 80
            return (
              <CourseRow
                key={idx}
                course={course} idx={idx}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                sessions={sessions} completedIds={completedIds}
                syllabusEvts={syllabusEvts} grades={grades}
                todayStr={todayStr} threshold={threshold}
                onImportSyllabus={onImportSyllabus}
                onOpenStudyCoach={onOpenStudyCoach}
                onEdit={() => setEditingIdx(idx)}
                onDelete={() => { onDeleteCourse?.(idx); if (expandedIdx === idx) setExpandedIdx(null) }}
                onNavigateToGradeHub={onNavigateToGradeHub}
              />
            )
          })}
          {filtered.length === 0 && search && (
            <div style={{ padding: 40, textAlign: 'center', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14 }}>
              <div style={{ fontSize: 14, color: D.muted }}>No courses match "{search}"</div>
            </div>
          )}
        </div>
      </div>

      {showAddPanel && (
        <AddCoursePanel
          courseCount={courses.length}
          onClose={() => setShowAddPanel(false)}
          onAdd={handleAddCourse}
        />
      )}

      {editingIdx !== null && courses[editingIdx] && (
        <EditCoursePanel
          course={courses[editingIdx]}
          onClose={() => setEditingIdx(null)}
          onSave={(updated) => { onEditCourse?.(editingIdx, updated); setEditingIdx(null) }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '12px 18px', borderRadius: 12, background: 'linear-gradient(180deg, #101028, #0b0b20)', border: `1px solid ${toast.color}40`, boxShadow: `0 8px 30px rgba(0,0,0,0.5), 0 0 20px ${toast.color}20`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, color: D.text, animation: 'cv-slideIn 0.2s', whiteSpace: 'nowrap' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: toast.color, boxShadow: `0 0 8px ${toast.color}` }} />
          {toast.msg}
        </div>
      )}
    </>
  )
}
