import { useMemo, useState } from 'react'
import { clean } from '../utils/strings'
import { getWeakestTopics, getMasterySummary } from '../lib/masteryStore'
import { getActivePlan } from '../lib/subscription'
import { track } from '../lib/analytics'

const D = {
  bg:       '#F7F6F3',
  bgCard:   '#FFFFFF',
  border:   'rgba(0,0,0,0.07)',
  text:     '#111111',
  muted:    '#6B6B6B',
  dim:      '#9B9B9B',
  blue:     '#3B61C4',
  green:    '#16A34A',
  amber:    '#D97706',
  red:      '#DC2626',
}

// Compute the single most important action right now
function computeMission({ courses, upcomingExam, weakSpots, todaySessions, completedIds, streak, coachPlans }) {
  const masteryWeakest = getWeakestTopics(null, 1)[0]

  // 1. Exam is tomorrow or today
  if (upcomingExam && upcomingExam.days <= 1) {
    return {
      priority: 'urgent',
      color: D.red,
      eyebrow: 'Exam is tomorrow',
      headline: `Final push for ${clean(upcomingExam.course.name)}`,
      context: 'You need an Exam Rescue plan to know exactly what to study in the hours you have left.',
      cta: 'Open Exam Rescue',
      ctaKey: 'examRescue',
      meta: `${upcomingExam.days === 0 ? 'Today' : 'Tomorrow'}: ${clean(upcomingExam.course.name)}`,
    }
  }

  // 2. Exam in 2-3 days
  if (upcomingExam && upcomingExam.days <= 3) {
    return {
      priority: 'high',
      color: D.amber,
      eyebrow: `${upcomingExam.days} days until ${clean(upcomingExam.course.name)}`,
      headline: 'Crunch time. Every hour counts.',
      context: 'Check your AI Cheat Sheet to see the highest-priority topics, then do a full Brain Dump on your weakest one.',
      cta: 'View Cheat Sheet',
      ctaKey: 'cheatSheet',
      meta: `Exam in ${upcomingExam.days} days`,
    }
  }

  // 3. Session scheduled today, uncompleted
  if (todaySessions.length > 0 && completedIds) {
    const uncompleted = todaySessions.filter(s => !completedIds.has(s.id))
    if (uncompleted.length > 0) {
      const s = uncompleted[0]
      return {
        priority: 'normal',
        color: D.blue,
        eyebrow: "Today's schedule",
        headline: s.sessionType ?? 'Start your study session',
        context: `${clean(s.courseName ?? '')} ${s.duration ? `· ${s.duration} min` : ''}`.trim() || 'Your AI-planned session is ready.',
        cta: 'Start Session',
        ctaKey: 'focus',
        meta: streak > 0 ? `${streak}-day streak` : null,
      }
    }
  }

  // 4. Known weak spot from mastery store
  if (masteryWeakest && masteryWeakest.score < 60) {
    return {
      priority: 'normal',
      color: D.blue,
      eyebrow: 'Your weakest topic',
      headline: `Train: ${masteryWeakest.topic}`,
      context: `Your last score on this topic was ${masteryWeakest.score}%. A Brain Dump now will show how much your recall has improved.`,
      cta: 'Brain Dump This Topic',
      ctaKey: 'brainDump',
      meta: streak > 0 ? `${streak}-day streak` : null,
      topic: masteryWeakest.topic,
    }
  }

  // 5. Weak spot from coach plan
  if (weakSpots.length > 0) {
    const w = weakSpots[0]
    return {
      priority: 'normal',
      color: D.blue,
      eyebrow: 'Coach flag',
      headline: `Focus on: ${w.topic}`,
      context: `Your Study Coach flagged ${w.topic} in ${clean(w.courseName)} as a gap. A quick Brain Dump will tell you how well you actually know it.`,
      cta: 'Brain Dump This Topic',
      ctaKey: 'brainDump',
      meta: streak > 0 ? `${streak}-day streak` : null,
      topic: w.topic,
    }
  }

  // 6. Exam in 4-14 days
  if (upcomingExam && upcomingExam.days <= 14) {
    return {
      priority: 'normal',
      color: D.blue,
      eyebrow: `${upcomingExam.days} days to ${clean(upcomingExam.course.name)}`,
      headline: 'Build exam momentum now.',
      context: 'You have enough time to close knowledge gaps if you start consistent sessions today. Open your Coach plan to see what to focus on.',
      cta: 'Open Study Coach',
      ctaKey: 'coach',
      meta: streak > 0 ? `${streak}-day streak` : null,
    }
  }

  // 7. Default: stay consistent
  return {
    priority: 'low',
    color: D.blue,
    eyebrow: streak > 1 ? `${streak}-day streak` : 'Ready to study',
    headline: streak > 2 ? 'Keep the streak alive.' : 'Start your session.',
    context: 'A 10-minute Quiz Burst on any topic is the fastest way to lock in knowledge from your last session.',
    cta: 'Quick Quiz Burst',
    ctaKey: 'quizBurst',
    meta: null,
  }
}

