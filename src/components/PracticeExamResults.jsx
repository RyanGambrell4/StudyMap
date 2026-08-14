import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { getActivePlan, canUseFeature, hasUsedTrial } from '../lib/subscription'
import { getCachedPracticeExams } from '../lib/db'
import { useCelebration } from '../utils/useCelebration'
import { getAccessToken } from '../lib/supabase'
import { addWeakTopics } from '../lib/weakTopics'
import { addStudySession } from '../lib/studyHistory'
import { addCardsToDeck, cardFromPracticeExamMiss } from '../lib/deckAdditions'
import { track } from '../lib/analytics'
import { PRACTICE_EXAMS as C, PE_SERIF } from '../theme/tokens'
import {
  gradeExam, examScore, correctCountLine, topicBreakdown,
  subtextLine, headline, sortForReview, reviewGroup, scoreColor,
} from '../utils/examResults'

// The one score at which a finished exam is worth celebrating. Below it the
// student has work to do and a burst of confetti reads as mockery.
const CELEBRATE_AT = 85

const EYEBROW = {
  font: `600 11px/1 Inter, sans-serif`,
  letterSpacing: '.08em',
  color: C.secondary,
  textTransform: 'uppercase',
}

function Card({ children, delay = 0, style }) {
  return (
    <div
      className="per-rise"
      style={{
        background: C.card, border: `1px solid ${C.cardBorder}`,
        borderRadius: 16, boxShadow: C.cardShadow,
        animationDelay: `${delay}ms`, ...style,
      }}
    >
      {children}
    </div>
  )
}

