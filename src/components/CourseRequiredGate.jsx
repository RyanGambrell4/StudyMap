import { useState, useRef, useEffect } from 'react'
import { T, RADIUS, SANS, COURSE_COLORS } from '../theme/tokens'
import { track } from '../lib/analytics'
import Spinner from './ui/spinner'

/**
 * CourseRequiredGate
 *
 * The first step of the app. Nothing downstream works without a course:
 * every AI endpoint resolves a courseId, the study plan is generated per
 * course, and the paywall has nothing to argue about against an empty
 * account. Onboarding used to end with zero courses and drop the user on a
 * dashboard that could not do anything, so this stands in front of that.
 *
 * It is not dismissible. There is no skip, no "later", no close button. The
 * only ways out are forward (add a course) or all the way out (sign out).
 *
 * Applies to existing accounts as well as new ones: it renders whenever the
 * course list is empty, not just after onboarding.
 *
 * Syllabus upload is the promoted path because it produces a populated course
 * in a single action, dates and topics and grade weights included. Typing a
 * name is the fallback for someone who does not have the file to hand.
 */

const FILE_ACCEPT = '.pdf,.docx,.pptx'

export default function CourseRequiredGate({
  onUploadSyllabus,
  onAddCourse,
  parsing = false,
  parseError = '',
  onDismissParseError,
  onSignOut,
}) {
  const [mode, setMode] = useState('syllabus')   // 'syllabus' | 'manual'
  const [dragging, setDragging] = useState(false)
  const [name, setName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    track('course_gate_shown', { default_path: 'syllabus' })
  }, [])

  const handleFile = (file) => {
    if (!file) return
    setError('')
    track('course_gate_syllabus_selected', { file_type: file.name.split('.').pop()?.toLowerCase() ?? null })
    onUploadSyllabus?.(file)
  }

  const handleManualSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a course name to continue.'); return }
    if (!examDate) { setError('Add the date of your final or next big exam. Your study plan is built backwards from it.'); return }
    if (examDate <= todayStr) { setError('That date has already passed. Pick a date in the future.'); return }
    setError('')
    track('course_gate_manual_submitted', {})
    onAddCourse?.({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: trimmed,
      code: '',
      examDate,
      difficulty: 'Medium',
      targetGrade: 'A',
      color: { name: 'custom', dot: COURSE_COLORS[0].dot },
    })
  }

  const switchTo = (next) => {
    setError('')
    setMode(next)
    track('course_gate_path_switched', { to: next })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-gate-heading"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: T.bg,
        overflowY: 'auto', fontFamily: SANS,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '48px 20px 40px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: RADIUS.md, background: T.blueBg,
            display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: T.blue,
          }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 id="course-gate-heading" style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: '-0.5px', margin: '0 0 8px' }}>
            Add your first course
          </h1>
          <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: 0 }}>
            StudyEdge works from your actual course material, so everything starts here.
            Your syllabus is the fastest way in: the dates, topics, and grade weights all come across in one step.
          </p>
        </div>

        {mode === 'syllabus' ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: 24 }}>
            <input
              ref={fileRef}
              type="file"
              accept={FILE_ACCEPT}
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]) }}
              onClick={() => !parsing && fileRef.current?.click()}
              style={{
                border: `1.5px dashed ${dragging ? T.blue : 'rgba(0,0,0,0.16)'}`,
                background: dragging ? T.blueBg : 'transparent',
                borderRadius: RADIUS.md, padding: '32px 20px', textAlign: 'center',
                cursor: parsing ? 'default' : 'pointer', transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {parsing ? (
                <>
                  <Spinner size="md" color={T.blue} style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Reading your syllabus</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>This takes a few seconds.</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text, marginBottom: 4 }}>
                    Drop your syllabus here
                  </div>
                  <div style={{ fontSize: 13, color: T.muted }}>
                    or click to choose a file. PDF, Word, or PowerPoint.
                  </div>
                </>
              )}
            </div>

            {parseError && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: RADIUS.sm, background: T.redBg, border: `1px solid rgba(214,69,69,0.2)` }}>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{parseError}</div>
                <button
                  onClick={() => { onDismissParseError?.(); switchTo('manual') }}
                  style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, color: T.blue, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Enter the course name instead
                </button>
              </div>
            )}

            {!parsing && (
              <div style={{ marginTop: 18, textAlign: 'center' }}>
                <button
                  onClick={() => switchTo('manual')}
                  style={{ background: 'none', border: 'none', padding: 0, color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
                >
                  I do not have my syllabus handy
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: 24 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 6 }}>
              Course name
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit() }}
              placeholder="Organic Chemistry II"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14,
                borderRadius: RADIUS.sm, border: `1px solid rgba(0,0,0,0.12)`,
                background: '#FFFFFF', color: T.text, fontFamily: 'inherit', outline: 'none',
              }}
            />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: T.text, margin: '16px 0 6px' }}>
              Final or next big exam
            </label>
            <input
              type="date"
              value={examDate}
              min={todayStr}
              onChange={e => { setExamDate(e.target.value); setError('') }}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14,
                borderRadius: RADIUS.sm, border: `1px solid rgba(0,0,0,0.12)`,
                background: '#FFFFFF', color: T.text, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>
              Your study plan is built backwards from this date. You can change it later.
            </div>

            {error && (
              <div style={{ marginTop: 14, fontSize: 13, color: T.red, lineHeight: 1.5 }}>{error}</div>
            )}

            <button
              onClick={handleManualSubmit}
              style={{
                marginTop: 18, width: '100%', padding: '12px 20px', borderRadius: RADIUS.sm,
                background: T.blue, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.blueHov }}
              onMouseLeave={e => { e.currentTarget.style.background = T.blue }}
            >
              Continue
            </button>

            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                onClick={() => switchTo('syllabus')}
                style={{ background: 'none', border: 'none', padding: 0, color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
              >
                Upload my syllabus instead
              </button>
            </div>
          </div>
        )}

        {onSignOut && (
          <div style={{ marginTop: 22, textAlign: 'center' }}>
            <button
              onClick={onSignOut}
              style={{ background: 'none', border: 'none', padding: 0, color: T.dim, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