// Map of CTA key to icon SVG string
function MissionIcon({ ctaKey, color }) {
  const paths = {
    examRescue: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    cheatSheet: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
    focus: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    brainDump: 'M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z',
    coach: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    quizBurst: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[ctaKey] ?? paths.quizBurst} />
    </svg>
  )
}

export default function SmartStartCard({
  courses,
  upcomingExam,
  weakSpots,
  todaySessions,
  completedIds,
  streak,
  coachPlans,
  onStartFocus,
  onOpenBrainDump,
  onOpenQuizBurst,
  onOpenExamRescue,
  onOpenCheatSheet,
  onOpenStudyCoach,
  onShowPaywall,
}) {
  const [hovered, setHovered] = useState(false)
  const plan = getActivePlan()
  const isPro = plan === 'pro' || plan === 'unlimited' || plan === 'trial'

  const mission = useMemo(() => computeMission({
    courses,
    upcomingExam,
    weakSpots,
    todaySessions: todaySessions ?? [],
    completedIds,
    streak: streak ?? 0,
    coachPlans,
  }), [courses, upcomingExam, weakSpots, todaySessions, completedIds, streak, coachPlans])

  const { color, eyebrow, headline, context, cta, ctaKey, meta, topic } = mission

  const handleCta = () => {
    track('smart_start_cta_clicked', { cta_key: ctaKey, priority: mission.priority })
    switch (ctaKey) {
      case 'focus':       onStartFocus?.(); break
      case 'brainDump':   onOpenBrainDump?.(); break
      case 'quizBurst':   onOpenQuizBurst?.(); break
      case 'examRescue':  isPro ? onOpenExamRescue?.() : onShowPaywall?.('examRescue'); break
      case 'cheatSheet':  isPro ? onOpenCheatSheet?.() : onShowPaywall?.('cheat-sheet'); break
      case 'coach':       onOpenStudyCoach?.(); break
      default: break
    }
  }

  const mastery = getMasterySummary()

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        gridColumn: 'span 12',
        background: D.bgCard,
        border: `1px solid ${hovered ? `${color}35` : D.border}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 14,
        boxShadow: hovered
          ? `0 8px 32px ${color}15, 0 2px 8px rgba(0,0,0,0.05)`
          : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Top strip: eyebrow label */}
      <div style={{
        padding: '10px 20px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', animation: mission.priority === 'urgent' ? 'smart-pulse 1.8s ease-in-out infinite' : 'none' }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: color }}>{eyebrow}</span>
        </div>
        {meta && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: D.dim, display: 'flex', alignItems: 'center', gap: 4 }}>
            {streak > 1 && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={D.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3-1 2-4 4-4 8a7 7 0 1014 0c0-6-7-13-7-13z"/></svg>
            )}
            {meta}
          </span>
        )}
      </div>

      {/* Main content row */}
      <div style={{ padding: '12px 20px 16px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>

        {/* Icon tile */}
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: `${color}10`,
          border: `1px solid ${color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MissionIcon ctaKey={ctaKey} color={color} />
        </div>

        {/* Text block */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: D.text, letterSpacing: -0.3, lineHeight: 1.25 }}>
            {headline}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: D.muted, lineHeight: 1.55, maxWidth: 560 }}>
            {context}
          </p>
        </div>

        {/* CTA group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleCta}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '11px 20px',
              background: color,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: `0 3px 14px ${color}35`,
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            {cta}
          </button>

          {/* Secondary quick actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            {ctaKey !== 'quizBurst' && (
              <button onClick={() => { track('smart_start_secondary', { action: 'quizBurst' }); onOpenQuizBurst?.() }}
                style={{ fontSize: 11.5, fontWeight: 600, color: D.dim, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Quiz Burst
              </button>
            )}
            {ctaKey !== 'brainDump' && (
              <button onClick={() => { track('smart_start_secondary', { action: 'brainDump' }); onOpenBrainDump?.() }}
                style={{ fontSize: 11.5, fontWeight: 600, color: D.dim, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Brain Dump
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mastery teaser strip -- only when there are tracked topics */}
      {mastery && (
        <div style={{
          borderTop: `1px solid ${D.border}`,
          padding: '9px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'rgba(0,0,0,0.015)',
        }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: D.dim }}>Knowledge map:</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {[
              { label: 'Strong', count: mastery.strong, color: '#16A34A' },
              { label: 'In progress', count: mastery.developing, color: '#D97706' },
              { label: 'Weak', count: mastery.weak, color: '#DC2626' },
            ].map(({ label, count, color: c }) => count > 0 && (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: D.muted }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />
                <strong style={{ color: c, fontWeight: 700 }}>{count}</strong> {label}
              </span>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: D.blue }}>Avg {mastery.avg}%</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes smart-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.6); }
        }
      `}</style>
    </div>
  )
}
