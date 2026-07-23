import { useState, useCallback, useMemo } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, hasUsedTrial } from '../lib/subscription'
import { hydrateCourseContext } from '../lib/courseContext'
import { pickSmartTopic, pickSmartCourse } from '../lib/smartDefault'
import { getLastSessionBridge } from '../lib/lastSessionBridge'
import { updateMastery } from '../lib/masteryStore'
import { addStudySession } from '../lib/studyHistory'
import { track } from '../lib/analytics'

// ── Storage ───────────────────────────────────────────────────────────────────

function loadDiagrams() {
  try { return JSON.parse(localStorage.getItem('studyedge_diagrams') ?? '[]') } catch { return [] }
}

function persistDiagrams(list) {
  localStorage.setItem('studyedge_diagrams', JSON.stringify(list))
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ── Diagram type definitions ──────────────────────────────────────────────────

const DIAGRAM_TYPES = [
  {
    id: 'mindmap',
    label: 'Mind Map',
    desc: 'Central topic with radiating branches and subtopics.',
    color: '#3B61C4',
    icon: 'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 0v5m0 5H7m5 0h5m-5 0v5M7.05 7.05l3.54 3.54m4.9 4.9l3.54-3.54M7.05 16.95l3.54-3.54m4.9-4.9l3.54 3.54',
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    desc: 'Step-by-step process with decisions and branching.',
    color: '#16A34A',
    icon: 'M8 6h8M8 10h8M8 14h8M5 6h.01M5 10h.01M5 14h.01',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    desc: 'Events in chronological order with study notes.',
    color: '#D97706',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'comparison',
    label: 'Comparison',
    desc: 'Side-by-side table comparing 2 to 4 concepts.',
    color: '#DC2626',
    icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
  },
  {
    id: 'hierarchy',
    label: 'Hierarchy',
    desc: 'Taxonomy tree showing parent-child relationships.',
    color: '#6366F1',
    icon: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z',
  },
]

const TYPE_LABELS = Object.fromEntries(DIAGRAM_TYPES.map(t => [t.id, t.label]))
const TYPE_COLORS = Object.fromEntries(DIAGRAM_TYPES.map(t => [t.id, t.color]))

// ── Mind Map Renderer ─────────────────────────────────────────────────────────

function MindMapRenderer({ diagram }) {
  const { center, branches = [] } = diagram

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Center node */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        <div style={{
          padding: '14px 32px',
          background: '#3B61C4',
          color: '#fff',
          borderRadius: 14,
          fontSize: 17,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          boxShadow: '0 4px 20px rgba(59,97,196,0.3)',
          textAlign: 'center',
          maxWidth: 320,
        }}>
          {center}
        </div>
      </div>

      {/* Branches grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {branches.map((branch, i) => (
          <div key={i} style={{
            background: '#fff',
            border: `1px solid ${branch.color}30`,
            borderLeft: `4px solid ${branch.color}`,
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: branch.color,
              marginBottom: 10,
              letterSpacing: '-0.01em',
            }}>
              {branch.label}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {(branch.children ?? []).map((child, j) => (
                <li key={j} style={{
                  fontSize: 12.5,
                  color: '#333',
                  padding: '4px 0',
                  borderBottom: j < branch.children.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 7,
                  lineHeight: 1.4,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 5, height: 5,
                    borderRadius: '50%',
                    background: branch.color,
                    flexShrink: 0,
                    marginTop: 5,
                  }} />
                  {child}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Flowchart Renderer ────────────────────────────────────────────────────────

function FlowchartRenderer({ diagram }) {
  const { title, steps = [] } = diagram
  const stepMap = Object.fromEntries(steps.map(s => [s.id, s]))

  const shapeStyle = (type) => {
    const base = {
      padding: '12px 20px',
      borderRadius: type === 'decision' ? 0 : type === 'start' || type === 'end' ? 999 : 10,
      fontSize: 13,
      fontWeight: 600,
      textAlign: 'center',
      maxWidth: 280,
      margin: '0 auto',
      position: 'relative',
    }
    switch (type) {
      case 'start': return { ...base, background: '#16A34A', color: '#fff', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }
      case 'end':   return { ...base, background: '#DC2626', color: '#fff', boxShadow: '0 2px 8px rgba(220,38,38,0.25)' }
      case 'decision': return {
        ...base,
        background: '#FFF7ED',
        color: '#92400E',
        border: '2px solid #D97706',
        borderRadius: 0,
        transform: 'rotate(0deg)',
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        padding: '20px 32px',
        minWidth: 200,
      }
      default: return { ...base, background: '#fff', color: '#111', border: '2px solid #E5E5E5', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
    }
  }

  const visited = new Set()
  const renderStep = (stepId, depth = 0) => {
    if (visited.has(stepId) || !stepMap[stepId]) return null
    visited.add(stepId)
    const step = stepMap[stepId]

    return (
      <div key={stepId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Step box */}
        <div style={shapeStyle(step.type)}>
          {step.type === 'decision' ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', textAlign: 'center', display: 'block', lineHeight: 1.3 }}>
              {step.label}
            </span>
          ) : step.label}
        </div>

        {/* Arrows */}
        {step.nexts?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {step.type === 'decision' && step.nexts.length === 2 ? (
              // Decision: side-by-side branches
              <div style={{ display: 'flex', width: '100%', gap: 16, marginTop: 0 }}>
                {step.nexts.map((nextId, i) => (
                  <div key={nextId} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ height: 24, width: 2, background: '#C0C0C0' }} />
                    {step.nextLabels?.[i] && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', marginBottom: 4, background: '#FFF7ED', padding: '2px 8px', borderRadius: 999, border: '1px solid #D9770630' }}>
                        {step.nextLabels[i]}
                      </span>
                    )}
                    <svg width="10" height="8" viewBox="0 0 10 8" style={{ marginBottom: 4 }}>
                      <path d="M5 8L0 0h10z" fill="#C0C0C0" />
                    </svg>
                    {renderStep(nextId, depth + 1)}
                  </div>
                ))}
              </div>
            ) : (
              // Single arrow down
              <>
                <div style={{ height: 24, width: 2, background: '#C0C0C0', marginTop: 0 }} />
                {step.nextLabels?.[0] && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#6B6B6B', marginBottom: 4 }}>
                    {step.nextLabels[0]}
                  </span>
                )}
                <svg width="10" height="8" viewBox="0 0 10 8" style={{ marginBottom: 4 }}>
                  <path d="M5 8L0 0h10z" fill="#C0C0C0" />
                </svg>
                {step.nexts[0] && renderStep(step.nexts[0], depth + 1)}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const startStep = steps.find(s => s.type === 'start')

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {title && (
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 24, textAlign: 'center' }}>{title}</h3>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {startStep ? renderStep(startStep.id) : steps.map(s => renderStep(s.id))}
      </div>
    </div>
  )
}

