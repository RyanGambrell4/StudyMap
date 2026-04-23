import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { getActivePlan, canUseAI, incrementAIQuery } from '../lib/subscription'
import { clean } from '../utils/strings'
import { getAccessToken } from '../lib/supabase'
import { saveCoachPlanStruggles, getCachedCoachPlan } from '../lib/db'
import {
  TARGET_OPTIONS, letterGrade, gradeStatus,
  getCurrentGrade, getProjectedGrade, getNeededOnRemaining,
  getDefenseFloor, generateScenarioPaths,
} from '../utils/gradeCalc'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:        '#060614',
  bgCard:    '#0a0a1e',
  border:    'rgba(255,255,255,0.06)',
  borderStr: 'rgba(255,255,255,0.10)',
  text:      '#e8e8f0',
  muted:     '#8888a0',
  dim:       '#55556e',
  accent:    '#6366f1',
  glow:      'rgba(99,102,241,0.35)',
  indigo:    '#818CF8',
  violet:    '#8b5cf6',
  mint:      '#34d399',
  orange:    '#F97316',
  sky:       '#38BDF8',
  pink:      '#F472B6',
  amber:     '#fbbf24',
}

const PATH_COLORS = [D.sky, D.violet, D.orange]
const PATH_ICONS  = ['↗', '⚡', '🛡']

function uid() { return Math.random().toString(36).slice(2, 10) }
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

function letterColor(ltr) {
  if (!ltr || ltr === '-') return D.muted
  if (ltr.startsWith('A')) return D.mint
  if (ltr.startsWith('B')) return D.sky
  if (ltr.startsWith('C')) return D.amber
  if (ltr.startsWith('D')) return D.orange
  return D.pink
}

function getCurrentSemester() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  if (month >= 1 && month <= 5) return `Spring ${year}`
  if (month >= 6 && month <= 8) return `Summer ${year}`
  return `Fall ${year}`
}

function daysTo(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr + 'T12:00:00') - new Date(new Date().toISOString().split('T')[0] + 'T12:00:00')) / 86400000)
}

function computeGPA(courses) {
  const pts = { 'A+': 4.0, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0 }
  const vals = courses.map(c => {
    const g = getCurrentGrade(c.gradeData?.components ?? [])
    return g !== null ? (pts[letterGrade(g)] ?? null) : null
  }).filter(v => v !== null)
  if (!vals.length) return null
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
}

// Inject range + input styles once
const GH_STYLE = `
body{overflow-x:hidden!important;}
*{box-sizing:border-box;}
.gh-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;background:rgba(255,255,255,0.06);outline:none;position:relative;}
.gh-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#6366f1;cursor:pointer;border:2px solid #0a0a1e;box-shadow:0 0 0 1px #818CF8,0 2px 8px rgba(99,102,241,0.35);}
.gh-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#6366f1;cursor:pointer;border:2px solid #0a0a1e;}
.gh-range:disabled{opacity:0.5;cursor:default;}
.gh-input{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#e8e8f0;border-radius:7px;padding:7px 10px;font-size:13px;outline:none;transition:border 0.15s;font-family:inherit;box-sizing:border-box;}
.gh-input:focus{border-color:rgba(99,102,241,0.5);}
.gh-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.gh-input::placeholder{color:#55556e;}
.gh-input:disabled{opacity:0.4;}
.gh-input-text{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#e8e8f0;border-radius:7px;padding:7px 10px;font-size:13px;outline:none;transition:border 0.15s;font-family:inherit;box-sizing:border-box;}
.gh-input-text:focus{border-color:rgba(99,102,241,0.5);}
.gh-input-text::placeholder{color:#55556e;}
.gh-grade-row-inner{display:contents;}
@media(max-width:900px){.gh-grid{grid-template-columns:1fr!important;}.gh-rail{position:static!important;}}
@media(max-width:640px){.gh-plan-row{display:flex!important;flex-direction:column!important;gap:8px!important;padding:12px 0!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;min-width:0!important;width:100%!important;}.gh-plan-row-header{display:none!important;}.gh-grade-row-inner{display:grid!important;grid-template-columns:64px 1fr 60px 24px!important;gap:8px!important;align-items:center!important;min-width:0!important;width:100%!important;}.gh-table-wrap{overflow-x:hidden!important;}.gh-plan-content{overflow-x:hidden!important;max-width:100%!important;}.gh-plan-callout{overflow:hidden!important;}.gh-header{padding:16px 14px 14px!important;}.gh-content{padding:14px 14px 48px!important;overflow-x:hidden!important;max-width:100%!important;}.gh-tab-btn{padding:9px 8px!important;font-size:12px!important;gap:5px!important;}.gh-scenarios-grid{grid-template-columns:1fr!important;}.gh-compare-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;}.gh-bottom-bar{flex-wrap:wrap!important;gap:8px!important;}.gh-course-strip{flex-wrap:nowrap!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;padding-bottom:6px!important;}}
`

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcoSparkles() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg> }
function IcoPlus()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg> }
function IcoX()        { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6"/></svg> }
function IcoLock()     { return <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg> }
function IcoShield()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/></svg> }
function IcoCheck()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg> }
function IcoPlan()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 10h8M8 14h5"/></svg> }
function IcoTrack()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg> }
function IcoBeaker()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3M9 3h6M8 14h8"/></svg> }
function IcoCalendar() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg> }
function IcoArrow()    { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg> }

