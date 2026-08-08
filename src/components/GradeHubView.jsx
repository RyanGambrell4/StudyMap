import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import EmptyState from './ui/empty-state'
import { getActivePlan, hasUsedTrial } from '../lib/subscription'
import { clean } from '../utils/strings'
import { saveCoachPlanStruggles, getCachedCoachPlan } from '../lib/db'
import { getAccessToken } from '../lib/supabase'
import { buildScheduleBlocks } from '../utils/pushPlanToSchedule'
import { track } from '../lib/analytics'
import { GRADE_HUB as G, GH_SERIF } from '../theme/tokens'
import {
  TARGET_OPTIONS, letterGrade,
  getCurrentGrade, getProjectedGrade, getNeededOnRemaining,
  getDefenseFloor, generateScenarioPaths,
  computeGradeMath, bestAchievableTarget,
} from '../utils/gradeCalc'

// ── Design tokens ─────────────────────────────────────────────────────────────
// Legacy token object still used by the Track and Sandbox tabs. Those tabs keep
// their current structure in this pass, but their colors are remapped onto the
// Grade Hub palette so the three tabs read as one page instead of two design
// systems. Status colors (orange, pink) stay distinct because Track and Sandbox
// use them to mean something specific.
const D = {
  bg:        G.pageBg,
  bgCard:    G.card,
  border:    G.cardBorder,
  borderStr: G.ctrlBorder,
  text:      G.ink,
  muted:     G.secondary,
  dim:       G.label,
  accent:    G.blue,
  glow:      'rgba(52,82,217,0.2)',
  indigo:    G.blue,
  mint:      G.green,
  orange:    G.amber,
  sky:       G.blue,
  pink:      '#DC2626',
  amber:     G.amber,
}

// Three Paths accents, in card order. Color here identifies the strategy; it is
// reused for the card's left rule and its mini chart so the two always agree.
const PATH_ACCENTS = [G.blue, G.green, G.amber]

function uid() { return Math.random().toString(36).slice(2, 10) }
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

// "an A" but "a B+". Letters are computed, so the article has to be too.
const article = ltr => (/^[AEFIO]/i.test(ltr ?? '') ? 'an' : 'a')

const fmt1 = n => (n === null || n === undefined || isNaN(n) ? '-' : n.toFixed(1))

// The mobile artboard is 390 wide and restructures rather than reflows: the
// table becomes stacked rows, Save becomes a full-width bar, path cards collapse
// to one line. That is a different tree, not different CSS, so the breakpoint
// lives in JS.
function useIsMobile(bp = 760) {
  const query = `(max-width:${bp}px)`
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    const onChange = e => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}

// Mini chart bar height, straight from the spec:
//   bar height px = clamp((pct - 76) * 1.7, 10, 40)
// Mobile scales the whole chart to 0.8. The spec also lists hand-set example
// heights that this formula does not reproduce and that are not monotonic in
// pct; the formula is the rule, so the formula is what ships.
const barHeight = (pct, mobile) => {
  const h = clamp((pct - 76) * 1.7, 10, 40)
  return Math.round(mobile ? h * 0.8 : h)
}

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

// Returns the minimum numeric threshold for a given letter grade
function letterMinThreshold(ltr) {
  const map = { 'A+': 90, 'A': 85, 'A-': 80, 'B+': 77, 'B': 73, 'B-': 70, 'C+': 67, 'C': 63, 'C-': 60, 'D+': 55, 'D': 50, 'F': 0 }
  return map[ltr] ?? 0
}

function computeGPA(courses) {
  // Only count a course toward GPA when at least 50% of its weight has been
  // graded. A single 95% on a 10%-weight quiz isn't a real course average yet
  // and shouldn't bump the user to a fake "GPA 4.00".
  const pts = { 'A+': 4.0, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0 }
  const vals = courses.map(c => {
    const comps = c.gradeData?.components ?? []
    if (!comps.length) return null
    const totalWeight = comps.reduce((s, x) => s + (x.weight || 0), 0)
    const gradedWeight = comps
      .filter(x => x.graded && x.grade !== null && x.grade !== undefined)
      .reduce((s, x) => s + (x.weight || 0), 0)
    if (totalWeight === 0 || gradedWeight / totalWeight < 0.5) return null
    const g = getCurrentGrade(comps)
    return g !== null ? (pts[letterGrade(g)] ?? null) : null
  }).filter(v => v !== null)
  if (!vals.length) return null
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
}

// Inject range + input styles once
const GH_STYLE = `
body{overflow-x:hidden!important;}
*{box-sizing:border-box;}
.gh-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;background:rgba(0,0,0,0.10);outline:none;position:relative;}
.gh-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${G.blue};cursor:pointer;border:2px solid #FFFFFF;box-shadow:0 0 0 1px ${G.blue},0 2px 8px rgba(52,82,217,0.3);}
.gh-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:${G.blue};cursor:pointer;border:2px solid #FFFFFF;}
.gh-range:disabled{opacity:0.5;cursor:default;}
.gh-input{background:#FFFFFF;border:1px solid ${G.ctrlBorder};color:${G.ink};border-radius:7px;padding:7px 10px;font-size:13px;outline:none;transition:border 0.15s;font-family:inherit;box-sizing:border-box;}
.gh-input:focus{border-color:${G.blue};}
.gh-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.gh-input::placeholder{color:${G.label};}
.gh-input:disabled{opacity:0.4;}
.gh-input-text{background:#FFFFFF;border:1px solid ${G.ctrlBorder};color:${G.ink};border-radius:7px;padding:7px 10px;font-size:13px;outline:none;transition:border 0.15s;font-family:inherit;box-sizing:border-box;}
.gh-input-text:focus{border-color:${G.blue};}
.gh-input-text::placeholder{color:${G.label};}
.gh-grade-row-inner{display:contents;}

/* Editable values sit inline in the table as plain text with a dashed rule,
   never as boxed inputs. The affordance is the rule, not a border. */
.gh-cell{border:none;background:transparent;outline:none;font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;padding:0 0 1px;border-bottom:1px dashed ${G.ctrlBorder};transition:border-color .15s;}
.gh-cell:focus{border-bottom-color:${G.blue};}
.gh-cell::-webkit-inner-spin-button,.gh-cell::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
.gh-cell::placeholder{color:${G.emptyDash};}
.gh-cell-name{border:none;background:transparent;outline:none;font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;padding:0 0 1px;border-bottom:1px dashed transparent;transition:border-color .15s;width:100%;}
.gh-cell-name:hover,.gh-cell-name:focus{border-bottom-color:${G.ctrlBorder};}
.gh-cell-name:focus{border-bottom-color:${G.blue};}

/* Delete stays out of the designed layout and appears on hover or focus, so the
   row reads exactly as drawn until you reach for it. */
.gh-row .gh-del{opacity:0;transition:opacity .12s;}
.gh-row:hover .gh-del,.gh-row:focus-within .gh-del{opacity:1;}
.gh-del:focus-visible{opacity:1;outline:2px solid ${G.blue};outline-offset:2px;}

.gh-link:hover{color:${G.blueHover};}
.gh-primary:hover:not(:disabled){background:${G.blueHover};}

@media(max-width:760px){
.gh-content{padding:28px 20px 56px!important;}
.gh-scenarios-grid{grid-template-columns:1fr!important;}
.gh-compare-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;}
.gh-bottom-bar{flex-wrap:wrap!important;gap:8px!important;}
.gh-course-strip{flex-wrap:nowrap!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;padding-bottom:6px!important;scrollbar-width:none;}
.gh-course-strip::-webkit-scrollbar{display:none;}
}
`

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcoPlus()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg> }
function IcoX()        { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6"/></svg> }
function IcoLock()     { return <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg> }
function IcoShield()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/></svg> }
function IcoCheck()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg> }

