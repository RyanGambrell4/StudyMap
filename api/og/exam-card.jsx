/**
 * Personalized exam countdown card — rendered as PNG at email open time.
 *
 * Called from exam-approaching.js with the student's real exam data:
 *   /api/og/exam-card?name=Emma&exam=Organic+Chem+Midterm&days=7&color=%23DC2626&label=URGENT
 *
 * Edge runtime so the image renders close to the user and is cached by Vercel's CDN.
 * No external font fetch — uses the edge runtime's default sans-serif. Text quality
 * is consistent across all email clients.
 *
 * Cache: immutable for 7 days since the URL params are frozen at send time.
 */

/** @jsxImportSource react */
import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

export function GET(req) {
  const { searchParams } = new URL(req.url)
  const name  = searchParams.get('name')  || null
  const exam  = searchParams.get('exam')  || 'Upcoming Exam'
  const days  = parseInt(searchParams.get('days') || '7', 10)
  const color = searchParams.get('color') || '#3B61C4'
  const label = searchParams.get('label') || 'PLAN NOW'
  console.log(`[og/exam-card] exam="${exam}" days=${days} name=${name ?? 'none'}`)

  try {

  const examDisplay   = exam.length > 40 ? exam.slice(0, 38) + '…' : exam
  const dayWord       = days === 1 ? 'day' : 'days'
  const nameLabel     = name ? `${name}'s exam` : 'Your exam'
  const urgencyBg     = color + '18' // semi-transparent background for the badge

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(140deg, #0D1526 0%, #17244A 60%, #1C2D5E 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top urgency bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '5px',
            background: color,
            display: 'flex',
          }}
        />

        {/* Subtle corner glow */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: color,
            opacity: 0.08,
            display: 'flex',
          }}
        />

        {/* Main content row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            padding: '28px 36px 28px 32px',
            gap: '0',
          }}
        >
          {/* Left: countdown number */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '130px',
              width: '130px',
            }}
          >
            <div
              style={{
                fontSize: days >= 10 ? '68px' : '78px',
                fontWeight: '900',
                color: color,
                lineHeight: 1,
                letterSpacing: '-4px',
                display: 'flex',
              }}
            >
              {days}
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: '700',
                color: 'rgba(255,255,255,0.45)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginTop: '5px',
                display: 'flex',
              }}
            >
              {dayWord} left
            </div>
            {/* Urgency badge */}
            <div
              style={{
                marginTop: '12px',
                fontSize: '9px',
                fontWeight: '800',
                color: color,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                background: urgencyBg,
                border: `1px solid ${color}44`,
                borderRadius: '4px',
                padding: '4px 10px',
                display: 'flex',
              }}
            >
              {label}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '1px',
              alignSelf: 'stretch',
              margin: '8px 32px 8px 28px',
              background: 'rgba(255,255,255,0.10)',
              display: 'flex',
            }}
          />

          {/* Right: exam info */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
            }}
          >
            {/* Student label */}
            <div
              style={{
                fontSize: '11px',
                fontWeight: '700',
                color: 'rgba(255,255,255,0.38)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: '10px',
                display: 'flex',
              }}
            >
              {nameLabel}
            </div>

            {/* Exam title */}
            <div
              style={{
                fontSize: examDisplay.length > 28 ? '20px' : '24px',
                fontWeight: '800',
                color: '#FFFFFF',
                lineHeight: 1.2,
                letterSpacing: '-0.4px',
                display: 'flex',
                flexWrap: 'wrap',
              }}
            >
              {examDisplay}
            </div>

            {/* Prompt line */}
            <div
              style={{
                marginTop: '14px',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.45)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: color,
                  display: 'flex',
                  flexShrink: 0,
                }}
              />
              StudyEdge · Build your plan now
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 508,
      height: 180,
      headers: {
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    }
  )
  } catch (err) {
    console.error('[og/exam-card] Failed to generate image:', err)
    return new Response('Image generation failed', { status: 500 })
  }
}
