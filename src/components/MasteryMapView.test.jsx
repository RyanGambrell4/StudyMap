/**
 * Render smoke tests for the Knowledge Map and the Brain Dump flow.
 *
 * Server-rendering each designed state catches the JSX-prop-scope crashes
 * this repo has shipped before (the build succeeds, every user hits an error
 * boundary), and pins the copy the export specifies.
 *
 * These render the designed states directly rather than driving the data
 * layer: the derivation rules are covered in src/utils/knowledgeMap.test.js.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TopicDetailPanel from './TopicDetailPanel'
import { deriveStatus } from '../utils/knowledgeMap'

beforeAll(() => {
  globalThis.window = globalThis.window ?? {}
  globalThis.window.matchMedia = globalThis.window.matchMedia ?? (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
  }))
  globalThis.window.addEventListener = globalThis.window.addEventListener ?? (() => {})
  globalThis.window.removeEventListener = globalThis.window.removeEventListener ?? (() => {})
})

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) },
  getAccessToken: async () => 'token',
}))

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const daysAgo = n => NOW - n * DAY

const evidence = (over = {}) => ({
  topic: 'Phospholipid bilayer',
  courseId: 'bio-101',
  courseName: 'Cell Biology',
  signalType: 'brain_dump_score',
  score: 71,
  at: daysAgo(1),
  detail: null,
  ...over,
})

function entryFor(records, topic = 'Phospholipid bilayer') {
  return {
    topic,
    key: `bio-101::${topic.toLowerCase()}`,
    courseId: 'bio-101',
    courseName: 'Cell Biology',
    evidence: records,
    derived: deriveStatus(records, { now: NOW }),
  }
}

describe('TopicDetailPanel', () => {
  it('renders the status word and the recorded event count', () => {
    const html = renderToStaticMarkup(
      <TopicDetailPanel entry={entryFor([evidence()])} mobile={false} onClose={() => {}} onStartDump={() => {}} />,
    )
    expect(html).toContain('Phospholipid bilayer')
    expect(html).toContain('Shaky')
    expect(html).toContain('1 recorded event')
    expect(html).toContain('Evidence trail')
  })

  it('shows a score numeral on scored rows and none on unscored ones', () => {
    const html = renderToStaticMarkup(
      <TopicDetailPanel
        entry={entryFor([
          evidence({ score: 71, at: daysAgo(1) }),
          evidence({ signalType: 'brain_dump_gap', score: 0, at: daysAgo(3) }),
        ])}
        mobile={false} onClose={() => {}} onStartDump={() => {}}
      />,
    )
    expect(html).toContain('71')
    expect(html).toContain('recorded, not scored')
  })

  it('draws no sparkline below three scored events', () => {
    const html = renderToStaticMarkup(
      <TopicDetailPanel
        entry={entryFor([evidence({ score: 45, at: daysAgo(20) }), evidence({ score: 62, at: daysAgo(9) })])}
        mobile={false} onClose={() => {}} onStartDump={() => {}}
      />,
    )
    expect(html).not.toContain('<polyline')
  })

  it('draws a sparkline at three scored events', () => {
    const html = renderToStaticMarkup(
      <TopicDetailPanel
        entry={entryFor([
          evidence({ score: 45, at: daysAgo(20) }),
          evidence({ score: 62, at: daysAgo(9) }),
          evidence({ score: 71, at: daysAgo(1) }),
        ])}
        mobile={false} onClose={() => {}} onStartDump={() => {}}
      />,
    )
    expect(html).toContain('<polyline')
    expect(html).toContain('45 to 71')
  })

  it('says so plainly when a topic has no evidence', () => {
    const html = renderToStaticMarkup(
      <TopicDetailPanel entry={entryFor([], 'Glycolysis')} mobile={false} onClose={() => {}} onStartDump={() => {}} />,
    )
    expect(html).toContain('Untested')
    expect(html).toContain('Nothing recorded for this topic yet')
    expect(html).not.toContain('<polyline')
  })

  it('offers exactly one primary action', () => {
    const html = renderToStaticMarkup(
      <TopicDetailPanel entry={entryFor([evidence()])} mobile={false} onClose={() => {}} onStartDump={() => {}} />,
    )
    const primaries = html.split('Brain Dump this topic').length - 1
    expect(primaries).toBe(1)
  })
})

describe('copy gates', () => {
  const files = [
    'src/components/MasteryMapView.jsx',
    'src/components/TopicDetailPanel.jsx',
    'src/components/BrainDumpModal.jsx',
    'src/utils/knowledgeMap.js',
    'src/utils/brainDumpFlow.js',
    'src/lib/knowledgeEvidence.js',
  ]

  it('has no em dashes in any changed file', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of files) {
      expect(readFileSync(f, 'utf8')).not.toContain('—')
    }
  })

  it('never says StudyEdge without AI', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const bare = src.match(/StudyEdge(?!\s*AI)/g) ?? []
      // studyedge: event namespaces are lowercase and not user facing.
      expect(bare.filter(m => m === 'StudyEdge')).toEqual([])
    }
  })

  it('leaves no microphone wiring behind', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/components/BrainDumpModal.jsx', 'utf8')
    for (const needle of ['transcribeAudio', 'createRecorder', 'deepgram', 'bdRecording', 'handleBdMicToggle', 'getUserMedia']) {
      expect(src).not.toContain(needle)
    }
  })

  it('introduces no streaks, badges, or gamification', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/streak|badge|trophy|leaderboard|confetti/i)
    }
  })
})
