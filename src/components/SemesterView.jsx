import { useState, useEffect, useCallback } from 'react'
import { getAccessToken } from '../lib/supabase'
import { track } from '../lib/analytics'
import { courseColor } from '../theme/tokens'

// Design tokens -- faithful to prototype
const SERIF = "'Newsreader', Georgia, serif"
const SANS  = "'Inter', system-ui, sans-serif"
const PAGE  = '#f5f6f8'
const TEXT  = '#14161a'
const DIM   = '#5a616b'
const MUTED = '#8b929c'
const FAINT = '#a3a9b2'
const BLUE  = '#3d5afe'
const GREEN = '#2f9e44'
const RED   = '#d33a3f'
const AMBER = '#e8890c'
const BORDER       = '#ecedf0'
const INNER_BORDER = '#f1f2f4'
const CARD_BORDER  = '#e7e9ee'

// Artifact type definitions
const ATYPES = {
  cheat_sheet:      { tag:'CS', label:'Cheat sheet',      bg:'#eef1ff', fg:'#3d5afe', action:'Download' },
  practice_exam:    { tag:'PE', label:'Practice exam',    bg:'#e8f0ff', fg:'#2f5bd8', action:'Retake'   },
  quiz_burst:       { tag:'QB', label:'Quiz burst',       bg:'#fdf3e7', fg:'#c2410c', action:'Retake'   },
  brain_dump_score: { tag:'BD', label:'Brain dump',       bg:'#eaf7ee', fg:'#2f9e44', action:'Open'     },
  diagram:          { tag:'DG', label:'Diagram',          bg:'#e7f6f4', fg:'#12a594', action:'Open'     },
  podcast:          { tag:'PC', label:'Podcast',          bg:'#f3edff', fg:'#7c5cff', action:'Play'     },
  mnemonic:         { tag:'MN', label:'Mnemonic set',     bg:'#fdecf3', fg:'#c026a6', action:'Open'     },
  flashcard:        { tag:'FC', label:'Flashcards',       bg:'#fdf8e7', fg:'#b45309', action:'Open'     },
  flashcard_set:    { tag:'FC', label:'Flashcards',       bg:'#fdf8e7', fg:'#b45309', action:'Open'     },
  essay_outline:    { tag:'EO', label:'Essay outline',    bg:'#f0f4ff', fg:'#4263eb', action:'Open'     },
}
function atype(t) {
  return ATYPES[t] || { tag: (t || '??').slice(0,2).toUpperCase(), label: t || 'Unknown', bg:'#f5f5f5', fg:'#8b929c', action:'Open' }
}

// Filter definitions
const FILTER_DEFS = [
  { key:'all',              label:'All'            },
  { key:'cheat_sheet',      label:'Cheat sheets'   },
  { key:'practice_exam',    label:'Practice exams' },
  { key:'quiz_burst',       label:'Quiz bursts'    },
  { key:'brain_dump_score', label:'Brain dumps'    },
  { key:'diagram',          label:'Diagrams'       },
  { key:'podcast',          label:'Podcasts'       },
  { key:'mnemonic',         label:'Mnemonics'      },
  { key:'flashcard',        label:'Flashcards'     },
  { key:'essay_outline',    label:'Essay outlines' },
]

// Mastery level config
const LEVELS = {
  insufficient_data: { pips:0, pipColor:'#9aa0a9', color:'#9aa0a9', word:'Unknown',   dashed:true  },
  weak:              { pips:1, pipColor:'#e5484d', color:'#d33a3f', word:'Weak'                    },
  developing:        { pips:2, pipColor:'#e8890c', color:'#c2410c', word:'Developing'              },
  solid:             { pips:3, pipColor:'#3d5afe', color:'#3d5afe', word:'Solid'                   },
  strong:            { pips:4, pipColor:'#2f9e44', color:'#2f9e44', word:'Strong'                  },
}
function lvlCfg(l) { return LEVELS[l] || LEVELS.insufficient_data }

// Trend config
const TRENDS = {
  new:  { glyph:'+',    word:'new',    color:'#a3a9b2' },
  up:   { glyph:'↑', word:'up',   color:'#2f9e44' },
  down: { glyph:'↓', word:'down', color:'#d33a3f' },
  flat: { glyph:'→', word:'steady', color:'#8b929c' },
}
function trdCfg(t) { return TRENDS[t] || TRENDS.flat }

// Utilities
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 700)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

function fmtShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

function relTime(iso) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return fmtShort(iso)
}

function fmtGrade(g) {
  if (g === null || g === undefined) return '--'
  return typeof g === 'number' ? `${g}%` : String(g)
}

