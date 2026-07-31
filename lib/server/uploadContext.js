// Server-side upload registry access for the course brain.
//
// Every AI endpoint that wants course-scoped materials should get them
// through getCourseContext() (see courseContext.js), which calls
// getRelevantExcerpts() here. The bare helpers (format, index, scrub,
// validate) are exported for the few call sites that still want direct
// control over the excerpt block.
//
// The client-side registry (src/lib/uploadRegistry.js) mirrors the same
// tokenizer and windowing behavior so client-side previews match what
// the server actually assembles. If the two ever drift, the client wins
// on rendering and the server wins on what the LLM sees.

import { isGroundedInStudent } from './coachAntiGuessing.js'

import { supabaseAdmin } from './supabaseAdmin.js'
const WINDOW_CHARS = 1500
const WINDOW_STRIDE = 1200
const DEFAULT_BUDGET_CHARS = 30000
const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','in','on','for','with','is','are','was',
  'were','be','been','being','it','this','that','these','those','as','by','at',
  'from','into','if','then','else','so','than','when','which','while','who',
  'whom','whose','not','no','do','does','did','done','doing','have','has','had',
  'i','you','he','she','we','they','me','him','her','us','them','my','your',
])

function tokenize(text) {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
}

function windowsOf(text) {
  if (!text) return []
  const src = String(text)
  const out = []
  let idx = 0
  let start = 0
  while (start < src.length) {
    const end = Math.min(src.length, start + WINDOW_CHARS)
    out.push({ idx, text: src.slice(start, end) })
    idx++
    if (end >= src.length) break
    start += WINDOW_STRIDE
  }
  return out
}

// Loads all processed uploads for one (user, course). Uploads with
// status != 'processed' or empty extracted_text are dropped.
async function fetchProcessedUploads(userId, courseId) {
  if (!userId) throw new Error('fetchProcessedUploads: userId is required')
  if (!courseId) throw new Error('fetchProcessedUploads: courseId is required')
  const { data, error } = await supabaseAdmin
    .from('course_uploads')
    .select('id, filename, kind, char_count, extracted_text, uploaded_at, status')
    .eq('user_id', userId)
    .eq('course_id', String(courseId))
    .eq('status', 'processed')
  if (error) throw error
  return (data || []).filter(u => u.extracted_text && u.extracted_text.length > 0)
}

// Returns the excerpts most relevant to `topic`, ranked by keyword
// overlap and packed into `budgetChars`. When topic is empty, returns
// the head window of each upload up to the budget so the AI still has
// some grounding to quote from.
//
// Return shape: [{ uploadId, filename, uploadedAt, kind, windowIndex, text, score }]
// Never returns text from another user or another course; the SQL WHERE
// clause enforces both.
export async function getRelevantExcerpts(userId, courseId, topic, budgetChars = DEFAULT_BUDGET_CHARS) {
  const uploads = await fetchProcessedUploads(userId, courseId)
  if (!uploads.length) return []

  const topicTokens = new Set(tokenize(topic || ''))
  const scored = []

  for (const u of uploads) {
    const windows = windowsOf(u.extracted_text)
    for (const w of windows) {
      let score = 0
      if (topicTokens.size) {
        const wt = tokenize(w.text)
        for (const t of wt) if (topicTokens.has(t)) score += 1
      }
      scored.push({
        uploadId: u.id,
        filename: u.filename,
        uploadedAt: u.uploaded_at,
        kind: u.kind || 'material',
        windowIndex: w.idx,
        text: w.text,
        score,
      })
    }
  }

  if (topicTokens.size) {
    const hits = scored.filter(s => s.score > 0)
    if (hits.length) {
      hits.sort((a, b) => b.score - a.score)
      return packToBudget(hits, budgetChars)
    }
  }

  const heads = []
  const seen = new Set()
  const byUpload = new Map()
  for (const s of scored) {
    if (!byUpload.has(s.uploadId)) byUpload.set(s.uploadId, [])
    byUpload.get(s.uploadId).push(s)
  }
  const uploadOrder = uploads
    .slice()
    .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
  for (const u of uploadOrder) {
    const wins = byUpload.get(u.id) || []
    if (!wins.length) continue
    const head = wins[0]
    if (seen.has(head.uploadId + ':' + head.windowIndex)) continue
    seen.add(head.uploadId + ':' + head.windowIndex)
    heads.push(head)
  }
  return packToBudget(heads, budgetChars)
}

function packToBudget(items, budgetChars) {
  const chosen = []
  let used = 0
  for (const s of items) {
    if (used + s.text.length > budgetChars) continue
    chosen.push(s)
    used += s.text.length
    if (used >= budgetChars) break
  }
  return chosen
}

// Ported from coach-v2-redesign/lib/server/uploadContext.js (copied, not referenced).
export function formatMaterialsBlock(uploads) {
  if (!Array.isArray(uploads) || uploads.length === 0) return ''
  return uploads.map(u => {
    const filename = String(u.filename || 'material').replace(/[\n\r]/g, ' ').slice(0, 200)
    const uploadedAt = String(u.uploaded_at || u.uploadedAt || '').slice(0, 40)
    const id = String(u.id || u.uploadId || '').slice(0, 64)
    const text = String(u.text || u.extracted_text || '').slice(0, 40000)
    return `[Source: ${filename}, uploaded ${uploadedAt}, id=${id}]\n${text}`
  }).join('\n\n---\n\n')
}

export function buildUploadIndex(uploads) {
  const idx = Object.create(null)
  for (const u of uploads ?? []) {
    const id = u?.id ?? u?.uploadId
    if (!id) continue
    idx[id] = {
      filename: u.filename,
      uploadedAt: u.uploaded_at || u.uploadedAt,
      text: u.text || u.extracted_text || '',
    }
  }
  return idx
}

// Strips sourceUploadId from any item whose id does not resolve to a
// real upload OR whose content is not grounded in that upload's text.
// Mutates and returns the same array.
export function scrubUploadCitations(items, uploads, contentKeys = ['question', 'answer', 'text']) {
  if (!Array.isArray(items)) return items
  const index = buildUploadIndex(uploads)
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const sid = item.sourceUploadId
    if (!sid) continue
    const src = index[sid]
    if (!src) {
      delete item.sourceUploadId
      continue
    }
    const candidateText = contentKeys.map(k => item[k]).filter(Boolean).join(' ')
    if (!candidateText) continue
    if (!isGroundedInStudent(candidateText, src.text)) {
      delete item.sourceUploadId
    }
  }
  return items
}

// Returns { ok: true } or { ok: false, offenders: [uploadId, ...] }.
export function validateCitations(items, uploads) {
  const index = buildUploadIndex(uploads)
  const offenders = []
  for (const item of items ?? []) {
    if (item?.sourceUploadId && !index[item.sourceUploadId]) {
      offenders.push(item.sourceUploadId)
    }
  }
  return offenders.length ? { ok: false, offenders } : { ok: true }
}
