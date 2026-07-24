import { useState, useMemo, useEffect } from 'react'
import { T, SANS, SERIF } from '../theme/tokens'
import ToolModal from './tools/ToolModal'
import UploadMaterialModal from './tools/UploadMaterialModal'
import { computeBestPick, getRecommendations } from './tools/toolBestPick'
import { getActivePlan } from '../lib/subscription'
import { track } from '../lib/analytics'

// ── Tool definitions ────────────────────────────────────────────────────────
// Icons are minimal 1.75-stroke line SVGs, no fills.
const ICON = {
  quizBurst: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>,
  topicDrill: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>,
  teachItBack: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  brainDump: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3 3 3 0 003-3V3z"/><path d="M15 3a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3 3 3 0 01-3-3V3z"/></svg>,
  timeAttack: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>,
  connections: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4"/></svg>,
  flashcards: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/></svg>,
  quizzes: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>,
  cheatSheet: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6M9 17h4"/></svg>,
  studyCoach: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>,
  examRescue: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  podcast: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  uploadMaterial: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12m0-12l-4 4m4-4l4 4M4 18v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>,
}

const TOOLS = {
  quizBurst: { id: 'quizBurst', name: 'Quiz Burst', desc: 'A 5-question hit on one topic. Fast recall, no setup.', color: '#E8A63C', ctaLabel: 'Start 5-question quiz', costLine: 'Uses 1 AI Boost', feature: 'quizBurst' },
  topicDrill: { id: 'topicDrill', name: 'Topic Drill', desc: 'Type any topic — instant 5-question practice.', color: '#10A56E', ctaLabel: 'Start drill', costLine: 'Uses 1 AI Boost' },
  teachItBack: { id: 'teachItBack', name: 'Teach It Back', desc: 'Explain a concept in your own words. Get scored on understanding.', color: '#3452D9', ctaLabel: 'Start explanation', costLine: 'Uses 1 AI Boost', feature: 'teachItBack' },
  brainDump: { id: 'brainDump', name: 'Brain Dump', desc: 'Recall everything you know on a topic. Score your memory.', color: '#10A56E', ctaLabel: 'Start brain dump', costLine: 'Uses 1 AI Boost', feature: 'brainDump' },
  timeAttack: { id: 'timeAttack', name: 'Time Attack', desc: '60 seconds. 14 questions. How many can you get right?', color: '#EA580C', ctaLabel: 'Start time attack', costLine: 'Uses 1 AI Boost' },
  connections: { id: 'connections', name: 'Connections', desc: 'See how your concepts relate. Explain the links.', color: '#10A56E', ctaLabel: 'Start connections', costLine: 'Uses 1 AI Boost', feature: 'connectionsMode' },
  flashcards: { id: 'flashcards', name: 'Flashcards', desc: 'Spaced-repetition cards built from your notes.', color: '#3452D9', ctaLabel: 'Study your deck', costLine: '' },
  quizzes: { id: 'quizzes', name: 'Quizzes', desc: 'Multiple choice, true/false, and fill-in-the-blank questions.', color: '#8B5CF6', ctaLabel: 'Take a quiz', costLine: '' },
  cheatSheet: { id: 'cheatSheet', name: 'AI Cheat Sheet', desc: 'Instant one-page summary of what to focus on.', color: '#3452D9', ctaLabel: 'Generate cheat sheet', costLine: 'Uses 1 AI Boost', proOnly: true },
  studyCoach: { id: 'studyCoach', name: 'Study Coach', desc: 'A week-by-week plan built around your schedule and exams.', color: '#0891B2', ctaLabel: 'Open your plan', costLine: '' },
  examRescue: { id: 'examRescue', name: 'Exam Rescue', desc: 'Crisis study plan when your exam is hours away.', color: '#D64545', ctaLabel: 'Start rescue plan', costLine: 'Uses 1 AI Boost', feature: 'examRescue', urgencyRed: true },
  podcast: { id: 'podcast', name: 'Study Podcast', desc: 'Two AI hosts review your notes as a 5-minute audio show.', color: '#0D9488', ctaLabel: 'Generate podcast', costLine: 'Unlimited plan only', unlimitedOnly: true },
  uploadMaterial: { id: 'uploadMaterial', name: 'Upload Material', desc: 'Turn anything into study material.', color: '#3452D9', ctaLabel: 'Open uploader', costLine: '' },
}

