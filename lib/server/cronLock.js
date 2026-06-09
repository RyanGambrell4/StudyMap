// cronLock.js — prevents cron jobs from running more than once per day
// Uses the cron_locks table (PRIMARY KEY cron_name, run_date) as a distributed lock.
// On duplicate key (already ran today) returns false. On any DB error, fails open (returns true).
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const TODAY = () => new Date().toISOString().split('T')[0]

export async function acquireCronLock(cronName) {
  const today = TODAY()
  try {
    const { error } = await supabaseAdmin
      .from('cron_locks')
      .insert({ cron_name: cronName, run_date: today })
    if (error) {
      // Duplicate key = already ran today
      if (error.code === '23505') return false
      console.error(`[cronLock] Error acquiring lock for ${cronName}:`, error.message)
      return true // Fail open: if we can't check, proceed
    }
    return true
  } catch (e) {
    console.error(`[cronLock] Exception acquiring lock for ${cronName}:`, e.message)
    return true // Fail open
  }
}