// ── Locked state ──────────────────────────────────────────────────────────────
function LockedState({ onShowPaywall }) {
  return (
    <div style={{ padding: '60px 32px', textAlign: 'center' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
        background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
        display: 'grid', placeItems: 'center', color: D.indigo,
      }}>
        <IcoShield />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: D.text, marginBottom: 8 }}>Grade Hub · Pro Feature</div>
      <p style={{ fontSize: 13.5, color: D.muted, maxWidth: 320, margin: '0 auto 20px', lineHeight: 1.55 }}>
        Advanced grade planning, live tracking, and what-if scenario modeling require a Pro or Unlimited plan.
      </p>
      <button
        onClick={() => onShowPaywall?.('grades')}
        style={{ padding: '11px 26px', background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`, borderRadius: 10, color: '#fff', fontSize: 13.5, fontWeight: 600, boxShadow: `0 6px 20px ${D.glow}` }}
      >
        Upgrade to Pro
      </button>
    </div>
  )
}

// ── Course pill card ──────────────────────────────────────────────────────────
function CourseCard({ course, active, onClick }) {
  const dot   = course.color?.dot ?? D.accent
  const comps = course.gradeData?.components ?? []
  const curr  = getCurrentGrade(comps)
  const ltr   = curr !== null ? letterGrade(curr) : null
  const days  = daysTo(course.examDate)
  const name  = clean(course.name)
  const shortName = name.length > 18 ? name.slice(0, 16) + '…' : name

  return (
    <button onClick={onClick} style={{
      flex: '1 1 0', minWidth: 0, padding: 14, textAlign: 'left',
      background: active ? `linear-gradient(155deg, ${dot}20, ${dot}08 50%, ${D.bgCard})` : D.bgCard,
      border: active ? `1px solid ${dot}55` : `1px solid ${D.border}`,
      borderRadius: 12, cursor: 'pointer',
      boxShadow: active ? `0 0 0 3px ${dot}15, 0 8px 24px ${dot}15` : 'none',
      transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
    }}>
      {active && <div style={{ position: 'absolute', top: -30, right: -30, width: 110, height: 110, background: `radial-gradient(circle, ${dot}25, transparent 70%)`, pointerEvents: 'none' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}90`, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortName}
        </span>
      </div>
      {curr !== null ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: `${letterColor(ltr)}15`, border: `1px solid ${letterColor(ltr)}35`, color: letterColor(ltr), marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{curr.toFixed(1)}%</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 600 }}>{ltr}</span>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: D.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          Set up <IcoArrow />
        </div>
      )}
      {days !== null && (
        <div style={{ fontSize: 10.5, color: D.dim, fontFamily: 'ui-monospace, monospace' }}>
          {days > 0 ? `${days}d to exam` : days === 0 ? 'Exam today' : 'Exam passed'}
        </div>
      )}
    </button>
  )
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
function Tabs({ active, onChange }) {
  const tabs = [
    { id: 'plan',    label: 'Plan',    Icon: IcoPlan    },
    { id: 'track',   label: 'Track',   Icon: IcoTrack   },
    { id: 'sandbox', label: 'Sandbox', Icon: IcoBeaker  },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderRadius: 12, padding: 4 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className="gh-tab-btn" style={{
          padding: '11px 14px', borderRadius: 9,
          background: active === t.id ? 'rgba(99,102,241,0.15)' : 'transparent',
          border: active === t.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
          color: active === t.id ? D.text : D.muted,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, fontWeight: active === t.id ? 600 : 500,
          cursor: 'pointer', transition: 'all 0.15s',
        }}>
          <t.Icon /> {t.label}
        </button>
      ))}
    </div>
  )
}