const CATEGORIES = [
  { id: 'quick', label: 'Quick Practice', tools: ['quizBurst', 'topicDrill', 'teachItBack', 'brainDump', 'timeAttack', 'connections'] },
  { id: 'materials', label: 'Study Materials', tools: ['flashcards', 'quizzes', 'cheatSheet'] },
  { id: 'deep', label: 'Deep Work', tools: ['studyCoach', 'examRescue', 'podcast'] },
  { id: 'add', label: 'Add Material', tools: ['uploadMaterial'] },
]

export default function StudyToolsViewV2({
  courses,
  userId,
  onShowPaywall,
  learningStyle,
  onNavigateToCoach,
  onOpenCheatSheet,
  onOpenBrainDump,
  onOpenExamRescue,
  onOpenQuizBurst,
  onOpenPodcast,
  onOpenTeachItBack,
  onOpenConnectionsMode,
  onOpenTimeAttack,
  initialDrillTopic,
  onDrillTopicConsumed,
  // NEW: allow callers (dashboard) to hand us a preset course/topic when
  // opening a tool from a Start button elsewhere.
  presetTool,
  presetCourseIdx,
  presetTopic,
  onPresetConsumed,
}) {
  const [openToolId, setOpenToolId] = useState(null)
  const [openBestPick, setOpenBestPick] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadCourseIdx, setUploadCourseIdx] = useState(0)

  const plan = getActivePlan()
  const isPro = plan === 'pro' || plan === 'unlimited' || plan === 'trial'
  const isUnlimited = plan === 'unlimited'

  const { recommendations } = useMemo(() => getRecommendations(courses), [courses])

  // If parent passed a preset (from dashboard Start button), open its ToolModal.
  useEffect(() => {
    if (presetTool && TOOLS[presetTool]) {
      const bp = computeBestPick(presetTool, courses)
      if (presetCourseIdx != null) bp.courseIdx = presetCourseIdx
      if (presetTopic) bp.topic = presetTopic
      setOpenToolId(presetTool)
      setOpenBestPick(bp)
      onPresetConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetTool])

  function openTool(toolId) {
    if (!TOOLS[toolId]) return
    const bp = computeBestPick(toolId, courses)
    setOpenBestPick(bp)
    setOpenToolId(toolId)
    track('tool_modal_opened', { tool: toolId, source: 'hub_v2' })
  }

  function closeModal() {
    setOpenToolId(null)
    setOpenBestPick(null)
  }

  function handleStart({ courseIdx, topic }) {
    const toolId = openToolId
    closeModal()
    if (!toolId) return

    track('tool_started', { tool: toolId, courseIdx, hasTopic: !!topic })

    // Route each tool to its runner. In phase 1, focus-mode tools open the
    // existing modal with autoStart + presets — the entry screen inside those
    // modals is suppressed because we already collected the config here.
    switch (toolId) {
      case 'quizBurst':
        onOpenQuizBurst?.({ courseIdx, topic, autoStart: true })
        return
      case 'topicDrill':
        // Topic Drill = "5 quick questions on any topic" — same runner as Quiz Burst.
        onOpenQuizBurst?.({ courseIdx, topic, autoStart: true })
        return
      case 'teachItBack':
        onOpenTeachItBack?.({ courseIdx, topic, autoStart: true })
        return
      case 'brainDump':
        onOpenBrainDump?.({ courseIdx, topic })
        return
      case 'timeAttack':
        onOpenTimeAttack?.({ courseIdx })
        return
      case 'connections':
        onOpenConnectionsMode?.({ courseIdx })
        return
      case 'cheatSheet':
        onOpenCheatSheet?.({ courseIdx })
        return
      case 'studyCoach':
        onNavigateToCoach?.({ courseIdx })
        return
      case 'examRescue':
        onOpenExamRescue?.({ courseIdx })
        return
      case 'podcast':
        if (!isUnlimited) { onShowPaywall?.('unlimited'); return }
        onOpenPodcast?.({ courseIdx })
        return
      case 'uploadMaterial':
        setUploadCourseIdx(courseIdx)
        setShowUpload(true)
        return
      case 'flashcards':
      case 'quizzes':
        // No cached set → funnel to Upload. If cached, the classic runner lives
        // in StudyToolsView; ToolModal Start routes users through Upload as the
        // canonical path so they always land on the freshest deck.
        setUploadCourseIdx(courseIdx)
        setShowUpload(true)
        return
      default:
        return
    }
  }

  function isToolDisabled(tool) {
    if (tool.proOnly && !isPro) return { disabled: false } // paywall triggers on start
    if (tool.unlimitedOnly && !isUnlimited) return { disabled: false }
    return { disabled: false }
  }

  return (
    <div style={{ background: T.bg, minHeight: '100%', fontFamily: SANS }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 32px 80px' }}>
        {/* Page header */}
        <h1 style={{
          margin: '0 0 4px', fontFamily: SERIF, fontSize: 36, fontWeight: 400,
          color: T.text, letterSpacing: '-0.015em', lineHeight: 1.1,
        }}>
          Study tools
        </h1>
        <p style={{ margin: '0 0 30px', fontSize: 15, color: T.muted }}>
          Pick a tool. We'll pick the topic.
        </p>

        {/* Recommended right now — slim strip */}
        {recommendations.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32,
          }}>
            {recommendations.map((r, i) => {
              const t = TOOLS[r.toolId]
              if (!t) return null
              return (
                <button
                  key={i}
                  onClick={() => openTool(r.toolId)}
                  style={{
                    flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 14,
                    background: T.card, border: `1px solid ${T.border}`,
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    boxShadow: '0 1px 3px rgba(28,27,24,0.04)',
                    transition: 'transform 0.1s, box-shadow 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(28,27,24,0.08)' }}
                  onMouseOut={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(28,27,24,0.04)' }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: `${t.color}18`, color: t.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{ICON[t.id]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Recommended
                    </div>
                    <div style={{ fontSize: 14, color: T.text, marginTop: 1 }}>
                      <span style={{ fontWeight: 700 }}>{t.name}</span>
                      <span style={{ color: T.muted }}>{' — '}{r.reason}</span>
                    </div>
                  </div>
                  <div style={{
                    color: T.dim, flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Category groups */}
        {CATEGORIES.map(cat => (
          <section key={cat.id} style={{ marginBottom: 30 }}>
            <h2 style={{
              margin: '0 0 12px', fontSize: 11.5, fontWeight: 700,
              color: T.dim, letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              {cat.label}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
            }}>
              {cat.tools.map(id => {
                const t = TOOLS[id]
                if (!t) return null
                return (
                  <button
                    key={id}
                    onClick={() => openTool(id)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '14px 16px', borderRadius: 14,
                      background: T.card, border: `1px solid ${T.border}`,
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      transition: 'transform 0.1s, box-shadow 0.15s, border-color 0.15s',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)'
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(28,27,24,0.06)'
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.borderColor = T.border
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `${t.color}18`, color: t.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{ICON[id]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, marginBottom: 3, letterSpacing: '-0.005em' }}>
                        {t.name}
                      </div>
                      <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.4 }}>
                        {t.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Tool entry modal */}
      {openToolId && openBestPick && (
        <ToolModal
          tool={{
            id: openToolId,
            name: TOOLS[openToolId].name,
            desc: TOOLS[openToolId].desc,
            color: TOOLS[openToolId].color,
            icon: ICON[openToolId],
          }}
          courses={courses}
          defaultCourseIdx={openBestPick.courseIdx}
          defaultTopic={openBestPick.topic}
          contextLine={openBestPick.contextLine}
          ctaLabel={TOOLS[openToolId].ctaLabel}
          costLine={TOOLS[openToolId].costLine}
          urgencyRed={!!TOOLS[openToolId].urgencyRed}
          onStart={handleStart}
          onClose={closeModal}
          onPickManual={closeModal}
        />
      )}

      {/* Upload Material modal (segmented control variant) */}
      {showUpload && (
        <UploadMaterialModal
          courses={courses}
          defaultCourseIdx={uploadCourseIdx}
          onClose={() => setShowUpload(false)}
          onShowPaywall={onShowPaywall}
          onGenerated={({ mode, courseIdx }) => {
            setShowUpload(false)
            track('upload_v2_generated', { mode, courseIdx })
            // Content is cached — reopen the Flashcards / Quizzes ToolModal so
            // the user sees the "N cards ready" state and can start studying.
            const nextTool = mode === 'Quiz' || mode === 'Timed' ? 'quizzes' : 'flashcards'
            const bp = computeBestPick(nextTool, courses)
            bp.courseIdx = courseIdx
            setOpenBestPick(bp)
            setOpenToolId(nextTool)
          }}
        />
      )}
    </div>
  )
}
