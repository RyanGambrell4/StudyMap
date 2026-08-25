/**
 * ReviewQueueView - the spaced repetition queue.
 *
 * Presentation rebuilt to sit inside the same design language as the Knowledge
 * Map, Practice Exams and the Study Coach: KNOWLEDGE_MAP neutrals, Newsreader
 * for the H1 and for numerals, Inter for everything else, one shadow, radius 16
 * on cards and 10 on controls. Nothing about the scheduling logic, the data
 * contract, the prop signature or the analytics events changed here; every
 * number on this screen still comes from masteryStore.
 *
 * Two rules govern the visual hierarchy and explain most of the choices below:
 *
 *   1. Every count appears exactly once. The tabs own the due and upcoming
 *      numbers. Nothing above them restates a number they already carry.
 *      (The old screen read the counts twice from two different queries -
 *      getReviewStats() is unfiltered and uses a 3-day upcoming window, while
 *      the tabs are filtered and use 7 - so the two could legitimately
 *      disagree. Both now read the same filtered lists.)
 *
 *   2. One red per row, and it is always the same thing: how late the review
 *      is. Mastery is context and never red; the ring is monochrome blue like
 *      every other progress indicator in the app, and the status dot follows
 *      the Knowledge Map's filled/hollow convention rather than a third hue.
 *
 * The loading state lives in ReviewQueueSkeleton.jsx, wired to this view's own
 * Suspense boundary in OutputView, because the wait worth covering is the lazy
 * chunk fetch and not the synchronous store read.
 */

import { useState, useMemo, useEffect, useRef, useId } from 'react'
import {
  getDueForReview, getUpcomingReviews, getMasteryLevel, getMasteryTrend,
} from '../lib/masteryStore'
import { track } from '../lib/analytics'
import { KNOWLEDGE_MAP as C, PRACTICE_EXAMS as PE, T, KM_SERIF, SANS, courseColor } from '../theme/tokens'
import { useIsMobile } from '../utils/useIsMobile'
import { useCelebration } from '../utils/useCelebration'
import { recordReviewClear, getWeeklyClears } from '../lib/reviewClears'

const DAY = 86400000

const btnReset = {
  appearance: 'none', border: 'none', background: 'none',
  padding: 0, margin: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
}

const EYEBROW = {
  fontFamily: SANS, fontSize: 11, fontWeight: 600, lineHeight: 1,
  letterSpacing: '.08em', textTransform: 'uppercase', color: C.secondary,
}

// #B93A3A rather than the base #D64545 because this is 13px body text and the
// base red lands at 4.38:1 on white, just under AA. The base value is still
// correct for the non-text rail, which only has to clear 3:1.
const OVERDUE_INK = T.redHov

// ── Formatters ──────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return 'never'
  const d = Math.floor((Date.now() - ts) / DAY)
  const h = Math.floor((Date.now() - ts) / 3600000)
  if (d >= 1) return `${d}d ago`
  if (h >= 1) return `${h}h ago`
  return 'just now'
}
function overdueLabel(ms) {
  const d = Math.floor(ms / DAY)
  const h = Math.floor(ms / 3600000)
  if (d >= 2) return `${d} days overdue`
  if (d >= 1) return '1 day overdue'
  if (h >= 1) return `${h}h overdue`
  return 'Due now'
}
function dueInLabel(due) {
  const diff = due - Date.now()
  const d = Math.floor(diff / DAY)
  const h = Math.floor(diff / 3600000)
  if (d >= 1) return `Due in ${d} day${d !== 1 ? 's' : ''}`
  if (h >= 1) return `Due in ${h} hour${h !== 1 ? 's' : ''}`
  return 'Due soon'
}

