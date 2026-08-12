/**
 * Step 1, ACT 1: THE HOOK.
 *
 * "What class is wrecking you right now?"
 *
 * No logo parade, no value props, no welcome. The user is asked a question
 * within 1.5 seconds of the app becoming interactive, and the answer becomes
 * the personalisation seed for every screen after it.
 *
 * No auth, no email, no account. Every field of friction before the reveal
 * costs 15 to 30% of the funnel.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import QuestionShell, { ContinueButton } from '../primitives/QuestionShell'
import { DURATION, EASE, SPRING, useReducedMotion } from '../../../lib/motion'
import { celebrate, TIER } from '../../../lib/celebration'
import { fetchWeeklyActiveStudents } from '../../../lib/onboardingStats'
import { T, RADIUS } from '../../../theme/tokens'

// Seeded one-tap chips. These are affordances, not statistics: they let a user
// start the whole flow with a single tap instead of typing.
const CHIPS = ['Organic Chemistry', 'Calculus II', 'Anatomy', 'Statistics']

// Autocomplete corpus. Free text always wins; this only speeds up the common case.
const COMMON_COURSES = [
  'Organic Chemistry', 'General Chemistry', 'Biochemistry', 'Anatomy', 'Physiology',
  'Anatomy and Physiology', 'Microbiology', 'Cell Biology', 'Genetics', 'Biology',
  'Calculus I', 'Calculus II', 'Calculus III', 'Linear Algebra', 'Differential Equations',
  'Statistics', 'Discrete Mathematics', 'Precalculus',
  'Physics I', 'Physics II', 'Thermodynamics', 'Circuits',
  'Psychology', 'Sociology', 'Macroeconomics', 'Microeconomics', 'Accounting',
  'Financial Accounting', 'Managerial Accounting', 'Business Law',
  'Computer Science', 'Data Structures', 'Algorithms', 'Operating Systems',
  'Nursing Pharmacology', 'Pathophysiology', 'Medical Terminology',
  'US History', 'World History', 'Political Science', 'Philosophy',
  'Spanish', 'French', 'English Composition', 'Literature',
  'MCAT', 'LSAT', 'GMAT', 'CPA', 'NCLEX',
]

function StudentCounter({ count }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? count : 0)

  useEffect(() => {
    if (reduced) { setShown(count); return }
    let raf
    const start = performance.now()
    const dur = 900
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur)
      // easeOutCubic
      setShown(Math.round(count * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [count, reduced])

  return (
    <div style={{ marginTop: 18, fontSize: 13, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
      <strong style={{ color: T.text, fontWeight: 700 }}>{shown.toLocaleString()}</strong>
      {' students studied with StudyEdge this week.'}
    </div>
  )
}

export default function Step01Hook({ state, setCourse, onAdvance }) {
  const [query, setQuery] = useState(state.course?.name ?? '')
  const [focused, setFocused] = useState(false)
  const [weekly, setWeekly] = useState(null)
  const inputRef = useRef(null)
  const reduced = useReducedMotion()

  // The field is the first thing the user meets, so it takes focus immediately.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 260)
    return () => clearTimeout(t)
  }, [])

  // Real number or nothing. See onboardingStats.js.
  useEffect(() => {
    let alive = true
    fetchWeeklyActiveStudents().then((v) => { if (alive && v) setWeekly(v) })
    return () => { alive = false }
  }, [])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return COMMON_COURSES.filter((c) => c.toLowerCase().includes(q)).slice(0, 5)
  }, [query])

  const commit = useCallback((name, anchorEl = null) => {
    const clean = String(name ?? '').trim()
    if (!clean) return
    setCourse({ name: clean, code: null, id: null })
    setQuery(clean)
    celebrate({ tier: TIER.MICRO, trigger: 'onboarding_course_selected', anchorEl })
    setTimeout(onAdvance, reduced ? 0 : 220)
  }, [setCourse, onAdvance, reduced])

  const canContinue = query.trim().length >= 2

  return (
    <QuestionShell
      title="What class is wrecking you right now?"
      subtitle="Start with the one that is costing you the most sleep."
      footer={(
        <ContinueButton
          enabled={canContinue}
          onClick={() => commit(query)}
        >
          Continue
        </ContinueButton>
      )}
    >
      <div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 140)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) commit(query) }}
          placeholder="Course name or code"
          aria-label="Course name or code"
          autoComplete="off"
          style={{
            width: '100%',
            minHeight: 54,
            padding: '15px 16px',
            borderRadius: RADIUS.md,
            border: `1.5px solid ${focused ? T.blue : T.border}`,
            background: T.card,
            color: T.text,
            fontSize: 16,
            fontWeight: 500,
            fontFamily: 'inherit',
            outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${T.blueBg}` : 'none',
            transition: 'border-color 120ms ease, box-shadow 120ms ease',
          }}
        />

        {focused && suggestions.length > 0 ? (
          <div
            role="listbox"
            style={{
              marginTop: 6,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.md,
              background: T.card,
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}
          >
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => commit(s, e.currentTarget)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  minHeight: 44,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${T.border}`,
                  color: T.text,
                  fontSize: 14.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {/* One-tap start. Chips stagger in at 60ms intervals. */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: reduced ? { duration: DURATION.micro } : { staggerChildren: 0.06, delayChildren: 0.1 } } }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}
        >
          {CHIPS.map((chip) => (
            <motion.button
              key={chip}
              type="button"
              variants={reduced
                ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: DURATION.micro } } }
                : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE.out } } }}
              whileTap={reduced ? undefined : { scale: 0.96 }}
              transition={SPRING.ui}
              onClick={(e) => commit(chip, e.currentTarget)}
              style={{
                padding: '9px 14px',
                minHeight: 40,
                borderRadius: RADIUS.pill,
                border: `1px solid ${T.border}`,
                background: T.neutralBg,
                color: T.text,
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {chip}
            </motion.button>
          ))}
        </motion.div>

        {weekly ? <StudentCounter count={weekly} /> : null}
      </div>
    </QuestionShell>
  )
}