// ── PathCard ──────────────────────────────────────────────────────────────────
function PathCard({ color, icon, title, desc, rows }) {
  return (
    <div style={{ padding: 14, borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderTop: `2px solid ${color}`, minWidth: 0, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${color}18`, color, display: 'grid', placeItems: 'center', fontSize: 13 }}>{icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: D.text }}>{title}</div>
      </div>
      <div style={{ fontSize: 11.5, color: D.muted, marginBottom: 12, lineHeight: 1.4 }}>{desc}</div>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0' }}>
          <span style={{ color: D.dim }}>{k}</span>
          <span style={{ color, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ── PLAN TAB ──────────────────────────────────────────────────────────────────
function PlanTab({ course, gradeData, dot, onSave }) {
  const saved = gradeData ?? {}
  const [rows, setRows] = useState(() =>
    saved.components?.length
      ? saved.components.map(c => ({ ...c, weight: String(c.weight), grade: c.grade !== null ? String(c.grade) : '' }))
      : [{ id: uid(), component: '', weight: '', grade: '', graded: false }]
  )
  const [targetGrade, setTargetGrade] = useState(saved.targetGrade ?? 85)
  const [showPlan, setShowPlan] = useState(!!(saved.components?.length))

  const totalWeight  = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0)
  const weightOk     = Math.abs(totalWeight - 100) < 0.5
  const canSave      = rows.every(r => r.component.trim() && parseFloat(r.weight) > 0) && weightOk

  const addRow    = () => setRows(p => [...p, { id: uid(), component: '', weight: '', grade: '', graded: false }])
  const removeRow = i  => setRows(p => p.filter((_, j) => j !== i))
  const setRow    = (i, f, v) => setRows(p => p.map((r, j) => j === i ? { ...r, [f]: v } : r))

  const handleSave = () => {
    if (!canSave) return
    const components = rows.map(r => ({
      id: r.id || uid(),
      component: r.component.trim(),
      weight: parseFloat(r.weight),
      grade: r.graded && r.grade !== '' ? parseFloat(r.grade) : null,
      graded: r.graded && r.grade !== '',
    }))
    onSave({ ...(gradeData ?? {}), components, targetGrade, scenarios: gradeData?.scenarios ?? [] })
    setShowPlan(true)
  }

  const savedComps   = gradeData?.components ?? []
  const neededInfo   = showPlan && savedComps.length ? getNeededOnRemaining(savedComps, targetGrade) : null
  const scenarioPaths = showPlan && savedComps.length ? generateScenarioPaths(savedComps, targetGrade) : []
  const ungraded     = savedComps.filter(c => !c.graded || c.grade === null)
  const targetLabel  = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'A'

  return (
    <div className="gh-plan-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Components table */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, rowGap: 8, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: D.text }}>Grade components</div>
            <div style={{ fontSize: 12, color: D.dim, marginTop: 2 }}>Define how this course is graded</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 999, background: totalWeight === 100 ? 'rgba(52,211,153,0.1)' : 'rgba(249,115,22,0.1)', border: `1px solid ${totalWeight === 100 ? 'rgba(52,211,153,0.3)' : 'rgba(249,115,22,0.3)'}`, flexShrink: 0, marginLeft: 'auto' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: totalWeight === 100 ? D.mint : D.orange }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: totalWeight === 100 ? D.mint : D.orange, fontFamily: 'ui-monospace, monospace' }}>{totalWeight.toFixed(0)}% / 100%</span>
          </div>
        </div>

        <div className="gh-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {/* Header row */}
          <div className="gh-plan-row gh-plan-row-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) 80px 100px 80px 28px', gap: 8, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, color: D.dim, textTransform: 'uppercase', padding: '0 4px 10px', minWidth: 400 }}>
            <span>Component</span><span>Weight</span><span>Status</span><span>Grade</span><span />
          </div>

          {rows.map((row, i) => (
            <div key={row.id} className="gh-plan-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) 80px 100px 80px 28px', gap: 8, alignItems: 'center', padding: '6px 0', minWidth: 400 }}>
              <input className="gh-input-text" type="text" value={row.component} onChange={e => setRow(i, 'component', e.target.value)} placeholder="e.g. Midterm" style={{ width: '100%' }} />
              <div className="gh-grade-row-inner">
                <div style={{ position: 'relative' }}>
                  <input className="gh-input" type="number" value={row.weight} onChange={e => setRow(i, 'weight', e.target.value)} style={{ width: '100%', paddingRight: 26 }} />
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: D.dim, pointerEvents: 'none' }}>%</span>
                </div>
                <button onClick={() => setRow(i, 'graded', !row.graded)} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer', background: row.graded ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', border: row.graded ? '1px solid rgba(99,102,241,0.35)' : `1px solid ${D.border}`, color: row.graded ? D.indigo : D.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  {row.graded && <span style={{ width: 5, height: 5, borderRadius: '50%', background: D.indigo }} />}
                  {row.graded ? 'Graded' : 'Not yet'}
                </button>
                <input className="gh-input" type="number" value={row.grade} placeholder="-" onChange={e => setRow(i, 'grade', e.target.value)} disabled={!row.graded} style={{ width: '100%', opacity: row.graded ? 1 : 0.4 }} />
                <button onClick={() => removeRow(i)} style={{ width: 28, height: 28, borderRadius: 6, color: D.dim, display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,114,182,0.1)'; e.currentTarget.style.color = D.pink }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = D.dim }}>
                  <IcoX />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addRow} style={{ marginTop: 8, padding: '8px 0', width: '100%', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: D.indigo, fontWeight: 500, cursor: 'pointer' }}>
          <IcoPlus /> Add component
        </button>
      </div>

      {/* Target grade */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 12 }}>Target grade</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TARGET_OPTIONS.map(opt => {
            const isActive = targetGrade === opt.value
            const c = letterColor(opt.label)
            return (
              <button key={opt.label} onClick={() => setTargetGrade(opt.value)} style={{ width: 44, height: 44, borderRadius: 10, cursor: 'pointer', background: isActive ? `linear-gradient(135deg, ${D.accent}, ${D.violet})` : 'rgba(255,255,255,0.03)', border: isActive ? '1px solid rgba(139,92,246,0.5)' : `1px solid ${c}30`, color: isActive ? '#fff' : c, fontSize: 14, fontWeight: 700, boxShadow: isActive ? '0 0 16px rgba(99,102,241,0.4)' : 'none', transition: 'all 0.15s' }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Save CTA */}
      <button onClick={handleSave} disabled={!canSave} style={{ padding: '14px 20px', background: canSave ? `linear-gradient(135deg, ${D.accent}, ${D.violet})` : 'rgba(255,255,255,0.05)', borderRadius: 12, color: canSave ? '#fff' : D.muted, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: canSave ? `0 8px 24px ${D.glow}` : 'none', cursor: canSave ? 'pointer' : 'default', transition: 'all 0.2s' }}>
        <IcoSparkles /> Save &amp; generate plan
      </button>

      {/* Required avg callout */}
      {showPlan && savedComps.length > 0 && neededInfo && (
        <div className="gh-plan-callout" style={{ background: 'linear-gradient(155deg, rgba(99,102,241,0.14), rgba(99,102,241,0.04) 45%, #0a0a1e)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 14, padding: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: `0 0 12px ${D.glow}`, flexShrink: 0 }}>
              <IcoSparkles />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', wordBreak: 'break-word' }}>To hit {targetLabel}, here's what you need</div>
              <div style={{ fontSize: 13, color: D.text, marginTop: 3, wordBreak: 'break-word' }}>
                You need an average of <span style={{ color: D.indigo, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{neededInfo.needed != null ? neededInfo.needed.toFixed(1) + '%' : '-'}</span> on remaining work
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', marginBottom: 14 }}>
            {ungraded.map(c => (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderRadius: 9 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: D.text }}>{c.component || 'Untitled'}</div>
                  <div style={{ fontSize: 11, color: D.dim, marginTop: 1 }}>Worth <span style={{ fontFamily: 'ui-monospace, monospace' }}>{c.weight}%</span> of final grade</div>
                </div>
                <div style={{ padding: '5px 11px', borderRadius: 999, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: D.mint, fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                  {neededInfo.needed != null ? neededInfo.needed.toFixed(1) + '%' : '-'}
                </div>
              </div>
            ))}
          </div>

          {neededInfo.bufferPts > 0 && !neededInfo.impossible && (
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', position: 'relative' }}>
              <div style={{ fontSize: 12.5, color: D.text, marginBottom: 8, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                You have a <span style={{ color: D.violet, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{neededInfo.bufferPts.toFixed(1)}-point</span> buffer on remaining work. Spend it wisely.
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, neededInfo.bufferPts)}%`, height: '100%', background: `linear-gradient(90deg, ${D.accent}, ${D.violet})`, boxShadow: `0 0 8px ${D.glow}` }} />
              </div>
            </div>
          )}

          {neededInfo.impossible && (
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(244,114,182,0.08)', border: `1px solid ${D.pink}30` }}>
              <div style={{ fontSize: 12.5, color: D.pink }}>Target is no longer mathematically achievable. Consider adjusting your target grade.</div>
            </div>
          )}
        </div>
      )}

      {/* Three paths */}
      {showPlan && scenarioPaths.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 12 }}>Three paths to {targetLabel}</div>
          <div className="gh-scenarios-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {scenarioPaths.filter(p => p.possible !== false).slice(0, 3).map((path, pi) => (
              <PathCard
                key={path.name}
                color={PATH_COLORS[pi]}
                icon={PATH_ICONS[pi]}
                title={path.name}
                desc={path.description}
                rows={ungraded.map(c => [c.component, (path.scores[c.id]?.toFixed(0) ?? '-') + '%'])}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TRACK TAB ─────────────────────────────────────────────────────────────────
