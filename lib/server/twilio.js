// Twilio SMS — no SDK, uses REST API
// Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

function getAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
}

/**
 * Send an SMS message via Twilio.
 * Returns true on success, false on failure.
 * Never throws — SMS must not break the app.
 */
export async function sendSMS(to, message) {
  const auth = getAuth()
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!auth || !from) return false

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
      }
    )
    return res.ok
  } catch (err) {
    console.error('[Twilio] SMS error:', err.message)
    return false
  }
}

/**
 * Send exam reminder SMS
 */
export async function sendExamReminderSMS(to, examTitle, isToday) {
  const message = isToday
    ? `StudyEdge: "${examTitle}" is tomorrow! Open your plan to run a final review: getstudyedge.com/app`
    : `StudyEdge: "${examTitle}" is in 2 days. Time to start your final prep: getstudyedge.com/app`
  return sendSMS(to, message)
}
