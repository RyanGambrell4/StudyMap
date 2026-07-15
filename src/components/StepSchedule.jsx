import { clean } from '../utils/strings'

const A = '#3B61C4'
const TEXT = '#111111'
const MUTED = '#6B6B6B'
const DIM = '#9B9B9B'
const BORDER = 'rgba(0,0,0,0.07)'
const CARD = { background: '#FFFFFF', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: 16 }

const TIME_OPTIONS = ['Morning', 'Afternoon', 'Evening']

const TIME_ICONS = {
  Morning: (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  ),
  Afternoon: (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  ),
  Evening: (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
}

function difficultyChip(d) {
  if (d === 'Hard')   return { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }
  if (d === 'Medium') return { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }
  return { background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }
}

export default function StepSchedule({ schedule, setSchedule, courses, onNext, onBack }) {
  const { hoursPerWeek, preferredTime } = schedule
  const pct = ((hoursPerWeek - 5) / 35) * 100

  return (
    <div style={{ maxWidth: 672, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.5px' }}>Your Study Schedule</h2>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Help us understand how you want to study</p>
      </div>

      {/* Hours per week slider */}
      <div style={{ ...CARD, padding: '24px', marginBottom: 16 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: TEXT }}>
          How many hours per week can you realistically study?
        </p>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: MUTED }}>Be honest. Consistent shorter sessions beat burnout.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: MUTED, width: 24, textAlign: 'right', flexShrink: 0 }}>5h</span>
          <input
            type="range"
            min={5} max={40} step={1}
            value={hoursPerWeek}
            onChange={e => setSchedule({ ...schedule, hoursPerWeek: Number(e.target.value) })}
            style={{
              flex: 1, height: 6, borderRadius: 3, appearance: 'none', cursor: 'pointer',
              accentColor: A,
              background: `linear-gradient(to right, ${A} 0%, ${A} ${pct}%, #E5E7EB ${pct}%, #E5E7EB 100%)`,
            }}
          />
          <span style={{ fontSize: 12, color: MUTED, width: 24, flexShrink: 0 }}>40h</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{hoursPerWeek}</span>
          <span style={{ fontSize: 18, color: MUTED }}>hrs / week</span>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: DIM, marginTop: 8 }}>
          ~{Math.round((hoursPerWeek / 6) * 10) / 10}h per day &nbsp;·&nbsp; ~{Math.round(hoursPerWeek / 6 * 60)} min sessions
        </p>
      </div>

      {/* Preferred time */}
      <div style={{ ...CARD, padding: '24px', marginBottom: 16 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: TEXT }}>When do you prefer to study?</p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: MUTED }}>We'll note this in your schedule</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {TIME_OPTIONS.map(t => {
            const active = preferredTime === t
            return (
              <button
                key={t}
                onClick={() => setSchedule({ ...schedule, preferredTime: t })}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '16px 12px', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13,
                  background: active ? 'rgba(59,97,196,0.07)' : '#FFFFFF',
                  color: active ? A : MUTED,
                  border: active ? `1.5px solid ${A}` : '1px solid rgba(0,0,0,0.10)',
                }}
              >
                <span style={{ color: active ? A : DIM }}>{TIME_ICONS[t]}</span>
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Course summary */}
      <div style={{ ...CARD, padding: '20px 24px', marginBottom: 24 }}>
        <h3 style={{
          margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: DIM,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Your Courses ({courses.length})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courses.map((course, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: course.color.dot }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(course.name)}</span>
              <span style={{ fontSize: 11.5, color: MUTED, flexShrink: 0 }}>
                {course.examDate ? new Date(course.examDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, flexShrink: 0, ...difficultyChip(course.difficulty) }}>{course.difficulty}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            padding: '16px 20px', background: '#FFFFFF', border: `1px solid ${BORDER}`,
            borderRadius: 12, color: MUTED, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          style={{
            flex: 1, background: A, color: '#fff', border: 'none', borderRadius: 12,
            padding: '16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(59,97,196,0.25)',
          }}
        >
          Continue
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
