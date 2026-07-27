// Persistent per-course upload registry.
//
// HARD PRODUCT RULE: Every content-generating feature in the app must draw from
// what the student uploaded here. No feature may fabricate citations, invent
// filenames, or "guess" material presence. See lib/server/coachAntiGuessing.js
// for the prompt-side rules.
//
// Every read takes a REQUIRED courseId — cross-course leakage is not possible
// through this interface.
//
// kind values: 'material' (default) | 'syllabus'
// The 'syllabus' kind is stored so re-upload diffing and coach prompts can
// distinguish it from general study materials.

import { getAccessToken } from './supabase.js'
import { extractText } from '../utils/extractText.js'

const EXT_FROM_NAME = (name) => {
  const dot = String(name || '').lastIndexOf('.')
  return dot >= 0 ? String(name).slice(dot + 1).toLowerCase() : ''
}

const ALLOWED_TYPES = ['pdf', 'docx', 'pptx', 'txt', 'md']

async function authHeaders() {
  const token = await getAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ---------- reads ----------

// Metadata-only list for the library UI. Never returns extracted_text.
export async function listUploads(courseId) {
  if (!courseId) throw new Error('listUploads: courseId is required')
  const headers = await authHeaders()
  const res = await fetch(`/api/list-uploads?courseId=${encodeURIComponent(courseId)}`, { headers })
  if (!res.ok) throw new Error(`list-uploads failed: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data.uploads) ? data.uploads : []
}

// Fetches the full extracted text for a single upload.
export async function getUploadText(courseId, uploadId) {
  if (!courseId) throw new Error('getUploadText: courseId is required')
  if (!uploadId) throw new Error('getUploadText: uploadId is required')
  const headers = await authHeaders()
  const res = await fetch(`/api/list-uploads?uploadId=${encodeURIComponent(uploadId)}`, { headers })
  if (!res.ok) throw new Error(`list-uploads failed: ${res.status}`)
  const data = await res.json()
  if (!data.upload || data.upload.course_id !== courseId) return null
  return data.upload
}

// Pulls every processed upload's text for a course, tagged with metadata.
export async function getAllTextForCourse(courseId) {
  if (!courseId) throw new Error('getAllTextForCourse: courseId is required')
  const headers = await authHeaders()
  const res = await fetch(`/api/list-uploads?courseId=${encodeURIComponent(courseId)}&full=1`, { headers })
  if (!res.ok) throw new Error(`list-uploads failed: ${res.status}`)
  const data = await res.json()
  return (data.uploads ?? []).filter(u => u.status === 'processed' && u.extracted_text)
}

// ---------- writes ----------

// Extracts text client-side then POSTs to /api/upload-material.
// Returns the created row (metadata only, no extracted_text).
// On extraction failure, records a 'failed' row so the library shows an honest state.
//
// kind: 'material' (default) | 'syllabus'
export async function addUpload(courseId, file, { kind = 'material' } = {}) {
  if (!courseId) throw new Error('addUpload: courseId is required')
  if (!file) throw new Error('addUpload: file is required')

  const fileType = EXT_FROM_NAME(file.name)
  if (!ALLOWED_TYPES.includes(fileType)) {
    throw new Error(`Unsupported file type: .${fileType}`)
  }

  let extractedText = ''
  let status = 'processed'
  let errorMessage = null

  try {
    extractedText = await extractText(file)
    if (!extractedText || !extractedText.trim()) {
      status = 'failed'
      errorMessage = 'Empty file'
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err?.message ?? 'Could not read file'
  }

  const headers = await authHeaders()
  const body = {
    courseId,
    filename: file.name,
    fileType,
    kind,
    status,
    extractedText: status === 'processed' ? extractedText : '',
    errorMessage,
  }
  const res = await fetch('/api/upload-material', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `upload-material failed: ${res.status}`)
  }
  const data = await res.json()
  return data.upload
}

export async function removeUpload(courseId, uploadId) {
  if (!courseId) throw new Error('removeUpload: courseId is required')
  if (!uploadId) throw new Error('removeUpload: uploadId is required')
  const headers = await authHeaders()
  const res = await fetch('/api/delete-course-uploads', {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, uploadId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `delete-course-uploads failed: ${res.status}`)
  }
  return true
}

export async function removeAllForCourse(courseId) {
  if (!courseId) throw new Error('removeAllForCourse: courseId is required')
  const headers = await authHeaders()
  const res = await fetch('/api/delete-course-uploads', {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId }),
  })
  if (!res.ok) return false
  return true
}

// ---------- selection ----------

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','by','from',
  'is','are','was','were','be','been','being','it','its','this','that','these',
  'those','as','at','into','over','under','about','than','then','so','if','not',
  'no','yes','do','does','did','has','have','had','can','could','will','would',
  'should','may','might','must','shall','you','your','we','our','they','their',
  'i','me','my','he','she','him','her','his','hers','study','notes','chapter',
])

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

function windowsOf(text, size = 1500, stride = 1200) {
  const out = []
  let i = 0
  const n = text.length
  while (i < n) {
    out.push({ start: i, text: text.slice(i, i + size) })
    i += stride
  }
  return out
}

// Given a topic string, returns excerpts across all uploads for a course
// ranked by keyword overlap. Each excerpt carries source metadata for honest citation.
//
// Returns [{ uploadId, filename, uploadedAt, windowIndex, text, score }].
// Empty array means no relevant material — callers must fall back to
// no-uploads behavior with NO citation phrasing.
export async function getRelevantExcerpts(courseId, topic, budgetChars = 30000) {
  if (!courseId) throw new Error('getRelevantExcerpts: courseId is required')
  if (!topic || !String(topic).trim()) return []

  const uploads = await getAllTextForCourse(courseId)
  if (!uploads.length) return []

  const topicTokens = new Set(tokenize(topic))
  if (!topicTokens.size) return []

  const scored = []
  for (const u of uploads) {
    const windows = windowsOf(u.extracted_text)
    windows.forEach((w, idx) => {
      const wt = tokenize(w.text)
      let score = 0
      for (const t of wt) if (topicTokens.has(t)) score += 1
      if (score >= 1) {
        scored.push({
          uploadId: u.id,
          filename: u.filename,
          uploadedAt: u.uploaded_at,
          windowIndex: idx,
          text: w.text,
          score,
        })
      }
    })
  }

  scored.sort((a, b) => b.score - a.score)

  const chosen = []
  let used = 0
  for (const s of scored) {
    if (used + s.text.length > budgetChars) continue
    chosen.push(s)
    used += s.text.length
    if (used >= budgetChars) break
  }
  return chosen
}

// Serializes excerpts for a prompt with clear source tags.
// AI must only cite filenames that appear in this block — see coachAntiGuessing.js.
export function formatExcerptsForPrompt(excerpts) {
  if (!excerpts?.length) return ''
  return excerpts.map(e =>
    `[Source: ${e.filename}, uploaded ${e.uploadedAt}]\n${e.text}`
  ).join('\n\n---\n\n')
}

// Returns a lookup { [uploadId]: { filename, uploadedAt } } for citation resolution.
export function buildUploadIndex(uploads) {
  const idx = Object.create(null)
  for (const u of uploads ?? []) {
    idx[u.id] = { filename: u.filename, uploadedAt: u.uploaded_at, status: u.status }
  }
  return idx
}