// ── Scoped stylesheet ───────────────────────────────────────────────────────
// Hover, active, focus-visible and the two-line clamp cannot be expressed as
// inline styles, and this screen has no stylesheet of its own. One injected
// block, every selector namespaced, so it cannot leak into another view.
const SHEET = `
.rq-row { transition: background 150ms cubic-bezier(.4,0,.2,1); }
.rq-row:hover { background: ${C.rowHover}; }

.rq-clamp {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; overflow-wrap: anywhere;
}

.rq-press { transition: background 140ms cubic-bezier(.4,0,.2,1), transform 140ms cubic-bezier(.4,0,.2,1), border-color 140ms cubic-bezier(.4,0,.2,1); }
.rq-press:active:not(:disabled) { transform: scale(.97); }
.rq-press:disabled { cursor: not-allowed; opacity: .55; }

.rq-primary:hover:not(:disabled) { background: ${C.blueHover}; }
.rq-quiet:hover:not(:disabled) { background: ${C.pageBg}; border-color: ${C.tileHover}; }
.rq-link:hover:not(:disabled) { color: ${C.blueHover}; text-decoration: underline; }
.rq-tab:hover { color: ${C.ink}; }
.rq-select-shell:hover { border-color: ${C.tileHover}; }

.rq-focus:focus-visible,
.rq-select-native:focus-visible + .rq-select-ring {
  outline: 2px solid ${C.blue};
  outline-offset: 2px;
}
.rq-focus:focus:not(:focus-visible) { outline: none; }

@keyframes rq-rise { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes rq-ring { from { transform: scale(.5); opacity: .85; } to { transform: scale(1.55); opacity: 0; } }

.rq-rise { animation: rq-rise 460ms cubic-bezier(.16,1,.3,1) both; }
.rq-halo { animation: rq-ring 1300ms ease-out 180ms both; }

@media (prefers-reduced-motion: reduce) {
  .rq-row, .rq-press { transition: none; }
  .rq-press:active:not(:disabled) { transform: none; }
  .rq-rise, .rq-halo { animation: none; }
  .rq-halo { opacity: 0; }
}
`

