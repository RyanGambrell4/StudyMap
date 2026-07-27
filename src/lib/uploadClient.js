// Client helper for wiring the upload registry into AI fetch calls.
//
// The se_upload_registry flag gates READS only — whether the AI can pull
// from uploaded materials. Writes (addUpload) always happen regardless of
// the flag; this means materials are already indexed the moment the flag
// is enabled. Do not move addUpload behind this flag.
//
// Usage in a component:
//
//   const { uploads, uploadIndex } = await loadUploadContext(courseId, topic)
//   const res = await fetch('/api/quiz-burst', {
//     method: 'POST',
//     body: JSON.stringify({ courseName, topic, uploads }),
//   })

import { getRelevantExcerpts, getAllTextForCourse, buildUploadIndex } from './uploadRegistry.js'

const REGISTRY_ENABLED = typeof window !== 'undefined'
  && localStorage.getItem('se_upload_registry') !== '0'

// Loads the excerpts most relevant to `topic`. If topic is empty, falls
// back to the whole course library (subject to budgetChars).
export async function loadUploadContext(courseId, topic, budgetChars = 30000) {
  if (!REGISTRY_ENABLED || !courseId) return { uploads: [], uploadIndex: {} }
  try {
    const excerpts = topic && String(topic).trim()
      ? await getRelevantExcerpts(courseId, topic, budgetChars)
      : []
    const uploads = excerpts.length
      ? excerpts.map(e => ({
          id: e.uploadId,
          filename: e.filename,
          uploaded_at: e.uploadedAt,
          text: e.text,
        }))
      : await allForCourse(courseId, budgetChars)
    const indexRows = uploads.map(u => ({
      id: u.id,
      filename: u.filename,
      uploaded_at: u.uploaded_at,
    }))
    return { uploads, uploadIndex: buildUploadIndex(indexRows) }
  } catch (err) {
    console.warn('[upload-client] loadUploadContext failed', err)
    return { uploads: [], uploadIndex: {} }
  }
}

async function allForCourse(courseId, budgetChars) {
  const rows = await getAllTextForCourse(courseId)
  let used = 0
  const out = []
  for (const r of rows) {
    const text = String(r.extracted_text || '')
    if (!text) continue
    const room = budgetChars - used
    if (room <= 0) break
    const slice = text.slice(0, room)
    out.push({
      id: r.id,
      filename: r.filename,
      uploaded_at: r.uploaded_at,
      text: slice,
    })
    used += slice.length
  }
  return out
}