function deadlineStr(nd) {
  if (!nd) return null
  const { title, daysUntil } = nd
  const when = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil}d`
  return `${title} ${when}`
}

function deadlineColor(daysUntil) {
  if (daysUntil <= 2) return RED
  if (daysUntil <= 7) return AMBER
  return MUTED
}

function recallChipStyle(score) {
  if (score === null || score === undefined) return null
  return {
    bg:    score >= 80 ? '#eaf7ee' : score >= 65 ? '#fdf3e7' : '#fff0f0',
    color: score >= 80 ? GREEN     : score >= 65 ? AMBER     : RED,
  }
}

function fileExt(filename) {
  if (!filename) return ''
  const m = filename.match(/\.([^.]+)$/)
  return m ? m[1].toUpperCase() : ''
}

// Spinner
function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}>
      <svg style={{ animation:'sem-spin .8s linear infinite', width:20, height:20, color:BLUE }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
    </div>
  )
}

// Back link
function BackLink({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display:'inline-flex', alignItems:'center', gap:6,
        background:'none', border:'none', cursor:'pointer',
        color:BLUE, fontSize:13, fontWeight:600, padding:'18px 0 10px',
        fontFamily:SANS,
      }}
    >
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
      {label}
    </button>
  )
}

// Pips component
function Pips({ lvl, size = 'normal' }) {
  const cfg = lvlCfg(lvl)
  const w = size === 'legend' ? 7 : 9
  const h = size === 'legend' ? 12 : 16
  return (
    <span style={{ display:'inline-flex', gap:3 }}>
      {[0,1,2,3].map(i => {
        const filled = i < cfg.pips
        return (
          <span
            key={i}
            style={{
              width:w, height:h, borderRadius:3, flexShrink:0,
              background: filled ? cfg.pipColor : BORDER,
              border: (!filled && cfg.dashed) ? '1.5px dashed #c8ccd3' : 'none',
              boxSizing:'border-box',
            }}
          />
        )
      })}
    </span>
  )
}

// ── Layer 1: Course card ──────────────────────────────────────────────────────
function CourseCard({ course, idx, onClick }) {
  const mobile = useIsMobile()
  const [hover, setHover] = useState(false)
  const dot      = course.color || courseColor(idx).dot
  const nd       = course.nextDeadline
  const dStr     = deadlineStr(nd)
  const dCol     = nd ? deadlineColor(nd.daysUntil) : MUTED
  const hasGrade = course.currentGrade !== null && course.currentGrade !== undefined

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:'block', width:'100%', textAlign:'left',
        padding: mobile ? '16px 18px' : '22px 26px',
        borderRadius:16,
        border:`1px solid ${hover ? '#c3ccfb' : CARD_BORDER}`,
        background:'#fff',
        boxShadow: hover ? '0 6px 22px rgba(43,60,150,.09)' : '0 1px 2px rgba(16,24,40,.04)',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition:'border-color .15s, box-shadow .15s, transform .15s',
        cursor:'pointer', fontFamily:SANS,
      }}
    >
      {mobile ? (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ width:11, height:11, borderRadius:3, background:dot, flexShrink:0 }} />
            {course.code && <span style={{ fontSize:12, fontWeight:700, color:'#8b929c' }}>{course.code}</span>}
          </div>
          <div style={{ fontFamily:SERIF, fontSize:20, fontWeight:600, color:TEXT, lineHeight:1.15, marginBottom:10 }}>{course.name}</div>
          {dStr && (
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:12 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:dCol, flexShrink:0 }} />
              <span style={{ fontSize:12, color:dCol }}>{dStr}</span>
            </div>
          )}
          <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>
            {hasGrade && (
              <div>
                <div style={{ fontFamily:SERIF, fontSize:28, fontWeight:500, lineHeight:1, color:TEXT }}>{fmtGrade(course.currentGrade)}</div>
                {course.delta !== null && course.delta !== undefined && (
                  <span style={{ fontSize:13, fontWeight:700, color: course.delta >= 0 ? GREEN : RED }}>
                    {course.delta >= 0 ? '↑' : '↓'} {Math.abs(course.delta)}
                  </span>
                )}
              </div>
            )}
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              {[
                { n:course.assetCount,   label:'ASSETS'   },
                { n:course.sessionCount, label:'SESSIONS' },
                { n:course.topicCount,   label:'TOPICS'   },
              ].map(s => (
                <div key={s.label} style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:SERIF, fontSize:18, fontWeight:600, color:TEXT }}>{s.n}</div>
                  <div style={{ fontSize:10, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        // Desktop: 4-column grid
        <div style={{ display:'grid', gridTemplateColumns:'1fr 150px 250px 20px', gap:26, alignItems:'center' }}>
          {/* Col 1: Identity */}
          <div style={{ borderRight:`1px solid ${INNER_BORDER}`, paddingRight:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ width:11, height:11, borderRadius:3, background:dot, flexShrink:0 }} />
              {course.code && <span style={{ fontSize:12, fontWeight:700, color:'#8b929c' }}>{course.code}</span>}
            </div>
            <div style={{ fontFamily:SERIF, fontSize:23, fontWeight:600, color:TEXT, lineHeight:1.2, marginBottom:6 }}>{course.name}</div>
            {dStr && (
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:dCol, flexShrink:0 }} />
                <span style={{ fontSize:12.5, color:dCol }}>{dStr}</span>
              </div>
            )}
          </div>

          {/* Col 2: Hero grade */}
          <div>
            {hasGrade ? (
              <>
                <div style={{ fontFamily:SERIF, fontSize:52, fontWeight:500, lineHeight:.9, color:TEXT }}>{fmtGrade(course.currentGrade)}</div>
                {course.delta !== null && course.delta !== undefined && (
                  <div style={{ fontSize:14, fontWeight:700, color: course.delta >= 0 ? GREEN : RED, marginBottom:8 }}>
                    {course.delta >= 0 ? '↑' : '↓'} {Math.abs(course.delta)}
                  </div>
                )}
                {(course.baselineGrade !== null && course.baselineGrade !== undefined || course.targetGrade) && (
                  <div style={{ fontSize:12.5, color:'#8b929c', marginTop:4 }}>
                    {course.baselineGrade !== null && course.baselineGrade !== undefined ? `from ${course.baselineGrade}` : ''}
                    {course.baselineGrade !== null && course.baselineGrade !== undefined && course.targetGrade ? ' · ' : ''}
                    {course.targetGrade ? `target ${course.targetGrade}` : ''}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize:13, color:FAINT }}>No grade yet</div>
            )}
          </div>

          {/* Col 3: Stats */}
          <div style={{ display:'flex', alignItems:'center' }}>
            {[
              { n:course.assetCount,   label:'ASSETS'   },
              { n:course.sessionCount, label:'SESSIONS' },
              { n:course.topicCount,   label:'TOPICS'   },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{ flex:1, minWidth:82, paddingLeft: i > 0 ? 16 : 0, borderLeft: i > 0 ? `1px solid ${INNER_BORDER}` : 'none' }}
              >
                <div style={{ fontFamily:SERIF, fontSize:21, fontWeight:600, color:TEXT }}>{s.n}</div>
                <div style={{ fontSize:11.5, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Col 4: Chevron */}
          <div style={{ fontSize:24, color:'#c8ccd3', textAlign:'center', lineHeight:1 }}>&#8250;</div>
        </div>
      )}
    </button>
  )
}

// ── Layer 1: Semester view ────────────────────────────────────────────────────
function SemView({ data, onCourse }) {
  const courses    = data?.courses ?? []
  const totals     = data?.totals  ?? {}
  const earlyState = (totals.assets ?? 0) <= 3 && (totals.sessions ?? 0) <= 2

  const stats = [
    { n: courses.length,        label: courses.length === 1        ? 'course'      : 'courses'      },
    { n: totals.assets  ?? 0,   label: (totals.assets  ?? 0) === 1 ? 'study asset' : 'study assets' },
    { n: totals.sessions ?? 0,  label: (totals.sessions ?? 0) === 1 ? 'session'    : 'sessions'     },
    { n: totals.weeksIn ?? 0,   label: (totals.weeksIn  ?? 0) === 1 ? 'week in'   : 'weeks in'     },
  ]

  return (
    <div style={{ fontFamily:SANS, maxWidth:900, margin:'0 auto', padding:'0 24px 80px' }}>
      {/* Eyebrow */}
      <div style={{ marginTop:40, fontSize:11.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.12em', color:'#a3a9b2' }}>
        StudyEdge AI
      </div>

      {/* H1 */}
      <h1 style={{ fontFamily:SERIF, fontSize:44, fontWeight:600, margin:'8px 0 0', lineHeight:1.04, letterSpacing:'-.01em', color:TEXT }}>
        My semester<span style={{ color:BLUE }}>.</span>
      </h1>

      {/* Summary line */}
      <div style={{ marginTop:14, display:'flex', alignItems:'center', flexWrap:'wrap', rowGap:4 }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#99a0aa', letterSpacing:'.09em', marginRight:14 }}>THIS SEMESTER</span>
        {stats.map((s, i) => (
          <span key={s.label} style={{ display:'inline-flex', alignItems:'center' }}>
            {i > 0 && <span style={{ color:'#c8ccd3', margin:'0 8px' }}>&middot;</span>}
            <strong style={{ fontSize:14, fontWeight:600, color:'#14161a', marginRight:4 }}>{s.n}</strong>
            <span style={{ fontSize:13.5, color:'#5a616b' }}>{s.label}</span>
          </span>
        ))}
      </div>

      {/* Course cards */}
      <div style={{ marginTop:32, display:'flex', flexDirection:'column', gap:14 }}>
        {courses.map((c, i) => (
          <CourseCard key={c.id} course={c} idx={i} onClick={() => onCourse(c.id, i)} />
        ))}
      </div>

      {/* Early state message */}
      {earlyState && courses.length > 0 && (
        <div style={{ margin:'18px 2px 0', color:'#8b929c', fontSize:13, lineHeight:1.5 }}>
          Two days in. Everything above is already yours, and it grows every time you study.
        </div>
      )}
    </div>
  )
}

// ── Layer 2: Uploads group ────────────────────────────────────────────────────
function UploadsGroup({ uploads }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        <span style={{ fontFamily:SERIF, fontSize:20, fontWeight:600, color:TEXT }}>From you</span>
        <span style={{ fontSize:12, fontWeight:700, color:'#6b7280', background:'#eef0f4', borderRadius:20, padding:'2px 10px' }}>{uploads.length}</span>
      </div>
      <div style={{ margin:'8px 0 0', color:'#8b929c', fontSize:13.5, lineHeight:1.5 }}>
        Syllabi, notes, and files you shared with StudyEdge AI.
      </div>
      {uploads.length === 0 && (
        <div style={{ marginTop:16, color:FAINT, fontSize:13 }}>No uploads yet.</div>
      )}
      <div style={{ marginTop:14 }}>
        {uploads.map((u, i) => {
          const ext = fileExt(u.filename)
          return (
            <div
              key={u.id}
              style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'13px 16px',
                borderTop: `1px solid ${INNER_BORDER}`,
                borderBottom: i === uploads.length - 1 ? `1px solid ${INNER_BORDER}` : 'none',
              }}
            >
              <div style={{
                width:40, height:40, borderRadius:9, background:'#f0f1f4', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:10, fontWeight:700, color:MUTED, fontFamily:SANS,
              }}>
                {ext || 'FILE'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.filename}</div>
                <div style={{ fontSize:12, color:'#8b929c', marginTop:2 }}>
                  {u.kind ? u.kind.charAt(0).toUpperCase() + u.kind.slice(1) : 'Upload'}
                  {u.char_count ? ` · ${Math.round(u.char_count / 1000)}k chars` : ''}
                </div>
              </div>
              <div style={{ fontSize:12, color:'#a3a9b2', minWidth:64, textAlign:'right', flexShrink:0 }}>{fmtShort(u.uploaded_at)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Layer 2: Single artifact row ──────────────────────────────────────────────
function ArtifactRow({ artifact, onOpen, isLast }) {
  const [hover, setHover] = useState(false)
  const at = atype(artifact.artifact_type)
  return (
    <div
      onClick={() => onOpen(artifact.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:'flex', alignItems:'center', gap:14,
        padding:'13px 16px',
        borderTop:`1px solid ${INNER_BORDER}`,
        borderBottom: isLast ? `1px solid ${INNER_BORDER}` : 'none',
        background: hover ? '#f7f8fb' : 'transparent',
        cursor:'pointer',
        transition:'background .1s',
      }}
    >
      <div style={{
        width:40, height:40, borderRadius:9, background:at.bg, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:11, fontWeight:700, color:at.fg, fontFamily:SANS, letterSpacing:'.02em',
      }}>
        {at.tag}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {artifact.title}
        </div>
        <div style={{ fontSize:12, color:'#8b929c', marginTop:1 }}>{at.label}</div>
      </div>
      <div style={{ fontSize:12, color:'#a3a9b2', minWidth:64, textAlign:'right', flexShrink:0 }}>{fmtShort(artifact.created_at)}</div>
      <div style={{ fontSize:12, fontWeight:600, color:BLUE, minWidth:66, textAlign:'right', flexShrink:0 }}>{at.action}</div>
    </div>
  )
}

// ── Layer 2: Artifacts group with filter bar ──────────────────────────────────
function ArtifactsGroup({ artifacts, onOpen }) {
  const [filter, setFilter] = useState('all')
  const typesPresent = new Set(artifacts.map(a => a.artifact_type))
  const visibleFilters = FILTER_DEFS.filter(f => f.key === 'all' || typesPresent.has(f.key))
  const visible = filter === 'all' ? artifacts : artifacts.filter(a => a.artifact_type === filter)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        <span style={{ fontFamily:SERIF, fontSize:20, fontWeight:600, color:TEXT }}>Made for you</span>
        <span style={{ fontSize:12, fontWeight:700, color:'#6b7280', background:'#eef0f4', borderRadius:20, padding:'2px 10px' }}>{artifacts.length}</span>
      </div>
      <div style={{ margin:'8px 0 0', color:'#8b929c', fontSize:13.5, lineHeight:1.5 }}>
        Cheat sheets, practice exams, quiz bursts, and everything else StudyEdge AI made for you.
      </div>

      {visibleFilters.length > 1 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:14 }}>
          {visibleFilters.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  border:`1px solid ${active ? BLUE : '#e2e4e9'}`,
                  background: active ? BLUE : '#fff',
                  color: active ? '#fff' : '#4a505a',
                  fontSize:12.5, fontWeight:600,
                  padding:'7px 13px', borderRadius:9,
                  cursor:'pointer', fontFamily:SANS,
                  transition:'background .12s, border-color .12s, color .12s',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ marginTop:14 }}>
        {visible.length === 0 && (
          <div style={{ color:FAINT, fontSize:13, padding:'12px 0' }}>Nothing here yet.</div>
        )}
        {visible.map((a, i) => (
          <ArtifactRow key={a.id} artifact={a} onOpen={onOpen} isLast={i === visible.length - 1} />
        ))}
      </div>
    </div>
  )
}

// ── Layer 2: Mastery map ──────────────────────────────────────────────────────
function MasteryMap({ mastery }) {
  const updatedAt = mastery.length > 0
    ? mastery.reduce((latest, m) => { const t = m.lastTouchedAt || ''; return t > latest ? t : latest }, '')
    : null

  const LEGEND = [
    { key:'insufficient_data', label:'Unknown'    },
    { key:'weak',              label:'Weak'       },
    { key:'developing',        label:'Developing' },
    { key:'solid',             label:'Solid'      },
    { key:'strong',            label:'Strong'     },
  ]

  return (
    <div style={{ background:'#fff', border:`1px solid ${BORDER}`, borderRadius:16, padding:'20px 22px 22px' }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', color:'#5a616b', letterSpacing:'.04em' }}>Mastery map</span>
        <span style={{ fontSize:12, color:'#a3a9b2' }}>
          {mastery.length} topic{mastery.length !== 1 ? 's' : ''}
          {updatedAt ? ` · updated ${relTime(updatedAt)}` : ''}
        </span>
      </div>

      <div style={{ display:'flex', gap:14, flexWrap:'wrap', paddingBottom:16, borderBottom:`1px solid ${INNER_BORDER}`, marginTop:14 }}>
        {LEGEND.map(entry => (
          <div key={entry.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Pips lvl={entry.key} size="legend" />
            <span style={{ fontSize:11.5, color:'#8b929c' }}>{entry.label}</span>
          </div>
        ))}
      </div>

      {mastery.length === 0 && (
        <div style={{ paddingTop:16, color:FAINT, fontSize:13 }}>
          No topics tracked yet. Complete quizzes and brain dumps to build your knowledge map.
        </div>
      )}
      <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'2px 20px' }}>
        {mastery.map((m, i) => {
          const lc = lvlCfg(m.level)
          const tc = trdCfg(m.trend)
          return (
            <div key={m.key || i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${INNER_BORDER}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                <div style={{ fontSize:11.5, fontWeight:600, color:tc.color, marginTop:1 }}>{tc.glyph} {tc.word}</div>
              </div>
              <div style={{ flexShrink:0, textAlign:'right' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                  <Pips lvl={m.level} />
                  <span style={{ fontSize:12.5, fontWeight:600, color:lc.color }}>{lc.word}</span>
                </div>
                {m.lastTouchedAt && (
                  <div style={{ fontSize:11, color:'#b0b6be', marginTop:2 }}>{relTime(m.lastTouchedAt)}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Layer 2: Session history ──────────────────────────────────────────────────
function SessionHistory({ sessions }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${BORDER}`, borderRadius:16, padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', color:'#5a616b', letterSpacing:'.04em' }}>Session history</span>
        <span style={{ fontSize:12, color:'#a3a9b2' }}>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
      </div>
      {sessions.length === 0 && (
        <div style={{ marginTop:12, color:FAINT, fontSize:13 }}>No sessions logged yet.</div>
      )}
      <div style={{ marginTop:12 }}>
        {sessions.map((s, i) => {
          const chip = recallChipStyle(s.recallScore)
          return (
            <div key={s.id || i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:`1px solid ${INNER_BORDER}` }}>
              <span style={{ fontSize:12, color:'#a3a9b2', width:48, flexShrink:0 }}>{s.dateStr || fmtShort(s.created_at)}</span>
              <span style={{ fontSize:13, fontWeight:500, color:TEXT, flex:1 }}>{s.sessionType || 'Study session'}</span>
              {s.duration != null && (
                <span style={{ fontSize:12, color:'#8b929c', width:52, textAlign:'right', flexShrink:0 }}>{s.duration}m</span>
              )}
              {chip && (
                <span style={{ fontSize:11.5, fontWeight:700, color:chip.color, background:chip.bg, borderRadius:6, padding:'2px 7px', flexShrink:0 }}>
                  {s.recallScore}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Layer 2: Brain dumps ──────────────────────────────────────────────────────
function BrainDumps({ brainDumps }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${BORDER}`, borderRadius:16, padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', color:'#5a616b', letterSpacing:'.04em' }}>Brain dumps</span>
        <span style={{ fontSize:12, color:'#a3a9b2' }}>{brainDumps.length} in your words</span>
      </div>
      {brainDumps.length === 0 && (
        <div style={{ marginTop:12, color:FAINT, fontSize:13 }}>No brain dumps yet.</div>
      )}
      <div style={{ marginTop:12 }}>
        {brainDumps.map((b, i) => {
          const score = b.recallScore ?? b.score ?? null
          const chip  = recallChipStyle(score)
          return (
            <div key={b.id || i} style={{ padding:'10px 0', borderBottom:`1px solid ${INNER_BORDER}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: b.textExcerpt ? 5 : 0 }}>
                <span style={{ fontSize:13, fontWeight:600, color:TEXT, flex:1 }}>{b.topic || b.title || 'Brain dump'}</span>
                <span style={{ fontSize:11, color:'#a3a9b2' }}>{fmtShort(b.created_at)}</span>
                {chip && (
                  <span style={{ fontSize:11.5, fontWeight:700, color:chip.color, background:chip.bg, borderRadius:6, padding:'2px 7px', flexShrink:0 }}>
                    {score}%
                  </span>
                )}
              </div>
              {b.textExcerpt && (
                <div style={{ fontFamily:SERIF, fontSize:12.5, color:'#5a616b', fontStyle:'italic', lineHeight:1.5 }}>
                  "{b.textExcerpt}"
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Layer 2: Course detail ────────────────────────────────────────────────────
function CourseDetailView({ courseId, colorIdx, onBack, onArtifact }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const token = await getAccessToken()
        const res   = await fetch(`/api/semester-course?courseId=${encodeURIComponent(courseId)}`, {
          headers: { Authorization:`Bearer ${token}` },
        })
        const json = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(json.error || 'Failed to load course')
          else setData(json)
        }
      } catch {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    track('semester_course_opened', { courseId })
  }, [courseId])

  const course    = data?.course
  const uploads   = data?.uploads   ?? []
  const artifacts = data?.artifacts ?? []
  const mastery   = data?.mastery   ?? []
  const sessions  = data?.sessions  ?? []
  const dot       = (course?.color) || courseColor(colorIdx).dot
  const brainDumps = artifacts.filter(a => a.artifact_type === 'brain_dump_score')

  return (
    <div style={{ fontFamily:SANS, maxWidth:900, margin:'0 auto', padding:'0 24px 80px' }}>
      <BackLink label="My semester" onClick={onBack} />

      {loading && <Spinner />}
      {error && <div style={{ color:RED, fontSize:13, padding:'8px 0' }}>{error}</div>}

      {course && (
        <>
          {/* Course header */}
          <div style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ width:11, height:11, borderRadius:3, background:dot, flexShrink:0 }} />
              {course.code && <span style={{ fontSize:12, fontWeight:700, color:'#8b929c' }}>{course.code}</span>}
            </div>
            <h2 style={{ fontFamily:SERIF, fontSize:32, fontWeight:600, margin:'4px 0 0', color:TEXT, lineHeight:1.1 }}>{course.name}</h2>
          </div>

          {/* Weight strip */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:26, padding:'16px 20px', background:'#fff', border:`1px solid ${BORDER}`, borderRadius:14, marginBottom:40 }}>
            <div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                <span style={{ fontFamily:SERIF, fontSize:30, fontWeight:500, color:TEXT }}>{fmtGrade(course.currentGrade)}</span>
                {course.delta !== null && course.delta !== undefined && (
                  <span style={{ fontSize:14, fontWeight:700, color: course.delta >= 0 ? GREEN : RED }}>
                    {course.delta >= 0 ? '↑' : '↓'} {Math.abs(course.delta)}
                  </span>
                )}
              </div>
              <div style={{ fontSize:11, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em', marginTop:2 }}>GRADE</div>
            </div>

            {course.targetGrade && (
              <>
                <div style={{ width:1, background:BORDER, alignSelf:'stretch' }} />
                <div>
                  <div style={{ fontFamily:SERIF, fontSize:30, fontWeight:500, color:TEXT }}>{course.targetGrade}</div>
                  <div style={{ fontSize:11, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em', marginTop:2 }}>TARGET</div>
                </div>
              </>
            )}

            <div style={{ width:1, background:BORDER, alignSelf:'stretch' }} />
            <div>
              <div style={{ fontFamily:SERIF, fontSize:30, fontWeight:500, color:TEXT }}>{data?.stats?.assetCount ?? 0}</div>
              <div style={{ fontSize:11, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em', marginTop:2 }}>ASSETS</div>
            </div>

            <div style={{ width:1, background:BORDER, alignSelf:'stretch' }} />
            <div>
              <div style={{ fontFamily:SERIF, fontSize:30, fontWeight:500, color:TEXT }}>{data?.stats?.sessionCount ?? 0}</div>
              <div style={{ fontSize:11, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em', marginTop:2 }}>SESSIONS</div>
            </div>

            <div style={{ width:1, background:BORDER, alignSelf:'stretch' }} />
            <div>
              <div style={{ fontFamily:SERIF, fontSize:30, fontWeight:500, color:TEXT }}>{data?.stats?.topicCount ?? 0}</div>
              <div style={{ fontSize:11, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.04em', marginTop:2 }}>TOPICS</div>
            </div>
          </div>

          {/* Group 1: From you */}
          <div style={{ marginBottom:40 }}>
            <UploadsGroup uploads={uploads} />
          </div>

          {/* Group 2: Made for you */}
          <div style={{ marginBottom:40 }}>
            <ArtifactsGroup artifacts={artifacts} onOpen={onArtifact} />
          </div>

          {/* Group 3: What you know */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <span style={{ fontFamily:SERIF, fontSize:20, fontWeight:600, color:TEXT }}>What you know</span>
            </div>
            <div style={{ margin:'8px 0 16px', color:'#8b929c', fontSize:13.5, lineHeight:1.5 }}>
              How well you know each topic, based on your quizzes, brain dumps, and practice exams.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <MasteryMap mastery={mastery} />
              {sessions.length > 0 && <SessionHistory sessions={sessions} />}
              {brainDumps.length > 0 && <BrainDumps brainDumps={brainDumps} />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Layer 3: Practice exam retake ─────────────────────────────────────────────
function PracticeExamRetake({ artifact }) {
  const { payload, course_id: courseId, course_name: courseName } = artifact
  const questions = Array.isArray(payload?.questions) ? payload.questions : []
  const [selected, setSelected]   = useState({})
  const [graded, setGraded]       = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const mcQuestions = questions.filter(q => Array.isArray(q.options) && q.options.length > 0)

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    const results = questions.map((q, i) => {
      const isMc = Array.isArray(q.options) && q.options.length > 0
      if (!isMc) return { q, correct:null }
      const given = selected[i] ?? null
      return { q, given, correct: given !== null && given === q.answer }
    })
    setGraded(results)

    const signals = results
      .map(({ q, correct }) => {
        if (correct === null) return null
        const topic = typeof q.topic === 'string' ? q.topic.trim() : ''
        if (!topic) return null
        return { signalType:'practice_exam_answer', courseId, courseName, topic, rawScore: correct ? 1 : 0, metadata:{} }
      })
      .filter(Boolean).slice(0, 50)

    if (signals.length && courseId) {
      try {
        const token = await getAccessToken()
        fetch('/api/record-signals', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body: JSON.stringify({ signals }),
        }).catch(() => {})
      } catch {}
    }
    track('semester_practice_exam_retake', { questionCount: questions.length })
  }, [questions, selected, submitted, courseId, courseName])

  const handleReset = () => { setSelected({}); setGraded(null); setSubmitted(false) }

  if (mcQuestions.length === 0) {
    return <div style={{ color:FAINT, fontSize:13 }}>This exam has only short-answer questions and cannot be auto-graded here.</div>
  }

  const totalGradable = graded ? graded.filter(g => g.correct !== null).length : 0
  const score = graded && totalGradable > 0
    ? Math.round((graded.filter(g => g.correct === true).length / totalGradable) * 100)
    : null

  return (
    <div>
      {payload.focus && <div style={{ fontSize:12, color:MUTED, marginBottom:16, fontStyle:'italic' }}>Focus: {payload.focus}</div>}

      {graded && score !== null && (
        <div style={{ marginBottom:20, padding:'14px 16px', borderRadius:12, background: score >= 70 ? '#eaf7ee' : '#fdf3e7', border:`1px solid ${score >= 70 ? '#a3e0b4' : '#f5cba7'}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:SERIF, fontSize:28, fontWeight:500, color: score >= 70 ? GREEN : AMBER }}>{score}%</div>
            <div style={{ fontSize:12, color:MUTED }}>{graded.filter(g => g.correct === true).length} of {totalGradable} correct</div>
          </div>
          <button onClick={handleReset} style={{ fontSize:12, fontWeight:600, color:BLUE, padding:'6px 12px', borderRadius:7, border:'1px solid #c3ccfb', background:'#eef1ff', cursor:'pointer', fontFamily:SANS }}>
            Retake
          </button>
        </div>
      )}

      {questions.map((q, i) => {
        const isMc      = Array.isArray(q.options) && q.options.length > 0
        const result    = graded ? graded[i] : null
        const isCorrect = result?.correct === true
        const isWrong   = result?.correct === false
        return (
          <div key={i} style={{ marginBottom:18, padding:'14px 16px', borderRadius:12, background:PAGE, border:`1px solid ${graded ? (isCorrect ? '#a3e0b4' : isWrong ? '#f5b8b8' : BORDER) : BORDER}` }}>
            <div style={{ fontSize:13, fontWeight:600, color:TEXT, marginBottom:10, lineHeight:1.5 }}>
              <span style={{ color:MUTED, marginRight:6 }}>Q{i + 1}.</span>{q.question}
            </div>
            {isMc && (
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
                {q.options.map((opt, oi) => {
                  const isSelected = selected[i] === opt
                  const isAnswer   = opt === q.answer
                  let bg = '#fff', border = BORDER, color = DIM
                  if (graded) {
                    if (isAnswer) { bg = '#eaf7ee'; border = '#a3e0b4'; color = GREEN }
                    else if (isSelected) { bg = '#fff0f0'; border = '#f5b8b8'; color = RED }
                  } else if (isSelected) { bg = '#eef1ff'; border = '#c3ccfb'; color = BLUE }
                  return (
                    <button
                      key={oi}
                      disabled={!!graded}
                      onClick={() => setSelected(prev => ({ ...prev, [i]: opt }))}
                      style={{ fontSize:13, color, padding:'8px 12px', borderRadius:8, background:bg, border:`1px solid ${border}`, cursor: graded ? 'default' : 'pointer', textAlign:'left', fontFamily:SANS }}
                    >
                      {String.fromCharCode(65 + oi)}. {opt}
                    </button>
                  )
                })}
              </div>
            )}
            {!isMc && <div style={{ fontSize:12, color:FAINT, fontStyle:'italic', marginBottom:8 }}>Short answer</div>}
            {(graded || !isMc) && q.answer && <div style={{ fontSize:12, color:GREEN, fontWeight:600, marginBottom:4 }}>Answer: {q.answer}</div>}
            {q.explanation && graded && <div style={{ fontSize:12, color:MUTED, lineHeight:1.5 }}>{q.explanation}</div>}
          </div>
        )
      })}

      {!graded && (
        <button
          onClick={handleSubmit}
          disabled={Object.keys(selected).length === 0}
          style={{ width:'100%', padding:12, borderRadius:10, fontSize:14, fontWeight:600, background: Object.keys(selected).length > 0 ? BLUE : BORDER, color: Object.keys(selected).length > 0 ? '#fff' : MUTED, border:'none', cursor: Object.keys(selected).length > 0 ? 'pointer' : 'default', fontFamily:SANS }}
        >
          Grade My Answers
        </button>
      )}
    </div>
  )
}

// ── Layer 3: Generic artifact content ─────────────────────────────────────────
function GenericArtifactContent({ artifact }) {
  const { artifact_type: type, payload } = artifact
  if (!payload) return <div style={{ color:FAINT, fontSize:13 }}>No content stored.</div>

  if (type === 'practice_exam' || type === 'quiz_burst') {
    return <PracticeExamRetake artifact={artifact} />
  }

  if (type === 'cheat_sheet') {
    const topics = Array.isArray(payload.planTopics) ? payload.planTopics : []
    return (
      <div>
        {payload.topPickReason && (
          <div style={{ padding:'10px 14px', marginBottom:16, borderRadius:10, background:'#eef1ff', border:'1px solid #c3ccfb', fontSize:13, color:BLUE }}>
            <strong>Highest ROI:</strong> {payload.topPickReason}
          </div>
        )}
        {topics.length === 0 && <div style={{ color:FAINT, fontSize:13 }}>No topics found.</div>}
        {topics.map((t, i) => (
          <div key={i} style={{ padding:'12px 0', borderBottom:`1px solid ${INNER_BORDER}` }}>
            <div style={{ fontSize:14, fontWeight:600, color:TEXT, marginBottom:4 }}>{t.name || t.topic}</div>
            {t.whyLikely && <p style={{ margin:'0 0 6px', fontSize:13, color:MUTED, lineHeight:1.5 }}>{t.whyLikely}</p>}
            {t.priorityAction && (
              <div style={{ fontSize:13, color:TEXT, padding:'6px 10px', borderRadius:6, background:'#eef1ff', borderLeft:`3px solid ${BLUE}` }}>
                {t.priorityAction}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === 'flashcard' || type === 'flashcard_set') {
    const flashcards = Array.isArray(payload.flashcards) ? payload.flashcards : []
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {flashcards.length === 0 && <div style={{ color:FAINT, fontSize:13 }}>No flashcards stored.</div>}
        {flashcards.map((fc, i) => (
          <div key={i} style={{ padding:'12px 14px', borderRadius:10, background:PAGE, border:`1px solid ${BORDER}` }}>
            <div style={{ fontSize:13, fontWeight:600, color:TEXT, marginBottom:6 }}>{fc.front}</div>
            <div style={{ fontSize:13, color:MUTED, borderTop:`1px solid ${INNER_BORDER}`, paddingTop:6 }}>{fc.back}</div>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'mnemonic') {
    return (
      <div>
        <div style={{ padding:'14px 16px', borderRadius:10, background:'#fdecf3', border:'1px solid #f0b8d9', marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#c026a6', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>
            Mnemonic{payload.type ? ` (${payload.type})` : ''}
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:TEXT, lineHeight:1.6 }}>{payload.mnemonic}</div>
        </div>
        {payload.concept && <div style={{ fontSize:13, color:TEXT, marginBottom:8 }}><strong>Concept:</strong> {payload.concept}</div>}
        {payload.answer  && <div style={{ fontSize:13, color:MUTED }}><strong>Answer:</strong> {payload.answer}</div>}
      </div>
    )
  }

  if (type === 'essay_outline') {
    return (
      <div>
        {payload.essayType && (
          <div style={{ fontSize:12, color:MUTED, marginBottom:12 }}>
            {payload.essayType}{payload.wordCount ? ` · ~${payload.wordCount} words` : ''}
          </div>
        )}
        <div style={{ fontSize:13, color:TEXT, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
          {typeof payload.outline === 'string' ? payload.outline : JSON.stringify(payload.outline, null, 2)}
        </div>
      </div>
    )
  }

  if (type === 'podcast') {
    return (
      <div>
        {payload.audioUrl && (
          <div style={{ marginBottom:20 }}>
            <audio controls style={{ width:'100%', borderRadius:8 }} src={payload.audioUrl} />
          </div>
        )}
        {payload.script && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:DIM, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Script</div>
            <div style={{ fontSize:13, color:TEXT, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{payload.script}</div>
          </div>
        )}
      </div>
    )
  }

  if (type === 'diagram') {
    const d = payload.diagram
    if (!d) return <div style={{ color:FAINT, fontSize:13 }}>Diagram not available.</div>
    return (
      <pre style={{ fontSize:12, color:MUTED, whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0 }}>
        {JSON.stringify(d, null, 2)}
      </pre>
    )
  }

  return (
    <pre style={{ fontSize:12, color:MUTED, whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0 }}>
      {JSON.stringify(payload, null, 2)}
    </pre>
  )
}

// ── Layer 3: Artifact detail ──────────────────────────────────────────────────
function ArtifactDetailView({ artifactId, backLabel, onBack }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const token = await getAccessToken()
        const res   = await fetch(`/api/semester-artifact?id=${encodeURIComponent(artifactId)}`, {
          headers: { Authorization:`Bearer ${token}` },
        })
        const json = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(json.error || 'Failed to load artifact')
          else setData(json.artifact)
        }
      } catch {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
  }, [artifactId])

  const at = data ? atype(data.artifact_type) : null

  return (
    <div style={{ fontFamily:SANS, maxWidth:900, margin:'0 auto', padding:'0 24px 80px' }}>
      <BackLink label={backLabel || 'Back'} onClick={onBack} />

      {loading && <Spinner />}
      {error && <div style={{ color:RED, fontSize:13, padding:'8px 0' }}>{error}</div>}

      {data && at && (
        <>
          {/* Type badge */}
          <div style={{
            width:40, height:40, borderRadius:10, background:at.bg,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize:11, fontWeight:700, color:at.fg, fontFamily:SANS,
            letterSpacing:'.02em', marginBottom:10,
          }}>
            {at.tag}
          </div>

          {/* Uppercase type label */}
          <div style={{ fontSize:11.5, fontWeight:700, textTransform:'uppercase', color:'#8b929c', letterSpacing:'.08em', marginBottom:6 }}>
            {at.label}
          </div>

          {/* H1 */}
          <h1 style={{ fontFamily:SERIF, fontSize:32, fontWeight:600, margin:'0 0 10px', color:TEXT, lineHeight:1.15 }}>
            {data.title}
          </h1>

          {/* Metadata row */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, fontSize:13, color:MUTED }}>
            <span>{fmtShort(data.created_at)}</span>
            {data.topic && <><span style={{ color:'#c8ccd3' }}>&middot;</span><span>{data.topic}</span></>}
          </div>

          {/* Content */}
          <div style={{ background:'#fff', border:`1px solid ${BORDER}`, borderRadius:16, padding:'20px 22px' }}>
            <GenericArtifactContent artifact={data} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function SemesterView() {
  const [view, setView]                             = useState('semester')
  const [activeCourseId, setActiveCourseId]         = useState(null)
  const [courseColorIdx, setCourseColorIdx]         = useState(0)
  const [activeArtifactId, setActiveArtifactId]     = useState(null)
  const [artifactBackLabel, setArtifactBackLabel]   = useState('Back')

  const [semData, setSemData]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const token = await getAccessToken()
        const res   = await fetch('/api/semester', { headers: { Authorization:`Bearer ${token}` } })
        const json  = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(json.error || 'Failed to load semester')
          else setSemData(json)
        }
      } catch {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    track('semester_view_opened')
  }, [])

  const openCourse = useCallback((id, idx) => {
    setActiveCourseId(id)
    setCourseColorIdx(idx)
    setView('course')
  }, [])

  const openArtifact = useCallback((id, label) => {
    setActiveArtifactId(id)
    setArtifactBackLabel(label || 'Back to course')
    setView('artifact')
  }, [])

  const backToSemester = useCallback(() => { setView('semester'); setActiveCourseId(null) }, [])
  const backToCourse   = useCallback(() => { setView('course'); setActiveArtifactId(null) }, [])

  return (
    <div style={{ minHeight:'100vh', background:PAGE }}>
      <style>{`@keyframes sem-spin{to{transform:rotate(360deg)}}`}</style>

      {view === 'artifact' && activeArtifactId && (
        <ArtifactDetailView
          artifactId={activeArtifactId}
          backLabel={artifactBackLabel}
          onBack={backToCourse}
        />
      )}

      {view === 'course' && activeCourseId && (
        <CourseDetailView
          courseId={activeCourseId}
          colorIdx={courseColorIdx}
          onBack={backToSemester}
          onArtifact={(id) => openArtifact(id, 'Back to course')}
        />
      )}

      {view === 'semester' && (
        <>
          {loading && (
            <div style={{ fontFamily:SANS, maxWidth:900, margin:'0 auto', padding:'0 24px' }}>
              <div style={{ marginTop:40, fontSize:11.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.12em', color:'#a3a9b2' }}>StudyEdge AI</div>
              <h1 style={{ fontFamily:SERIF, fontSize:44, fontWeight:600, margin:'8px 0 0', lineHeight:1.04, letterSpacing:'-.01em', color:TEXT }}>
                My semester<span style={{ color:BLUE }}>.</span>
              </h1>
              <Spinner />
            </div>
          )}
          {error && (
            <div style={{ fontFamily:SANS, maxWidth:900, margin:'0 auto', padding:'40px 24px' }}>
              <div style={{ color:RED, fontSize:13 }}>{error}</div>
            </div>
          )}
          {!loading && !error && semData && (
            <SemView data={semData} onCourse={openCourse} />
          )}
        </>
      )}
    </div>
  )
}
