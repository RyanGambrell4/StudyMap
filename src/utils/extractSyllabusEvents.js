import { getAccessToken } from '../lib/supabase'

export async function extractSyllabusEvents(text) {
  const token = await getAccessToken()
  const res = await fetch('/api/extract-syllabus-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Extraction failed')
  return (data.events ?? []).map((e, i) => ({
    id: `syl-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
    name: e.name,
    date: e.date,
    type: e.type,
    weight: e.weight ?? null,
    notes: e.notes ?? null,
  }))
}
