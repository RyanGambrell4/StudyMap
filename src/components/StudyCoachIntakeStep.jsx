/**
 * StudyCoachIntakeStep - step 1 of the Study Coach wizard.
 *
 * Matches design/study-coach-flow/IntakeStep1.dc.html. This is a
 * reorganisation, not a redesign of behaviour: every control from the Phase 1
 * contract still exists and writes to the same key on `form` that it did
 * before. Nothing was added and nothing was removed.
 *
 * Deleted with the old layout: the right sidebar, the "Plan confidence" score,
 * and every trust disclaimer except the single line in the footer.
 */

import { useRef } from 'react'
import { STUDY_COACH as C, SC_SERIF, SANS, courseColor } from '../theme/tokens'
import { cardFeedback, footerState, TRUST_LINE } from '../utils/coachIntake'
import { useIsMobile } from '../utils/useIsMobile'

const BORDER = '#d9dbe1'
const PLACEHOLDER = '#9a9ba1'
const TOPIC_CHIP_BG = '#EEF1FD'
const DROPZONE_BG = '#F7F9FE'

const btnReset = { border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }

const LEARNING_STYLES = [
  'Active recall', 'Spaced repetition', 'Practice problems', 'Teaching others',
  'Visual diagrams', 'Reading + notes', 'Flashcards', 'Watching lectures',
]
// Kept at the app's existing option sets rather than the mockup's shorter
// ones, so nobody loses the ability to pick 1 day a week or a 75 minute block.
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7]
const LENGTH_OPTIONS = [30, 45, 60, 75, 90]