// ── Locked state ──────────────────────────────────────────────────────────────
function LockedState({ onShowPaywall }) {
  const trialUsed = hasUsedTrial()
  const fakeRows = [
    { label: 'Midterm Exam',    weight: '25%', score: '82 / 100', grade: 'B',  color: '#3B61C4' },
    { label: 'Lab Report 3',    weight: '10%', score: '91 / 100', grade: 'A-', color: '#16A34A' },
    { label: 'Problem Set 4',   weight: '8%',  score: '–',        grade: '–',  color: '#D97706' },
    { label: 'Final Exam',      weight: '35%', score: '–',        grade: '–',  color: '#D97706' },
  ]
  return (
    <div style={{ position: 'relative', minHeight: 480, background: D.bg, overflow: 'hidden' }}>
      {/* Ghost preview */}
      <div style={{ filter: 'blur(4px)', opacity: 0.4, pointerEvents: 'none', userSelect: 'none', padding: '28px 32px' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: '16px 20px', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Current Grade</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#3B61C4', letterSpacing: -1 }}>83.4%</div>
            <div style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>B+ · On track for A-</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: '16px 20px', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Need on Final</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#16A34A', letterSpacing: -1 }}>78%</div>
            <div style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>to hit your A- target</div>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'grid', gridTemplateColumns: '1fr 80px 100px 60px', gap: 12 }}>
            {['Assignment', 'Weight', 'Score', 'Grade'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
            ))}
          </div>
          {fakeRows.map((r, i) => (
            <div key={i} style={{ padding: '12px 20px', borderBottom: i < fakeRows.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', display: 'grid', gridTemplateColumns: '1fr 80px 100px 60px', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: r.color }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{r.label}</span>
              </div>
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>{r.weight}</span>
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>{r.score}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: r.grade === '–' ? '#9B9B9B' : r.color }}>{r.grade}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA overlay */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(247,246,243,0.65)', backdropFilter: 'blur(1px)', padding: 24 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 20, padding: '36px 32px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px', background: 'rgba(59,97,196,0.08)', border: '1px solid rgba(59,97,196,0.2)', display: 'grid', placeItems: 'center', color: D.indigo }}>
            <IcoShield />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: D.text, marginBottom: 8 }}>Know your grade before it's too late.</div>
          <p style={{ fontSize: 13.5, color: D.muted, margin: '0 auto 6px', lineHeight: 1.55 }}>
            Track every assignment, run what-if scenarios, and see exactly what you need on your final to hit your target.
          </p>
          {!trialUsed && (
            <p style={{ fontSize: 12, color: D.indigo, fontWeight: 600, margin: '8px auto 20px' }}>7-day free trial. Cancel anytime.</p>
          )}
          {trialUsed && <div style={{ marginBottom: 20 }} />}
          <button
            onClick={() => onShowPaywall?.('grades')}
            style={{ width: '100%', padding: '12px 24px', background: '#3B61C4', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(59,97,196,0.35)' }}
          >
            {trialUsed ? 'Upgrade to Pro' : 'Start 7-day free trial →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Course chip ───────────────────────────────────────────────────────────────
// Active chip carries the course identity dot, its letter grade in blue, and a
// divider plus the one piece of context that matters right now: time to the
// final, or "Complete" once every component is in.
function CourseChip({ course, active, mobile, onClick }) {
  const dot   = course.color?.dot ?? G.blue
  const comps = course.gradeData?.components ?? []
  const curr  = comps.length ? getCurrentGrade(comps) : null
  const ltr   = curr !== null ? letterGrade(curr) : '–'
  const name  = clean(course.name)

  const allGraded = comps.length > 0 && comps.every(c => c.graded && c.grade !== null && c.grade !== undefined)
  const days = daysTo(course.examDate)
  const meta = allGraded ? 'Complete' : (days !== null && days >= 0 ? `Final in ${days} days` : null)

  const dotSize = mobile ? 7 : 8
  return (
    <button onClick={onClick} style={{
      flex: 'none', display: 'flex', alignItems: 'center', gap: mobile ? 8 : 9,
      background: G.card, borderRadius: 999,
      padding: mobile ? '8px 14px' : '9px 16px',
      border: active ? 'none' : `1px solid ${G.chipBorder}`,
      boxShadow: active ? `inset 0 0 0 1.5px ${G.blue}` : 'none',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{
        fontSize: mobile ? 13.5 : 14, fontWeight: active ? 600 : 500,
        color: active ? G.ink : G.secondary,
        maxWidth: mobile ? 200 : 260, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{name}</span>
      <span style={{ fontSize: mobile ? 12.5 : 13, fontWeight: 600, color: active ? G.blue : (ltr === '–' ? G.colHeader : G.label) }}>{ltr}</span>
      {active && meta && !mobile && (
        <>
          <span style={{ width: 1, height: 14, background: G.chipBorder }} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: G.body }}>{meta}</span>
        </>
      )}
    </button>
  )
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
function Tabs({ active, onChange, mobile }) {
  const tabs = [
    { id: 'plan',    label: 'Plan'    },
    { id: 'track',   label: 'Track'   },
    { id: 'sandbox', label: 'Sandbox' },
  ]
  return (
    <div style={{ display: 'flex', gap: mobile ? 22 : 26, borderBottom: `1px solid ${G.cardBorder}`, marginTop: mobile ? 22 : 30 }}>
      {tabs.map(t => {
        const on = active === t.id
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            padding: mobile ? '0 2px 10px' : '0 2px 11px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: mobile ? 14 : 14.5,
            fontWeight: on ? 600 : 500,
            color: on ? G.ink : G.label,
            borderBottom: on ? `2px solid ${G.blue}` : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── PLAN TAB ──────────────────────────────────────────────────────────────────
// Rebuilt against design/grade-hub/ (canvas turn 2). The hero card answers the
// one question once; the prediction sidebar, the per-component needs list, the
// header subtitle and the bottom buffer bar are all absorbed into it. Every
// figure below is computed from live component data, never from the mockup.

const cardShell = {
  background: G.card,
  border: `1px solid ${G.cardBorder}`,
  borderRadius: 16,
  boxShadow: G.cardShadow,
}

const fmtWeight = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))

function SectionLabel({ children, mobile, style }) {
  return (
    <div style={{
      fontSize: mobile ? 10.5 : 11, fontWeight: 600, letterSpacing: '.1em',
      color: G.label, textTransform: 'uppercase', ...style,
    }}>{children}</div>
  )
}

function Stat({ label, value, mobile }) {
  return (
    <div>
      <div style={{ fontSize: mobile ? 10.5 : 11, fontWeight: 600, letterSpacing: '.08em', color: G.label, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: GH_SERIF, fontSize: mobile ? 19 : 22, fontWeight: 500, color: G.ink, marginTop: mobile ? 3 : 4 }}>{value}</div>
    </div>
  )
}

// `status` is the real result of the last sync, never an assumption. The old
// version flipped to "Synced to study plan" even when there was no coach plan
// and nothing had happened.
function SyncLink({ onClick, status, style }) {
  const label = status?.kind === 'synced' ? `Synced ${status.count} sessions`
    : status?.kind === 'noplan' ? 'No study plan yet'
    : 'Sync to study plan ›'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, ...style }}>
      <button className="gh-link" onClick={onClick} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: 14, fontWeight: 600, color: G.blue, textAlign: 'left',
      }}>
        {label}
      </button>
      {status?.kind === 'noplan' && (
        <span style={{ fontSize: 12.5, color: G.body, fontWeight: 400 }}>
          Build one in Study Coach and your struggles will carry over.
        </span>
      )}
    </span>
  )
}

// ── Cushion bar ───────────────────────────────────────────────────────────────
// The signature element. Segment widths are point values on a 100-point course,
// so the bar always fills exactly and can be read as the whole course at once.
// The lost segment renders at its true width even when it is a hairline.
function CushionBar({ math, targetLabel, mobile }) {
  let segments
  if (math.allGraded) {
    segments = [
      { key: 'earned', value: math.earned, color: G.earned, label: 'Earned' },
      { key: 'lost',   value: math.lost,   color: G.lost,   label: 'Lost'   },
    ]
  } else if (math.impossible) {
    // Order shifts so the shortfall reads as the gap between what is still
    // possible and the target. It is carved out of the lost points.
    segments = [
      { key: 'earned',   value: math.earned,       color: G.earned, label: 'Earned' },
      { key: 'possible', value: math.remaining,    color: G.needed, label: mobile ? 'Possible' : 'Still possible' },
      { key: 'short',    value: math.shortfall,    color: G.amber,  label: mobile ? 'Short' : `Short of ${targetLabel}` },
      { key: 'lost',     value: math.residualLost, color: G.lost,   label: 'Lost' },
    ]
  } else {
    segments = [
      { key: 'earned',  value: math.earned,                   color: G.earned,  label: 'Earned' },
      { key: 'lost',    value: math.lost,                     color: G.lost,    label: 'Lost' },
      { key: 'needed',  value: math.remaining - math.cushion, color: G.needed,  label: mobile ? 'Needed' : 'Still needed' },
      { key: 'cushion', value: math.cushion,                  color: G.cushion, label: 'Cushion' },
    ]
  }
  const shown = segments.filter(s => s.value > 0.001)

  return (
    <div style={{ marginTop: mobile ? 18 : 26, maxWidth: mobile ? '100%' : 720 }}>
      <div style={{ display: 'flex', height: mobile ? 8 : 10, borderRadius: mobile ? 4 : 5, overflow: 'hidden', gap: 2 }}>
        {shown.map(s => <div key={s.key} style={{ width: `${s.value}%`, background: s.color }} />)}
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        gap: mobile ? '8px 16px' : '10px 24px',
        marginTop: mobile ? 9 : 10,
        fontSize: mobile ? 11.5 : 12.5, color: G.body,
      }}>
        {shown.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 7 }}>
            <span style={{ width: mobile ? 7 : 8, height: mobile ? 7 : 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            {s.label}{' '}
            {mobile
              ? fmt1(s.value)
              : <span style={{ fontWeight: 600, color: G.ink }}>{fmt1(s.value)} pts</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Target control ────────────────────────────────────────────────────────────
// A real dropdown wearing the designed chip. The native select sits invisibly on
// top so keyboard and mobile pickers work without a custom popover.
function TargetControl({ value, onChange, mobile, staticGrade }) {
  const label = TARGET_OPTIONS.find(o => o.value === value)?.label ?? 'A'
  const shell = {
    display: 'flex', alignItems: 'center', gap: mobile ? 6 : 8,
    border: `1px solid ${G.ctrlBorder}`, borderRadius: mobile ? 9 : 10,
    padding: mobile ? '6px 11px' : '8px 14px',
    // The artboard draws a compact chip; the same spec requires 44px hit
    // targets on mobile, so the chip grows to meet the finger.
    minHeight: mobile ? 44 : undefined,
    background: 'transparent',
  }
  const caption = { fontSize: mobile ? 10 : 11, fontWeight: 600, letterSpacing: '.08em', color: G.label, textTransform: 'uppercase' }
  const grade   = { fontSize: mobile ? 14 : 16, fontWeight: 600, color: G.ink }

  if (staticGrade) {
    return (
      <div style={shell}>
        <span style={caption}>Grade</span>
        <span style={grade}>{staticGrade}</span>
      </div>
    )
  }
  return (
    <label style={{ ...shell, position: 'relative', cursor: 'pointer' }}>
      <span style={caption}>Target</span>
      <span style={grade}>{label}</span>
      <span style={{ fontSize: mobile ? 9 : 10, color: G.label }}>▾</span>
      <select
        aria-label="Target grade"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', appearance: 'none' }}
      >
        {TARGET_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

// ── Hero answer card ──────────────────────────────────────────────────────────
function HeroCard({ math, components, targetGrade, targetLabel, onTargetChange, onSync, status, mobile }) {
  const maxLetter = letterGrade(math.maxAchievable)
  const best = math.impossible ? bestAchievableTarget(components, math.maxAchievable) : null

  const eyebrow = math.allGraded ? 'Final grade' : 'What you need'
  const setup = math.allGraded
    ? 'This course is complete. Your final average:'
    : math.impossible
      ? 'Perfect scores on everything remaining top out at:'
      : 'The average you need on remaining work to hit your target:'
  const headline = math.allGraded
    ? math.finalAverage
    : math.impossible
      ? math.maxAchievable
      : math.neededAvg

  return (
    <div style={{ ...cardShell, marginTop: mobile ? 20 : 28, padding: mobile ? '22px 20px' : '32px 36px 28px' }}>
      <SectionLabel mobile={mobile} style={{ marginBottom: mobile ? 10 : 14 }}>{eyebrow}</SectionLabel>

      <div style={{ fontFamily: GH_SERIF, fontSize: mobile ? 17 : 21, fontWeight: 500, lineHeight: 1.5, color: G.secondary }}>
        {setup}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 14 : 22, marginTop: mobile ? 8 : 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: GH_SERIF, fontSize: mobile ? 48 : 62, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em', color: G.ink }}>
          {fmt1(headline)}%
        </div>
        <TargetControl
          value={targetGrade}
          onChange={onTargetChange}
          mobile={mobile}
          staticGrade={math.allGraded ? letterGrade(math.finalAverage) : null}
        />
      </div>

      {math.impossible && (
        <div style={{
          marginTop: mobile ? 18 : 22,
          borderLeft: `3px solid ${G.amber}`,
          padding: mobile ? '4px 0 6px 14px' : '4px 0 6px 18px',
          maxWidth: 640,
        }}>
          <div style={{ fontSize: mobile ? 10.5 : 11, fontWeight: 600, letterSpacing: '.09em', color: G.amberText, textTransform: 'uppercase' }}>
            {targetLabel} is out of reach
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: G.secondary, marginTop: 6 }}>
            The maximum achievable grade is {article(maxLetter)} {maxLetter}, and only with a perfect score on everything remaining.
            {best && (
              <>
                {' '}Aim for {article(best.label)} {best.label} instead and you need a {fmt1(best.neededAvg)}% average on remaining work.{' '}
                <button className="gh-link" onClick={() => onTargetChange(best.value)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 600, color: G.blue }}>
                  Retarget to {best.label}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <CushionBar math={math} targetLabel={targetLabel} mobile={mobile} />

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: mobile ? 32 : 44,
        marginTop: mobile ? 18 : 26, paddingTop: mobile ? 14 : 22,
        borderTop: `1px solid ${G.rowRule}`,
      }}>
        <Stat
          mobile={mobile}
          label={math.allGraded ? 'Final average' : (mobile ? 'Current avg' : 'Current average')}
          value={fmt1(math.allGraded ? math.finalAverage : math.currentAverage)}
        />
        <Stat mobile={mobile} label="Graded" value={`${math.gradedCount} of ${math.componentCount}`} />
        {!mobile && <SyncLink onClick={onSync} status={status} style={{ marginLeft: 'auto' }} />}
      </div>
      {mobile && <SyncLink onClick={onSync} status={status} style={{ marginTop: 12 }} />}
    </div>
  )
}

// ── Grade components card ─────────────────────────────────────────────────────
function ComponentsCard({
  rows, setRow, toggleGraded, addRow, removeRow,
  totalWeight, weightOk, canSave, onSave, saved, readOnly, mobile,
}) {
  const counterColor = weightOk ? G.label : G.amberText

  const nameInput = (row, i, style) => (
    <input
      className="gh-cell-name"
      value={row.component}
      onChange={e => setRow(i, 'component', e.target.value)}
      placeholder="Component name"
      aria-label="Component name"
      style={style}
    />
  )

  // Value and unit share one dashed rule, and the field is sized to its content
  // so the rule hugs "30%" instead of trailing off across the column.
  const weightInput = (row, i) => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', borderBottom: `1px dashed ${G.ctrlBorder}`, paddingBottom: 1 }}>
      <input
        value={row.weight}
        onChange={e => setRow(i, 'weight', e.target.value)}
        inputMode="decimal"
        aria-label="Weight"
        style={{
          border: 'none', background: 'transparent', outline: 'none', font: 'inherit',
          color: 'inherit', padding: 0, textAlign: 'right',
          width: `${Math.max(2, String(row.weight).length)}ch`,
        }}
      />
      <span>%</span>
    </span>
  )

  const gradeInput = (row, i, mob) => {
    const graded = !!row.graded && row.grade !== ''
    return (
      <input
        className={graded ? 'gh-cell' : 'gh-cell-name'}
        value={row.grade}
        onChange={e => setRow(i, 'grade', e.target.value)}
        inputMode="decimal"
        placeholder="–"
        aria-label="Grade"
        style={{
          textAlign: 'right',
          // Sized to the value so the dashed rule sits under the numeral only.
          width: `${Math.max(2, String(row.grade).length)}ch`,
          fontFamily: graded ? GH_SERIF : 'inherit',
          fontSize: graded ? (mob ? 21 : 23) : 15,
          fontWeight: graded ? 500 : 400,
          color: graded ? G.ink : G.emptyDash,
        }}
      />
    )
  }

  const statusButton = (row, i, mob) => {
    const graded = !!row.graded && row.grade !== ''
    return (
      <button
        onClick={() => toggleGraded(i)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', fontSize: mob ? 12.5 : 13.5,
          color: graded ? (mob ? G.label : G.ink) : (mob ? G.label : G.colHeader),
        }}
      >
        {!mob && <span style={{ width: 7, height: 7, borderRadius: '50%', background: graded ? G.green : G.dotUngraded, flexShrink: 0 }} />}
        {graded ? 'Graded' : 'Not yet'}
      </button>
    )
  }

  const deleteButton = (i, style) => (
    <button
      className="gh-del"
      onClick={() => removeRow(i)}
      aria-label="Delete component"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', color: G.label,
        display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, ...style,
      }}
    >
      <IcoX />
    </button>
  )

  const GRID = '1fr 110px 150px 90px'

  return (
    <>
      <div style={{ ...cardShell, marginTop: mobile ? 16 : 24, padding: mobile ? '20px 20px 8px' : '26px 36px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 0 : 18, justifyContent: mobile ? 'space-between' : 'flex-start', marginBottom: mobile ? 6 : 18 }}>
          <SectionLabel mobile={mobile}>Grade components</SectionLabel>
          <span style={{ fontSize: mobile ? 12 : 12.5, fontWeight: 500, color: counterColor }}>
            {fmtWeight(totalWeight)}% of 100%
          </span>
          {!mobile && !readOnly && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
              <button onClick={addRow} className="gh-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: G.blue }}>
                Add component
              </button>
              <button
                onClick={onSave}
                disabled={!canSave}
                className="gh-primary"
                style={{
                  background: canSave ? G.blue : G.chipBorder,
                  color: canSave ? '#fff' : G.label,
                  border: 'none', borderRadius: 10, padding: '9px 16px',
                  fontSize: 14, fontWeight: 600, cursor: canSave ? 'pointer' : 'default',
                }}
              >
                {saved ? 'Saved' : 'Save and generate plan'}
              </button>
            </div>
          )}
        </div>

        {!mobile && (
          <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '0 2px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: G.colHeader, textTransform: 'uppercase' }}>
            <span>Component</span><span>Weight</span><span>Status</span><span style={{ textAlign: 'right' }}>Grade</span>
          </div>
        )}

        {rows.map((row, i) => mobile ? (
          <div key={row.id} className="gh-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0', borderTop: `1px solid ${G.rowRule}`, marginTop: i === 0 ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
              <button
                onClick={() => toggleGraded(i)}
                aria-label="Toggle graded"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', width: 16, height: 16, flexShrink: 0 }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: (row.graded && row.grade !== '') ? G.green : G.dotUngraded }} />
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                {nameInput(row, i, { fontSize: 14.5, fontWeight: 600, color: G.ink })}
                <div style={{ fontSize: 12.5, color: G.label, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {weightInput(row, i)}<span>·</span>{statusButton(row, i, true)}
                </div>
              </div>
            </div>
            {gradeInput(row, i, true)}
            {!readOnly && deleteButton(i, { flexShrink: 0, marginLeft: 4 })}
          </div>
        ) : (
          <div key={row.id} className="gh-row" style={{ position: 'relative', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '13px 2px', borderTop: `1px solid ${G.rowRule}` }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: G.ink, paddingRight: 12, minWidth: 0 }}>
              {nameInput(row, i)}
            </span>
            <span style={{ fontSize: 14, color: G.body }}>{weightInput(row, i)}</span>
            {statusButton(row, i, false)}
            <span style={{ textAlign: 'right' }}>{gradeInput(row, i, false)}</span>
            {!readOnly && deleteButton(i, { position: 'absolute', right: -26, top: '50%', transform: 'translateY(-50%)' })}
          </div>
        ))}

        {mobile && !readOnly && (
          <button
            onClick={addRow}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '14px 0', background: 'none', cursor: 'pointer',
              // Only the top rule, and it must stay a hairline: a blanket
              // border:none here would reset it back to a 3px default.
              borderTop: `1px solid ${G.rowRule}`,
              borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
              fontSize: 13.5, fontWeight: 600, color: G.blue,
            }}
          >
            Add component
          </button>
        )}
      </div>

      {mobile && !readOnly && (
        <button
          onClick={onSave}
          disabled={!canSave}
          className="gh-primary"
          style={{
            marginTop: 16, width: '100%', background: canSave ? G.blue : G.chipBorder,
            color: canSave ? '#fff' : G.label, border: 'none', borderRadius: 12,
            padding: '13px 0', fontSize: 14.5, fontWeight: 600, cursor: canSave ? 'pointer' : 'default',
          }}
        >
          {saved ? 'Saved' : 'Save and generate plan'}
        </button>
      )}
    </>
  )
}

// ── Three paths ───────────────────────────────────────────────────────────────
function RecommendedMark({ mobile }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: mobile ? 6 : 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: G.blue }} />
      <span style={{ fontSize: mobile ? 10 : 10.5, fontWeight: 600, letterSpacing: '.09em', color: G.blue, textTransform: 'uppercase' }}>Recommended</span>
    </div>
  )
}

// Effort distribution at a glance. One bar per remaining component, height from
// the spec's formula, colored with the path's own accent.
function MiniChart({ rows, accent, mobile }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: mobile ? 4 : 5,
      height: mobile ? 34 : 42, flex: 'none', paddingBottom: 1,
      borderBottom: `1.5px solid ${G.cardBorder}`,
    }}>
      {rows.slice(0, 6).map((r, i) => (
        <span key={i} style={{
          width: mobile ? 12 : 16,
          height: barHeight(r.pct, mobile),
          background: accent,
          borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  )
}

function PathCard({ accent, title, desc, rows, recommended, mobile }) {
  const shell = {
    ...cardShell,
    borderLeft: `3px solid ${accent}`,
    padding: mobile ? '18px 20px' : '24px 26px',
  }

  if (mobile) {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          {recommended && <RecommendedMark mobile />}
          <div style={{ fontFamily: GH_SERIF, fontSize: 20, fontWeight: 500, color: G.ink }}>{title}</div>
          <div style={{ fontSize: 12.5, color: G.body, marginTop: 3 }}>
            {rows.map(r => `${r.name} ${fmt1(r.pct)}`).join(' · ')}
          </div>
        </div>
        <MiniChart rows={rows} accent={accent} mobile />
      </div>
    )
  }

  return (
    <div style={shell}>
      {recommended && <RecommendedMark />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: GH_SERIF, fontSize: 23, fontWeight: 500, color: G.ink }}>{title}</div>
          <div style={{ fontSize: 13.5, color: G.body, marginTop: 5, minHeight: 38, maxWidth: 190 }}>{desc}</div>
        </div>
        <MiniChart rows={rows} accent={accent} />
      </div>
      <div style={{ marginTop: 14 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${G.rowRule}`, fontSize: 13.5 }}>
            <span style={{ color: G.body, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ fontWeight: 600, color: G.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt1(r.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyPlan({ courseName, onStart, mobile }) {
  return (
    <div style={{
      ...cardShell,
      marginTop: mobile ? 20 : 28,
      padding: mobile ? '48px 24px' : '72px 36px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    }}>
      <SectionLabel mobile={mobile}>Set up grading</SectionLabel>
      <div style={{ fontFamily: GH_SERIF, fontSize: mobile ? 24 : 30, fontWeight: 500, color: G.ink, marginTop: 12 }}>
        How is {courseName} graded?
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.6, color: G.body, marginTop: 10, maxWidth: 440 }}>
        Add the components from your syllabus, like exams, quizzes, and homework, with their weights. Grade Hub does the math from there.
      </div>
      <button onClick={onStart} className="gh-primary" style={{
        marginTop: 24, background: G.blue, color: '#fff', border: 'none',
        borderRadius: 10, padding: '11px 20px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
      }}>
        Add your first component
      </button>
    </div>
  )
}

// ── Plan tab ──────────────────────────────────────────────────────────────────
function PlanTab({ course, gradeData, onSave, onSync, mobile }) {
  const saved = gradeData ?? {}
  const savedComps = saved.components ?? []

  const [rows, setRows] = useState(() =>
    savedComps.length
      ? savedComps.map(c => ({
          ...c,
          weight: String(c.weight),
          grade: c.grade !== null && c.grade !== undefined ? String(c.grade) : '',
        }))
      : []
  )
  const [targetGrade, setTargetGrade] = useState(saved.targetGrade ?? 85)
  const [justSaved, setJustSaved] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  const blankRow = () => ({ id: uid(), component: '', weight: '', grade: '', graded: false })

  const addRow    = () => { setRows(p => [...p, blankRow()]); setJustSaved(false) }
  const removeRow = i  => { setRows(p => p.filter((_, j) => j !== i)); setJustSaved(false) }
  const setRow    = (i, field, value) => {
    setJustSaved(false)
    setRows(p => p.map((r, j) => {
      if (j !== i) return r
      const next = { ...r, [field]: value }
      // Typing a grade marks the row graded; clearing it marks it outstanding.
      // The status dot is a shortcut, not a required first step.
      if (field === 'grade') next.graded = value !== ''
      return next
    }))
  }
  const toggleGraded = i => {
    setJustSaved(false)
    setRows(p => p.map((r, j) => (j === i ? { ...r, graded: !(r.graded && r.grade !== ''), grade: r.graded ? '' : r.grade } : r)))
  }

  // Live components drive every figure on the page, so the answer updates as the
  // user types. There is no Run prediction button and nothing to wait for.
  const liveComponents = useMemo(() => rows.map(r => {
    const grade = parseFloat(r.grade)
    const isGraded = r.graded && r.grade !== '' && !isNaN(grade)
    return {
      id: r.id,
      component: r.component.trim() || 'Untitled',
      weight: parseFloat(r.weight) || 0,
      grade: isGraded ? grade : null,
      graded: isGraded,
    }
  }), [rows])

  const totalWeight = liveComponents.reduce((s, c) => s + c.weight, 0)
  const weightOk    = Math.abs(totalWeight - 100) < 0.5
  const canSave     = rows.length > 0 && rows.every(r => r.component.trim() && parseFloat(r.weight) > 0) && weightOk

  const math = useMemo(() => computeGradeMath(liveComponents, targetGrade), [liveComponents, targetGrade])
  const targetLabel = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'A'

  // A finished course hides Add and Save, as designed. The moment anything is
  // edited they come back, so correcting a typo on a completed course is never
  // a dead end.
  const dirty = useMemo(() => {
    if (liveComponents.length !== savedComps.length) return true
    return liveComponents.some((c, i) => {
      const s = savedComps[i]
      return !s || s.component !== c.component || s.weight !== c.weight || s.grade !== c.grade
    })
  }, [liveComponents, savedComps])

  const persist = useCallback((components, target) => {
    onSave({ ...(gradeData ?? {}), components, targetGrade: target, scenarios: gradeData?.scenarios ?? [] })
  }, [gradeData, onSave])

  const handleSave = () => {
    if (!canSave) return
    const components = liveComponents.map(c => ({ ...c }))
    persist(components, targetGrade)
    setJustSaved(true)
    track('grade_plan_saved', {
      course_name: course?.name,
      component_count: components.length,
      target_grade: targetGrade,
      is_first_save: !savedComps.length,
    })
  }

  // Changing the target re-answers the question immediately, and sticks without
  // a save so Track and Sandbox stay in step.
  const handleTargetChange = value => {
    setTargetGrade(value)
    if (savedComps.length) persist(savedComps, value)
  }

  const handleSync = async () => {
    const result = await onSync?.()
    setSyncStatus(result ?? { kind: 'noplan' })
    setTimeout(() => setSyncStatus(null), 6000)
  }

  const paths = useMemo(
    () => (math.hasComponents && !math.allGraded && !math.impossible
      ? generateScenarioPaths(liveComponents, targetGrade).filter(p => p.possible !== false)
      : []),
    [liveComponents, targetGrade, math.hasComponents, math.allGraded, math.impossible]
  )
  const ungraded = liveComponents.filter(c => !c.graded)

  if (!rows.length) {
    return <EmptyPlan courseName={clean(course.name)} onStart={() => setRows([blankRow()])} mobile={mobile} />
  }

  const showHero = math.hasComponents && totalWeight > 0

  return (
    <>
      {showHero && (
        <HeroCard
          math={math}
          components={liveComponents}
          targetGrade={targetGrade}
          targetLabel={targetLabel}
          onTargetChange={handleTargetChange}
          onSync={handleSync}
          status={syncStatus}
          mobile={mobile}
        />
      )}

      <ComponentsCard
        rows={rows}
        setRow={setRow}
        toggleGraded={toggleGraded}
        addRow={addRow}
        removeRow={removeRow}
        totalWeight={totalWeight}
        weightOk={weightOk}
        canSave={canSave}
        onSave={handleSave}
        saved={justSaved}
        readOnly={math.allGraded && !dirty}
        mobile={mobile}
      />

      {paths.length > 0 && ungraded.length > 0 && (
        <div style={{ marginTop: mobile ? 28 : 36 }}>
          <SectionLabel mobile={mobile} style={{ marginBottom: mobile ? 12 : 16 }}>
            Three paths to your {targetLabel}
          </SectionLabel>
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr',
            gap: mobile ? 12 : 16,
          }}>
            {paths.slice(0, 3).map((path, pi) => (
              <PathCard
                key={path.name}
                accent={PATH_ACCENTS[pi]}
                title={path.name}
                desc={path.description}
                rows={ungraded.map(c => ({ name: c.component, pct: path.scores[c.id] ?? 0 }))}
                // Front-Loaded carries the quiet recommendation whenever the
                // target is still reachable, matching the approved default.
                recommended={pi === 2}
                mobile={mobile}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── TRACK TAB ─────────────────────────────────────────────────────────────────
function TrackTab({ course, gradeData, dot, onSave }) {
  const components  = gradeData?.components ?? []
  const targetGrade = gradeData?.targetGrade ?? 85
  const [defenseMode, setDefenseMode] = useState(false)
  const [entryMode, setEntryMode] = useState('pct') // 'pct' | 'pts'

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
  const [ptsEarned, setPtsEarned] = useState(() => {
    const m = {}
    components.forEach(c => { m[c.id] = c.ptsEarned !== undefined ? String(c.ptsEarned) : '' })
    return m
  })
  const [ptsPossible, setPtsPossible] = useState(() => {
    const m = {}
    components.forEach(c => { m[c.id] = c.ptsPossible !== undefined ? String(c.ptsPossible) : '' })
    return m
  })

  const saveTimer = useRef(null)
  const autoSave = useCallback((grades, graded, earned, possible) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const updated = components.map(c => ({
        ...c,
        grade: graded[c.id] && grades[c.id] !== '' ? parseFloat(grades[c.id]) : null,
        graded: graded[c.id] && grades[c.id] !== '',
        ptsEarned: earned[c.id] !== '' ? parseFloat(earned[c.id]) : undefined,
        ptsPossible: possible[c.id] !== '' ? parseFloat(possible[c.id]) : undefined,
      }))
      onSave({ ...gradeData, components: updated })
    }, 600)
  }, [components, gradeData, onSave])

  const setGrade     = (id, val) => { const g = { ...localGrades, [id]: val }; setLocalGrades(g); autoSave(g, localGraded, ptsEarned, ptsPossible) }
  const toggleGraded = (id) => {
    const nowGraded = !localGraded[id]
    const g = { ...localGraded, [id]: nowGraded }
    setLocalGraded(g)
    autoSave(localGrades, g, ptsEarned, ptsPossible)
    if (nowGraded) {
      const comp = components.find(c => c.id === id)
      track('grade_logged', { course_name: course?.name, component: comp?.component })
    }
  }

  const setPtsEntry = (id, field, val) => {
    const e = field === 'earned'   ? { ...ptsEarned,   [id]: val } : ptsEarned
    const p = field === 'possible' ? { ...ptsPossible, [id]: val } : ptsPossible
    if (field === 'earned')   setPtsEarned(e)
    if (field === 'possible') setPtsPossible(p)
    // Derive pct grade when both fields filled
    const earned   = parseFloat(field === 'earned'   ? val : ptsEarned[id])
    const possible = parseFloat(field === 'possible' ? val : ptsPossible[id])
    if (!isNaN(earned) && !isNaN(possible) && possible > 0) {
      const pct = (earned / possible * 100).toFixed(2)
      const g = { ...localGrades, [id]: pct }
      const graded = { ...localGraded, [id]: true }
      setLocalGrades(g)
      setLocalGraded(graded)
      autoSave(g, graded, e, p)
    } else {
      autoSave(localGrades, localGraded, e, p)
    }
  }

  const liveComponents = useMemo(() =>
    components.map(c => ({ ...c, grade: localGraded[c.id] && localGrades[c.id] !== '' ? parseFloat(localGrades[c.id]) : null, graded: localGraded[c.id] && localGrades[c.id] !== '' })),
    [components, localGrades, localGraded]
  )

  const currentGrade = getCurrentGrade(liveComponents)
  const needed       = getNeededOnRemaining(liveComponents, targetGrade)
  const ltr          = letterGrade(currentGrade)
  const lc           = letterColor(ltr)
  // Defense: compute minimum floor to protect the current LETTER GRADE boundary, not the exact percentage
  const defenseThreshold = letterMinThreshold(ltr)
  const defense      = defenseMode ? getDefenseFloor(liveComponents, defenseThreshold) : null
  const gradedWeight = liveComponents.filter(c => c.graded).reduce((s, c) => s + c.weight, 0)
  const totalWeight  = liveComponents.reduce((s, c) => s + c.weight, 0)
  const pctGraded    = totalWeight > 0 ? (gradedWeight / totalWeight) * 100 : 0
  const targetLabel  = TARGET_OPTIONS.find(o => o.value === targetGrade)?.label ?? 'A'

  if (!components.length) return (
    <EmptyState
      icon={(<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>)}
      headline="No grade components yet"
      sub="Set up your grade components in the Plan tab to see this view."
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 24, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto', minWidth: 200 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 8 }}>Current grade</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: lc }}>
                {currentGrade !== null ? currentGrade.toFixed(1) : '-'}
              </span>
              <span style={{ fontSize: 22, fontWeight: 500, color: D.muted }}>%</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: lc, marginLeft: 8 }}>{ltr}</span>
            </div>
          </div>
          {needed.impossible ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.3)', color: D.pink, fontSize: 13, fontWeight: 600 }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginRight:6}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Target no longer reachable
            </div>
          ) : needed.needed !== null && needed.needed > 90 ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: D.orange, fontSize: 13, fontWeight: 600 }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.41 0zM12 9v4M12 17h.01"/>
              </svg>
              Possible but tough, need {needed.needed.toFixed(0)}%+ avg
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: D.mint, fontSize: 13, fontWeight: 600 }}>
              <IcoCheck /> On track for {targetLabel}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: D.dim, marginBottom: 8 }}>
            <span><span style={{ color: D.text, fontFamily: 'inherit', fontWeight: 500 }}>{pctGraded.toFixed(0)}%</span> of grade graded</span>
            <span><span style={{ color: D.text, fontFamily: 'inherit', fontWeight: 500 }}>{(100 - pctGraded).toFixed(0)}%</span> remaining</span>
          </div>
          <div style={{ height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pctGraded}%`, height: '100%', background: D.accent, transition: 'width 0.4s' }} />
          </div>
        </div>

        <div style={{ marginTop: 16, position: 'relative' }}>
          <button onClick={() => setDefenseMode(v => !v)} style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, cursor: 'pointer', background: defenseMode ? 'rgba(251,191,36,0.1)' : 'rgba(0,0,0,0.04)', border: defenseMode ? `1px solid ${D.amber}40` : `1px solid ${D.border}`, color: defenseMode ? D.amber : D.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoShield /> Grade Defense Mode {defenseMode ? 'ON' : 'OFF'}
          </button>
          {defenseMode && defense && (
            <div style={{ marginTop: 10, padding: 14, borderRadius: 10, background: `rgba(251,191,36,0.08)`, border: `1px solid ${D.amber}30` }}>
              {defense.impossible ? (
                <p style={{ fontSize: 12.5, color: D.amber, margin: 0 }}>
                  Your {ltr} is already out of reach. The graded scores bring you below the {ltr} threshold regardless of remaining work. Consider adjusting your target.
                </p>
              ) : defense.rawFloor <= 0 ? (
                <p style={{ fontSize: 12.5, color: D.amber, margin: 0 }}>
                  Your <span style={{ fontWeight: 700 }}>{ltr}</span> is safe. Even if you scored 0% on all remaining work, your current grades keep you in {ltr} territory. Your buffer is {Math.abs(defense.rawFloor?.toFixed(0))} points.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: D.amber, margin: '0 0 8px' }}>
                    To protect your <span style={{ fontWeight: 700 }}>{ltr}</span>, score at least{' '}
                    <span style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: 15 }}>{defense.floor?.toFixed(1)}%</span>{' '}
                    on remaining work. That's the floor to stay above the {ltr} grade boundary ({defenseThreshold}%).
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(251,191,36,0.12)', border: `1px solid ${D.amber}25`, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: D.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Min to keep {ltr}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: D.amber, fontFamily: 'inherit' }}>{defense.floor?.toFixed(1)}%</div>
                    </div>
                    <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', border: `1px solid ${D.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Buffer above floor</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: D.text, fontFamily: 'inherit' }}>{Math.max(0, currentGrade - defenseThreshold).toFixed(1)}pt</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase' }}>Grade breakdown</div>
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}` }}>
            {[{ id: 'pct', label: '%' }, { id: 'pts', label: 'pts' }].map(m => (
              <button key={m.id} onClick={() => setEntryMode(m.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: entryMode === m.id ? '#FFFFFF' : 'transparent', color: entryMode === m.id ? D.text : D.muted, boxShadow: entryMode === m.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none', transition: 'all 0.12s' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {liveComponents.map((c, i) => {
          const contrib = c.graded && c.grade !== null ? (c.grade * c.weight / (totalWeight || 100)) : null
          const gradeVal = localGrades[c.id] !== '' && !isNaN(parseFloat(localGrades[c.id])) ? parseFloat(localGrades[c.id]) : null
          const weightPct = totalWeight > 0 ? (c.weight / totalWeight) * 100 : 0
          return (
            <div key={c.id} style={{ padding: '14px 0', borderBottom: i < liveComponents.length - 1 ? `1px solid ${D.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: D.text }}>{c.component}</div>
                  <div style={{ fontSize: 11.5, color: D.dim, marginTop: 2 }}>
                    <span style={{ fontFamily: 'inherit' }}>{c.weight}%</span> of grade
                    {contrib != null && <> · adds <span style={{ color: D.indigo, fontFamily: 'inherit' }}>{contrib.toFixed(1)}%</span> to total</>}
                  </div>
                </div>
                <button onClick={() => toggleGraded(c.id)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, background: localGraded[c.id] ? 'rgba(59,97,196,0.08)' : 'rgba(0,0,0,0.04)', border: localGraded[c.id] ? '1px solid rgba(59,97,196,0.25)' : `1px solid ${D.border}`, color: localGraded[c.id] ? D.indigo : D.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {localGraded[c.id] && <span style={{ width: 5, height: 5, borderRadius: '50%', background: D.indigo }} />}
                  {localGraded[c.id] ? 'Graded' : 'Pending'}
                </button>
                {entryMode === 'pct' ? (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <input type="number" value={localGrades[c.id]} onChange={e => setGrade(c.id, e.target.value)} placeholder="--" className="gh-input"
                      style={{ width: 66, textAlign: 'center', color: gradeVal != null ? letterColor(letterGrade(gradeVal)) : D.dim, fontWeight: gradeVal != null ? 700 : 400 }} />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: D.dim, pointerEvents: 'none' }}>%</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <input type="number" value={ptsEarned[c.id] ?? ''} onChange={e => setPtsEntry(c.id, 'earned', e.target.value)} placeholder="--" className="gh-input"
                      style={{ width: 50, textAlign: 'center', color: gradeVal != null ? letterColor(letterGrade(gradeVal)) : D.dim, fontWeight: gradeVal != null ? 700 : 400 }} />
                    <span style={{ fontSize: 12, color: D.dim }}>/</span>
                    <input type="number" value={ptsPossible[c.id] ?? ''} onChange={e => setPtsEntry(c.id, 'possible', e.target.value)} placeholder="--" className="gh-input"
                      style={{ width: 50, textAlign: 'center', color: D.muted }} />
                  </div>
                )}
              </div>
              {/* Weight bar */}
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${weightPct}%`, background: localGraded[c.id] && gradeVal != null ? letterColor(letterGrade(gradeVal)) : D.border, transition: 'width 0.3s, background 0.3s' }} />
              </div>
              {entryMode === 'pts' && gradeVal != null && (
                <div style={{ fontSize: 11, color: D.dim, marginTop: 4, fontFamily: 'inherit' }}>
                  = <span style={{ fontWeight: 600, color: letterColor(letterGrade(gradeVal)) }}>{gradeVal.toFixed(1)}%</span>
                </div>
              )}
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
              <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.8, fontFamily: 'inherit', color: needed.impossible ? D.pink : needed.needed > 90 ? D.orange : D.indigo }}>
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
    <EmptyState
      icon={(<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>)}
      headline="No grade components yet"
      sub="Set up your grade components in the Plan tab to see this view."
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Projected hero */}
      <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 14, padding: 24, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, color: D.muted, textTransform: 'uppercase', marginBottom: 8 }}>Projected grade</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: lc }}>
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
                    <span style={{ fontSize: 10.5, color: D.dim, fontFamily: 'inherit' }}>· {c.weight}% weight</span>
                  </div>
                  <div style={{ width: 64, textAlign: 'center', padding: '5px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.03)', border: `1px solid ${isLocked ? 'rgba(52,211,153,0.3)' : D.border}`, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: isLocked ? D.mint : D.orange }}>
                    {Math.round(v)}
                  </div>
                </div>
                <div style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.05)' }} />
                  <div style={{ position: 'absolute', left: 0, height: 6, borderRadius: 3, width: `${v}%`, background: fillColor, pointerEvents: 'none' }} />
                  <input type="range" min="0" max="100" value={Math.round(v)} disabled={isLocked} onChange={e => setSlider(c.id, parseFloat(e.target.value))} className="gh-range" style={{ position: 'relative', background: 'transparent', opacity: isLocked ? 0.6 : 1 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="gh-bottom-bar" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10 }}>
        <button onClick={handleReset} style={{ padding: '13px 16px', background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, fontWeight: 500, color: D.text, cursor: 'pointer' }}>
          Reset to actuals
        </button>
        {scenarios.length < 3 && !showSaveInput ? (
          <button onClick={() => setShowSaveInput(true)} style={{ padding: '13px 16px', background: '#3B61C4', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
            Save scenario
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="gh-input-text" type="text" placeholder="Scenario name…" value={saveName} onChange={e => setSaveName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveScenario()} autoFocus style={{ flex: 1, minWidth: 0 }} />
            <button onClick={handleSaveScenario} style={{ padding: '8px 14px', background: '#3B61C4', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setShowSaveInput(false)} style={{ padding: '8px', border: `1px solid ${D.border}`, borderRadius: 8, color: D.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Cancel"><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
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
                      <button onClick={() => deleteScenario(sc.name)} style={{ color: D.dim, cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Delete scenario"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: slc, fontFamily: 'inherit' }}>{proj?.toFixed(1)}%</div>
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
                          return <td key={s.name} style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, fontFamily: 'inherit', color: isMax ? D.mint : isMin ? D.pink : D.muted }}>{score?.toFixed(0) ?? '-'}%</td>
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <td style={{ padding: '12px 16px', color: D.muted, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Projected</td>
                    {scenarios.map(s => {
                      const proj = getProjectedGrade(components.map(c => ({ ...c, graded: false })), s.overrides)
                      return <td key={s.name} style={{ padding: '12px 16px', textAlign: 'center', fontSize: 15, fontWeight: 800, color: letterColor(letterGrade(proj)), fontFamily: 'inherit' }}>{proj?.toFixed(1)}% {letterGrade(proj)}</td>
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

// ── Main ──────────────────────────────────────────────────────────────────────
// userId is still passed by OutputView but is no longer read here: the AI
// prediction call that needed it is gone, the math is local now.
export default function GradeHubView({ courses, onEditCourse, onShowPaywall, initialCourseIdx = 0, onSyncToCalendar }) {
  const plan = getActivePlan()
  const mobile = useIsMobile()

  const [activeCourseIdx, setActiveCourseIdx] = useState(() =>
    Math.max(0, Math.min(initialCourseIdx, courses.length - 1))
  )
  const [activeTab, setActiveTab] = useState('plan')

  useEffect(() => {
    const idx = Math.max(0, Math.min(initialCourseIdx, courses.length - 1))
    setActiveCourseIdx(idx)
  }, [initialCourseIdx, courses.length])

  // Fire-and-forget baseline capture for each course that has any graded component.
  // Server is idempotent (ON CONFLICT DO NOTHING) so calling this on every mount is safe.
  useEffect(() => {
    const coursesWithGrades = courses.filter(c => {
      const comps = c.gradeData?.components ?? []
      return comps.some(x => x && x.graded && x.grade != null)
    })
    if (!coursesWithGrades.length) return
    getAccessToken().then(token => {
      coursesWithGrades.forEach(c => {
        fetch('/api/capture-grade-baseline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ courseId: String(c.id) }),
        }).catch(() => {})
      })
    }).catch(() => {})
  }, [])

  const course    = courses[activeCourseIdx]
  const gradeData = course?.gradeData ?? null

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

    // 2. Push coach plan sessions onto the calendar.
    // This used to have its own date maths, which produced a different
    // schedule from the one Study Coach produced for the same plan. It now
    // calls the shared builder, so both routes agree.
    const courseKey = course.id ?? activeCourseIdx
    const cached = getCachedCoachPlan(courseKey)
    if (!cached?.plan?.weeklyFocus?.length) {
      // No plan to sync. Say so instead of reporting a success that did not
      // happen: the struggles above were still saved and will be picked up
      // the moment a plan is built.
      return { kind: 'noplan' }
    }

    const { sessions, skipped } = buildScheduleBlocks({
      plan: cached.plan,
      course,
      courseKey,
      courseIdx: activeCourseIdx,
      preferredTime: 'Morning',
      existingSessions: [],
      sessionLen: cached.formData?.sessionLen ?? cached.formData?.sessionMinutes ?? 60,
    })

    if (!sessions.length) return { kind: 'nothing' }
    onSyncToCalendar?.(sessions, courseKey)
    return { kind: 'synced', count: sessions.length, skipped: skipped.length }
  }, [gradeData, course, activeCourseIdx, onSyncToCalendar])

  if (plan === 'free') return <LockedState onShowPaywall={onShowPaywall} />
  if (!courses.length) return (
    <div style={{ background: G.pageBg, minHeight: '100vh', padding: '60px 32px', textAlign: 'center' }}>
      <p style={{ color: G.body, fontSize: 13 }}>Add courses to use the Grade Hub.</p>
    </div>
  )

  const dot      = course?.color?.dot ?? G.blue
  const gpa      = computeGPA(courses)
  const hasSetup = !!(gradeData?.components?.length)
  const activeDays = daysTo(course.examDate)
  const activeComps = gradeData?.components ?? []
  const activeAllGraded = activeComps.length > 0 && activeComps.every(c => c.graded && c.grade !== null && c.grade !== undefined)
  const activeMeta = activeAllGraded ? 'Complete' : (activeDays !== null && activeDays >= 0 ? `Final in ${activeDays} days` : null)

  return (
    <div style={{ background: G.pageBg, minHeight: '100vh', overflowX: 'hidden', maxWidth: '100vw', animation: 'gh-in 280ms cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{GH_STYLE}{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes gh-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="gh-content" style={{ maxWidth: 1080, margin: '0 auto', padding: '44px 40px 72px' }}>
        {/* Title block */}
        <div style={{ fontSize: mobile ? 10.5 : 11, fontWeight: 600, letterSpacing: '.1em', color: G.label, textTransform: 'uppercase' }}>
          Academic Control · {getCurrentSemester()}{!mobile && ` · ${courses.length} ${courses.length === 1 ? 'course' : 'courses'} tracked`}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: mobile ? 10 : 14, marginTop: mobile ? 8 : 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontFamily: GH_SERIF, fontSize: mobile ? 36 : 44, fontWeight: 500, color: G.ink, letterSpacing: '-0.01em' }}>
            Grade Hub<span style={{ color: G.blue }}>.</span>
          </h1>
          {gpa && (
            <span style={{ border: `1px solid ${G.chipBorder}`, borderRadius: 999, padding: mobile ? '3px 9px' : '4px 11px', fontSize: mobile ? 11.5 : 12, fontWeight: 500, color: G.body }}>
              GPA {gpa}
            </span>
          )}
        </div>

        {/* Course switcher */}
        <div className="gh-course-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 10, marginTop: mobile ? 20 : 26, alignItems: 'center' }}>
          {courses.map((c, i) => (
            <CourseChip
              key={c.id ?? i}
              course={c}
              active={activeCourseIdx === i}
              mobile={mobile}
              onClick={() => { setActiveCourseIdx(i); setActiveTab('plan') }}
            />
          ))}
        </div>
        {mobile && activeMeta && (
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 500, color: G.body }}>{activeMeta}</div>
        )}

        <Tabs
          active={activeTab}
          mobile={mobile}
          onChange={tab => { setActiveTab(tab); track('grade_hub_tab_changed', { tab, course_name: course?.name }) }}
        />

        {/* Recovery nudge. The Plan tab now states the shortfall in the hero and
            offers a retarget, so this only rides along on Track and Sandbox. */}
        {activeTab !== 'plan' && (() => {
          if (!hasSetup) return null
          const curr = getCurrentGrade(activeComps)
          const target = gradeData?.targetGrade ?? 85
          const gradedWeight = activeComps.filter(x => x.graded && x.grade != null).reduce((a, c) => a + (parseFloat(c.weight) || 0), 0)
          if (curr === null || gradedWeight < 30) return null
          const gap = target - curr
          if (gap < 10) return null
          const urgent = activeDays !== null && activeDays <= 21
          return (
            <div style={{ marginTop: 24, borderLeft: `3px solid ${G.amber}`, padding: '4px 0 6px 18px', maxWidth: 640 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.09em', color: G.amberText, textTransform: 'uppercase' }}>
                {gap.toFixed(0)} points below target
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: G.secondary, marginTop: 6 }}>
                {urgent
                  ? `Your final is in ${activeDays} days. `
                  : ''}
                Model the scores that close the gap in the Sandbox.{' '}
                {activeTab !== 'sandbox' && (
                  <button className="gh-link" onClick={() => setActiveTab('sandbox')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 600, color: G.blue }}>
                    Open Sandbox
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        <div style={{ marginTop: activeTab === 'plan' ? 0 : 24 }}>
          {activeTab === 'plan' && (
            <PlanTab
              course={course}
              gradeData={gradeData}
              onSave={handleSaveGradeData}
              onSync={handleSyncStudyPlan}
              mobile={mobile}
            />
          )}
          {activeTab === 'track'   && <TrackTab   course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />}
          {activeTab === 'sandbox' && <SandboxTab course={course} gradeData={gradeData} dot={dot} onSave={handleSaveGradeData} />}
        </div>
      </div>
    </div>
  )
}