// A quiet blue text link. Used for Drill, "Why was I wrong?" and the upgrade
// nudges, so that Retake stays the only filled button on the screen.
function TextLink({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        font: '500 13px/1 Inter, sans-serif', color: C.blue,
        fontFamily: 'inherit', ...style,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Every score this course has recorded, oldest to newest.
 *
 * This plots what the student actually sat and nothing else. The card it
 * replaced also drew a regression line forward and labelled it a predicted
 * real exam score, which was a number the app had no way to know.
 */
function TrendLine({ scores }) {
  const W = 276, H = 84, PAD_X = 6, PAD_Y = 12
  const n = scores.length
  const x = i => PAD_X + (n === 1 ? (W - 2 * PAD_X) / 2 : (i * (W - 2 * PAD_X)) / (n - 1))
  const y = v => H - PAD_Y - (v / 100) * (H - 2 * PAD_Y)
  const last = n - 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} aria-label={`Score trend across ${n} practice exams`}>
      <polyline
        points={scores.map((s, i) => `${x(i)},${y(s)}`).join(' ')}
        fill="none" stroke={C.cardBorder} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
      />
      {scores.map((s, i) => (
        <circle
          key={i}
          cx={x(i)} cy={y(s)} r={i === last ? 4 : 2.5}
          fill={i === last ? scoreColor(s) : C.card}
          stroke={i === last ? scoreColor(s) : C.barTrack}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  )
}

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * One row of the answer review.
 *
 * A missed question is open by default, because that is the reason the student
 * is on this screen. A correct one collapses to a single line: it is worth
 * confirming at a glance and worth expanding only if they want to check they
 * were right for the right reason. Nothing here is tinted. A hard exam should
 * read as a list of things to learn, not nineteen alarms in a row.
 */
function AnswerRow({ item, number, repair, onFetchRepair, onRepairAnswer }) {
  const { q, given } = item
  const group = reviewGroup(item)
  const [open, setOpen] = useState(group !== 'correct')

  const eyebrow = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
      <span style={{ ...EYEBROW, whiteSpace: 'nowrap' }}>Question {number}</span>
      {q?.topic && (
        <span style={{ font: '400 12px/1 Inter, sans-serif', color: C.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {q.topic}
        </span>
      )}
    </div>
  )

  if (group === 'correct' && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          borderTop: `1px solid ${C.cardBorder}`, padding: '16px 32px', cursor: 'pointer',
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12, fontFamily: 'inherit',
        }}
      >
        {eyebrow}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Check />
          <span style={{ font: '400 13px/1 Inter, sans-serif', color: C.secondary }}>Correct</span>
        </span>
      </button>
    )
  }

  return (
    <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: '22px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        {eyebrow}
        {group === 'correct' && (
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', flexShrink: 0 }}
          >
            <Check />
            <span style={{ font: '400 13px/1 Inter, sans-serif', color: C.secondary }}>Hide</span>
          </button>
        )}
      </div>

      <p style={{ margin: 0, fontFamily: PE_SERIF, fontSize: 19, fontWeight: 400, lineHeight: 1.45, color: C.ink, textWrap: 'pretty' }}>
        {q?.question}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', font: '400 13.5px/1.4 Inter, sans-serif' }}>
        {group === 'missed' && (
          given
            ? (
              <span style={{ color: C.secondary, display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber, flexShrink: 0, alignSelf: 'center' }} />
                Your answer {given}
              </span>
            )
            : <span style={{ color: C.secondary, fontStyle: 'italic' }}>Skipped</span>
        )}
        {group === 'ungraded' && (
          <span style={{ color: C.secondary }}>
            {given ? `Your answer ${given}` : <em>Skipped</em>}
          </span>
        )}
        {q?.answer && (
          <span style={{ color: C.secondary }}>
            {q?.type === 'multiple_choice' ? 'Correct answer ' : 'Model answer '}
            <span style={{ color: C.green }}>{q.answer}</span>
          </span>
        )}
      </div>

      {q?.explanation && (
        <p style={{ margin: 0, font: '400 13.5px/1.55 Inter, sans-serif', color: C.secondary, maxWidth: 640 }}>
          {q.explanation}
        </p>
      )}

      {group === 'missed' && (
        <MisconceptionRepair
          repair={repair}
          onFetch={onFetchRepair}
          onAnswer={onRepairAnswer}
        />
      )}
    </div>
  )
}

/**
 * The "Why was I wrong?" flow. Opens as a quiet text link and expands into a
 * diagnosis plus one reinforcing question. Colors follow the same vocabulary
 * as everything else: green for right, amber for wrong. No red.
 */
function MisconceptionRepair({ repair, onFetch, onAnswer }) {
  const rq = repair?.data?.repairQuestion

  if (!repair) return <TextLink onClick={onFetch} style={{ alignSelf: 'flex-start' }}>Why was I wrong?</TextLink>
  if (repair.loading) return <p style={{ margin: 0, font: '400 13px/1 Inter, sans-serif', color: C.secondary }}>Working out where this went wrong.</p>
  if (repair.error) return <p style={{ margin: 0, font: '400 13px/1.4 Inter, sans-serif', color: C.amber }}>{repair.error}</p>
  if (!repair.data) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
      <div>
        <div style={{ ...EYEBROW, marginBottom: 6 }}>What went wrong</div>
        <p style={{ margin: 0, font: '400 13.5px/1.55 Inter, sans-serif', color: C.ink, maxWidth: 640 }}>{repair.data.diagnosis}</p>
      </div>

      {rq && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={EYEBROW}>Try it again</div>
          <p style={{ margin: 0, fontFamily: PE_SERIF, fontSize: 16, fontWeight: 400, lineHeight: 1.45, color: C.ink }}>{rq.question}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 520 }}>
            {rq.options.map((opt, oi) => {
              const isSelected = repair.repairSelected === opt
              const isCorrect = opt === rq.answer
              const showRight = repair.repairConfirmed && isCorrect
              const showWrong = repair.repairConfirmed && isSelected && !isCorrect
              const edge = showRight ? C.green : showWrong ? C.amber : isSelected ? C.blue : C.cardBorder
              return (
                <button
                  key={oi}
                  onClick={() => !repair.repairConfirmed && onAnswer(opt)}
                  disabled={repair.repairConfirmed}
                  style={{
                    padding: '10px 13px', borderRadius: 10, textAlign: 'left',
                    font: '400 13.5px/1.4 Inter, sans-serif', fontFamily: 'inherit',
                    border: `1px solid ${edge}`, background: C.card,
                    color: showRight ? C.green : showWrong ? C.amber : C.ink,
                    cursor: repair.repairConfirmed ? 'default' : 'pointer',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>
          {repair.repairConfirmed && (
            <p style={{ margin: 0, font: '400 13.5px/1.55 Inter, sans-serif', color: C.secondary, maxWidth: 640 }}>
              <span style={{ color: repair.repairSelected === rq.answer ? C.green : C.amber }}>
                {repair.repairSelected === rq.answer ? 'Got it. ' : 'Still not quite. '}
              </span>
              {rq.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * readOnly is replay mode: the student is reopening a stored exam from the
 * history card, not finishing a new one. The work was already counted once, so
 * every mount side effect below is suppressed. Replaying writes nothing.
 */
export default function PracticeExamResults({
  questions, answers, timeMs, courseId, courseName,
  timerMinutes = null, takenAt = null, savedToHistory = false, readOnly = false,
  onRetake, onClose, onDrillTopic,
}) {
  const graded = useMemo(() => gradeExam(questions, answers), [questions, answers])
  const { score, correctCount, autoGradedCount } = useMemo(() => examScore(graded), [graded])
  const topics = useMemo(() => topicBreakdown(graded), [graded])
  const ordered = useMemo(() => sortForReview(graded), [graded])

  // Everything the student sat before this one, for the comparison line. The
  // current exam is already in the cache by the time this renders, so it is
  // filtered out by timestamp rather than assumed to be absent.
  const priorExams = useMemo(() => {
    if (!courseId) return []
    const all = getCachedPracticeExams(courseId) ?? []
    return all.filter(e => !Number.isFinite(takenAt) || (Number.isFinite(e?.takenAt) && e.takenAt < takenAt))
  }, [courseId, takenAt])

  const subtext = useMemo(
    () => subtextLine({ score, priorExams, timeMs, timerMinutes }),
    [score, priorExams, timeMs, timerMinutes],
  )

  // Weak topics, for the write-backs below. Ordered worst first and capped,
  // which is the shape addWeakTopics has always expected.
  const weakTopics = useMemo(
    () => topics.filter(t => t.missed > 0).sort((a, b) => a.pct - b.pct).slice(0, 5),
    [topics],
  )

  const celebrate = useCelebration()
  const celebratedRef = useRef(false)

  // Confetti belongs to the moment an exam was finished well. Never on a
  // replay, and never below CELEBRATE_AT: a 40 does not get a celebration.
  useEffect(() => {
    if (readOnly) return
    if (score === null || celebratedRef.current) return
    celebratedRef.current = true
    if (score >= CELEBRATE_AT) {
      const timer = setTimeout(() => celebrate(score >= 90 ? 'big' : 'medium'), 700)
      return () => clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    // Replay mode records nothing. Study history, deck cards, weak topics and
    // mastery signals were all written when this exam was actually taken;
    // writing them again would count one exam twice.
    if (readOnly) return
    if (weakTopics.length) addWeakTopics(weakTopics.map(t => t.topic))
    addStudySession({ tool: 'Practice Exam', score: score ?? null, topic: null, courseName: courseName || null })
    // Missed practice-exam questions become deck cards. Practice exam is
    // where the highest-value misses are. These are the ones the real exam
    // will punish, so we want them in spaced-repetition immediately.
    const missedForDeck = graded
      .filter(g => g.correct === false)
      .map(g => cardFromPracticeExamMiss(g.q, courseId, courseName))
    if (missedForDeck.length) {
      addCardsToDeck(missedForDeck)
        .then(({ added }) => added > 0 && window.dispatchEvent(new CustomEvent('studyedge:deck-updated', { detail: { added, source: 'practice_exam_miss' } })))
        .catch(() => {})
    }
    window.dispatchEvent(new CustomEvent('studyedge:tool-session-complete', { detail: { tool: 'practiceExam' } }))

    // Batch one topic_signal per auto-graded question with a topic.
    // Short-answer items (correct === null, not auto-graded) are skipped
    // because we have no reliable score for them. Fire-and-forget: the
    // POST is not awaited and its failure never blocks the results UI.
    if (typeof courseId === 'string' && courseId && courseName) {
      const signals = graded
        .map(g => {
          if (g.correct === null) return null
          const topic = typeof g.q?.topic === 'string' ? g.q.topic.trim() : ''
          if (!topic) return null
          return {
            signalType: 'practice_exam_answer',
            courseId,
            courseName,
            topic,
            rawScore: g.correct === true ? 1 : 0,
            metadata: {
              question_type: g.q?.type || null,
              source_type: g.q?.sourceType || null,
            },
          }
        })
        .filter(Boolean)
        .slice(0, 50)
      if (signals.length) {
        getAccessToken().then(token => {
          fetch('/api/record-signals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ signals }),
          }).catch(() => {})
        })
      }
    }

    track('practice_exam_complete', { score: score ?? null, questionCount: graded.length, weakTopicCount: weakTopics.length, plan: getActivePlan() })
  }, [])

  const [repairs, setRepairs] = useState({})

  const fetchRepair = useCallback(async (questionIdx) => {
    const { q, given } = graded[questionIdx]
    setRepairs(prev => ({ ...prev, [questionIdx]: { loading: true } }))
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/repair-misconception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseName: courseName || 'this course',
          topic: q.topic || undefined,
          wrongQuestion: q.question,
          wrongAnswer: given || null,
          correctAnswer: q.answer,
          existingExplanation: q.explanation,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
      setRepairs(prev => ({ ...prev, [questionIdx]: { loading: false, data, repairSelected: null, repairConfirmed: false } }))
    } catch (e) {
      setRepairs(prev => ({ ...prev, [questionIdx]: { loading: false, error: e.message } }))
    }
  }, [graded, courseName])

  const handleRepairAnswer = useCallback((questionIdx, opt) => {
    setRepairs(prev => ({ ...prev, [questionIdx]: { ...prev[questionIdx], repairSelected: opt, repairConfirmed: true } }))
  }, [])

  const plan = getActivePlan()
  const isUnlimited = plan === 'unlimited'
  const outOfExams = plan === 'free' && !canUseFeature('practiceExam').allowed
  const countLine = correctCountLine({ correctCount, autoGradedCount })

  // The trend needs at least two sittings to be a trend. Scores only, oldest
  // first, with this exam on the end.
  const trend = useMemo(() => {
    if (!isUnlimited) return []
    const past = priorExams
      .filter(e => Number.isFinite(e?.score))
      .sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0))
      .map(e => e.score)
    return Number.isFinite(score) ? [...past, score] : past
  }, [isUnlimited, priorExams, score])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: C.pageBg, overflowY: 'auto' }}>
      <style>{`
        @keyframes per-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .per-rise { animation: per-rise 400ms cubic-bezier(0.16,1,0.3,1) both; }
        .per-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 24px; align-items: start; }
        @media (max-width: 900px) {
          .per-grid { grid-template-columns: minmax(0, 1fr); }
          .per-pad { padding: 32px 20px 64px !important; }
          .per-row { padding-left: 20px !important; padding-right: 20px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .per-rise { animation: none !important; }
        }
      `}</style>

      <div className="per-pad" style={{ maxWidth: 1136, margin: '0 auto', padding: '56px 24px 72px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Headline */}
        <div className="per-rise" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={EYEBROW}>Practice exam result{courseName ? `, ${courseName}` : ''}</div>
          <h1 style={{ margin: 0, fontFamily: PE_SERIF, fontSize: 44, fontWeight: 500, lineHeight: 1.1, color: C.ink }}>
            {headline(score)}<span style={{ color: C.blue }}>.</span>
          </h1>
          {subtext && (
            <p style={{ margin: 0, font: '400 15px/1.5 Inter, sans-serif', color: C.secondary, maxWidth: 560 }}>
              {subtext}
            </p>
          )}
        </div>

        <div className="per-grid">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>

          {/* Score and topics */}
          <Card delay={60} style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              {score === null ? (
                <>
                  <span style={{ fontFamily: PE_SERIF, fontSize: 62, fontWeight: 500, lineHeight: 1, color: C.secondary }}>
                    &ndash;
                  </span>
                  <span style={{ font: '400 14px/1.3 Inter, sans-serif', color: C.secondary }}>Scored answers below</span>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: PE_SERIF, fontSize: 62, fontWeight: 500, lineHeight: 1, color: scoreColor(score) }}>
                    {score}
                  </span>
                  {countLine && <span style={{ font: '400 14px/1 Inter, sans-serif', color: C.secondary }}>{countLine}</span>}
                </>
              )}
            </div>

            {topics.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={EYEBROW}>By topic</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {topics.map(t => (
                    <div key={t.topic} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, font: '400 13.5px/1.3 Inter, sans-serif', color: C.ink }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.topic}</span>
                        <span style={{ color: C.secondary, flexShrink: 0 }}>{t.correct} of {t.total}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: C.barTrack }}>
                        <div style={{ width: `${t.pct}%`, height: 4, borderRadius: 2, background: t.color }} />
                      </div>
                      {t.missed > 0 && onDrillTopic && (
                        <TextLink onClick={() => onDrillTopic(t.topic)} style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                          Drill
                        </TextLink>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savedToHistory && !readOnly && (
              <p style={{ margin: 0, font: '400 13px/1.5 Inter, sans-serif', color: C.secondary }}>
                Added to your practice exam history.
              </p>
            )}
          </Card>

          {/* Score trend, Unlimited only. Every point is an exam that was
              actually sat. The card this replaced also drew the line forward
              and called the result a predicted real exam score. */}
          {trend.length >= 2 && (
            <Card delay={100} style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={EYEBROW}>Score trend</div>
              <TrendLine scores={trend} />
              <p style={{ margin: 0, font: '400 13px/1.5 Inter, sans-serif', color: C.secondary }}>
                Your last {trend.length} practice exams for this course.
              </p>
            </Card>
          )}

          {/* The Unlimited nudge for everyone else, as a link rather than a
              button so Retake stays the only filled action. */}
          {!isUnlimited && (
            <Card delay={100} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, font: '400 13.5px/1.5 Inter, sans-serif', color: C.secondary }}>
                Unlimited charts your score across every practice exam for a course, so you can see whether the work is landing.
              </p>
              <TextLink
                onClick={() => window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'practiceExamAnalytics' } }))}
                style={{ alignSelf: 'flex-start' }}
              >
                See Unlimited
              </TextLink>
            </Card>
          )}

          </div>

          {/* Answer review */}
          <Card delay={130} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '24px 32px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontFamily: PE_SERIF, fontSize: 24, fontWeight: 500, color: C.ink }}>Your answers.</h2>
              <span style={{ font: '400 12.5px/1 Inter, sans-serif', color: C.secondary }}>Missed first</span>
            </div>
            {ordered.map(item => (
              <div key={item.index} className="per-row">
                <AnswerRow
                  item={item}
                  number={item.index + 1}
                  repair={repairs[item.index]}
                  onFetchRepair={() => fetchRepair(item.index)}
                  onRepairAnswer={(opt) => handleRepairAnswer(item.index, opt)}
                />
              </div>
            ))}
          </Card>
        </div>

        {/* The one upgrade nudge: shown after a free student uses their exam.
            A text link, not a button, so Retake stays the only primary. */}
        {outOfExams && (
          <Card delay={200} style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, font: '400 13.5px/1.5 Inter, sans-serif', color: C.secondary, maxWidth: 560 }}>
              That was your free practice exam. {hasUsedTrial() ? 'Pro gives you unlimited exams for every course.' : 'Pro gives you unlimited exams for every course, free for 3 days.'}
            </p>
            <TextLink onClick={() => window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'practice-exam-results' } }))}>
              {hasUsedTrial() ? 'See plans' : 'Start free trial'}
            </TextLink>
          </Card>
        )}

        {/* Actions */}
        <div className="per-rise" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', animationDelay: '260ms' }}>
          <TextLink onClick={onClose} style={{ font: '500 14px/1 Inter, sans-serif', color: C.secondary }}>
            Back to Practice Exams
          </TextLink>
          <button
            onClick={onRetake}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '14px 26px', borderRadius: 12, border: 'none',
              background: C.blue, color: '#fff', cursor: 'pointer',
              font: '600 14.5px/1 Inter, sans-serif', fontFamily: 'inherit',
            }}
          >
            Retake
          </button>
        </div>
      </div>
    </div>
  )
}
