import { useState } from 'react'
import Spinner from './ui/spinner'
import { getAccessToken } from '../lib/supabase'
import { canUseAI, incrementAIQuery, getActivePlan, canUseFeature, incrementFeatureUsage, hasUsedTrial } from '../lib/subscription'
import { addStudySession } from '../lib/studyHistory'
import { daysBetween } from '../utils/dateUtils'

const D = {
  bg: '#F7F6F3', bgCard: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.12)',
  text: '#111111', textMuted: '#6B6B6B', textDim: '#9B9B9B',
  accent: '#E8531A', green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#3B61C4',
}

const GRADE_STEPS = ['F','D-','D','D+','C-','C','C+','B-','B','B+','A-','A','A+']
const PRIORITY_STYLE = {
  Critical:       { color: '#DC2626', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.20)' },
  Important:      { color: '#D97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.20)'  },
  'Nice to have': { color: '#6B6B6B', bg: 'rgba(0,0,0,0.06)',      border: 'rgba(0,0,0,0.12)'      },
}
const BLOCK_COLORS = { study: '#3B61C4', buffer: '#16A34A' }

export default function ExamRescueModal({ courses, onClose, onShowPaywall }) {
  const plan = getActivePlan()
  const isPro = plan !== 'free'

  const [courseIdx, setCourseIdx] = useState(0)
  const [gradeIdx, setGradeIdx] = useState(8) // default B
  const [examDatetime, setExamDatetime] = useState('')
  const [step, setStep] = useState('setup') // 'setup' | 'topics' | 'schedule'
  const [topics, setTopics] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const course = courses[courseIdx] ?? null
  const COURSE_COLORS = ['#3B82F6','#6366F1','#059669','#D97706','#EC4899','#0891B2']
  const courseColor = course?.color?.dot ?? COURSE_COLORS[courseIdx % COURSE_COLORS.length]
  const currentGrade = GRADE_STEPS[gradeIdx]

  // Auto-calculate hours from exam datetime
  const hoursUntilExam = examDatetime
    ? Math.max(0.5, Math.round((new Date(examDatetime) - Date.now()) / 3600000 * 2) / 2)
    : null

  // Pre-fill exam date from course if available
  function useCourseDatetime() {
    if (!course?.examDate) return
    const d = new Date(course.examDate + 'T09:00')
    const local = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setExamDatetime(local)
  }

  async function generateTopics() {
    const { allowed: canRescue } = canUseFeature('examRescue')
    if (!canRescue) { onShowPaywall?.('examRescue'); return }
    setLoading(true)
    setError('')

    let retries = 0
    while (retries < 2) {
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/exam-rescue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            courseName: course?.name ?? 'course',
            currentGrade,
            hoursAvailable: hoursUntilExam ?? 4,
            step: 'topics',
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
        incrementAIQuery()
        incrementFeatureUsage('examRescue')
        addStudySession({ tool: 'Exam Rescue', score: null, topic: null, courseName: course?.name || null })
        window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'examRescue' } }))
        setTopics(data.topics)
        setStep('topics')
        setLoading(false)
        // Kick off schedule generation immediately in background
        generateSchedule(data.topics)
        return
      } catch (e) {
        retries++
        if (retries >= 2) {
          setError(e.message || 'Something went wrong. Please try again.')
          setLoading(false)
        }
      }
    }
  }

  async function generateSchedule(topicList) {
    setScheduleLoading(true)
    setScheduleError(false)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/exam-rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: course?.name ?? 'course',
          hoursAvailable: hoursUntilExam ?? 4,
          topics: topicList,
          step: 'schedule',
        }),
      })
      const data = await res.json()
      if (res.ok && data.blocks) {
        setSchedule(data)
      } else {
        setScheduleError(true)
      }
    } catch (e) {
      setScheduleError(true)
    } finally {
      setScheduleLoading(false)
    }
  }

  const visibleTopics = isPro ? (topics ?? []) : (topics ?? []).slice(0, 1)
  const lockedTopicCount = isPro ? 0 : (topics?.length ?? 0) - 1

  return (
    <div role="dialog" aria-modal="true" aria-label="Exam Rescue" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: D.bgCard, borderRadius: 20, width: '100%', maxWidth: 580,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)', border: `1px solid ${D.border}`,
        overflow: 'hidden',
      }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" fill="none" stroke={D.red} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: D.text, letterSpacing: -0.3 }}>Exam Rescue Plan</div>
            <div style={{ fontSize: 12, color: D.textMuted, marginTop: 1 }}>Ranked topics and an hour-by-hour schedule</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${D.border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Setup */}
        {step === 'setup' && (
          <div style={{ padding: 24, overflowY: 'auto' }}>
            {courses.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Course</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {courses.map((c, i) => {
                    const dot = c.color?.dot ?? COURSE_COLORS[i % COURSE_COLORS.length]
                    const active = courseIdx === i
                    return (
                      <button key={i} onClick={() => { setCourseIdx(i); useCourseDatetime() }} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${active ? `${dot}50` : D.border}`, background: active ? `${dot}12` : 'none', color: active ? dot : D.textMuted, cursor: 'pointer' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Current grade</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: courseColor }}>{currentGrade}</div>
              </div>
              <input
                type="range" min={0} max={GRADE_STEPS.length - 1}
                value={gradeIdx} onChange={e => setGradeIdx(Number(e.target.value))}
                style={{ width: '100%', accentColor: courseColor }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: D.textDim, marginTop: 4 }}>
                <span>F</span><span>C</span><span>B</span><span>A+</span>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Exam date and time</div>
              <input
                type="datetime-local" value={examDatetime}
                onChange={e => setExamDatetime(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: `1px solid ${D.borderStrong}`, fontSize: 14, color: D.text, background: D.bg, outline: 'none', fontFamily: 'inherit' }}
              />
              {course?.examDate && (
                <button onClick={useCourseDatetime} style={{ marginTop: 6, fontSize: 12, color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Use date from my course plan
                </button>
              )}
              {hoursUntilExam !== null && (
                <div style={{ marginTop: 8, fontSize: 13, color: D.textMuted }}>
                  <strong style={{ color: D.text }}>{hoursUntilExam}h</strong> available to study
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 13, color: D.red, marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 8 }}>{error}</div>}

            <button
              onClick={generateTopics}
              disabled={loading}
              style={{ width: '100%', padding: '13px', background: loading ? D.textDim : D.red, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? (
                <><Spinner size="xs" color="#fff" track="rgba(255,255,255,0.3)" />Building rescue plan...</>
              ) : 'Build my rescue plan'}
            </button>

            {!isPro && (() => {
              const { remaining } = canUseFeature('examRescue')
              return (
                <div style={{ textAlign: 'center', fontSize: 12, color: D.textDim, marginTop: 12 }}>
                  {remaining !== null && remaining > 0
                    ? <>{1 - remaining} of 1 rescue plan used · <button onClick={() => onShowPaywall?.('study-hacks')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>Upgrade for the full plan</button></>
                    : <>{hasUsedTrial() ? 'Upgrade to Pro' : 'Start free trial'} for unlimited rescue plans · <button onClick={() => onShowPaywall?.('examRescue')} style={{ color: D.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>Unlock now</button></>
                  }
                </div>
              )
            })()}
          </div>
        )}

        {/* Topics step */}
        {step === 'topics' && topics && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ padding: '14px 24px', borderBottom: `1px solid ${D.border}`, background: D.bg, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 13, color: D.textMuted }}>
                <strong style={{ color: D.text }}>{topics.length} topics</strong> ranked by impact on your grade
              </div>
              <button onClick={() => setStep('setup')} style={{ fontSize: 12, color: D.textDim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit inputs</button>
            </div>

            <div>
              {visibleTopics.map((t, i) => {
                const ps = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE['Nice to have']
                return (
                  <div key={i} style={{ padding: '16px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: 14 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: `${courseColor}12`, border: `1px solid ${courseColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: courseColor }}>
                      {t.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{t.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: ps.color, background: ps.bg, border: `1px solid ${ps.border}`, letterSpacing: '0.03em' }}>{t.priority}</span>
                      </div>
                      <div style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.5, marginBottom: 4 }}>{t.why}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 11.5, color: D.textDim }}>~{t.estimatedMinutes} min</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {lockedTopicCount > 0 && (
                <div style={{ position: 'relative' }}>
                  {topics.slice(1, 3).map((t, i) => (
                    <div key={i} style={{ padding: '16px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: 14, filter: 'blur(5px)', userSelect: 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.04)', border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: D.textDim, flexShrink: 0 }}>{t.rank}</div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{t.name}</div><div style={{ fontSize: 13, color: D.textMuted, marginTop: 2 }}>{t.why}</div></div>
                    </div>
                  ))}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.97) 50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '0 24px 20px' }}>
                    <div style={{ background: D.bgCard, borderRadius: 14, padding: '18px 22px', border: `1px solid ${D.border}`, boxShadow: '0 8px 28px rgba(0,0,0,0.10)', textAlign: 'center', width: '100%', maxWidth: 340 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginBottom: 6 }}>Unlock {lockedTopicCount} more topic{lockedTopicCount !== 1 ? 's' : ''} and the full schedule</div>
                      <button onClick={() => onShowPaywall?.('examRescue')} style={{ width: '100%', padding: '10px', background: D.blue, border: 'none', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{hasUsedTrial() ? 'Upgrade to Pro' : 'Start free trial →'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Schedule section */}
            {isPro && (
              <div style={{ padding: '20px 24px', borderTop: `1px solid ${D.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
                  Hour-by-hour schedule
                </div>

                {scheduleLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
                    <Spinner size="sm" color={D.blue} />
                    <span style={{ fontSize: 13, color: D.textMuted }}>Building your schedule...</span>
                  </div>
                )}

                {scheduleError && !scheduleLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}>
                    <span style={{ fontSize: 12, color: D.red }}>Could not build schedule. Try again.</span>
                    <button onClick={() => generateSchedule(topics)} style={{ fontSize: 12, fontWeight: 600, color: D.red, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Retry</button>
                  </div>
                )}

                {schedule && !scheduleLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...(schedule.blocks ?? []), ...(schedule.bufferBlock ? [schedule.bufferBlock] : [])].map((block, i) => {
                      const color = BLOCK_COLORS[block.type] ?? D.blue
                      return (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, background: `${color}07`, border: `1px solid ${color}18` }}>
                          <div style={{ width: 3, borderRadius: 2, background: color, flexShrink: 0, alignSelf: 'stretch', minHeight: 32 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{block.startTime} to {block.endTime}</span>
                              {block.type === 'buffer' && <span style={{ fontSize: 10, fontWeight: 700, color: D.green, background: 'rgba(22,163,74,0.10)', padding: '1px 6px', borderRadius: 999 }}>Buffer</span>}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginBottom: 2 }}>{block.topic}</div>
                            <div style={{ fontSize: 12, color: D.textMuted }}>{block.focus}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