// ── Mastery ring ────────────────────────────────────────────────────────────
// The ring is deliberately monochrome. Its job is to show how much of the
// topic is proven, which the arc and the numeral already do; making it also
// carry a red/amber/green status was the third colour system on a row that
// only needs one. Blue is what every other progress indicator in the app uses
// (Study Coach `done`, Grade Hub `earned`).
//
// The bare numeral used to teach the user nothing, so it now sits under a
// caption that names the unit, and the whole ring carries one aria-label.
function MasteryRing({ score, level, size }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score ?? 0))
  const dash = (pct / 100) * circ

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 'none',
    }}>
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Mastery ${pct} out of 100. ${level}.`}
        style={{ display: 'block' }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PE.barTrack} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={C.blue} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%" y="50%" dy="0.36em" textAnchor="middle"
          fontFamily={KM_SERIF} fontSize={size * 0.42} fontWeight="500" fill={C.ink}
        >{pct}</text>
      </svg>
      <span aria-hidden style={{ ...EYEBROW, fontSize: 9.5, letterSpacing: '.07em' }}>Mastery</span>
    </div>
  )
}

// ── Row status ──────────────────────────────────────────────────────────────
// The word carries the state, so nothing here is communicated by colour alone.
// The dot follows the Knowledge Map: filled means proven at this level, hollow
// means not proven yet. That keeps weak and developing apart without spending
// a third hue, and keeps red for lateness.
const LEVEL_LABEL = { strong: 'Strong', developing: 'Developing', weak: 'Weak', unknown: 'Not scored' }

function StatusDot({ level }) {
  const filled = level === 'strong' || level === 'developing'
  const tone = level === 'strong' ? C.solid : level === 'developing' ? C.shaky : C.hollow
  return (
    <span aria-hidden style={{
      width: 8, height: 8, borderRadius: 999, flex: 'none',
      ...(filled ? { background: tone } : { border: `1.5px solid ${level === 'weak' ? C.shaky : C.hollow}` }),
    }} />
  )
}

function TrendNote({ trend }) {
  if (!trend || trend === 'flat') return null
  const up = trend === 'up'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.secondary }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {up
          ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>
          : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></>}
      </svg>
      {up ? 'improving' : 'slipping'}
    </span>
  )
}

// ── Buttons ─────────────────────────────────────────────────────────────────
function PrimaryButton({ label, onClick, full = false, disabled = false, ariaLabel, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="rq-press rq-primary rq-focus"
      style={{
        ...btnReset,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 44, padding: '12px 22px', borderRadius: 10,
        background: C.blue, color: '#ffffff',
        fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1,
        width: full ? '100%' : 'auto', textAlign: 'center', flex: 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </button>
  )
}

function QuietButton({ label, onClick, full = false, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="rq-press rq-quiet rq-focus"
      style={{
        ...btnReset,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 44, padding: '12px 18px', borderRadius: 10,
        background: C.card, color: C.secondary,
        border: `1px solid ${C.cardBorder}`,
        fontFamily: SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1,
        width: full ? '100%' : 'auto', textAlign: 'center', flex: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// ── Course filter ───────────────────────────────────────────────────────────
// The app's dropdown pattern, taken from the Grade Hub target-grade control: a
// styled shell with the real <select> laid over it at zero opacity. It reads as
// a designed control, keeps the native picker on mobile, and inherits keyboard
// and screen reader behaviour for free. The focus ring is drawn on the shell,
// driven by :focus-visible on the native element underneath.
function CourseFilter({ courses, value, onChange, mobile }) {
  const selected = value === 'all' ? null : courses.find(c => String(c.id) === value)
  const idx = selected ? courses.findIndex(c => String(c.id) === value) : -1

  return (
    <div style={{ position: 'relative', flex: mobile ? '1 1 100%' : '0 0 auto' }}>
      <select
        className="rq-select-native"
        aria-label="Filter by course"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          opacity: 0, cursor: 'pointer', border: 'none', appearance: 'none', margin: 0,
        }}
      >
        <option value="all">All courses</option>
        {courses.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
      </select>
      <div
        aria-hidden
        className="rq-select-ring rq-select-shell"
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          minHeight: 44, padding: '0 14px', borderRadius: 10,
          border: `1px solid ${C.cardBorder}`, background: C.card,
          fontFamily: SANS, fontSize: 13.5, fontWeight: 500, color: C.ink,
          width: mobile ? '100%' : 'auto', pointerEvents: 'none',
          transition: 'border-color 140ms cubic-bezier(.4,0,.2,1)',
        }}
      >
        {selected
          ? <span style={{ width: 7, height: 7, borderRadius: 999, background: courseColor(idx).dot, flex: 'none' }} />
          : null}
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{selected ? selected.name : 'All courses'}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flex: 'none' }}>
          <path d="M1 1l4 4 4-4" stroke={C.hollow} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

// ── Tabs ────────────────────────────────────────────────────────────────────
// The segmented control the app already uses (Upload Material modal): a
// neutral track, a white thumb with the one shadow. These two labels are the
// only place the due and upcoming counts appear on the whole screen.
function Tabs({ tab, onChange, dueCount, upcomingCount, mobile }) {
  const items = [
    { id: 'due', label: 'Due', count: dueCount },
    { id: 'upcoming', label: 'Coming up', count: upcomingCount },
  ]
  return (
    <div
      role="tablist"
      aria-label="Review queue"
      style={{
        display: 'flex', background: T.neutralBg, borderRadius: 12, padding: 4,
        flex: mobile ? '1 1 100%' : '0 0 auto',
      }}
    >
      {items.map(t => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`rq-tab-${t.id}`}
            aria-selected={active}
            aria-controls="rq-panel"
            onClick={() => onChange(t.id)}
            className="rq-press rq-tab rq-focus"
            style={{
              ...btnReset,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              flex: mobile ? 1 : '0 0 auto',
              // 44 on touch to clear the tap-target floor; the app's segmented
              // control sits at 36, which is right for a pointer.
              minHeight: mobile ? 44 : 36,
              padding: '0 16px', borderRadius: 8,
              background: active ? C.card : 'transparent',
              color: active ? C.ink : C.secondary,
              boxShadow: active ? '0 1px 3px rgba(28,27,24,0.08)' : 'none',
              fontFamily: SANS, fontSize: 13.5, fontWeight: active ? 600 : 500, lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            <span style={{
              fontFamily: KM_SERIF, fontSize: 14, fontWeight: 500,
              color: active ? C.ink : C.label,
            }}>{t.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Topic row ───────────────────────────────────────────────────────────────
// One primary path per row. Brain Dump is the path the queue exists to push
// you down, so it is the only filled button; Quiz is still one tap away but no
// longer asks you to choose on every single row.
//
// The metadata line is ranked rather than run together: lateness first, in the
// one red this row is allowed and at the heaviest weight, then what you know,
// then the history that matters least, in the faintest ink.
function TopicRow({ item, isDue, onDrill, onQuiz, mobile, first }) {
  const level = getMasteryLevel(item.score)
  const trend = getMasteryTrend(item)
  // Red is spent at 3 days, not at 1. A day or two late is the normal texture
  // of a queue, and colouring that red is what stopped the colour meaning
  // anything. Past three days the review has drifted far enough outside its
  // window that it is worth calling out.
  const veryLate = isDue && item.overdueMs > 3 * DAY

  const timing = isDue ? overdueLabel(item.overdueMs) : dueInLabel(item.dueAt)

  // Quiet action first, primary last, on one line. Stacking them made every
  // row 98px of button, which is what let two equal buttons read as a choice.
  const actions = (
    <div style={{
      display: 'flex', gap: mobile ? 10 : 6, flex: 'none',
      alignItems: 'center', justifyContent: mobile ? 'stretch' : 'flex-end',
      width: mobile ? '100%' : 'auto',
    }}>
      <button
        type="button"
        onClick={() => onQuiz?.(item.topic, item.courseId)}
        aria-label={`Quiz: ${item.topic}`}
        className="rq-press rq-link rq-focus"
        style={{
          ...btnReset,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 44, padding: '0 14px',
          borderRadius: 10, color: C.blue,
          fontFamily: SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1,
          flex: 'none', whiteSpace: 'nowrap',
        }}
      >
        Quiz instead
      </button>
      <PrimaryButton
        label="Brain Dump"
        ariaLabel={`Brain Dump: ${item.topic}`}
        onClick={() => onDrill?.(item.topic, item.courseId)}
        style={mobile ? { flex: 1 } : { minWidth: 126 }}
      />
    </div>
  )

  return (
    <div
      className="rq-row"
      style={{
        display: 'flex', gap: mobile ? 14 : 24,
        alignItems: mobile ? 'flex-start' : 'center',
        flexDirection: mobile ? 'column' : 'row',
        padding: mobile ? '18px 18px' : '20px 28px',
        // Lighter than the card border, and absent on the first row so the
        // container's own edge does the work there.
        borderTop: first ? 'none' : `1px solid ${C.rowRule}`,
      }}
    >
      <div style={{
        display: 'flex', gap: mobile ? 14 : 20, alignItems: 'center',
        flex: 1, minWidth: 0, width: mobile ? '100%' : 'auto',
      }}>
        <MasteryRing score={item.score} level={LEVEL_LABEL[level] ?? level} size={mobile ? 48 : 54} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="rq-clamp"
            title={item.topic}
            style={{
              fontFamily: SANS, fontSize: 15, fontWeight: 500, lineHeight: 1.35,
              color: C.ink, letterSpacing: '-0.005em',
            }}
          >
            {item.topic}
          </div>

          {/* Ranked metadata. Three tiers of weight, size and ink. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginTop: 6, fontFamily: SANS,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, lineHeight: 1.3,
              color: veryLate ? OVERDUE_INK : C.secondary,
            }}>
              {timing}
            </span>
            <span aria-hidden style={{ color: C.hollow }}>·</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: C.secondary,
            }}>
              <StatusDot level={level} />
              {LEVEL_LABEL[level] ?? level}
            </span>
            {/* The trend is the least load-bearing thing on the row, so at
                390px it is the first thing dropped rather than the thing that
                wraps the ranked line onto two. */}
            {!mobile && trend && trend !== 'flat' && (
              <>
                <span aria-hidden style={{ color: C.hollow }}>·</span>
                <TrendNote trend={trend} />
              </>
            )}
          </div>

          <div style={{
            marginTop: 3, fontFamily: SANS, fontSize: 12.5, fontWeight: 400,
            lineHeight: 1.4, color: C.stale,
          }}>
            {item.count} session{item.count !== 1 ? 's' : ''} · last practiced {timeAgo(item.lastUpdated)}
          </div>
        </div>
      </div>

      {actions}
    </div>
  )
}

// ── Empty states ────────────────────────────────────────────────────────────
function EmptyShell({ children, mobile }) {
  return (
    <div style={{
      padding: mobile ? '38px 22px 34px' : '56px 40px 50px',
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {children}
    </div>
  )
}

function EmptyBody({ children }) {
  return (
    <p style={{
      margin: '12px 0 0', maxWidth: 460,
      fontFamily: SANS, fontSize: 14.5, lineHeight: 1.6, color: C.secondary,
    }}>{children}</p>
  )
}

// A cleared queue is the best moment this screen has, so it gets the loudest
// treatment on the page: the serif headline, the one green mark, and the
// weekly count that makes the habit visible.
function ClearedState({ mobile, weeklyClears, onOpenBrainDump }) {
  return (
    <EmptyShell mobile={mobile}>
      <div className="rq-rise" style={{
        position: 'relative',
        width: 68, height: 68, borderRadius: 999,
        background: `${C.solid}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <span aria-hidden className="rq-halo" style={{
          position: 'absolute', inset: -4, borderRadius: 999,
          border: `2px solid ${C.solid}`, pointerEvents: 'none',
        }} />
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.solid}
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 style={{
        margin: 0, fontFamily: KM_SERIF, fontWeight: 500,
        fontSize: mobile ? 24 : 28, lineHeight: 1.25, color: C.ink,
      }}>
        Queue cleared<span style={{ color: C.solid }}>.</span>
      </h2>
      <EmptyBody>
        Every topic that was due is reviewed. Spaced repetition compounds, so the ones you just
        went through will hold for longer before they come back.
      </EmptyBody>
      {weeklyClears >= 2 && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          margin: '18px 0 0', padding: '9px 15px', borderRadius: 999,
          background: C.pageBg, border: `1px solid ${C.cardBorder}`,
          fontFamily: SANS, fontSize: 13, fontWeight: 500, color: C.ink,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: C.solid }} />
          {weeklyClears} clears this week
        </div>
      )}
      {onOpenBrainDump && (
        <div style={{ marginTop: 24, width: mobile ? '100%' : 'auto' }}>
          <PrimaryButton label="Capture new topics" full={mobile} onClick={() => onOpenBrainDump()} />
        </div>
      )}
    </EmptyShell>
  )
}

