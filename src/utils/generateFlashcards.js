export function generateFlashcards(text) {
  const cards = []
  const seen = new Set()

  function add(front, back) {
    front = front.trim().replace(/\s+/g, ' ')
    back = back.trim().replace(/\s+/g, ' ')
    if (!front || !back || front.length < 3 || back.length < 5) return
    if (front.length > 200 || back.length > 400) return
    const key = front.toLowerCase().slice(0, 60)
    if (seen.has(key)) return
    seen.add(key)
    cards.push({ front, back })
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Pattern 1: "Term: definition" lines
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 2 && colonIdx < 80) {
      const front = line.slice(0, colonIdx).trim()
      const back = line.slice(colonIdx + 1).trim()
      // Avoid lines where "front" itself contains a sentence (has a period before colon)
      if (!front.includes('.') && !front.includes('?') && back.length >= 8) {
        add(front, back)
      }
    }
  }

  // Pattern 2: ALL CAPS header followed by descriptive text on next line
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (/^[A-Z][A-Z\s\-]{3,60}$/.test(line) && lines[i + 1].length > 15) {
      add(line, lines[i + 1])
    }
  }

  // Pattern 3: "X is/are/refers to Y" sentences
  const allText = text.replace(/\n+/g, ' ')
  const defRegex = /([A-Z][a-zA-Z\s\-]{3,60}?)\s+(is|are|refers to|means|is defined as|is known as)\s+([a-z][^.!?]{10,180})[.!?]/g
  let m
  while ((m = defRegex.exec(allText)) !== null) {
    const term = m[1].trim()
    const verb = m[2]
    const def = m[3].trim()
    add(term, `${term} ${verb} ${def}.`)
  }

  // Pattern 4: Numbered list items (turn into Q&A pairs)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const numMatch = line.match(/^(\d+)[.)]\s+(.{15,150})$/)
    if (numMatch) {
      add(numMatch[2].slice(0, 80), numMatch[2])
    }
  }

  // Pattern 5: Bulleted list items with clear noun phrases
  for (const line of lines) {
    const bulletMatch = line.match(/^[•\-*]\s+(.{15,150})$/)
    if (bulletMatch) {
      const content = bulletMatch[1].trim()
      const colonIdx = content.indexOf(':')
      if (colonIdx > 2 && colonIdx < 60) {
        add(content.slice(0, colonIdx).trim(), content.slice(colonIdx + 1).trim())
      }
    }
  }

  // Fallback: first sentence of paragraphs as front, second sentence as back
  if (cards.length < 10) {
    const paragraphs = text.split(/\n{2,}/)
    for (const para of paragraphs) {
      const clean = para.trim()
      if (clean.length < 40) continue
      const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.length > 20)
      if (sentences.length >= 2) {
        add(sentences[0].slice(0, 120), sentences.slice(1).join(' ').slice(0, 300))
      }
    }
  }

  // Last resort: slide consecutive sentences as Q→A pairs
  if (cards.length < 10) {
    const sentences = allText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 25)
    for (let i = 0; i + 1 < sentences.length && cards.length < 10; i += 2) {
      add(sentences[i].trim(), sentences[i + 1].trim())
    }
  }

  return cards.slice(0, 50)
}