const inputBase = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`,
  borderRadius: 10, fontFamily: SANS, color: C.ink, outline: 'none',
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: C.ink, ...style }}>
      {children}
    </div>
  )
}

function Card({ n, eyebrow, title, feedback, children, mobile }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16,
      boxShadow: C.cardShadow, padding: mobile ? '26px 20px' : '36px 40px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: mobile ? 12 : 24, marginBottom: 28, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: C.blue, color: '#ffffff',
            fontFamily: SC_SERIF, fontSize: 17, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{n}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: C.secondary, marginBottom: 4,
            }}>{eyebrow}</div>
            <div style={{
              fontFamily: SC_SERIF, fontSize: mobile ? 23 : 27, fontWeight: 500,
              lineHeight: 1.1, color: C.ink,
            }}>{title}</div>
          </div>
        </div>
        {feedback && (
          <div style={{
            fontSize: 13, fontWeight: 600, color: C.green,
            display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6,
          }}>
            <span style={{ fontWeight: 700 }} aria-hidden="true">✓</span>{feedback}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

/** Pill used by course chips, day and length options, and learning styles. */
function Pill({ selected, onClick, children, style }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...btnReset, fontFamily: SANS, fontSize: 13.5,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 999, padding: '9px 16px',
      border: `1px solid ${selected ? C.blue : BORDER}`,
      background: selected ? C.blue : C.card,
      color: selected ? '#ffffff' : C.ink,
      fontWeight: 500,
      ...style,
    }}>{children}</button>
  )
}

export default function StudyCoachIntakeStep({
  form, setForm, courses,
  cachedStruggles, onSaveStruggles,
  materialLoading, materialError, onMaterialFile,
  onNext, syllabusHintFile, onSyllabusHint,
  StruggleTracker,
}) {
  const mobile = useIsMobile()
  const fileRef = useRef(null)
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const dates = form.dates || []
  const topics = form.topics || []
  const styles = form.style || []
  const materials = form.materials || []

  const feedback = cardFeedback(form, courses)
  const footer = footerState(form, courses)

  // ── Topics ──
  const addTopic = (raw) => {
    const value = String(raw ?? '').trim()
    if (!value || topics.includes(value)) return
    update('topics', [...topics, value])
  }
  const onTopicKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTopic(e.target.value)
      e.target.value = ''
    }
  }

  // ── Deadlines: staged inputs, committed by Add, stored on form.dates ──
  const dlName = form._dlName ?? ''
  const dlDate = form._dlDate ?? ''
  const addDeadline = () => {
    if (!dlName.trim()) return
    setForm(f => ({
      ...f,
      dates: [...(f.dates || []), { label: dlName.trim(), date: dlDate }],
      _dlName: '', _dlDate: '',
    }))
  }
  const removeDate = (i) => update('dates', dates.filter((_, j) => j !== i))

  const fmtDate = (iso) => {
    if (!iso) return 'No date'
    const [y, m, d] = iso.split('-').map(Number)
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${MONTHS[m - 1]} ${d}, ${y}`
  }

  const handleFiles = (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    update('materials', [...materials, ...incoming.map(f => ({ name: f.name, size: f.size }))])
    incoming.forEach(f => onMaterialFile?.(f))
  }

  const step = (n, label, active) => (
    <span key={n} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: active ? C.ink : PLACEHOLDER, fontWeight: active ? 600 : 400,
    }}>
      <span style={{ fontFamily: SC_SERIF, fontSize: 15 }}>{n}</span>
      {!mobile && label}
    </span>
  )

  return (
    <div style={{ background: C.pageBg, minHeight: '100vh', fontFamily: SANS }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: mobile ? '28px 20px 160px' : '44px 32px 140px',
      }}>
        <h1 style={{
          fontFamily: SC_SERIF, fontSize: mobile ? 34 : 44, fontWeight: 500,
          margin: 0, lineHeight: 1.1, letterSpacing: '-0.01em', color: C.ink,
        }}>Tell me about the course<span style={{ color: C.blue }}>.</span></h1>

        {/* Step indicator: current step ink, future steps muted, no pills. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          margin: '18px 0 36px', fontSize: 13, flexWrap: 'wrap',
        }}>
          {step(1, 'Tell me about the course', true)}
          <span style={{ width: 24, height: 1, background: BORDER }} />
          {step(2, 'Confirm and refine', false)}
          <span style={{ width: 24, height: 1, background: BORDER }} />
          {step(3, 'Your study plan', false)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Card 1 ── */}
          <Card n="1" eyebrow="Step 1 of 3" title="The course and the goal." feedback={feedback.card1} mobile={mobile}>
            <SectionLabel>Which course is this plan for?</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
              {courses.map((c, i) => {
                const selected = form.courseIdx === i
                const dot = c.color?.dot || courseColor(i).dot
                return (
                  <Pill
                    key={c.id ?? i}
                    selected={selected}
                    onClick={() => update('courseIdx', selected ? -1 : i)}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: selected ? '#ffffff' : dot, flexShrink: 0,
                    }} />
                    {c.name}
                  </Pill>
                )
              })}
            </div>

            <SectionLabel>What does a win look like?</SectionLabel>
            <textarea
              value={form.goal || ''}
              onChange={e => update('goal', e.target.value)}
              placeholder="For example: score an 85 or higher on the final, or finally feel solid on the second half of the course."
              style={{
                ...inputBase, minHeight: 96, resize: 'vertical',
                padding: '14px 16px', fontSize: 15, lineHeight: 1.5,
              }}
            />
          </Card>

          {/* ── Card 2 ── */}
          <Card n="2" eyebrow="What to study" title="What's on the exam." feedback={feedback.card2} mobile={mobile}>
            <SectionLabel>Topics your professor emphasizes</SectionLabel>
            <input
              type="text"
              onKeyDown={onTopicKey}
              onBlur={e => { addTopic(e.target.value); e.target.value = '' }}
              placeholder="Type a topic and press Enter"
              style={{ ...inputBase, padding: '12px 16px', fontSize: 14.5 }}
            />
            {topics.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {topics.map((t, i) => (
                  <span key={`${t}-${i}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: TOPIC_CHIP_BG, color: C.blue, fontSize: 13, fontWeight: 500,
                    padding: '7px 12px', borderRadius: 999,
                  }}>
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove ${t}`}
                      onClick={() => update('topics', topics.filter((_, j) => j !== i))}
                      style={{ ...btnReset, fontSize: 14, lineHeight: 1, color: C.blue }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              margin: '28px 0 10px', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Where you stand</span>
              <span style={{ fontSize: 12.5, color: PLACEHOLDER }}>Optional, but sharpens the plan</span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
              gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.green, marginBottom: 8 }}>What feels solid</div>
                <textarea
                  value={form.strengths || ''}
                  onChange={e => update('strengths', e.target.value)}
                  placeholder="Concepts you could teach a friend"
                  style={{
                    ...inputBase, borderLeft: `3px solid ${C.green}`, minHeight: 84,
                    resize: 'vertical', padding: '12px 14px', fontSize: 14, lineHeight: 1.5,
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.behind, marginBottom: 8 }}>What you&apos;re struggling with</div>
                <textarea
                  value={form.struggles || ''}
                  onChange={e => update('struggles', e.target.value)}
                  placeholder="Separate areas with commas. These get extra time in the plan."
                  style={{
                    ...inputBase, borderLeft: `3px solid ${C.behind}`, minHeight: 84,
                    resize: 'vertical', padding: '12px 14px', fontSize: 14, lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {/* The live Struggle Tracker, restyled with the export's amber
                left accent. The mockup shows an "Import" link here; that was
                shorthand for this component, so the working control stays. */}
            {StruggleTracker && onSaveStruggles && form.courseIdx >= 0 && courses[form.courseIdx] && (
              <div style={{
                border: `1px solid ${C.cardBorder}`, borderLeft: `3px solid ${C.behind}`,
                borderRadius: 12, padding: '16px 20px', marginTop: 20,
              }}>
                <StruggleTracker
                  struggles={cachedStruggles ?? []}
                  courseId={courses[form.courseIdx].id ?? form.courseIdx}
                  courseName={courses[form.courseIdx].name}
                  courseIdx={form.courseIdx}
                  dot={courses[form.courseIdx].color?.dot || C.blue}
                  onSave={onSaveStruggles}
                />
              </div>
            )}
          </Card>

          {/* ── Card 3 ── */}
          <Card n="3" eyebrow="When to study" title="Dates and rhythm." feedback={feedback.card3} mobile={mobile}>
            <SectionLabel>Upcoming deadlines</SectionLabel>
            {dates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {dates.map((d, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: `1px solid ${C.cardBorder}`, borderLeft: `3px solid ${C.blue}`,
                    borderRadius: 10, padding: '12px 16px', gap: 12,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{d.label || 'Untitled'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 13.5, color: C.secondary }}>{fmtDate(d.date)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${d.label || 'deadline'}`}
                        onClick={() => removeDate(i)}
                        style={{ ...btnReset, color: PLACEHOLDER, fontSize: 15, lineHeight: 1 }}
                      >×</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{
              display: mobile ? 'grid' : 'flex',
              gridTemplateColumns: mobile ? '1fr' : undefined,
              gap: 10, marginBottom: 28,
            }}>
              <input
                type="text"
                value={dlName}
                onChange={e => update('_dlName', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDeadline() } }}
                placeholder="Deadline name, like Midterm"
                style={{ ...inputBase, flex: 1, width: mobile ? '100%' : undefined, padding: '11px 14px', fontSize: 14 }}
              />
              <input
                type="date"
                value={dlDate}
                onChange={e => update('_dlDate', e.target.value)}
                style={{ ...inputBase, width: mobile ? '100%' : 'auto', padding: '11px 14px', fontSize: 14, color: C.secondary }}
              />
              <button type="button" onClick={addDeadline} style={{
                ...btnReset, fontFamily: SANS, background: C.card,
                border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 16px',
                fontSize: 13.5, fontWeight: 600, color: C.ink, flexShrink: 0,
              }}>Add</button>
            </div>

            <SectionLabel>Course materials</SectionLabel>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
              style={{
                border: `1.5px dashed ${C.blue}`, background: DROPZONE_BG, borderRadius: 12,
                padding: 26, textAlign: 'center', marginBottom: 28, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, color: C.secondary }}>
                {materialLoading ? 'Reading your file…' : 'Drop your syllabus, lecture slides, or notes here'}
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                <span style={{ fontWeight: 600, color: C.blue }}>Browse files</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
                style={{ display: 'none' }}
              />
              {materials.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: C.secondary }}>
                  {materials.map(m => m.name).join(', ')}
                </div>
              )}
            </div>
            {materialError && (
              <p style={{ margin: '-20px 0 24px', fontSize: 12.5, color: '#DC2626' }}>{materialError}</p>
            )}
            {syllabusHintFile && onSyllabusHint && (
              <div style={{
                margin: '-16px 0 24px', padding: '10px 14px', borderRadius: 10,
                background: DROPZONE_BG, border: `1px solid ${C.cardBorder}`,
                fontSize: 13, color: C.secondary, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              }}>
                This looks like a syllabus.
                <button type="button" onClick={() => onSyllabusHint(syllabusHintFile)} style={{
                  ...btnReset, fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.blue,
                }}>Want me to pull the dates too?</button>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
              gap: 28, marginBottom: 28,
            }}>
              <div>
                <SectionLabel>Study days per week</SectionLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {DAY_OPTIONS.map(n => (
                    <Pill
                      key={n}
                      selected={form.daysPerWeek === n}
                      onClick={() => update('daysPerWeek', n)}
                      style={{ width: 40, height: 38, padding: 0, borderRadius: 10, fontWeight: 600 }}
                    >{n}</Pill>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>Session length</SectionLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {LENGTH_OPTIONS.map(m => (
                    <Pill
                      key={m}
                      selected={form.sessionLen === m}
                      onClick={() => update('sessionLen', m)}
                      style={{ height: 38, padding: '0 14px', borderRadius: 10, fontWeight: 600 }}
                    >{m} min</Pill>
                  ))}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 28, gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Weekend sessions</div>
                <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 3 }}>
                  Allow the plan to schedule Saturdays and Sundays.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!form.includeWeekends}
                aria-label="Weekend sessions"
                onClick={() => update('includeWeekends', !form.includeWeekends)}
                style={{
                  ...btnReset, width: 42, height: 24, borderRadius: 12, position: 'relative',
                  flexShrink: 0, transition: 'background .15s',
                  background: form.includeWeekends ? C.blue : BORDER,
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, transition: 'left .15s',
                  boxShadow: '0 1px 2px rgba(28,27,24,.2)',
                  left: form.includeWeekends ? 21 : 3,
                }} />
              </button>
            </div>

            <SectionLabel>How you learn best</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {LEARNING_STYLES.map(t => {
                const selected = styles.includes(t)
                return (
                  <Pill
                    key={t}
                    selected={selected}
                    onClick={() => update('style', selected ? styles.filter(x => x !== t) : [...styles, t])}
                  >{t}</Pill>
                )
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: C.card,
        borderTop: `1px solid ${C.cardBorder}`, boxShadow: '0 -1px 3px rgba(28,27,24,.05)',
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: mobile ? '12px 20px' : '16px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: mobile ? 12 : 24, boxSizing: 'border-box',
          flexDirection: mobile ? 'column' : 'row',
        }}>
          <div style={{ minWidth: 0, width: mobile ? '100%' : 'auto' }}>
            <div style={{
              fontSize: 14, fontWeight: 500,
              color: footer.ready ? C.green : PLACEHOLDER,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {footer.ready && <span style={{ color: C.green, fontWeight: 700 }} aria-hidden="true">✓</span>}
              {footer.line}
            </div>
            <div style={{ fontSize: 12, color: PLACEHOLDER, marginTop: 3 }}>{TRUST_LINE}</div>
          </div>
          <button
            type="button"
            disabled={!footer.ready}
            onClick={onNext}
            style={{
              ...btnReset, fontFamily: SANS, borderRadius: 10,
              padding: '13px 24px', fontSize: 14.5, fontWeight: 600,
              flexShrink: 0, whiteSpace: 'nowrap',
              background: footer.ready ? C.blue : C.cardBorder,
              color: footer.ready ? '#ffffff' : PLACEHOLDER,
              cursor: footer.ready ? 'pointer' : 'default',
              width: mobile ? '100%' : 'auto', minHeight: 44,
            }}
          >Review my input</button>
        </div>
      </div>
    </div>
  )
}
