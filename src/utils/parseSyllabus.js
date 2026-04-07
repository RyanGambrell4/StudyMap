const KEYWORDS = [
  'quiz', 'exam', 'midterm', 'final', 'assignment', 'project',
  'lab', 'test', 'homework', 'due', 'deadline', 'presentation',
  'paper', 'report', 'reading', 'chapter', 'submit', 'submission',
  'review',
]

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function parseMonth(str) {
  return MONTH_MAP[str.toLowerCase().replace(/\./g, '').slice(0, 3)] ?? null
}

function resolveYear(month, day) {
  const now = new Date()
  const thisYear = now.getFullYear()
  const candidate = new Date(thisYear, month - 1, day)
  if (candidate >= now) return thisYear
  return thisYear + 1
}

function toDateStr(year, month, day) {
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getMonth() !== month - 1) return null
  return d.toISOString().split('T')[0]
}

function extractDates(line) {
  const dates = []
  let m

  // "Jan 15", "January 15th", "Sept. 18"
  const re1 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})(st|nd|rd|th)?\b/gi
  while ((m = re1.exec(line)) !== null) {
    const month = parseMonth(m[1])
    const day = parseInt(m[2])
    if (month) {
      const ds = toDateStr(resolveYear(month, day), month, day)
      if (ds) dates.push(ds)
    }
  }

  // "15th January", "15 Jan"
  const re2 = /\b(\d{1,2})(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi
  while ((m = re2.exec(line)) !== null) {
    const day = parseInt(m[1])
    const month = parseMonth(m[3])
    if (month) {
      const ds = toDateStr(resolveYear(month, day), month, day)
      if (ds) dates.push(ds)
    }
  }

  // MM/DD, MM/DD/YY, MM/DD/YYYY
  const re3 = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g
  while ((m = re3.exec(line)) !== null) {
    const mm = parseInt(m[1])
    const dd = parseInt(m[2])
    const year = m[3]
      ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]))
      : resolveYear(mm, dd)
    const ds = toDateStr(year, mm, dd)
    if (ds) dates.push(ds)
  }

  // "Week 3 (Sept 18)" — recurse into the parenthetical
  const re4 = /\(([^)]{3,25})\)/g
  while ((m = re4.exec(line)) !== null) {
    const inner = m[1]
    const im = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})\b/i.exec(inner)
    if (im) {
      const month = parseMonth(im[1])
      const day = parseInt(im[2])
      if (month) {
        const ds = toDateStr(resolveYear(month, day), month, day)
        if (ds) dates.push(ds)
      }
    }
  }

  return [...new Set(dates)]
}

function detectType(text) {
  const t = text.toLowerCase()
  if (t.match(/\bfinal\s+exam\b/) || (t.includes('final') && t.includes('exam'))) return 'Final Exam'
  if (t.includes('midterm')) return 'Midterm'
  if (t.match(/\bexam\b/) || t.match(/\btest\b/)) return 'Exam'
  if (t.includes('quiz')) return 'Quiz'
  if (t.includes('project') || t.includes('presentation')) return 'Project'
  if (t.includes('lab')) return 'Lab'
  if (t.includes('reading') || t.includes('chapter')) return 'Reading'
  return 'Assignment'
}

export function parseSyllabus(text) {
  const events = []
  const lines = text.split(/\n+/).filter(l => l.trim().length > 4)

  lines.forEach((line, lineIdx) => {
    // Only process lines that have a date
    const dates = extractDates(line)
    if (!dates.length) return

    // Check same line + adjacent lines for keywords
    const context = [
      lines[lineIdx - 1] ?? '',
      line,
      lines[lineIdx + 1] ?? '',
    ].join(' ').toLowerCase()

    if (!KEYWORDS.some(k => context.includes(k))) return

    events.push({
      id: `syl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: line.trim().replace(/\s+/g, ' ').slice(0, 120),
      date: dates[0],
      type: detectType(context),
    })
  })

  // Deduplicate by date + first 30 chars of name
  const seen = new Set()
  return events.filter(e => {
    const key = `${e.date}-${e.name.slice(0, 30).toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