function TrackTab({ course, gradeData, dot, onSave }) {
  const components  = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 85
  const [defenseMode, setDefenseMode] = useState(false)

  const [localGrades, setLocalGrades] = useState(() => {
    const m = {}
    components.forEach(c => { m[c.id] = c.grade !== null && c.grade !== undefined ? String(c.grade) : '' })
    return m
  })
  const [localGraded, setLocalGraded] = useState(() => {
    const m = {}
    components.forEach(c => { m[c.id] = c.graded ?? false })
    return m
  })

  const saveTimer = useRef(null)
  const autoSave = useCallback((grades, graded) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const updated = components.map(c => ({ ...c, grade: graded[c.id] && grades[c.id] !== '' ? parseFloat(grades[c.id]) : null, graded: graded[c.id] && grades[c.id] !== '' }))
      onSave({ ...gradeData, components: updated })
    }, 600)
  }, [components, gradeData, onSave])

  const setGrade     = (id, val) => { const g = { ...localGrades, [id]: val }; setLocalGrades(g); autoSave(g, localGraded) }
  const toggleGraded = (id)      => { const g = { ...localGraded, [id]: !localGraded[id] }; setLocalGraded(g); autoSave(localGrades, g) }

  const liveComponents = useMemo(() =>
    components.map(c => ({ ...c, grade: localGraded[c.id] && localGrades[c.id] !== '' ? parseFloat(localGrades[c.id]) : null, graded: localGraded[c.id] && localGrades[c.id] !== '' })),
    [components, localGrades, localGraded]
  )

  const currentGrade = getCurrentGrade(liveComponents)
  const needed       = getNeededOnRemaining(liveComponents, targetGrade)
  const defense      = defenseMode ? getDefenseFloor(liveComponents, currentGrade) : null
  const gradedWeight = liveComponents.filter(c => c.graded).reduce((s, c) => s + c.weight, 0)
  const totalWeight  = liveComponents.reduce((s, c) => s + c.weight, 0)
  const pctGraded    = totalWeight > 0 ? (gradedWeight / totalWeight) * 100 : 0
  const targetLabel  = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'A'
  const ltr          = letterGrade(currentGrade)
  const lc           = letterColor(ltr)

  if (!components.length) return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <p style={{ color: D.muted, fontSize: 13 }}>Set up your grade components in the Plan tab first.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(155deg, ${lc}1a, ${lc}05 40%, ${D.bgCard})`, border: `1px solid ${lc}30`, borderRadius: 14, padding: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, background: `radial-gradient(circle, ${lc}25, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', position: 'relative' }}>
          <div style={{ flex: '1 1 auto', minWidth: 200 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 8 }}>Current grade</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1, background: `linear-gradient(135deg, ${lc}, ${lc}cc)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'ui-monospace, monospace' }}>
                {currentGrade !== null ? currentGrade.toFixed(1) : '-'}
              </span>
              <span style={{ fontSize: 22, fontWeight: 500, color: D.muted }}>%</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: lc, marginLeft: 8 }}>{ltr}</span>
            </div>
          </div>
          {needed.impossible ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.3)', color: D.pink, fontSize: 13, fontWeight: 600 }}>
              ✕ Target no longer reachable
            </div>
          ) : needed.needed !== null && needed.needed > 90 ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: D.orange, fontSize: 13, fontWeight: 600 }}>
              ⚡ Possible but tough, need {needed.needed.toFixed(0)}%+ avg
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: D.mint, fontSize: 13, fontWeight: 600 }}>
              <IcoCheck /> On track for {targetLabel}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: D.dim, marginBottom: 8 }}>
            <span><span style={{ color: D.text, fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}>{pctGraded.toFixed(0)}%</span> of grade graded</span>
            <span><span style={{ color: D.text, fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}>{(100 - pctGraded).toFixed(0)}%</span> remaining</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pctGraded}%`, height: '100%', background: `linear-gradient(90deg, ${D.accent}, ${lc})`, boxShadow: `0 0 10px ${lc}60`, transition: 'width 0.4s' }} />
          </div>
        </div>

        <div style={{ marginTop: 16, position: 'relative' }}>
          <button onClick={() => setDefenseMode(v => !v)} style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, cursor: 'pointer', background: defenseMode ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)', border: defenseMode ? `1px solid ${D.amber}40` : `1px solid ${D.border}`, color: defenseMode ? D.amber : D.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoShield /> Grade Defense Mode {defenseMode ? 'ON' : 'OFF'}
          </button>
          {defenseMode && defense && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: `rgba(251,191,36,0.08)`, border: `1px solid ${D.amber}30` }}>
              {defense.impossible
                ? <p style={{ fontSize: 12.5, color: D.amber }}>Score is already locked in. No remaining work can change it.</p>
                : <p style={{ fontSize: 12.5, color: D.amber }}>To keep your <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{currentGrade?.toFixed(1)}%</span>, score at least <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 16 }}>{defense.floor?.toFixed(1)}%</span> on all remaining work.</p>
              }
            </div>
          )}
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 14 }}>Grade breakdown</div>
        {liveComponents.map((c, i) => {
          const contrib = c.graded && c.grade !== null ? (c.grade * c.weight / (totalWeight || 100)) : null
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', padding: '14px 0', borderBottom: i < liveComponents.length - 1 ? `1px solid ${D.border}` : 'none' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: D.text }}>{c.component}</div>
                <div style={{ fontSize: 11.5, color: D.dim, marginTop: 2 }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{c.weight}%</span> weight
                  {contrib != null && <> · contributes <span style={{ color: D.indigo, fontFamily: 'ui-monospace, monospace' }}>{contrib.toFixed(1)}%</span> to final</>}
                </div>
              </div>
              <button onClick={() => toggleGraded(c.id)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: localGraded[c.id] ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', border: localGraded[c.id] ? '1px solid rgba(99,102,241,0.3)' : `1px solid ${D.border}`, color: localGraded[c.id] ? D.indigo : D.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {localGraded[c.id] && <span style={{ width: 5, height: 5, borderRadius: '50%', background: D.indigo }} />}
                {localGraded[c.id] ? 'Graded' : 'Pending'}
              </button>
              <input type="number" value={localGrades[c.id]} onChange={e => setGrade(c.id, e.target.value)} placeholder="-" className="gh-input"
                style={{ width: 66, textAlign: 'center', color: c.grade != null ? letterColor(letterGrade(parseFloat(localGrades[c.id]))) : D.dim }} />
            </div>
          )
        })}
      </div>

      {/* What you need */}
      {needed.needed !== null && !defenseMode && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto', minWidth: 200 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 8 }}>What you need on remaining work</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.8, fontFamily: 'ui-monospace, monospace', color: needed.impossible ? D.pink : needed.needed > 90 ? D.orange : D.indigo }}>
                {needed.impossible ? '100+%' : needed.needed.toFixed(1) + '%'}
              </span>
              <span style={{ fontSize: 13, color: D.muted }}>avg to hit {targetLabel}</span>
            </div>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: 999, background: needed.impossible ? `rgba(244,114,182,0.12)` : 'rgba(52,211,153,0.12)', border: `1px solid ${needed.impossible ? D.pink + '30' : 'rgba(52,211,153,0.3)'}`, color: needed.impossible ? D.pink : D.mint, fontSize: 12, fontWeight: 600 }}>
            {needed.impossible ? 'Not achievable' : 'Achievable'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SANDBOX TAB ───────────────────────────────────────────────────────────────
function SandboxTab({ course, gradeData, dot, onSave }) {
  const components  = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 85
  const scenarios   = gradeData?.scenarios ?? []

  const initOverrides = useCallback(() => {
    const { needed } = getNeededOnRemaining(components, targetGrade)
    const m = {}
    components.forEach(c => { m[c.id] = c.graded && c.grade !== null ? c.grade : Math.round(needed ?? 75) })
    return m
  }, [components, targetGrade])

  const [overrides, setOverrides] = useState(initOverrides)
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showCompare, setShowCompare] = useState(false)
  const [editingName, setEditingName] = useState(null)
  const [nameInput, setNameInput] = useState('')

  const projected  = getProjectedGrade(components.map(c => ({ ...c, graded: false })), overrides)
  const targetLabel = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'A'
  const diff       = projected !== null ? projected - targetGrade : 0
  const ltr        = letterGrade(projected)
  const lc         = letterColor(ltr)

  const setSlider = (id, val) => setOverrides(p => ({ ...p, [id]: parseFloat(val) }))
  const handleReset = () => setOverrides(initOverrides())

  const handleSaveScenario = () => {
    if (!saveName.trim()) return
    const name = saveName.trim()
    const scenarioOverrides = {}
    components.forEach(c => { scenarioOverrides[c.id] = overrides[c.id] })
    const newScenarios = [...scenarios.filter(s => s.name !== name).slice(0, 2), { name, overrides: scenarioOverrides }]
    onSave({ ...gradeData, scenarios: newScenarios })
    setSaveName('')
    setShowSaveInput(false)
  }

  const deleteScenario = name => onSave({ ...gradeData, scenarios: scenarios.filter(s => s.name !== name) })
  const renameScenario = (oldName, newName) => {
    if (!newName.trim()) return
    onSave({ ...gradeData, scenarios: scenarios.map(s => s.name === oldName ? { ...s, name: newName.trim() } : s) })
    setEditingName(null)
  }

  if (!components.length) return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <p style={{ color: D.muted, fontSize: 13 }}>Set up your grade components in the Plan tab first.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Projected hero */}
      <div style={{ background: `linear-gradient(155deg, ${lc}1a, ${lc}05 40%, ${D.bgCard})`, border: `1px solid ${lc}30`, borderRadius: 14, padding: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, background: `radial-gradient(circle, ${lc}25, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 8 }}>Projected grade</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2, lineHeight: 1, background: `linear-gradient(135deg, ${lc}, ${lc}cc)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'ui-monospace, monospace' }}>
                {projected !== null ? projected.toFixed(1) : '-'}
              </span>
              <span style={{ fontSize: 20, color: D.muted }}>%</span>
              <span style={{ fontSize: 26, fontWeight: 700, color: lc, marginLeft: 8 }}>{ltr}</span>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: diff >= 0 ? 'rgba(52,211,153,0.12)' : 'rgba(244,114,182,0.12)', border: `1px solid ${diff >= 0 ? 'rgba(52,211,153,0.3)' : 'rgba(244,114,182,0.3)'}`, color: diff >= 0 ? D.mint : D.pink, fontSize: 12.5, fontWeight: 600 }}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}pt vs target {targetLabel}
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase' }}>Drag to model scenarios</div>
            <div style={{ fontSize: 11.5, color: D.dim, marginTop: 3 }}>Graded items stay locked · drag the rest</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10.5, color: D.dim }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 3, background: D.mint, borderRadius: 2 }} /> Locked</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 3, background: D.orange, borderRadius: 2 }} /> Hypothetical</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {components.map(c => {
            const isLocked  = c.graded && c.grade !== null
            const v         = overrides[c.id] ?? 0
            const fillColor = isLocked ? D.mint : D.orange
            return (
              <div key={c.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: D.text }}>{c.component}</span>
                    {isLocked && <span style={{ fontSize: 10, color: D.mint, background: 'rgba(52,211,153,0.1)', padding: '1px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}><IcoLock /> Actual</span>}
                    <span style={{ fontSize: 10.5, color: D.dim, fontFamily: 'ui-monospace, monospace' }}>· {c.weight}% weight</span>
                  </div>
                  <div style={{ width: 64, textAlign: 'center', padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: `1px solid ${isLocked ? 'rgba(52,211,153,0.3)' : D.border}`, fontSize: 13, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: isLocked ? D.mint : D.orange }}>
                    {Math.round(v)}
                  </div>
                </div>
                <div style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }} />
                  <div style={{ position: 'absolute', left: 0, height: 6, borderRadius: 3, width: `${v}%`, background: `linear-gradient(90deg, ${fillColor}, ${fillColor}cc)`, boxShadow: `0 0 8px ${isLocked ? 'rgba(52,211,153,0.5)' : 'rgba(249,115,22,0.5)'}`, pointerEvents: 'none' }} />
                  <input type="range" min="0" max="100" value={Math.round(v)} disabled={isLocked} onChange={e => setSlider(c.id, parseFloat(e.target.value))} className="gh-range" style={{ position: 'relative', background: 'transparent', opacity: isLocked ? 0.6 : 1 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="gh-bottom-bar" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10 }}>
        <button onClick={handleReset} style={{ padding: '13px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, fontWeight: 500, color: D.text, cursor: 'pointer' }}>
          Reset to actuals
        </button>
        {scenarios.length < 3 && !showSaveInput ? (
          <button onClick={() => setShowSaveInput(true)} style={{ padding: '13px 16px', background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`, borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${D.glow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
            <IcoSparkles /> Save scenario
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="gh-input-text" type="text" placeholder="Scenario name…" value={saveName} onChange={e => setSaveName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveScenario()} autoFocus style={{ flex: 1, minWidth: 0 }} />
            <button onClick={handleSaveScenario} style={{ padding: '8px 14px', background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`, borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setShowSaveInput(false)} style={{ padding: '8px 12px', border: `1px solid ${D.border}`, borderRadius: 8, color: D.muted, cursor: 'pointer' }}>✕</button>
          </div>
        )}
      </div>

      {/* Saved scenarios */}
      {scenarios.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase' }}>Saved scenarios</div>
            {scenarios.length >= 2 && (
              <button onClick={() => setShowCompare(v => !v)} style={{ fontSize: 12, fontWeight: 600, color: D.indigo, cursor: 'pointer' }}>
                {showCompare ? 'Hide compare' : 'Compare →'}
              </button>
            )}
          </div>
          {!showCompare ? (
            <div className="gh-scenarios-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {scenarios.map(sc => {
                const proj = getProjectedGrade(components.map(c => ({ ...c, graded: false })), sc.overrides)
                const sltr = letterGrade(proj)
                const slc  = letterColor(sltr)
                return (
                  <div key={sc.name} style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      {editingName === sc.name ? (
                        <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} onBlur={() => renameScenario(sc.name, nameInput)} onKeyDown={e => e.key === 'Enter' && renameScenario(sc.name, nameInput)} className="gh-input-text" style={{ flex: 1, marginRight: 8, fontSize: 12 }} />
                      ) : (
                        <button onClick={() => { setEditingName(sc.name); setNameInput(sc.name) }} style={{ fontSize: 13, fontWeight: 600, color: D.text, cursor: 'pointer', textAlign: 'left' }}>{sc.name}</button>
                      )}
                      <button onClick={() => deleteScenario(sc.name)} style={{ color: D.dim, cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: slc, fontFamily: 'ui-monospace, monospace' }}>{proj?.toFixed(1)}%</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: slc, marginTop: 2 }}>{sltr}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="gh-compare-wrap" style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', minWidth: 360, fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px', color: D.dim, fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Component</th>
                    {scenarios.map(s => <th key={s.name} style={{ textAlign: 'center', padding: '10px 16px', color: D.muted, fontWeight: 600 }}>{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {components.map(c => {
                    const scores = scenarios.map(s => s.overrides[c.id] ?? 0)
                    const max = Math.max(...scores), min = Math.min(...scores)
                    return (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${D.border}` }}>
                        <td style={{ padding: '10px 16px', color: D.text, fontWeight: 500 }}>{c.component}</td>
                        {scenarios.map(s => {
                          const score = s.overrides[c.id]
                          const isMax = score === max && max !== min
                          const isMin = score === min && max !== min
                          return <td key={s.name} style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: isMax ? D.mint : isMin ? D.pink : D.muted }}>{score?.toFixed(0) ?? '-'}%</td>
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px 16px', color: D.muted, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Projected</td>
                    {scenarios.map(s => {
                      const proj = getProjectedGrade(components.map(c => ({ ...c, graded: false })), s.overrides)
                      return <td key={s.name} style={{ padding: '12px 16px', textAlign: 'center', fontSize: 15, fontWeight: 800, color: letterColor(letterGrade(proj)), fontFamily: 'ui-monospace, monospace' }}>{proj?.toFixed(1)}% {letterGrade(proj)}</td>
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── RIGHT RAIL ────────────────────────────────────────────────────────────────
function RightRail({ course, gradeData, onShowPaywall, userId, onSyncStudyPlan }) {
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiPrediction, setAiPrediction] = useState(null)
  const [syncToast, setSyncToast]     = useState(false)

  const components  = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 85
  const graded      = components.filter(c => c.graded && c.grade !== null)
  const curr        = getCurrentGrade(components)
  const targetLabel = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'A'
  const bestGrade   = graded.length ? Math.max(...graded.map(c => c.grade)) : null

  const handleRunPredictor = async () => {
    if (!components.length) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }
    setAiLoading(true)
    setAiPrediction(null)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/generate-study-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'predict-grade',
          courseName: course.name,
          targetGrade: targetLabel,
          components: components.map(c => ({ name: c.component, weight: c.weight, type: 'Assignment', earnedGrade: c.graded ? c.grade : null })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAiPrediction(data.prediction)
      await incrementAIQuery()
    } catch (e) {
      console.error(e)
    } finally {
      setAiLoading(false)
    }
  }

  const handleSync = async () => {
    await onSyncStudyPlan?.()
    setSyncToast(true)
    setTimeout(() => setSyncToast(false), 3000)
  }

  return (
    <div className="gh-rail" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 20 }}>
      {/* AI Prediction */}
      <div style={{ background: 'linear-gradient(155deg, rgba(139,92,246,0.14), rgba(99,102,241,0.05) 45%, #0a0a1e)', border: '1px solid rgba(139,92,246,0.28)', borderRadius: 14, padding: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle, rgba(139,92,246,0.25), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, position: 'relative' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: `0 0 12px ${D.glow}` }}>
            <IcoSparkles />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase' }}>AI Grade prediction</div>
            <div style={{ fontSize: 11, color: D.dim, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: D.mint, boxShadow: `0 0 6px ${D.mint}` }} />
              Live forecast
            </div>
          </div>
        </div>

        {aiPrediction ? (
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 800, fontFamily: 'ui-monospace, monospace', color: letterColor(letterGrade(aiPrediction.predictedGrade)) }}>{aiPrediction.predictedGrade?.toFixed(1)}%</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: letterColor(letterGrade(aiPrediction.predictedGrade)) }}>{aiPrediction.letterGrade}</span>
            </div>
            {aiPrediction.recommendations?.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {aiPrediction.recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: 12, color: D.muted, display: 'flex', gap: 6 }}><span style={{ color: D.mint }}>→</span> {r}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: D.text, lineHeight: 1.5, marginBottom: 14, position: 'relative' }}>
            Based on <span style={{ color: D.indigo, fontFamily: 'ui-monospace, monospace' }}>{graded.length} graded items</span>, run a prediction to see your projected final grade.
          </div>
        )}

        <button onClick={handleRunPredictor} disabled={aiLoading || !components.length} style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: D.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', position: 'relative', opacity: aiLoading ? 0.7 : 1 }}>
          {aiLoading
            ? <><div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: D.violet, animation: 'spin 0.8s linear infinite' }} /> Analyzing…</>
            : <><IcoSparkles /> Run AI grade prediction</>}
        </button>
      </div>

      {/* At a glance */}
      {components.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 14 }}>At a glance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Best grade',   value: bestGrade !== null ? bestGrade + '%' : '-',  color: D.mint   },
              { label: 'Current avg',  value: curr !== null ? curr.toFixed(1) + '%' : '-', color: D.indigo },
              { label: 'Graded items', value: `${graded.length} / ${components.length}`,   color: D.violet },
              { label: 'Target',       value: targetLabel,                                 color: D.sky    },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: D.muted }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: 'ui-monospace, monospace' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect to study plan */}
      {components.length > 0 && (
        <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 10 }}>Connect to study plan</div>
          {syncToast && <div style={{ fontSize: 12, color: D.mint, marginBottom: 8 }}>✓ Study plan updated.</div>}
          <button onClick={handleSync} style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: D.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
            <IcoCalendar /> Sync to schedule
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GradeHubView({ courses, onEditCourse, userId, onShowPaywall, initialCourseIdx = 0, onSyncToCalendar }) {
  const plan = getActivePlan()

  const [activeCourseIdx, setActiveCourseIdx] = useState(() =>
    Math.max(0, Math.min(initialCourseIdx, courses.length - 1))
  )
  const [activeTab, setActiveTab] = useState('plan')

  useEffect(() => {
    const idx = Math.max(0, Math.min(initialCourseIdx, courses.length - 1))
    setActiveCourseIdx(idx)
  }, [initialCourseIdx])

  if (plan === 'free') return <LockedState onShowPaywall={onShowPaywall} />
  if (!courses.length) return (
    <div style={{ padding: '60px 32px', textAlign: 'center' }}>
      <p style={{ color: D.muted, fontSize: 13 }}>Add courses to use the Grade Hub.</p>
    </div>
  )

  const course    = courses[activeCourseIdx]
  const dot       = course?.color?.dot ?? D.accent
  const gradeData = course?.gradeData ?? null
  const hasSetup  = !!(gradeData?.components?.length)
  const gpa       = computeGPA(courses)

  const handleSelectCourse = idx => {
    setActiveCourseIdx(idx)
    setActiveTab('plan')
  }

  const handleSaveGradeData = useCallback((newData) => {
    onEditCourse(activeCourseIdx, { ...course, gradeData: newData })
  }, [activeCourseIdx, course, onEditCourse])

  const handleSyncStudyPlan = useCallback(async () => {
    // 1. Save grade struggles back to coach plan
    const comps = gradeData?.components ?? []
    const curr  = getCurrentGrade(comps)
    const tg    = gradeData?.targetGrade ?? 85
    const gap   = curr !== null ? curr - tg : null
    const weak  = comps.filter(c => c.graded && c.grade !== null && c.grade < 70).map(c => c.component)
    const struggles = [
      gap !== null ? `Projected to ${gap >= 0 ? 'meet' : 'miss'} target by ${Math.abs(gap).toFixed(1)}%` : null,
      weak.length ? `Weak components: ${weak.join(', ')}` : null,
    ].filter(Boolean)
    try { await saveCoachPlanStruggles(course.id ?? activeCourseIdx, struggles) } catch (e) { console.error(e) }

    // 2. Push coach plan sessions onto the calendar
    const cached = getCachedCoachPlan(course.id ?? activeCourseIdx)
    if (!cached?.plan?.weeklyFocus?.length) return
    const today = new Date()
    const dow = today.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    // Spread sessions across Mon/Wed/Fri/Tue/Thu so they don't stack on one day
    const DAY_SPREAD = [0, 2, 4, 1, 3]
    const sessions = []
    cached.plan.weeklyFocus.forEach((week, wi) => {
      const weekMonday = new Date(today)
      weekMonday.setDate(today.getDate() + mondayOffset + wi * 7)
      ;(week.sessions || []).forEach((sess, si) => {
        const sessionDate = new Date(weekMonday)
        sessionDate.setDate(weekMonday.getDate() + DAY_SPREAD[si % 5])
        const dateStr = sessionDate.toISOString().split('T')[0]
        sessions.push({
          id: `coach-${dateStr}-${wi}-${si}-${Date.now()}`,
          dateStr,
          courseId: activeCourseIdx,
          courseName: course.name,
          color: course.color,
          sessionType: sess.sessionLabel || 'Review',
          duration: sess.duration || cached.formData?.sessionLen || cached.formData?.sessionMinutes || 60,
          startTime: null,
          endTime: null,
          isManual: true,
          fromCoachPlan: true,
        })
      })
    })
    if (sessions.length) onSyncToCalendar?.(sessions)
  }, [gradeData, course, activeCourseIdx, onSyncToCalendar])

  return (
    <div style={{ background: D.bg, minHeight: '100vh', overflowX: 'hidden', maxWidth: '100vw', backgroundImage: 'radial-gradient(1200px 600px at 85% -10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(900px 500px at 10% 110%, rgba(99,102,241,0.05), transparent 60%)' }}>
      <style>{GH_STYLE}{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div className="gh-header" style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${D.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.05em', color: D.muted, textTransform: 'uppercase' }}>Academic Control</span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: D.dim }} />
          <span style={{ fontSize: 11.5, color: D.dim }}>{getCurrentSemester()} · {courses.length} courses tracked</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: -0.8, color: D.text, display: 'flex', alignItems: 'center', gap: 12 }}>
          Grade Hub
          {gpa && (
            <span style={{ fontSize: 13, fontWeight: 500, color: D.indigo, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', padding: '4px 10px', borderRadius: 999, verticalAlign: 'middle' }}>
              GPA {gpa}
            </span>
          )}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: D.muted, maxWidth: 640 }}>
          Plan, track, and model every scenario for your final grade, one calculator per course.
        </p>
      </div>

      <div className="gh-content" style={{ padding: '24px 32px 48px', overflowX: 'hidden', maxWidth: '100%' }}>
        {/* Course pills */}
        <div className="gh-course-strip" style={{ display: 'flex', gap: 12, marginBottom: 20, overflowX: 'auto' }}>
          {courses.map((c, i) => (
            <CourseCard key={i} course={c} active={activeCourseIdx === i} onClick={() => handleSelectCourse(i)} />
          ))}
        </div>

        {/* Course label + tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, boxShadow: `0 0 10px ${dot}` }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: D.text }}>{clean(course.name)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: D.dim, fontFamily: 'ui-monospace, monospace' }}>
            {daysTo(course.examDate) !== null ? `${daysTo(course.examDate)}d to exam` : ''}
          </span>
        </div>
        <div style={{ marginBottom: 20 }}>
          <Tabs active={activeTab} onChange={setActiveTab} />
        </div>

        {hasSetup ? (
          <div className="gh-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'flex-start' }}>
            <div>
              {activeTab === 'plan'    && <PlanTab    course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />}
              {activeTab === 'track'   && <TrackTab   course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />}
              {activeTab === 'sandbox' && <SandboxTab course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />}
            </div>
            <div className="gh-rail"><RightRail course={course} gradeData={gradeData} onShowPaywall={onShowPaywall} userId={userId} onSyncStudyPlan={handleSyncStudyPlan} /></div>
          </div>
        ) : activeTab === 'plan' ? (
          <PlanTab course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />
        ) : (
          // Setup empty state
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 14px', background: `${dot}18`, color: dot, display: 'grid', placeItems: 'center' }}>
              <IcoPlus />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: D.text, marginBottom: 6 }}>Set up {clean(course.name)}</div>
            <div style={{ fontSize: 13, color: D.muted, marginBottom: 18 }}>Add grade components, weights, and your target to start tracking.</div>
            <button onClick={() => setActiveTab('plan')} style={{ padding: '11px 22px', background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`, borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: `0 6px 20px ${D.glow}`, cursor: 'pointer' }}>
              <IcoSparkles /> Set up course
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
