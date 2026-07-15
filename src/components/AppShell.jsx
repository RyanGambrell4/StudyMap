import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { getActivePlan, isTrialActive, hasUsedTrial, getTrialDaysRemaining } from '../lib/subscription'
import { getCachedStudyTools } from '../lib/db'
import { getDueCards } from '../lib/sm2'
import OnboardingTour from './OnboardingTour'

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAV_BG  = '#FFFFFF'
const PAGE_BG = '#F7F6F3'
const ACCENT  = '#3B61C4'
const TEXT    = '#111111'
const MUTED   = '#6B6B6B'
const BORDER  = '#E5E5E5'

const STRATEGY_SECTIONS = ['coach', 'grades', 'practice', 'tutor']
const BRAIN_SECTIONS    = ['tools', 'diagrams', 'problem-solver', 'essay-architect']

const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|FAR|AUD|REG|MBE|MEE|Verbal Reasoning|Quantitative Reasoning|MCAT|LSAT|CPA|GMAT/i

export default function AppShell({
  activeSection,
  setActiveSection,
  onImportSyllabus,
  onShare,
  onEditPlan,
  onSignOut,
  userEmail,
  onNavigateToAccount,
  googleCalendarConnected,
  onConnectGoogleCalendar,
  courses,
  onOpenBrainDump,
  onOpenQuizBurst,
  onOpenExamRescue,
  onNavigateToTools,
  onOpenPaywall,
  children,
}) {
  const isExamMode = Array.isArray(courses) && courses.some(c => EXAM_PATTERN.test(c.name))
  const [settingsOpen, setSettingsOpen]     = useState(false)
  const [startTour, setStartTour]           = useState(null)
  const [openHub, setOpenHub]               = useState(null)   // 'strategy' | 'brainTraining' | null  (desktop)
  const [mobileHub, setMobileHub]           = useState(null)   // same, for mobile sheet
  const settingsRef   = useRef(null)
  const closeTimerRef = useRef(null)
  const handleTourReady = useCallback((fn) => setStartTour(() => fn), [])

  const isStrategyActive = STRATEGY_SECTIONS.includes(activeSection)
  const isBrainActive    = BRAIN_SECTIONS.includes(activeSection)

  useEffect(() => { window.scrollTo(0, 0) }, [activeSection])

  // Close settings on outside click
  useEffect(() => {
    if (!settingsOpen) return
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [settingsOpen])

  // Flyout helpers - 150ms grace period so diagonal cursor movement doesn't close
  const openFlyout = (hub) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpenHub(hub)
  }
  const scheduleFlyoutClose = () => {
    closeTimerRef.current = setTimeout(() => setOpenHub(null), 150)
  }

  // Close mobile hub when a brain-training modal opens
  const handleBrainAction = (fn) => { setMobileHub(null); setOpenHub(null); fn?.() }

  const plan      = getActivePlan()
  const planLabel = plan === 'unlimited' ? 'Unlimited' : plan === 'pro' ? 'Pro' : 'Free'

  const dueCount = useMemo(() => {
    const saved = getCachedStudyTools()
    if (!saved?.flashcards?.length) return 0
    return getDueCards(saved.flashcards).length
  }, [])
  const isTrialing = isTrialActive()
  const daysLeft = isTrialing ? getTrialDaysRemaining() : null
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(
    () => sessionStorage.getItem('studyedge_trial_banner_dismissed') === '1'
  )
  const trialMsg = daysLeft !== null && daysLeft <= 1
    ? "Your trial ends tomorrow. Upgrade now to keep all your courses and AI tools."
    : daysLeft !== null && daysLeft <= 2
      ? "Your trial ends in 2 days. Upgrade to keep Unlimited access."
      : daysLeft !== null
        ? `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Upgrade to keep Unlimited access.`
        : null
  const showTrialBanner = isTrialing && trialMsg && !trialBannerDismissed
  const initials    = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'
  const displayName = userEmail?.split('@')[0] ?? 'Account'

  const SETTINGS_ITEMS = [
    { label: 'Import Syllabus', onClick: () => { setSettingsOpen(false); onImportSyllabus?.() }, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Share Plan',      onClick: () => { setSettingsOpen(false); onShare?.() },          icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' },
    { label: 'Edit Plan',       onClick: () => { setSettingsOpen(false); onEditPlan?.() },       icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { label: 'Send Feedback',   onClick: () => { setSettingsOpen(false); window.dispatchEvent(new CustomEvent('studyedge:open-feedback')) }, icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
  ]

  // Shared icon button style
  const navBtnBase = (active) => ({
    padding: '0 14px', height: '100%',
    borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
    color: active ? ACCENT : MUTED,
    fontWeight: active ? 600 : 500,
    fontSize: 13, background: 'none', cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'color 0.12s',
    display: 'flex', alignItems: 'center', gap: 5,
  })

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG }}>

      {/* ── Desktop top nav ── */}
      <header
        className="hidden lg:flex"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: NAV_BG, borderBottom: `1px solid ${BORDER}`, zIndex: 40, alignItems: 'center', padding: '0 32px' }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 36, flexShrink: 0 }}>
          <img src="/favicon.png" alt="StudyEdge AI" style={{ height: 28, width: 28, objectFit: 'contain' }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: TEXT, letterSpacing: '-0.01em' }}>StudyEdge AI</span>
          {startTour && (
            <button onClick={startTour} title="Take a tour" style={{ marginLeft: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <svg style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'stretch', height: '100%', flex: 1 }}>

          {/* ── Home (icon only, no label) ── */}
          <button
            id="tour-nav-dashboard"
            onClick={() => setActiveSection('dashboard')}
            title="Dashboard"
            style={{ ...navBtnBase(activeSection === 'dashboard'), padding: '0 16px' }}
            onMouseEnter={e => { if (activeSection !== 'dashboard') e.currentTarget.style.color = TEXT }}
            onMouseLeave={e => { if (activeSection !== 'dashboard') e.currentTarget.style.color = MUTED }}
          >
            <svg style={{ width: 17, height: 17 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'dashboard' ? 2.5 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>

          {/* ── Schedule ── */}
          <button
            id="tour-nav-calendar"
            onClick={() => setActiveSection('calendar')}
            style={navBtnBase(activeSection === 'calendar')}
            onMouseEnter={e => { if (activeSection !== 'calendar') e.currentTarget.style.color = TEXT }}
            onMouseLeave={e => { if (activeSection !== 'calendar') e.currentTarget.style.color = MUTED }}
          >
            Schedule
          </button>

          {/* ── Strategy hub ── */}
          <div
            style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}
            onMouseEnter={() => openFlyout('strategy')}
            onMouseLeave={scheduleFlyoutClose}
          >
            <button
              id="tour-nav-coach"
              style={navBtnBase(isStrategyActive)}
              onMouseEnter={e => { if (!isStrategyActive) e.currentTarget.style.color = TEXT }}
              onMouseLeave={e => { if (!isStrategyActive) e.currentTarget.style.color = MUTED }}
            >
              Strategy
              {/* stacked-lines hint */}
              <svg style={{ width: 10, height: 10, opacity: 0.45 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>

            {openHub === 'strategy' && (
              <div style={{ position: 'absolute', top: '100%', left: 0, width: 256, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: 12, zIndex: 200 }}>
                {/* Study Coach */}
                <button
                  onClick={() => { setOpenHub(null); setActiveSection('coach') }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 10, background: 'none', border: '1px solid rgba(59,97,196,0.15)', cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,97,196,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,97,196,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>Study Coach</div>
                    <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>Build your weekly AI plan</div>
                  </div>
                </button>

                {/* Track Grades */}
                <button
                  id="tour-nav-grades"
                  onClick={() => { setOpenHub(null); setActiveSection('grades') }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 10, background: 'none', border: '1px solid rgba(22,163,74,0.15)', cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,163,74,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(22,163,74,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{isExamMode ? 'Score Tracker' : 'Track Grades'}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>Monitor grades and targets</div>
                  </div>
                </button>

                {/* Practice Exam */}
                <button
                  onClick={() => { setOpenHub(null); setActiveSection('practice') }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 10, background: 'none', border: '1px solid rgba(217,119,6,0.15)', cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(217,119,6,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(217,119,6,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>Practice Exam</div>
                    <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>Drop a past exam, get a look-alike</div>
                  </div>
                </button>

                <div style={{ height: 1, background: BORDER, marginBottom: 8 }} />

                {/* AI Tutor */}
                <button
                  onClick={() => { setOpenHub(null); setActiveSection('tutor') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="14" height="14" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
                  </svg>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: MUTED, flex: 1 }}>AI Tutor</span>
                  <svg style={{ width: 12, height: 12, color: '#C0C0C0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* ── Brain Training hub ── */}
          <div
            style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}
            onMouseEnter={() => openFlyout('brainTraining')}
            onMouseLeave={scheduleFlyoutClose}
          >
            <button
              id="tour-nav-tools"
              style={navBtnBase(isBrainActive)}
              onMouseEnter={e => { if (!isBrainActive) e.currentTarget.style.color = TEXT }}
              onMouseLeave={e => { if (!isBrainActive) e.currentTarget.style.color = MUTED }}
            >
              Study Tools
              {dueCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999,
                  background: '#EF4444', color: '#fff', lineHeight: 1.5, marginLeft: 2,
                }}>
                  {dueCount}
                </span>
              )}
              <svg style={{ width: 10, height: 10, opacity: 0.45 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>

            {openHub === 'brainTraining' && (
              <div style={{ position: 'absolute', top: '100%', left: 0, width: 220, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '6px 0', zIndex: 200 }}>
                <button
                  onClick={() => { setOpenHub(null); typeof onNavigateToTools === 'function' ? onNavigateToTools() : setActiveSection('tools') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="14" height="14" fill="none" stroke="#6B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <rect x="2" y="3" width="7" height="7" rx="1"/><rect x="15" y="3" width="7" height="7" rx="1"/><rect x="2" y="14" width="7" height="7" rx="1"/><path d="M15 17.5h7M18.5 14v7"/>
                  </svg>
                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 600, flex: 1 }}>All Study Tools</span>
                </button>
                <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />
                <button
                  onClick={() => { setOpenHub(null); setActiveSection('diagrams') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="14" height="14" fill="none" stroke="#6B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 500, flex: 1 }}>Study Diagrams</span>
                </button>
                <button
                  onClick={() => { setOpenHub(null); setActiveSection('problem-solver') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="14" height="14" fill="none" stroke="#6B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 500, flex: 1 }}>STEM Problem Solver</span>
                </button>
                <button
                  onClick={() => { setOpenHub(null); setActiveSection('essay-architect') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="14" height="14" fill="none" stroke="#6B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 500, flex: 1 }}>Essay Architect</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Right side: settings + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setSettingsOpen(v => !v)}
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: settingsOpen ? TEXT : MUTED, background: settingsOpen ? '#F0EFEC' : 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.12s, color 0.12s' }}
              onMouseEnter={e => { if (!settingsOpen) { e.currentTarget.style.background = '#F0EFEC'; e.currentTarget.style.color = TEXT } }}
              onMouseLeave={e => { if (!settingsOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED } }}
            >
              <svg style={{ width: 17, height: 17 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {settingsOpen && (
              <div style={{ position: 'absolute', top: 40, right: 0, width: 200, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', padding: '6px 0', zIndex: 100 }}>
                {SETTINGS_ITEMS.map(({ label, onClick, icon, danger }) => (
                  <button key={label} onClick={onClick}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', width: '100%', background: 'none', border: 'none', color: danger ? '#9B9B9B' : TEXT, fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <svg style={{ width: 14, height: 14, color: danger ? '#9B9B9B' : MUTED, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                    </svg>
                    {label}
                  </button>
                ))}
                {onConnectGoogleCalendar && (
                  <button
                    onClick={googleCalendarConnected ? undefined : () => { setSettingsOpen(false); onConnectGoogleCalendar?.() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', width: '100%', background: 'none', border: 'none', color: googleCalendarConnected ? '#16A34A' : TEXT, fontSize: 13, fontWeight: 500, cursor: googleCalendarConnected ? 'default' : 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { if (!googleCalendarConnected) e.currentTarget.style.background = '#F7F6F3' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <svg style={{ width: 14, height: 14, color: googleCalendarConnected ? '#16A34A' : MUTED, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {googleCalendarConnected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Calendar Connected
                      </span>
                    ) : 'Connect Google Cal'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Avatar / Account */}
          <button
            onClick={onNavigateToAccount}
            title={displayName}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F0EFEC'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
            {isTrialing ? (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenPaywall?.('trial') }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: daysLeft <= 1 ? '#FFF7ED' : '#F0FDF4', border: `1px solid ${daysLeft <= 1 ? '#FED7AA' : '#BBF7D0'}`, cursor: 'pointer' }}
              >
                <svg style={{ width: 10, height: 10, color: daysLeft <= 1 ? '#D97706' : '#16A34A', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: daysLeft <= 1 ? '#D97706' : '#16A34A', whiteSpace: 'nowrap' }}>
                  Trial · {daysLeft}d left
                </span>
              </button>
            ) : plan === 'free' && !hasUsedTrial() ? (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenPaywall?.('nav-trial') }}
                style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Start Free Trial
              </button>
            ) : plan !== 'free' ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: plan === 'unlimited' ? '#16A34A' : ACCENT }}>{planLabel}</span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenPaywall?.('nav-upgrade') }}
                style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Upgrade
              </button>
            )}
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="lg:pt-14 pb-24 lg:pb-0 min-h-screen" style={{ minWidth: 0, width: '100%', maxWidth: '100vw' }}>
        {showTrialBanner && (
          <div style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#92400E', fontWeight: 500 }}>{trialMsg}</span>
            <button onClick={() => { sessionStorage.setItem('studyedge_trial_banner_dismissed', '1'); setTrialBannerDismissed(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }} aria-label="Dismiss">×</button>
          </div>
        )}
        {children}
      </main>

      <OnboardingTour onReady={handleTourReady} />

      {/* ── Mobile hub backdrop ── */}
      {mobileHub && (
        <div
          onClick={() => setMobileHub(null)}
          className="lg:hidden"
          style={{ position: 'fixed', inset: 0, zIndex: 39, background: 'rgba(0,0,0,0.25)' }}
        />
      )}

      {/* ── Mobile bottom bar ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40" style={{ background: '#FFFFFF', borderTop: `1px solid ${BORDER}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Mobile hub sheet - slides up above the tab bar */}
        {mobileHub && (
          <div style={{ borderTop: `1px solid ${BORDER}`, background: '#FFFFFF', padding: 16 }}>
            {mobileHub === 'strategy' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strategy</p>
                {[
                  { label: 'Study Coach',                        sub: 'Build your weekly AI plan',   color: ACCENT,    section: 'coach',  iconPath: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
                  { label: isExamMode ? 'Score Tracker' : 'Track Grades', sub: 'Monitor grades and targets', color: '#16A34A', section: 'grades', iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                  { label: 'Practice Exam',                      sub: 'Drop a past exam, get a look-alike', color: '#D97706', section: 'practice', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                  { label: 'AI Tutor',                           sub: 'Get help on anything',        color: '#8B5CF6', section: 'tutor',  iconPath: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                ].map(({ label, sub, color, section, iconPath }) => (
                  <button key={label} onClick={() => { setMobileHub(null); setActiveSection(section) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: `${color}06`, border: `1px solid ${color}15`, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={iconPath}/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{label}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={() => { setMobileHub(null); typeof onNavigateToTools === 'function' ? onNavigateToTools() : setActiveSection('tools') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, background: '#F7F6F3', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
                >
                  <svg width="15" height="15" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <rect x="2" y="3" width="7" height="7" rx="1"/><rect x="15" y="3" width="7" height="7" rx="1"/><rect x="2" y="14" width="7" height="7" rx="1"/><path d="M15 17.5h7M18.5 14v7"/>
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>All Study Tools</span>
                  <svg style={{ width: 12, height: 12, color: '#C0C0C0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
                <button
                  onClick={() => { setMobileHub(null); typeof onNavigateToTools === 'function' ? onNavigateToTools() : setActiveSection('tools') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, background: '#F7F6F3', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
                >
                  <svg width="15" height="15" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: MUTED, flex: 1 }}>Flashcards &amp; Quizzes</span>
                  {dueCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: '#EF4444', color: '#fff', lineHeight: 1.5 }}>
                      {dueCount}
                    </span>
                  )}
                  <svg style={{ width: 12, height: 12, color: '#C0C0C0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
                <button
                  onClick={() => { setMobileHub(null); setActiveSection('diagrams') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, background: '#F7F6F3', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
                >
                  <svg width="15" height="15" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: MUTED, flex: 1 }}>Study Diagrams</span>
                  <svg style={{ width: 12, height: 12, color: '#C0C0C0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
                <button
                  onClick={() => { setMobileHub(null); setActiveSection('problem-solver') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, background: '#F7F6F3', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
                >
                  <svg width="15" height="15" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: MUTED, flex: 1 }}>STEM Problem Solver</span>
                  <svg style={{ width: 12, height: 12, color: '#C0C0C0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
                <button
                  onClick={() => { setMobileHub(null); setActiveSection('essay-architect') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', borderRadius: 10, background: '#F7F6F3', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
                >
                  <svg width="15" height="15" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: MUTED, flex: 1 }}>Essay Architect</span>
                  <svg style={{ width: 12, height: 12, color: '#C0C0C0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex' }}>
          {/* Home */}
          <button onClick={() => { setMobileHub(null); setActiveSection('dashboard') }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <svg style={{ width: 18, height: 18, color: activeSection === 'dashboard' ? ACCENT : MUTED }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'dashboard' ? 2.5 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 500, color: activeSection === 'dashboard' ? ACCENT : MUTED }}>Home</span>
          </button>
          {/* Schedule */}
          <button onClick={() => { setMobileHub(null); setActiveSection('calendar') }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <svg style={{ width: 18, height: 18, color: activeSection === 'calendar' ? ACCENT : MUTED }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'calendar' ? 2.5 : 2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 500, color: activeSection === 'calendar' ? ACCENT : MUTED }}>Schedule</span>
          </button>
          {/* Strategy */}
          <button onClick={() => setMobileHub(h => h === 'strategy' ? null : 'strategy')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <svg style={{ width: 18, height: 18, color: (isStrategyActive || mobileHub === 'strategy') ? ACCENT : MUTED }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={(isStrategyActive || mobileHub === 'strategy') ? 2.5 : 2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 500, color: (isStrategyActive || mobileHub === 'strategy') ? ACCENT : MUTED }}>Strategy</span>
          </button>
          {/* Brain Training */}
          <button onClick={() => setMobileHub(h => h === 'brainTraining' ? null : 'brainTraining')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0', background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ width: 18, height: 18, color: (isBrainActive || mobileHub === 'brainTraining') ? ACCENT : MUTED }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={(isBrainActive || mobileHub === 'brainTraining') ? 2.5 : 2} d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
              </svg>
              {dueCount > 0 && (
                <span style={{ position: 'absolute', top: -3, right: -5, width: 8, height: 8, borderRadius: '50%', background: '#EF4444', border: '1.5px solid #fff', display: 'block' }} />
              )}
            </div>
            <span style={{ fontSize: 9, fontWeight: 500, color: (isBrainActive || mobileHub === 'brainTraining') ? ACCENT : MUTED }}>Tools</span>
          </button>
          {/* Account */}
          <button onClick={() => { setMobileHub(null); onNavigateToAccount?.() }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <svg style={{ width: 18, height: 18, color: activeSection === 'account' ? ACCENT : MUTED }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeSection === 'account' ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 500, color: activeSection === 'account' ? ACCENT : MUTED }}>Account</span>
          </button>
        </div>
      </nav>

    </div>
  )
}
