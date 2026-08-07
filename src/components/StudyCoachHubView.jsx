/**
 * StudyCoachHubView - the My Plans hub.
 *
 * Matches design/study-coach-flow/ (StudyCoachHub.dc.html, states normal,
 * deadline-passed, first-time, caught-up). All logic lives in
 * src/utils/coachHub.js so it can be tested without a DOM; this file is the
 * rendering only.
 *
 * The export has no mobile artboard, so the responsive rules here follow the
 * ones the plan view already uses: the hero stacks, list rows drop to two
 * lines. A horizontally scrolling page is not an acceptable fallback.
 */

import { useMemo } from 'react'
import { STUDY_COACH as C, SC_SERIF, SANS, courseColor } from '../theme/tokens'
import { buildHubModel, formatCountdown, rowProgress } from '../utils/coachHub'
import { useIsMobile } from '../utils/useIsMobile'

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

function HeroCard({ hero, mobile, onPrimary }) {
  const numeralColor = hero.urgentNumeral ? C.behind : C.ink
  const barColor = hero.progressDone ? C.green : C.done
  const progressColor = hero.progressDone ? C.green : C.secondary

  const numeral = hero.numeral && (
    <div style={{
      textAlign: mobile ? 'left' : 'center',
      paddingRight: mobile ? 0 : 24,
      flexShrink: 0,
      ...(mobile ? { marginBottom: 20 } : {}),
    }}>
      <div style={{
        fontFamily: SC_SERIF, fontSize: mobile ? 46 : 62, fontWeight: 500,
        lineHeight: 1, color: numeralColor,
      }}>{hero.numeral}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: C.secondary }}>{hero.caption}</div>
    </div>
  )

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16,
      boxShadow: C.cardShadow, padding: mobile ? '28px 22px' : '40px 44px',
      marginBottom: 24,
      display: 'flex', flexDirection: mobile ? 'column' : 'row',
      alignItems: mobile ? 'stretch' : 'center',
      justifyContent: 'space-between', gap: mobile ? 0 : 48,
    }}>
      {mobile && numeral}
      <div style={{ maxWidth: mobile ? '100%' : 560 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: C.secondary, marginBottom: 14,
        }}>{hero.eyebrow}</div>

        <div style={{
          fontFamily: SC_SERIF, fontSize: mobile ? 28 : 34, fontWeight: 500,
          lineHeight: 1.15, letterSpacing: '-0.01em', color: C.ink,
        }}>{hero.title}</div>

        {hero.sub && (
          <p style={{
            margin: '12px 0 0', fontSize: 15, color: C.secondary, lineHeight: 1.5,
          }}>{hero.sub}</p>
        )}

        {hero.progress && (
          <div style={{ marginTop: 22 }}>
            <div style={{
              fontSize: 14, fontWeight: 500, marginBottom: 8, color: progressColor,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {hero.progressDone && <span style={{ fontWeight: 700 }} aria-hidden="true">✓</span>}
              {hero.progress}
            </div>
            <div style={{
              width: mobile ? '100%' : 340, height: 6, borderRadius: 3,
              background: C.cardBorder, overflow: 'hidden',
            }}>
              <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${hero.pct}%` }} />
            </div>
          </div>
        )}

        <button type="button" onClick={onPrimary} style={{
          ...btnReset, fontFamily: SANS, marginTop: 26,
          background: C.done, borderRadius: 10,
          padding: mobile ? '13px 0' : '12px 22px',
          fontSize: 14, fontWeight: 600, color: '#ffffff',
          ...(mobile ? { width: '100%', minHeight: 44 } : {}),
        }}>{hero.button}</button>
      </div>
      {!mobile && numeral}
    </div>
  )
}

function CourseRow({ entry, today, last, mobile, onOpen, onBuild }) {
  const countdown = formatCountdown(entry, today)
  const dot = entry.dot || courseColor(entry.idx).dot
  const linkLabel = entry.hasPlan ? 'View plan' : 'Build plan'
  const onClick = () => (entry.hasPlan ? onOpen(entry) : onBuild(entry))

  const deadline = (
    <span style={{ fontSize: 13.5, color: countdown.urgent ? C.behind : C.secondary }}>
      {countdown.text}
    </span>
  )
  const progress = (
    <span style={{ fontSize: 13.5, color: C.secondary }}>{rowProgress(entry)}</span>
  )
  const link = (
    <button type="button" onClick={onClick} style={{
      ...btnReset, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.blue,
      textAlign: mobile ? 'left' : 'right',
    }}>{linkLabel}</button>
  )
  const rule = last ? 'none' : `1px solid ${C.rowRule}`

  if (mobile) {
    return (
      <div style={{ padding: '16px 18px', borderBottom: rule }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flex: 'none' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{entry.name}</span>
          <span style={{ marginLeft: 'auto' }}>{link}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, paddingLeft: 19, flexWrap: 'wrap' }}>
          {deadline}
          <span style={{ color: C.label }}>·</span>
          {progress}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '14px 1fr 220px 170px 90px',
      alignItems: 'center', gap: 16, padding: '18px 28px', borderBottom: rule,
    }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
      <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{entry.name}</span>
      {deadline}
      {progress}
      {link}
    </div>
  )
}

export default function StudyCoachHubView({
  entries,
  today,
  onOpenPlan,
  onBuildPlan,
  onNewPlan,
}) {
  const mobile = useIsMobile()
  const model = useMemo(() => buildHubModel(entries, today), [entries, today])

  // The hero's primary action: open the plan it names, or start a first plan.
  const heroPrimary = () => {
    if (model.heroEntry) onOpenPlan(model.heroEntry)
    else onNewPlan()
  }

  return (
    <div style={{ background: C.pageBg, minHeight: '100vh', fontFamily: SANS }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: mobile ? '28px 20px 64px' : '44px 32px 80px',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: mobile ? 'column' : 'row',
          alignItems: mobile ? 'stretch' : 'flex-start',
          justifyContent: 'space-between',
          gap: mobile ? 16 : 24,
          marginBottom: 32,
        }}>
          <div>
            <h1 style={{
              fontFamily: SC_SERIF, fontSize: mobile ? 36 : 44, fontWeight: 500,
              margin: 0, lineHeight: 1.1, letterSpacing: '-0.01em', color: C.ink,
            }}>Study Coach<span style={{ color: C.blue }}>.</span></h1>
            <p style={{ margin: '10px 0 0', fontSize: 15, color: C.secondary }}>
              One plan per course, built only from what you tell me.
            </p>
          </div>
          <button type="button" onClick={onNewPlan} style={{
            ...btnReset, fontFamily: SANS,
            background: C.card, border: '1px solid #d9dbe1', borderRadius: 10,
            padding: mobile ? '12px 0' : '10px 18px',
            fontSize: 14, fontWeight: 600, color: C.ink,
            boxShadow: C.cardShadow, flexShrink: 0,
            ...(mobile ? { width: '100%', minHeight: 44 } : {}),
          }}>New plan</button>
        </div>

        <HeroCard hero={model.hero} mobile={mobile} onPrimary={heroPrimary} />

        {model.rows.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: C.secondary, margin: '0 0 10px 4px',
            }}>{model.listEyebrow}</div>
            <div style={{
              background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16,
              boxShadow: C.cardShadow, overflow: 'hidden',
            }}>
              {model.rows.map((entry, i) => (
                <CourseRow
                  key={entry.courseKey}
                  entry={entry}
                  today={today}
                  last={i === model.rows.length - 1}
                  mobile={mobile}
                  onOpen={onOpenPlan}
                  onBuild={onBuildPlan}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
