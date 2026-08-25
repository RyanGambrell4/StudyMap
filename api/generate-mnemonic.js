import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { sendUserError } from '../lib/server/userErrors.js'
import { resolveCourseId } from '../lib/server/courseContext.js'
import { saveArtifact } from '../lib/server/artifactWriter.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { concept, answer, courseName, courseId: bodyCourseId } = req.body
  if (!concept || !answer) return sendUserError(res, 'missing_input', 'generate-mnemonic: no concept or no answer')

  let courseId = bodyCourseId || null
  if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName).catch(() => null)

  // Reserved after validation, so a request that gets rejected costs nothing.
  const gate = await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  const prompt = `Create a memorable mnemonic device to help a student remember the following flashcard.

${courseName ? `Course: ${courseName}` : ''}
Concept (front): ${concept}
Answer (back): ${answer}

Return ONLY a valid JSON object with no other text:
{
  "mnemonic": "A vivid, concrete mnemonic — acronym, rhyme, story, visual association, or wordplay. Must be genuinely memorable and directly tied to the specific content, not generic. 1-3 sentences max.",
  "type": "acronym | rhyme | story | visual | wordplay"
}

Rules:
- The mnemonic must work specifically for THIS concept and answer, not a generic template
- Prefer mnemonics that create a visual image or story — these stick the longest
- If using an acronym, every letter must map to a specific word in the answer
- Never start with "I" and never use em dashes
- If the concept has multiple parts to remember, address all of them`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const result = JSON.parse(content.slice(first, last + 1))
    if (courseId) {
      saveArtifact({
        userId: gate.userId,
        courseId,
        courseName: courseName || 'Unknown Course',
        artifactType: 'mnemonic',
        title: `${String(concept).slice(0, 60)} Mnemonic`,
        topic: String(concept).slice(0, 200),
        payload: { ...result, concept, answer },
      }).then(w => { if (!w.ok) console.warn('[generate-mnemonic] saveArtifact failed', w.error) })
        .catch(err => console.warn('[generate-mnemonic] saveArtifact threw', err?.message))
    }
    // The work succeeded, so charge for it now.
    await gate.commit?.()
    return res.status(200).json(result)
  } catch (e) {
    console.error('[generate-mnemonic]', e)
    return res.status(500).json({ error: 'Failed to generate mnemonic. Please try again.' })
  }
}
