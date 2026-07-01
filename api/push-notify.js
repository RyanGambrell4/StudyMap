import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { acquireCronLock } from '../lib/server/cronLock.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export const config = { maxDuration: 60 }

// Initialise VAPID — requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL env vars.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'hello@getstudyedge.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
    return true
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) return 'expired'
    console.error('[push-notify] send error:', err.statusCode, err.message)
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(200).json({ ok: true, skipped: true, reason: 'no_vapid' })

  const locked = await acquireCronLock('push-notify')
  if (!locked) return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, push_subscription, completed_sessions, study_tools, subscription')
    .not('push_subscription', 'is', null)
    .limit(5000)

  if (error) {
    console.error('[push-notify] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  let sent = 0, expired = 0

  for (const row of rows ?? []) {
    if (!row.push_subscription?.endpoint) continue

    const sessions = row.completed_sessions ?? []
    const lastSession = sessions.at(-1)
    const lastDate = lastSession?.date ?? null

    // Skip if already studied today
    if (lastDate === todayStr) continue

    // Build personalized message
    const streak = row.study_tools?._streak?.currentStreak ?? 0
    const courses = row.study_tools?.courses ?? []
    const nextExam = courses
      .filter(c => c.examDate > todayStr)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))[0]

    let body = "Open your study plan to stay on track today."
    if (streak > 0) {
      body = `Keep your ${streak}-day streak alive! Open your plan now.`
    }
    if (nextExam) {
      const daysAway = Math.ceil((new Date(nextExam.examDate) - new Date()) / 86400000)
      if (daysAway <= 7) {
        body = `${nextExam.name} is in ${daysAway} day${daysAway > 1 ? 's' : ''}. Review now.`
      }
    }

    const result = await sendPush(row.push_subscription, {
      title: '📚 Time to study',
      body,
      tag: 'daily-study',
      url: '/app',
    })

    if (result === 'expired') {
      expired++
      // Clear stale subscription
      await supabaseAdmin.from('user_data').update({ push_subscription: null }).eq('user_id', row.user_id)
    } else if (result === true) {
      sent++
    }
  }

  return res.status(200).json({ ok: true, sent, expired })
}
