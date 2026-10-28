// Uploaded or pasted material, split into numbered sections so generated
// cards and questions can say where they came from.
//
// Paragraphs are packed into sections of about `size` characters, in order,
// up to `maxChars` in total. A 3,129-word PDF (about 19,000 characters) used
// to be cut to its first 8,000 characters.

export function sectionize(text, { size = 1800, maxChars = 60000 } = {}) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, maxChars)
  if (!clean) return []
  const paras = clean.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const out = []
  let cur = ''
  for (const p of paras) {
    // A single paragraph longer than a section is split on sentence ends.
    const pieces = p.length > size ? p.match(new RegExp(`[\\s\\S]{1,${size}}(?=\\s|$)`, 'g')) || [p] : [p]
    for (const piece of pieces) {
      if (cur && cur.length + piece.length + 2 > size) {
        out.push(cur)
        cur = ''
      }
      cur = cur ? `${cur}\n\n${piece}` : piece
    }
  }
  if (cur) out.push(cur)
  return out
}

/** The material as prompt text: "[Section 1]\n…\n\n[Section 2]\n…". */
export function renderSections(sections) {
  return sections.map((s, i) => `[Section ${i + 1}]\n${s}`).join('\n\n')
}

/** The instruction that keeps generation inside the material. */
export const MATERIAL_ONLY_RULES = `MATERIAL RULES:
- The student uploaded the material above. Every card and question must come from it. Do not add facts, examples or topics that are not in it.
- The deck name is only a label. If it does not match the material, follow the material.
- Give each item a "source" naming the section it came from, exactly as written, e.g. "Section 3".
- Cover the material evenly, not just the first sections.`
