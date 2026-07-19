import { useMemo, useState, useEffect } from 'react'
import { clean } from '../utils/strings'
import { getWeakestTopics, getMasterySummary, getDueForReview } from '../lib/masteryStore'
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
      missionCourseId: masteryWeakest.courseId ?? null,
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
      missionCourseName: w.courseName,
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

  // 7. Default: stay consistent, personalize with last session if recent
  const lastSess = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem('se_last_session') ?? 'null')
      if (!raw || Date.now() - raw.completedAt > 6 * 60 * 60 * 1000) return null
      return raw
    } catch { return null }
  })()
  const defaultContext = lastSess?.courseName
    ? `You studied ${lastSess.courseName} recently. A quick Quiz Burst will lock in what you covered.`
    : 'A 10-minute Quiz Burst is the fastest way to lock in knowledge from your last session.'
  return {
    priority: 'low',
    color: D.blue,
    eyebrow: streak > 1 ? `${streak}-day streak` : 'Ready to study',
    headline: streak > 2 ? 'Keep the streak alive.' : 'Start your session.',
    context: defaultContext,
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

// Live hours/minutes/seconds countdown display for urgent exam mode
function HoursCountdown({ examDate, showSeconds = false }) {
  const [parts, setParts] = useState({ h: 0, m: 0, s: 0, days: 0, isNow: false })
  useEffect(() => {
    const update = () => {
      const diff = new Date(examDate + 'T09:00:00') - new Date()
      if (diff <= 0) { setParts({ h: 0, m: 0, s: 0, days: 0, isNow: true }); return }
      const days = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setParts({ h, m, s, days, isNow: false })
    }
    update()
    const t = setInterval(update, showSeconds ? 1000 : 15000)
    return () => clearInterval(t)
  }, [examDate, showSeconds])
  if (parts.isNow) return <span>Now</span>
  if (parts.days > 0) return <span>{parts.days}d {String(parts.h).padStart(2, '0')}h</span>
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {String(parts.h).padStart(2, '0')}h {String(parts.m).padStart(2, '0')}m{showSeconds ? ` ${String(parts.s).padStart(2, '0')}s` : ''}
    </span>
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
  onOpenReviewQueue,
  onOpenTeachItBack,
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

  const { color, eyebrow, headline, context, cta, ctaKey, meta } = mission

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
  const dueForReview = useMemo(() => getDueForReview(null, 5), [])
  const isWarRoom = upcomingExam && upcomingExam.days <= 1
  const weakTopics = useMemo(() => getWeakestTopics(
    upcomingExam?.course?.id ?? null, 3
  ).filter(t => t.score < 65), [upcomingExam])

  // ── War Room rendering for exam-day / day-before ──
  if (isWarRoom) {
    const examName = clean(upcomingExam.course.name)
    const isToday = upcomingExam.days === 0
    return (
      <div className="ss-war" style={{
        gridColumn: 'span 12',
        position: 'relative',
        background: 'linear-gradient(160deg, #FFFFFF 0%, #FFF8F8 45%, #FFEEEE 100%)',
        border: '1px solid rgba(220,38,38,0.18)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(220,38,38,0.14), 0 2px 8px rgba(220,38,38,0.08)',
      }}>
        <style>{`
          @media (max-width: 480px) {
            .ss-war-hero { padding: 18px 16px !important; }
            .ss-war-body { min-width: 0 !important; flex: 1 1 100% !important; }
            .ss-war-body h2 { font-size: 22px !important; }
            .ss-war-meter { min-width: 0 !important; width: 100%; }
            .ss-war-actions { grid-template-columns: 1fr !important; }
          }
        `}</style>
        {/* Ambient glow behind the header */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(220,38,38,0.18) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Top status bar */}
        <div style={{
          position: 'relative',
          padding: '14px 22px',
          background: 'linear-gradient(90deg, #DC2626, #B91C1C 55%, #991B1B)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: '#fff',
              display: 'inline-block', animation: 'war-pulse 1.4s ease-in-out infinite',
              boxShadow: '0 0 12px rgba(255,255,255,0.7)',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#fff',
            }}>
              {isToday ? 'Exam Day · War Room' : 'Exam Tomorrow · War Room'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.9)' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {upcomingExam.course.examDate && (
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                <HoursCountdown examDate={upcomingExam.course.examDate} showSeconds={isToday} />
              </span>
            )}
          </div>
        </div>

        {/* Hero content */}
        <div className="ss-war-hero" style={{ position: 'relative', padding: '24px 24px 22px' }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="ss-war-body" style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: '#DC2626', margin: '0 0 6px',
              }}>
                Final Push
              </p>
              <h2 style={{
                margin: '0 0 8px',
                fontSize: 28, fontWeight: 800, color: '#7F1D1D',
                letterSpacing: '-0.025em', lineHeight: 1.1,
              }}>
                {examName}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: '#991B1B', lineHeight: 1.55, maxWidth: 480 }}>
                {isToday
                  ? 'No new material. Review your weakest topics only. Trust what you have prepared.'
                  : 'Focus on high-yield weaknesses. Sleep is more valuable than one extra hour of study.'}
              </p>
            </div>

            {/* Prep readiness meter */}
            {mastery && (
              <div className="ss-war-meter" style={{
                minWidth: 140, padding: '12px 16px',
                background: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(220,38,38,0.18)',
                borderRadius: 14, textAlign: 'center',
                backdropFilter: 'blur(6px)',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: '#991B1B', textTransform: 'uppercase', marginBottom: 4 }}>
                  Prep Readiness
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: mastery.avg >= 70 ? '#059669' : mastery.avg >= 50 ? '#D97706' : '#DC2626', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'ui-monospace, monospace' }}>
                  {mastery.avg}%
                </div>
                <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>
                  {mastery.strong} strong · {mastery.weak} weak
                </div>
              </div>
            )}
          </div>

          {/* Actions grid */}
          <div className="ss-war-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: weakTopics.length > 0 ? 20 : 0 }}>
            <button
              className="ss-btn"
              onClick={() => { track('war_room_cta', { action: 'examRescue' }); isPro ? onOpenExamRescue?.() : onShowPaywall?.('examRescue') }}
              style={{
                minHeight: 52,
                padding: '12px 18px',
                background: 'linear-gradient(135deg, #DC2626, #991B1B)',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 6px 18px rgba(220,38,38,0.35)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'transform 150ms ease, box-shadow 150ms ease',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Exam Rescue
            </button>
            <button
              className="ss-btn"
              onClick={() => { track('war_room_cta', { action: 'brainDump' }); onOpenBrainDump?.() }}
              style={{
                minHeight: 52,
                padding: '12px 18px',
                background: '#FFFFFF', color: '#B91C1C',
                border: '1.5px solid rgba(185,28,28,0.28)',
                borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'transform 150ms ease, background 150ms ease',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.06)'}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = '#FFFFFF' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
              Brain Dump
            </button>
            <button
              className="ss-btn"
              onClick={() => { track('war_room_cta', { action: 'cheatSheet' }); isPro ? onOpenCheatSheet?.() : onShowPaywall?.('cheat-sheet') }}
              style={{
                minHeight: 52,
                padding: '12px 18px',
                background: '#FFFFFF', color: '#B91C1C',
                border: '1.5px solid rgba(185,28,28,0.28)',
                borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'transform 150ms ease, background 150ms ease',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.06)'}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = '#FFFFFF' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="14 2 14 8 20 8"/><path d="M20 22H4a2 2 0 01-2-2V4a2 2 0 012-2h10l6 6v12a2 2 0 01-2 2z"/></svg>
              Cheat Sheet
            </button>
          </div>

          {/* Prioritized weak topics */}
          {weakTopics.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.72)',
              border: '1px solid rgba(220,38,38,0.18)',
              borderRadius: 14, padding: '14px 16px',
              backdropFilter: 'blur(6px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Priority · drill these first
                </p>
                <span style={{ fontSize: 11, color: '#991B1B', opacity: 0.7 }}>Lowest mastery in this course</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weakTopics.map((t, i) => {
                  const pct = Math.max(6, t.score)
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 10px',
                      background: '#FFFFFF',
                      border: '1px solid rgba(220,38,38,0.1)',
                      borderRadius: 10,
                    }}>
                      <div style={{
                        width: 38, height: 22, borderRadius: 6,
                        background: `linear-gradient(90deg, #DC2626, #B91C1C)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(220,38,38,0.3)',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', fontFamily: 'ui-monospace, monospace' }}>{t.score}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: '#7F1D1D', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.topic}
                        </div>
                        <div style={{ marginTop: 4, height: 4, background: 'rgba(220,38,38,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #DC2626, #F87171)', borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          className="ss-btn"
                          onClick={() => { track('war_room_drill_topic', { topic: t.topic }); onOpenBrainDump?.() }}
                          style={{
                            minHeight: 36, minWidth: 54,
                            padding: '6px 12px',
                            fontSize: 12, fontWeight: 700, color: '#fff',
                            background: '#DC2626', border: 'none', borderRadius: 8,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
                            transition: 'transform 150ms ease',
                          }}
                          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          Drill
                        </button>
                        {onOpenTeachItBack && (
                          <button
                            className="ss-btn"
                            onClick={() => {
                              track('war_room_teach_it_back', { topic: t.topic })
                              const idx = courses?.findIndex(c => String(c.id) === String(t.courseId)) ?? -1
                              onOpenTeachItBack({ courseIdx: Math.max(0, idx), topic: t.topic })
                            }}
                            style={{
                              minHeight: 36, minWidth: 54,
                              padding: '6px 12px',
                              fontSize: 12, fontWeight: 700, color: '#7C3AED',
                              background: 'rgba(124,58,237,0.09)', border: '1px solid rgba(124,58,237,0.25)',
                              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                              transition: 'transform 150ms ease',
                            }}
                            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            Teach
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes war-pulse {
            0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 12px rgba(255,255,255,0.7); }
            50% { opacity: 0.5; transform: scale(1.5); box-shadow: 0 0 20px rgba(255,255,255,0.4); }
          }
          .ss-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
          .ss-btn:hover { transform: translateY(-1px); }
          .ss-btn:active { transform: scale(0.97); }
          .ss-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(220,38,38,0.4); }
        `}</style>
      </div>
    )
  }

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
      <div className="ss-row" style={{ padding: '12px 20px 16px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>

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
        <div className="ss-body" style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: D.text, letterSpacing: -0.3, lineHeight: 1.25 }}>
            {headline}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: D.muted, lineHeight: 1.55, maxWidth: 560 }}>
            {context}
          </p>
        </div>

        {/* CTA */}
        <div className="ss-cta-group" style={{ display: 'flex', flexShrink: 0 }}>
          <button
            className="smart-btn"
            onClick={handleCta}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              minHeight: 44,
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
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            {cta}
          </button>
        </div>
      </div>

      {/* Bottom strip: mastery summary + review queue nudge */}
      {(mastery || dueForReview.length > 0) && (
        <div style={{
          borderTop: `1px solid ${D.border}`,
          padding: '9px 20px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.015)',
        }}>
          {mastery && (
            <>
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
              <span style={{ fontSize: 11.5, fontWeight: 600, color: D.blue }}>Avg {mastery.avg}%</span>
            </>
          )}
          {dueForReview.length > 0 && (
            <button
              className="smart-btn"
              onClick={() => { track('smart_start_review_queue_nudge'); onOpenReviewQueue?.() }}
              style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
                minHeight: 32, fontSize: 11.5, fontWeight: 700, color: D.red,
                background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: D.red, display: 'inline-block', animation: 'smart-pulse 2s ease-in-out infinite' }} />
              {dueForReview.length} due for review
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes smart-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.6); }
        }
        .smart-btn { transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1); }
        .smart-btn:hover { transform: translateY(-1px); }
        .smart-btn:active { transform: scale(0.97); }
        .smart-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(59,97,196,0.35); }
        @media (max-width: 480px) {
          .ss-row { padding: 12px 16px 16px !important; gap: 12px !important; }
          .ss-body { flex: 1 1 100% !important; min-width: 0 !important; }
          .ss-cta-group { width: 100%; align-items: stretch !important; }
          .ss-cta-group > button:first-child { width: 100%; justify-content: center; }
          .ss-cta-group > div { flex-wrap: wrap; justify-content: center; }
        }
      `}</style>
    </div>
  )
}