function CaughtUpState({ mobile, onOpenBrainDump }) {
  return (
    <EmptyShell mobile={mobile}>
      <div style={{
        width: 60, height: 60, borderRadius: 999, background: `${C.solid}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.solid}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 style={{
        margin: 0, fontFamily: KM_SERIF, fontWeight: 500,
        fontSize: mobile ? 22 : 26, lineHeight: 1.25, color: C.ink,
      }}>
        Nothing due right now<span style={{ color: C.solid }}>.</span>
      </h2>
      <EmptyBody>
        Every topic you have practiced is still inside its review window. Check the Coming up tab to
        see what lands next, or add a topic with a Brain Dump.
      </EmptyBody>
      {onOpenBrainDump && (
        <div style={{ marginTop: 22, width: mobile ? '100%' : 'auto' }}>
          <PrimaryButton label="Add a new topic" full={mobile} onClick={() => onOpenBrainDump()} />
        </div>
      )}
    </EmptyShell>
  )
}

// Two different nothings, and they deserve different copy. Nothing scheduled
// at all is a first-run state and needs teaching; nothing in the next 7 days
// when the queue is otherwise healthy is a good result and should say so.
function UpcomingEmptyState({ mobile, hasAnyHistory, onOpenBrainDump }) {
  return (
    <EmptyShell mobile={mobile}>
      <div style={{
        width: 60, height: 60, borderRadius: 999, background: C.pageBg,
        border: `1px solid ${C.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.hollow}
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2.5" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <h2 style={{
        margin: 0, fontFamily: KM_SERIF, fontWeight: 500,
        fontSize: mobile ? 22 : 26, lineHeight: 1.25, color: C.ink,
      }}>
        {hasAnyHistory ? 'Clear for the next 7 days' : 'Nothing scheduled yet'}
        <span style={{ color: C.blue }}>.</span>
      </h2>
      <EmptyBody>
        {hasAnyHistory
          ? 'No topic comes back up this week. Anything you practice from here gets its own review date and will show up in this tab.'
          : 'Finish a Brain Dump or a quiz and the topic lands here with a review date. Every practice pushes the next review further out.'}
      </EmptyBody>
      {onOpenBrainDump && (
        <div style={{ marginTop: 22, width: mobile ? '100%' : 'auto' }}>
          <PrimaryButton
            label={hasAnyHistory ? 'Practice something new' : 'Start a Brain Dump'}
            full={mobile}
            onClick={() => onOpenBrainDump()}
          />
        </div>
      )}
    </EmptyShell>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export default function ReviewQueueView({ courses, onOpenBrainDump, onOpenQuizBurst }) {
  const mobile = useIsMobile()
  const [courseFilter, setCourseFilter] = useState('all')
  const [tab, setTab] = useState('due')
  const sheetId = useId()

  const courseId = useMemo(() => {
    if (courseFilter === 'all') return null
    return courses?.find(c => String(c.id) === courseFilter)?.id ?? null
  }, [courseFilter, courses])

  // Both lists were memoised on courseId alone, so finishing a Brain Dump from
  // a row left the queue showing the topic you had just cleared, and the queue
  // could never reach zero while you were looking at it. That is why clearing
  // it produced nothing. The Knowledge Map and the Dashboard already re-read on
  // this event; the queue now does the same. It re-reads the same store through
  // the same functions, so no scheduling behaviour changes, only when it looks.
  const [readAt, setReadAt] = useState(0)
  useEffect(() => {
    const onComplete = () => setReadAt(n => n + 1)
    window.addEventListener('studyedge:tool-session-complete', onComplete)
    return () => window.removeEventListener('studyedge:tool-session-complete', onComplete)
  }, [])

  // readAt is a deliberate cache key, not a value either call reads, which is
  // exactly the shape the exhaustive-deps rule cannot see: the store behind
  // these functions is external to React, so bumping the key is what makes the
  // read happen again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dueItems = useMemo(() => getDueForReview(courseId), [courseId, readAt])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const upcomingItems = useMemo(() => getUpcomingReviews(courseId, 7), [courseId, readAt])

  // Fire a celebration the moment the due queue drops from >0 to 0.
  // Guarded so re-renders and course-filter flips don't retrigger.
  const celebrate = useCelebration()
  const prevDueCountRef = useRef(dueItems.length)
  const [justCleared, setJustCleared] = useState(false)
  const [weeklyClears, setWeeklyClears] = useState(() => getWeeklyClears())
  useEffect(() => {
    const prev = prevDueCountRef.current
    if (prev > 0 && dueItems.length === 0 && courseId === null) {
      const result = recordReviewClear()
      setWeeklyClears(result.weeklyClears)
      if (result.recorded) {
        setJustCleared(true)
        celebrate('medium')
        track('review_queue_cleared', { weeklyClears: result.weeklyClears, clearedCount: prev })
        const t = setTimeout(() => setJustCleared(false), 8000)
        return () => clearTimeout(t)
      }
    }
    prevDueCountRef.current = dueItems.length
  }, [dueItems.length, courseId, celebrate])

  const displayed = tab === 'due' ? dueItems : upcomingItems
  const oldest = dueItems[0] ?? null
  const nextUp = upcomingItems[0] ?? null

  const handleDrill = (topic, courseId) => {
    track('review_queue_drill', { topic, source: 'brain_dump' })
    onOpenBrainDump?.(topic, courseId)
  }
  const handleQuiz = (topic, courseId) => {
    track('review_queue_drill', { topic, source: 'quiz' })
    onOpenQuizBurst?.(topic, courseId)
  }
  const handleDrillAll = () => {
    track('review_queue_drill_all')
    onOpenBrainDump?.()
  }

  // The one line under the H1. It never restates a count the tabs already
  // carry; it says the single thing those counts cannot, which is how long the
  // worst topic has been sitting, or when the next one lands.
  const subline = dueItems.length > 0
    ? (oldest && oldest.overdueMs > DAY
        ? `Your longest wait is ${overdueLabel(oldest.overdueMs).replace(' overdue', '')}. Reviewing right before you forget is what makes it stick.`
        : 'Reviewing right before you forget is what makes it stick.')
    : nextUp
      ? `Nothing is due. The next topic comes back ${dueInLabel(nextUp.dueAt).toLowerCase().replace('due ', '')}.`
      : 'Topics come back on a schedule set by how well you know them.'

  return (
    <div style={{
      minHeight: '100vh', background: C.pageBg,
      padding: mobile ? '28px 18px 80px' : '56px 100px 96px',
      overflowX: 'hidden',
      fontFamily: SANS,
    }}>
      <style id={`rq-sheet-${sheetId}`}>{SHEET}</style>

      {/* Header. One eyebrow, one headline, one sentence, one button. The
          primary action is a button with button proportions rather than a
          third tile wearing a metric's shell. */}
      <header style={{
        display: 'flex',
        flexDirection: mobile ? 'column' : 'row',
        alignItems: mobile ? 'stretch' : 'flex-end',
        justifyContent: 'space-between',
        gap: mobile ? 22 : 40,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={EYEBROW}>Review Queue</div>
          <h1 style={{
            fontFamily: KM_SERIF, fontWeight: 500, fontSize: mobile ? 32 : 44,
            lineHeight: 1.1, margin: '10px 0 0', color: C.ink,
          }}>
            What comes back next<span style={{ color: C.blue }}>.</span>
          </h1>
          <p style={{
            margin: '12px 0 0', fontSize: 15, lineHeight: 1.5,
            color: C.secondary, maxWidth: 620,
          }}>
            {subline}
          </p>
        </div>
        {dueItems.length > 0 && (
          <PrimaryButton
            label="Start reviewing"
            full={mobile}
            onClick={handleDrillAll}
            style={{ padding: '14px 26px', minHeight: 48 }}
          />
        )}
      </header>

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        margin: mobile ? '26px 0 0' : '32px 0 0',
        flexWrap: 'wrap',
      }}>
        <Tabs
          tab={tab}
          onChange={setTab}
          dueCount={dueItems.length}
          upcomingCount={upcomingItems.length}
          mobile={mobile}
        />
        {courses?.length > 1 && (
          <CourseFilter
            courses={courses}
            value={courseFilter}
            onChange={setCourseFilter}
            mobile={mobile}
          />
        )}
      </div>

      {/* List */}
      <div
        id="rq-panel"
        role="tabpanel"
        aria-labelledby={`rq-tab-${tab}`}
        style={{
          margin: mobile ? '16px 0 0' : '20px 0 0',
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 16, boxShadow: C.cardShadow, overflow: 'hidden',
        }}
      >
        {displayed.length === 0 ? (
          tab === 'due'
            ? (justCleared
                ? <ClearedState mobile={mobile} weeklyClears={weeklyClears} onOpenBrainDump={onOpenBrainDump} />
                : <CaughtUpState mobile={mobile} onOpenBrainDump={onOpenBrainDump} />)
            : <UpcomingEmptyState
                mobile={mobile}
                hasAnyHistory={dueItems.length > 0}
                onOpenBrainDump={onOpenBrainDump}
              />
        ) : (
          displayed.map((item, i) => (
            <TopicRow
              key={`${item.topic}-${item.courseId}-${i}`}
              item={item}
              isDue={tab === 'due'}
              onDrill={handleDrill}
              onQuiz={handleQuiz}
              mobile={mobile}
              first={i === 0}
            />
          ))
        )}
      </div>

      {/* How it works, only while there is nothing to look at yet. */}
      {dueItems.length === 0 && upcomingItems.length === 0 && (
        <div style={{
          margin: mobile ? '16px 0 0' : '20px 0 0',
          padding: mobile ? '18px 20px' : '22px 28px',
          borderRadius: 16,
          background: C.card, border: `1px solid ${C.cardBorder}`,
          boxShadow: C.cardShadow,
          maxWidth: 720,
        }}>
          <div style={EYEBROW}>How this works</div>
          <p style={{
            margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: C.secondary,
          }}>
            Review intervals scale with your mastery. Weak topics come back in 1 day, developing in
            2 to 4 days, strong in 7. Each review updates your score and pushes the next review
            further out.
          </p>
        </div>
      )}
    </div>
  )
}