// ── Timeline Renderer ─────────────────────────────────────────────────────────

function TimelineRenderer({ diagram }) {
  const { title, events = [] } = diagram
  const DOT_COLOR = '#D97706'

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {title && (
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 24 }}>{title}</h3>
      )}
      <div style={{ position: 'relative', paddingLeft: 32 }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 9, top: 8, bottom: 8,
          width: 2, background: `${DOT_COLOR}30`,
        }} />

        {events.map((event, i) => (
          <div key={i} style={{
            position: 'relative',
            paddingBottom: i < events.length - 1 ? 28 : 0,
          }}>
            {/* Dot */}
            <div style={{
              position: 'absolute', left: -27, top: 4,
              width: 14, height: 14, borderRadius: '50%',
              background: DOT_COLOR,
              border: '2px solid #fff',
              boxShadow: `0 0 0 2px ${DOT_COLOR}40`,
            }} />

            {/* Content */}
            <div style={{
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.07)',
              borderRadius: 10,
              padding: '12px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: DOT_COLOR,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}>
                  {event.period}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
                  {event.title}
                </span>
              </div>
              {event.description && (
                <p style={{ margin: 0, fontSize: 12.5, color: '#6B6B6B', lineHeight: 1.5 }}>
                  {event.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Comparison Renderer ───────────────────────────────────────────────────────

function ComparisonRenderer({ diagram }) {
  const { title, items = [], attributes = [] } = diagram
  const ITEM_COLORS = ['#3B61C4', '#16A34A', '#D97706', '#DC2626']

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {title && (
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>{title}</h3>
      )}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: items.length > 2 ? 500 : 360 }}>
          <thead>
            <tr>
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                fontSize: 11,
                fontWeight: 700,
                color: '#9B9B9B',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                background: '#F7F6F3',
                borderBottom: '2px solid rgba(0,0,0,0.08)',
                width: 140,
                minWidth: 120,
              }}>
                Attribute
              </th>
              {items.map((item, i) => (
                <th key={i} style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: ITEM_COLORS[i % ITEM_COLORS.length],
                  background: `${ITEM_COLORS[i % ITEM_COLORS.length]}06`,
                  borderBottom: `2px solid ${ITEM_COLORS[i % ITEM_COLORS.length]}30`,
                  borderLeft: '1px solid rgba(0,0,0,0.06)',
                }}>
                  {item}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((attr, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                <td style={{
                  padding: '11px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#6B6B6B',
                  borderBottom: i < attributes.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  verticalAlign: 'top',
                }}>
                  {attr.name}
                </td>
                {(attr.values ?? []).map((val, j) => (
                  <td key={j} style={{
                    padding: '11px 16px',
                    fontSize: 12.5,
                    color: '#333',
                    borderBottom: i < attributes.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                    borderLeft: '1px solid rgba(0,0,0,0.06)',
                    textAlign: 'center',
                    verticalAlign: 'top',
                    lineHeight: 1.4,
                  }}>
                    {val}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Hierarchy Renderer ────────────────────────────────────────────────────────

function HierarchyNode({ node, depth = 0, color }) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = node.children?.length > 0
  const DEPTH_COLORS = ['#3B61C4', '#6366F1', '#D97706', '#16A34A', '#DC2626']
  const nodeColor = color ?? DEPTH_COLORS[depth % DEPTH_COLORS.length]

  return (
    <div style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: `${depth === 0 ? 10 : 7}px 0`,
        borderBottom: depth === 0 ? '2px solid rgba(0,0,0,0.06)' : 'none',
        marginBottom: depth === 0 ? 6 : 0,
      }}>
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={() => setCollapsed(v => !v)}
            style={{
              width: 20, height: 20,
              borderRadius: 5,
              background: `${nodeColor}12`,
              border: `1px solid ${nodeColor}30`,
              color: nodeColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              marginTop: 1,
              transition: 'background 0.12s',
            }}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d={collapsed ? 'M12 4v16m8-8H4' : 'M20 12H4'} />
            </svg>
          </button>
        ) : (
          <div style={{
            width: 20, height: 20, flexShrink: 0, marginTop: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: nodeColor,
              opacity: 0.5,
            }} />
          </div>
        )}

        {/* Label */}
        <div>
          <span style={{
            fontSize: depth === 0 ? 15 : depth === 1 ? 13.5 : 12.5,
            fontWeight: depth === 0 ? 800 : depth === 1 ? 700 : 600,
            color: depth === 0 ? nodeColor : '#111',
            lineHeight: 1.3,
          }}>
            {node.label}
          </span>
          {node.note && (
            <span style={{ fontSize: 11.5, color: '#9B9B9B', marginLeft: 8 }}>
              {node.note}
            </span>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && !collapsed && (
        <div style={{
          borderLeft: `2px solid ${nodeColor}20`,
          marginLeft: 9,
          paddingLeft: 4,
        }}>
          {node.children.map((child, i) => (
            <HierarchyNode
              key={i}
              node={child}
              depth={depth + 1}
              color={depth === 0 ? DEPTH_COLORS[(depth + i + 1) % DEPTH_COLORS.length] : nodeColor}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HierarchyRenderer({ diagram }) {
  const { title, root } = diagram
  return (
    <div style={{ fontFamily: 'inherit' }}>
      {title && (
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>{title}</h3>
      )}
      <div style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {root && <HierarchyNode node={root} depth={0} />}
      </div>
    </div>
  )
}

// ── Diagram Router ────────────────────────────────────────────────────────────

function DiagramRenderer({ diagram }) {
  if (!diagram) return null
  switch (diagram.type) {
    case 'mindmap':    return <MindMapRenderer diagram={diagram} />
    case 'flowchart':  return <FlowchartRenderer diagram={diagram} />
    case 'timeline':   return <TimelineRenderer diagram={diagram} />
    case 'comparison': return <ComparisonRenderer diagram={diagram} />
    case 'hierarchy':  return <HierarchyRenderer diagram={diagram} />
    default: return <p style={{ color: '#9B9B9B', fontSize: 13 }}>Unknown diagram type.</p>
  }
}

// ── Hub empty state ───────────────────────────────────────────────────────────

function EmptyHub({ onCreate }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{
        width: 56, height: 56,
        borderRadius: 16,
        background: 'rgba(59,97,196,0.08)',
        border: '1px solid rgba(59,97,196,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <svg width="24" height="24" fill="none" stroke="#3B61C4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
        </svg>
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>No diagrams yet</p>
      <p style={{ fontSize: 13, color: '#9B9B9B', margin: '0 0 24px', maxWidth: 240, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
        Generate mind maps, flowcharts, timelines, and more to visualize complex topics.
      </p>
      <button
        onClick={onCreate}
        style={{
          padding: '11px 28px',
          background: '#3B61C4',
          color: '#fff',
          border: 'none',
          borderRadius: 11,
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(59,97,196,0.3)',
          fontFamily: 'inherit',
        }}
      >
        Create your first diagram
      </button>
    </div>
  )
}

// ── Diagram Practice Mode ─────────────────────────────────────────────────────
// Turn a static diagram into a recall drill: blank ~30% of the labels and
// let the student fill them in. Scores by exact + close-match. Feeds mastery.

function collectPracticeSlots(diagram) {
  // Walk the diagram tree and return every leaf-ish string label as a slot.
  // We only blank labels — never blank the root/center concept so the
  // student has an anchor.
  const slots = []
  if (!diagram) return slots
  if (diagram.type === 'mindmap' && Array.isArray(diagram.branches)) {
    diagram.branches.forEach((b, bi) => {
      if (Array.isArray(b.children)) {
        b.children.forEach((c, ci) => slots.push({ id: `mm-${bi}-${ci}`, path: ['branches', bi, 'children', ci], answer: c }))
      }
    })
  } else if (diagram.type === 'flowchart' && Array.isArray(diagram.steps)) {
    diagram.steps.forEach((s, i) => {
      if (s.type !== 'start' && s.type !== 'end' && s.label) {
        slots.push({ id: `fc-${i}`, path: ['steps', i, 'label'], answer: s.label })
      }
    })
  } else if (diagram.type === 'timeline' && Array.isArray(diagram.events)) {
    diagram.events.forEach((e, i) => {
      if (e.title) slots.push({ id: `tl-${i}`, path: ['events', i, 'title'], answer: e.title })
    })
  } else if (diagram.type === 'comparison' && Array.isArray(diagram.attributes)) {
    diagram.attributes.forEach((a, ai) => {
      if (Array.isArray(a.values)) a.values.forEach((v, vi) => slots.push({ id: `cp-${ai}-${vi}`, path: ['attributes', ai, 'values', vi], answer: v }))
    })
  } else if (diagram.type === 'hierarchy' && diagram.root) {
    const walk = (node, path) => {
      if (Array.isArray(node.children)) {
        node.children.forEach((child, i) => {
          if (child.label) slots.push({ id: `h-${[...path, i].join('-')}`, path: [...path, i, 'label'], answer: child.label })
          walk(child, [...path, i, 'children'])
        })
      }
    }
    walk(diagram.root, ['root', 'children'])
  }
  return slots
}

function normalizeLabel(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function DiagramPractice({ diagram, title, courseId, courseName, onExit }) {
  const slots = useMemo(() => collectPracticeSlots(diagram), [diagram])
  const blanks = useMemo(() => {
    if (!slots.length) return new Set()
    const target = Math.max(3, Math.min(Math.round(slots.length * 0.30), 12))
    // Deterministic shuffle by hashing id so re-render doesn't reshuffle.
    const shuffled = [...slots].sort((a, b) => a.id.localeCompare(b.id))
    return new Set(shuffled.slice(0, target).map(s => s.id))
  }, [slots])

  const [inputs, setInputs] = useState({}) // { slotId: string }
  const [checked, setChecked] = useState(false)

  const graded = useMemo(() => {
    if (!checked) return []
    return [...blanks].map(id => {
      const slot = slots.find(s => s.id === id)
      if (!slot) return null
      const student = normalizeLabel(inputs[id] ?? '')
      const answer = normalizeLabel(slot.answer)
      const exact = student === answer && student.length > 0
      const partial = !exact && student.length > 2 && answer.includes(student)
      return { id, answer: slot.answer, student: inputs[id] ?? '', exact, partial }
    }).filter(Boolean)
  }, [checked, inputs, blanks, slots])

  const correctCount = graded.filter(g => g.exact).length
  const partialCount = graded.filter(g => g.partial).length
  const scorePct = graded.length ? Math.round(((correctCount + partialCount * 0.5) / graded.length) * 100) : 0

  const handleGrade = useCallback(() => {
    setChecked(true)
    const total = blanks.size || 1
    const filled = Object.values(inputs).filter(v => (v ?? '').trim().length > 0).length
    const score = Math.round(((correctCount + partialCount * 0.5) / total) * 100)
    // Only credit mastery if the student actually attempted 2/3 of the blanks
    if (filled >= total * 0.66 && title) {
      updateMastery(title, courseId, score, 'diagram_practice')
      addStudySession({ tool: 'Diagram Practice', score, topic: title, courseName: courseName || null })
    }
    track('diagram_practice_graded', { score, filledPct: total ? filled / total : 0, blanks: total })
  }, [inputs, blanks, correctCount, partialCount, title, courseId, courseName])

  if (slots.length < 3) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#6B6B6B', fontSize: 13 }}>
        This diagram doesn't have enough labels to practice with. Try another.
        <div style={{ marginTop: 12 }}>
          <button onClick={onExit} style={{ padding: '8px 16px', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', borderRadius: 8, cursor: 'pointer' }}>Back to diagram</button>
        </div>
      </div>
    )
  }

  // Render each slot: filled label or blank input. Rest of the tree renders
  // as static labels so context is preserved.
  const renderNode = (label, id) => {
    if (blanks.has(id)) {
      const g = graded.find(x => x.id === id)
      const color = g ? (g.exact ? '#16A34A' : g.partial ? '#D97706' : '#DC2626') : '#3B61C4'
      return (
        <div style={{ display: 'inline-block', minWidth: 120 }}>
          <input
            value={inputs[id] ?? ''}
            onChange={e => setInputs(prev => ({ ...prev, [id]: e.target.value }))}
            disabled={checked}
            placeholder="?"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 12.5, fontWeight: 600,
              border: `1.5px solid ${color}`, borderRadius: 6,
              background: g && !g.exact ? `${color}0F` : '#fff',
              color: '#111', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {g && !g.exact && (
            <div style={{ fontSize: 10.5, color, marginTop: 2, fontWeight: 700 }}>
              Answer: {g.answer}
            </div>
          )}
        </div>
      )
    }
    return <span>{label}</span>
  }

  // Compact tree renderer per diagram type — kept text-only for the practice
  // pass so the input fields are unambiguous.
  const renderTree = () => {
    if (diagram.type === 'mindmap') {
      return (
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111', marginBottom: 14 }}>{diagram.center}</div>
          {diagram.branches.map((b, bi) => (
            <div key={bi} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: `${b.color ?? '#3B61C4'}0A`, border: `1px solid ${b.color ?? '#3B61C4'}22` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: b.color ?? '#3B61C4', marginBottom: 6 }}>{b.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {b.children?.map((c, ci) => (
                  <div key={ci}>{renderNode(c, `mm-${bi}-${ci}`)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    }
    if (diagram.type === 'flowchart') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {diagram.steps.map((s, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.type}</div>
              <div style={{ fontSize: 13, color: '#111', marginTop: 4 }}>{renderNode(s.label, `fc-${i}`)}</div>
            </div>
          ))}
        </div>
      )
    }
    if (diagram.type === 'timeline') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {diagram.events.map((e, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3B61C4' }}>{e.period}</div>
              <div style={{ fontSize: 13, color: '#111', margin: '4px 0 4px' }}>{renderNode(e.title, `tl-${i}`)}</div>
              {e.description && <div style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.45 }}>{e.description}</div>}
            </div>
          ))}
        </div>
      )
    }
    if (diagram.type === 'comparison') {
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ padding: 8, borderBottom: '1px solid rgba(0,0,0,0.08)', textAlign: 'left' }}></th>
                {diagram.items.map((item, ii) => (
                  <th key={ii} style={{ padding: 8, borderBottom: '1px solid rgba(0,0,0,0.08)', textAlign: 'left', color: '#3B61C4' }}>{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diagram.attributes.map((a, ai) => (
                <tr key={ai}>
                  <td style={{ padding: 8, borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 700, color: '#111' }}>{a.name}</td>
                  {a.values.map((v, vi) => (
                    <td key={vi} style={{ padding: 8, borderBottom: '1px solid rgba(0,0,0,0.04)', color: '#111' }}>{renderNode(v, `cp-${ai}-${vi}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    if (diagram.type === 'hierarchy') {
      const walk = (node, path, depth = 0) => (
        <div style={{ marginLeft: depth * 16 }}>
          <div style={{ fontSize: 13, color: '#111', padding: '4px 0' }}>
            {depth === 0 ? <strong>{node.label}</strong> : renderNode(node.label, `h-${path.join('-')}`)}
            {node.note && <span style={{ fontSize: 11, color: '#9B9B9B', marginLeft: 6 }}>— {node.note}</span>}
          </div>
          {Array.isArray(node.children) && node.children.map((c, i) => walk(c, [...path, i], depth + 1))}
        </div>
      )
      return walk(diagram.root, [], 0)
    }
    return null
  }

  return (
    <div>
      <div style={{ padding: 20, background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 16, marginBottom: 14 }}>
        {renderTree()}
      </div>

      {!checked ? (
        <button
          onClick={handleGrade}
          disabled={Object.values(inputs).filter(v => (v ?? '').trim().length > 0).length === 0}
          style={{
            width: '100%', padding: '13px',
            background: '#3B61C4', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 3px 12px rgba(59,97,196,0.35)',
          }}
        >
          Check my answers
        </button>
      ) : (
        <div style={{ padding: 16, borderRadius: 12, background: scorePct >= 70 ? 'rgba(22,163,74,0.05)' : 'rgba(217,119,6,0.05)', border: `1px solid ${scorePct >= 70 ? 'rgba(22,163,74,0.22)' : 'rgba(217,119,6,0.22)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: scorePct >= 70 ? '#16A34A' : '#D97706', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Practice result</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: scorePct >= 70 ? '#16A34A' : '#D97706' }}>{scorePct}%</div>
          </div>
          <div style={{ fontSize: 13, color: '#111', marginBottom: 10, lineHeight: 1.5 }}>
            {correctCount} exact · {partialCount} close · {blanks.size - correctCount - partialCount} missed.
            {title ? ` Mastery on ${title} updated.` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setInputs({}); setChecked(false) }}
              style={{ flex: 1, padding: '11px', background: '#3B61C4', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again (new blanks)
            </button>
            <button
              onClick={onExit}
              style={{ padding: '11px 16px', background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, color: '#6B6B6B', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Back to diagram
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DiagramsView({ courses, userId, onShowPaywall, learningStyle = null, yearLevel = null, firstName = null, schoolType = null, assignments = [] }) {
  const [mode, setMode] = useState('hub')  // 'hub' | 'create' | 'view'
  const [diagrams, setDiagrams] = useState(() => loadDiagrams())
  const [activeDiagram, setActiveDiagram] = useState(null) // { id, title, type, courseName, diagram }
  const [practicing, setPracticing] = useState(false)

  // Create form state
  const [topic, setTopic] = useState('')
  const [diagramType, setDiagramType] = useState('mindmap')
  const initialSmartCourse = useMemo(() =>
    courses.length ? pickSmartCourse(courses).index : null
  , [courses])
  const [selectedCourse, setSelectedCourse] = useState(initialSmartCourse)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const smart = useMemo(() => {
    const c = selectedCourse != null ? courses[selectedCourse] : null
    if (!c) return null
    const ctx = hydrateCourseContext(c, { firstName, yearLevel, learningStyle, schoolType, assignments })
    return pickSmartTopic(c, ctx)
  }, [selectedCourse, courses]) // eslint-disable-line react-hooks/exhaustive-deps

  const bridge = useMemo(() => {
    const c = selectedCourse != null ? courses[selectedCourse] : null
    return getLastSessionBridge({ courseId: c?.id ?? null, courseName: c?.name ?? null, currentTool: 'Diagram' })
  }, [selectedCourse, courses])

  const plan = getActivePlan()
  const isPro = plan === 'pro' || plan === 'unlimited' || plan === 'trial'

  const saveDiagram = useCallback((entry) => {
    setDiagrams(prev => {
      const exists = prev.find(d => d.id === entry.id)
      const next = exists
        ? prev.map(d => d.id === entry.id ? entry : d)
        : [entry, ...prev]
      persistDiagrams(next)
      return next
    })
  }, [])

  const deleteDiagram = useCallback((id) => {
    setDiagrams(prev => {
      const next = prev.filter(d => d.id !== id)
      persistDiagrams(next)
      return next
    })
    if (activeDiagram?.id === id) {
      setActiveDiagram(null)
      setMode('hub')
    }
  }, [activeDiagram])

  async function handleGenerate() {
    if (!topic.trim()) return
    if (!canUseAI()) { onShowPaywall?.('ai'); return }

    setIsGenerating(true)
    setGenerateError('')
    track('diagram_started', { type: diagramType, hasCourse: selectedCourse !== null })

    try {
      const token = await getAccessToken()
      const course = selectedCourse !== null ? courses[selectedCourse] : null
      const courseName = course?.name ?? null
      const courseContext = hydrateCourseContext(course, {
        firstName, yearLevel, learningStyle, schoolType, assignments,
      })
      const res = await fetch('/api/generate-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: topic.trim(), diagramType, courseName, courseContext }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      const entry = {
        id: uid(),
        title: topic.trim(),
        type: diagramType,
        courseName: courseName ?? null,
        diagram: data.diagram,
        createdAt: new Date().toISOString(),
      }

      saveDiagram(entry)
      await incrementAIQuery()
      track('diagram_generated', { type: diagramType, hasCourseName: !!courseName })
      window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'diagrams' } }))

      setActiveDiagram(entry)
      setMode('view')
      setTopic('')
    } catch (err) {
      track('diagram_error', { error: err.message ?? 'unknown' })
      setGenerateError(err.message ?? 'Failed to generate diagram. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Hub ──────────────────────────────────────────────────────────────────────
  if (mode === 'hub') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px', animation: 'dv-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{`
          @keyframes dv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          .dv-list-item { transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s !important; }
          .dv-list-item:hover { border-color: rgba(0,0,0,0.14) !important; box-shadow: 0 2px 8px rgba(0,0,0,0.05) !important; }
          .dv-list-item:active { transform: scale(0.99) !important; }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111111', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Study Diagrams
            </h1>
            <p style={{ fontSize: 13.5, color: '#6B6B6B', margin: 0 }}>
              Turn any concept into a mind map, timeline, or hierarchy in seconds.
            </p>
          </div>
          {diagrams.length > 0 && (
            <button
              onClick={() => { setMode('create'); setGenerateError('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px',
                background: '#3B61C4',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Diagram
            </button>
          )}
        </div>

        {diagrams.length === 0 ? (
          <EmptyHub onCreate={() => { setMode('create'); setGenerateError('') }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diagrams.map(d => {
              const typeColor = TYPE_COLORS[d.type] ?? '#3B61C4'
              const typeLabel = TYPE_LABELS[d.type] ?? d.type
              return (
                <button
                  key={d.id}
                  onClick={() => { setActiveDiagram(d); setMode('view') }}
                  className="dv-list-item"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    width: '100%', textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: '#FFFFFF',
                    border: '1px solid rgba(0,0,0,0.07)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${typeColor}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: typeColor, flexShrink: 0,
                  }}>
                    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d={DIAGRAM_TYPES.find(t => t.id === d.type)?.icon ?? ''} />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.title}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                        background: `${typeColor}12`, color: typeColor,
                        border: `1px solid ${typeColor}30`, letterSpacing: '0.02em', flexShrink: 0,
                      }}>
                        {typeLabel}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#9B9B9B' }}>
                      {d.courseName ? `${d.courseName} · ` : ''}{new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <svg width="14" height="14" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Create ───────────────────────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px', animation: 'dv-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{`@keyframes dv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setMode('hub')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none',
              color: '#6B6B6B', fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            New Diagram
          </h1>
        </div>

        {bridge && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,97,196,0.06)', border: '1px solid rgba(59,97,196,0.18)', borderRadius: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B61C4', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Since your last session</div>
            <div style={{ fontSize: 12.5, color: '#111', lineHeight: 1.45 }}>{bridge.line}</div>
          </div>
        )}
        {smart?.topic && !topic.trim() && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>Best pick for you right now</div>
            <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg, rgba(59,97,196,0.08) 0%, rgba(59,97,196,0.02) 100%)', border: '1px solid rgba(59,97,196,0.25)', borderRadius: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6B6B', marginBottom: 4 }}>{courses[selectedCourse]?.name}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginBottom: 4, letterSpacing: -0.3 }}>Diagram {smart.topic}</div>
              <div style={{ fontSize: 12.5, color: '#6B6B6B', marginBottom: 14 }}>{smart.reason} · rendered as a {DIAGRAM_TYPES.find(d => d.id === diagramType)?.label ?? diagramType}</div>
              <button
                onClick={() => { setTopic(smart.topic); setTimeout(() => handleGenerate(), 30) }}
                disabled={isGenerating}
                style={{ width: '100%', padding: '13px', background: isGenerating ? '#9B9B9B' : '#3B61C4', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: isGenerating ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(59,97,196,0.35)' }}
              >
                {isGenerating ? 'Generating…' : `Generate diagram`}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: '#9B9B9B', textAlign: 'center', marginTop: 10 }}>Or type your own topic below ▾</div>
          </div>
        )}

        {/* Topic input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            What topic do you want to visualize?
          </label>
          <input
            type="text"
            value={topic}
            onChange={e => { setTopic(e.target.value); setGenerateError('') }}
            onKeyDown={e => e.key === 'Enter' && !isGenerating && topic.trim() && handleGenerate()}
            placeholder="e.g. Photosynthesis, French Revolution, Recursion..."
            autoFocus
            style={{
              width: '100%',
              padding: '13px 16px',
              fontSize: 14,
              border: '1.5px solid rgba(0,0,0,0.1)',
              borderRadius: 12,
              outline: 'none',
              color: '#111',
              background: '#fff',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#3B61C4'}
            onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
          />
        </div>

        {/* Diagram type picker */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Diagram Type
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DIAGRAM_TYPES.map(dt => {
              const active = diagramType === dt.id
              return (
                <button
                  key={dt.id}
                  onClick={() => setDiagramType(dt.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: active ? `${dt.color}08` : '#fff',
                    border: active ? `1.5px solid ${dt.color}50` : '1.5px solid rgba(0,0,0,0.07)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.12s, background 0.12s',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: active ? `${dt.color}15` : `${dt.color}08`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: dt.color, flexShrink: 0,
                  }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d={dt.icon} />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? dt.color : '#111', marginBottom: 2 }}>
                      {dt.label}
                    </div>
                    <div style={{ fontSize: 12, color: '#6B6B6B' }}>{dt.desc}</div>
                  </div>
                  {active && (
                    <svg width="16" height="16" fill="none" stroke={dt.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Course selector */}
        {courses.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Course (optional)
            </label>
            <select
              value={selectedCourse ?? ''}
              onChange={e => setSelectedCourse(e.target.value === '' ? null : Number(e.target.value))}
              style={{
                width: '100%', padding: '11px 14px',
                border: '1.5px solid rgba(0,0,0,0.1)',
                borderRadius: 11, fontSize: 13, color: '#111',
                background: '#fff', outline: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <option value="">No specific course</option>
              {courses.map((c, i) => (
                <option key={i} value={i}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Error */}
        {generateError && (
          <div style={{
            padding: '10px 14px', marginBottom: 16,
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 10, fontSize: 13, color: '#DC2626',
          }}>
            {generateError}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!topic.trim() || isGenerating}
          style={{
            width: '100%', padding: '14px',
            background: topic.trim() && !isGenerating ? '#3B61C4' : 'rgba(59,97,196,0.4)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: topic.trim() && !isGenerating ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: topic.trim() && !isGenerating ? '0 4px 14px rgba(59,97,196,0.3)' : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
        >
          {isGenerating ? (
            <>
              <Spinner size="sm" color="#fff" />
              Generating diagram...
            </>
          ) : (
            <>
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Diagram
            </>
          )}
        </button>

        {!isPro && (
          <p style={{ textAlign: 'center', fontSize: 12, color: '#9B9B9B', marginTop: 12 }}>
            Uses 1 AI query. Free plan includes 5 total.
          </p>
        )}
      </div>
    )
  }

  // ── View ─────────────────────────────────────────────────────────────────────
  if (mode === 'view' && activeDiagram) {
    const typeColor = TYPE_COLORS[activeDiagram.type] ?? '#3B61C4'
    const typeLabel = TYPE_LABELS[activeDiagram.type] ?? activeDiagram.type

    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px', animation: 'dv-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{`@keyframes dv-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setMode('hub')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
              background: 'none', border: 'none',
              color: '#6B6B6B', fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
                {activeDiagram.title}
              </h1>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: `${typeColor}12`, color: typeColor,
                border: `1px solid ${typeColor}30`, flexShrink: 0,
              }}>
                {typeLabel}
              </span>
            </div>
            {activeDiagram.courseName && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#9B9B9B' }}>
                {activeDiagram.courseName}
              </p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setPracticing(p => !p)}
              title="Practice mode"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 9,
                background: practicing ? '#3B61C4' : 'rgba(59,97,196,0.08)',
                color: practicing ? '#fff' : '#3B61C4',
                border: practicing ? 'none' : '1px solid rgba(59,97,196,0.22)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              {practicing ? 'Studying' : 'Practice'}
            </button>
            <button
              onClick={() => {
                setTopic(activeDiagram.title)
                setDiagramType(activeDiagram.type)
                setSelectedCourse(courses.findIndex(c => c.name === activeDiagram.courseName))
                setMode('create')
              }}
              title="Regenerate"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 9,
                background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
                fontSize: 12, fontWeight: 600, color: '#6B6B6B',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
            <button
              onClick={() => deleteDiagram(activeDiagram.id)}
              title="Delete"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 9,
                background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
                color: '#9B9B9B', cursor: 'pointer',
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Diagram — or Practice mode */}
        {practicing ? (
          <DiagramPractice
            diagram={activeDiagram.diagram}
            title={activeDiagram.title}
            courseName={activeDiagram.courseName}
            courseId={courses.find(c => c.name === activeDiagram.courseName)?.id ?? null}
            onExit={() => setPracticing(false)}
          />
        ) : (
          <div style={{
            background: '#FAFAF9',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 16,
            padding: '28px 24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <DiagramRenderer diagram={activeDiagram.diagram} />
          </div>
        )}

        {/* Create another */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={() => { setMode('create'); setGenerateError(''); setTopic('') }}
            style={{
              background: 'none', border: 'none',
              fontSize: 13, fontWeight: 600, color: '#3B61C4',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Create another diagram →
          </button>
        </div>
      </div>
    )
  }

  return null
}
