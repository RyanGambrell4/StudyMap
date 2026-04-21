/**
 * Shared date/time utilities — single source of truth across components.
 */

export function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}

export function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}
