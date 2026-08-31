/**
 * The one paywall screen.
 *
 * Every locked control and every blurred region in the product opens this, via
 * openPaywall() in App.jsx. There is deliberately no second variant, no
 * multi-step pre-paywall and no exit gift: those existed to soften an ask that
 * was mistimed, and the fix for a mistimed ask is timing, not more screens.
 *
 * Two taps to Stripe. Tap a locked control, this opens with Pro monthly
 * selected. Tap the button, land on Stripe. The billing toggle is optional and
 * does not count as a step.
 *
 * Only two billing periods exist: monthly and yearly. Weekly is retired — a
 * weekly charge on a student debit card is what killed the only real
 * subscription this product has had.
 *
 * Motion follows the Apple fluid-interface rules: feedback lands on pointer
 * down rather than on release, the sheet materializes (blur and scale together)
 * rather than fading, enter and exit run the same path in reverse, and every
 * bit of it degrades to a cross-fade under prefers-reduced-motion.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  activateTrial,
  createCheckoutSession,
  hasUsedTrial,
  isTrialActive,
} from '../lib/subscription'
import { track } from '../lib/analytics'
import { T, SERIF, SANS } from '../theme/tokens'

// ── Pricing. Mirrors PRICE_IDS in api/stripe.js; the server is authoritative. ──
const PLANS = {
  monthly: {
    pro:       { price: '$9.99',  unit: '/mo', note: 'Billed monthly' },
    unlimited: { price: '$14.99', unit: '/mo', note: 'Billed monthly' },
    savings:   null,
  },
  yearly: {
    // $69.99 against $119.88 is 41.6%; $119.99 against $179.88 is 33.3%.
    // Real percentages, because the student who checks the arithmetic is
    // exactly the student who was going to buy.
    pro:       { price: '$69.99',  unit: '/yr', note: 'Billed once a year', save: 'Save 42%' },
    unlimited: { price: '$119.99', unit: '/yr', note: 'Billed once a year', save: 'Save 33%' },
  },
}

/**
 * The annual discount, advertised while the student is still on Monthly.
 *
 * This used to hang off PLANS.yearly, which meant the saving only appeared
 * once they had already switched to Annual: the one moment they no longer
 * needed persuading. Nobody on Monthly ever saw a reason to look.
 *
 * It now appears in two places, and the duplication is deliberate. The pill on
 * the Annual tab is the strong version, because a control should carry the
 * information about itself rather than rely on a caption elsewhere. The line
 * above the toggle is the one that gets read, because it sits on the path the
 * eye already travels from the headline down to the price.
 */
const ANNUAL_SAVE_TAB = 'Save 42%'
const ANNUAL_SAVE_LINE = 'Save up to 42% with annual billing'

const PRO_FEATURES = [
  ['Your full semester plan', 'Every week through finals, not just this one.'],
  ['Grade Hub and predicted scores', 'See what you need on the final to hit your target.'],
  ['Knowledge map and tutor memory', 'The tutor remembers the whole conversation.'],
  ['Unlimited practice exams', 'Plus the history and mastery behind them.'],
  ['Unlimited AI tutor chat', 'Ask as much as you want.'],
  ['100 AI actions a month', 'Blueprints, quizzes, brain dumps, exam rescues.'],
]

const UNLIMITED_FEATURES = [
  ['Unlimited courses', 'Pro covers 5. This covers every class you take.'],
  ['Unlimited AI actions', 'No monthly ceiling.'],
  ['Podcast mode', 'Turn any session into audio for the walk to class.'],
]

// Headline per trigger. Specific beats clever: name the thing they just hit.
const HEADLINES = {
  grades:                 'See where your grade is heading',
  courses:                'Add every class, not just one',
  'practice_exam':        'Keep practising until it sticks',
  practiceExamAnalytics:  'See every attempt, not just the last one',
  tutorMemory:            'A tutor that remembers the whole conversation',
  semester:               'Unlock your semester',
  blueprint:              'A plan for every session, not just the first',
  coach:                  'Your full coach plan, every week',
  ai:                     'Keep going without running out',
  'ai-exhausted':         'Keep going without running out',
  unlimited:              'Take off every cap',
}

export default function PaywallModal({
  trigger,
  onClose,
  userEmail,
  userId,
  currentPlan = 'free',
  onTrialActivated,
  coursesCount = 0,
  primaryCourseName = null,
}) {
  // Monthly is the anchor. It is the trial's billing period, so the default
  // selection and the default CTA agree with each other.
  const [billingPeriod, setBillingPeriod] = useState('monthly')
  const [loading, setLoading] = useState(null)   // 'pro' | 'unlimited' | null
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null) // `${card}:${idx}`
  const [closing, setClosing] = useState(false)
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState('')
  const openedAt = useRef(Date.now())
  const sheetRef = useRef(null)

  const trialUsed = hasUsedTrial()
  const trialActive = isTrialActive()
  // The trial is Pro monthly only. On yearly there is nothing to trial, so the
  // button says what it does instead of promising a trial it cannot start.
  const proOffersTrial = !trialUsed && !trialActive && billingPeriod === 'monthly'

  const p = PLANS[billingPeriod]

  useEffect(() => {
    track('paywall_view', { trigger, current_plan: currentPlan, billing_period: billingPeriod })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Symmetric exit: the sheet leaves along the path it arrived on.
  const dismiss = useCallback((how) => {
    if (closing) return
    setClosing(true)
    track('paywall_dismissed', {
      trigger,
      how,
      stopped_reason: reason.trim() || null,
      ms_open: Date.now() - openedAt.current,
      billing_period: billingPeriod,
    })
    window.setTimeout(() => onClose?.(), 180)
  }, [closing, onClose, trigger, reason, billingPeriod])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') dismiss('escape') }
    window.addEventListener('keydown', onKey)
    sheetRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  const go = async (which) => {
    if (loading) return
    setError(null)
    setLoading(which)
    track('plan_selected', { plan: which, billing_period: billingPeriod, trigger })
    try {
      let url
      if (which === 'pro' && proOffersTrial) {
        // 7-day trial. The server forces Pro/monthly whatever we send.
        url = await activateTrial(userId, userEmail)
      } else {
        // Unlimited never trials, and Pro on yearly is a straight purchase.
        url = await createCheckoutSession(which, billingPeriod, userEmail, userId)
      }
      if (url?.staleBundle) return           // a reload is already in flight
      if (url?.alreadySubscribed) { setError('You already have an active subscription.'); setLoading(null); return }
      if (!url) { setError('Could not reach checkout. Please try again.'); setLoading(null); return }
      if (which === 'pro' && proOffersTrial) onTrialActivated?.()
      window.location.href = url
    } catch {
      setError('Could not reach checkout. Please try again.')
      setLoading(null)
    }
  }

  const headline = HEADLINES[trigger] ?? 'Unlock your semester'
  const sub = primaryCourseName
    ? `Your full plan for ${primaryCourseName} through finals${coursesCount > 1 ? `, and ${coursesCount - 1} more ${coursesCount - 1 === 1 ? 'class' : 'classes'}` : ''}.`
    : 'Your full plan through finals.'

  return createPortal(
    <>
      <style>{CSS}</style>
      <div
        className={`pw-scrim${closing ? ' is-closing' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) dismiss('scrim') }}
      >
        <div
          className={`pw-sheet${closing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={headline}
          tabIndex={-1}
          ref={sheetRef}
        >
          <button className="pw-x" onClick={() => dismiss('close')} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path d="M1 1l13 13M14 1L1 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <header className="pw-head">
            <div className="pw-brand">
              <img src="/favicon.png" alt="" width="22" height="22" />
              <span>StudyEdge AI</span>
            </div>
            <h2 className="pw-title">{headline}</h2>
            <p className="pw-sub">{sub}</p>
          </header>

          <div className="pw-togwrap">
            {/* The slot keeps its height on both tabs, so switching billing
                does not shunt the cards up and down under the pointer. */}
            <p className="pw-save" aria-hidden={billingPeriod !== 'monthly'}>
              {billingPeriod === 'monthly' ? ANNUAL_SAVE_LINE : '\u00A0'}
            </p>
            <div className="pw-tog" role="tablist" aria-label="Billing period">
              {['monthly', 'yearly'].map((period) => (
                <button
                  key={period}
                  role="tab"
                  aria-selected={billingPeriod === period}
                  className={billingPeriod === period ? 'on' : ''}
                  onClick={() => { setBillingPeriod(period); track('pricing_billing_toggle', { billing_period: period, trigger }) }}
                >
                  {period === 'monthly' ? 'Monthly' : 'Annual'}
                  {period === 'yearly' && <span className="pw-togpct">{ANNUAL_SAVE_TAB}</span>}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="pw-err" role="alert">{error}</p>}

          <div className="pw-cards">
            <Card
              id="pro"
              featured
              name="Pro"
              badge="Most popular"
              price={p.pro.price}
              unit={p.pro.unit}
              save={p.pro.save}
              desc="The whole system, across 5 courses"
              cta={proOffersTrial ? 'Start 7-day free trial' : 'Get Pro'}
              fine={proOffersTrial
                ? `Free for 7 days, then ${p.pro.price}${p.pro.unit} · Cancel anytime`
                : `${p.pro.note} · Cancel anytime`}
              featuresLabel="Everything in Free, plus"
              features={PRO_FEATURES}
              loading={loading === 'pro'}
              disabled={!!loading}
              onGo={() => go('pro')}
              expanded={expanded}
              setExpanded={setExpanded}
            />
            <Card
              id="unlimited"
              name="Unlimited"
              price={p.unlimited.price}
              unit={p.unlimited.unit}
              save={p.unlimited.save}
              desc="No caps on anything"
              cta="Get Unlimited"
              fine={`${p.unlimited.note} · Cancel anytime`}
              featuresLabel="Everything in Pro, plus"
              features={UNLIMITED_FEATURES}
              loading={loading === 'unlimited'}
              disabled={!!loading}
              onGo={() => go('unlimited')}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          </div>

          {/* No dismissal trickery: one visible way out, and one question. */}
          <footer className="pw-foot">
            {askReason ? (
              <form
                className="pw-reason"
                onSubmit={(e) => { e.preventDefault(); dismiss('reason_given') }}
              >
                <label htmlFor="pw-why">What stopped you?</label>
                <div>
                  <input
                    id="pw-why"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Too expensive, not sure yet, something missing…"
                    autoFocus
                    maxLength={300}
                  />
                  <button type="submit" className="pw-send">Send</button>
                </div>
                <button type="button" className="pw-skip" onClick={() => dismiss('reason_skipped')}>
                  Skip
                </button>
              </form>
            ) : (
              <button className="pw-later" onClick={() => setAskReason(true)}>Maybe later</button>
            )}
          </footer>
        </div>
      </div>
    </>,
    document.body
  )
}

function Card({
  id, featured, name, badge, price, unit, save, desc, cta, fine,
  featuresLabel, features, loading, disabled, onGo, expanded, setExpanded,
}) {
  return (
    <section className={`pw-card${featured ? ' is-featured' : ''}`}>
      <div className="pw-namerow">
        <p className="pw-name">{name}</p>
        {badge && <span className="pw-badge">{badge}</span>}
      </div>
      <p className="pw-price">
        <span className="pw-amount">{price}</span>
        <span className="pw-unit">{unit}</span>
        {save && <span className="pw-pct">{save}</span>}
      </p>
      <p className="pw-desc">{desc}</p>

      <button className="pw-cta" onClick={onGo} disabled={disabled}>
        {loading ? <span className="pw-spin" aria-label="Loading" /> : cta}
      </button>
      <p className="pw-fine">{fine}</p>

      <p className="pw-feath">{featuresLabel}</p>
      <ul className="pw-list">
        {features.map(([label, detail], i) => {
          const key = `${id}:${i}`
          const open = expanded === key
          return (
            <li key={label} className={open ? 'is-open' : ''}>
              <button
                className="pw-row"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : key)}
              >
                <span className="pw-tick" aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 13 13">
                    <path d="M1 6.8l3.4 3.4L12 2.6" stroke="currentColor" strokeWidth="2.2"
                          fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="pw-rowlabel">{label}</span>
                <span className="pw-chev" aria-hidden="true">
                  <svg width="9" height="9" viewBox="0 0 10 10">
                    <path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.7"
                          fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {open && <p className="pw-detail">{detail}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const CSS = `
.pw-scrim{
  position:fixed; inset:0; z-index:2000;
  display:flex; align-items:center; justify-content:center;
  padding:24px 16px; overflow-y:auto;
  background:rgba(12,14,24,.44);
  -webkit-backdrop-filter:blur(20px) saturate(120%);
  backdrop-filter:blur(20px) saturate(120%);
  animation:pw-scrim-in .28s cubic-bezier(.32,.72,0,1) both;
}
.pw-scrim.is-closing{ animation:pw-scrim-in .18s cubic-bezier(.32,.72,0,1) reverse both; }
@keyframes pw-scrim-in{ from{opacity:0} to{opacity:1} }

/* Materialize: blur and scale move together, so it reads as a surface arriving
   rather than an image fading up. */
.pw-sheet{
  position:relative; width:100%; max-width:760px;
  background:${T.card}; color:${T.text};
  border-radius:24px; padding:34px 30px 22px;
  font-family:${SANS};
  box-shadow:0 1px 2px rgba(16,20,40,.06), 0 28px 70px -24px rgba(16,20,40,.34);
  animation:pw-sheet-in .38s cubic-bezier(.32,.72,0,1) both;
  outline:none;
}
.pw-sheet.is-closing{ animation:pw-sheet-in .18s cubic-bezier(.32,.72,0,1) reverse both; }
@keyframes pw-sheet-in{
  from{ opacity:0; transform:translateY(10px) scale(.965); filter:blur(6px) }
  to  { opacity:1; transform:none;                          filter:blur(0)  }
}

.pw-x{
  position:absolute; top:16px; right:16px;
  width:32px; height:32px; border-radius:999px;
  display:grid; place-items:center;
  background:transparent; border:none; cursor:pointer; color:${T.dim};
  transition:background .16s ease, color .16s ease, transform .1s ease-out;
}
.pw-x:hover{ background:${T.neutralBg}; color:${T.text} }
.pw-x:active{ transform:scale(.92) }

.pw-head{ text-align:center; max-width:520px; margin:0 auto }
.pw-brand{
  display:inline-flex; align-items:center; gap:7px;
  font-size:12.5px; font-weight:650; color:${T.muted};
  letter-spacing:.01em; margin-bottom:14px;
}
.pw-brand img{ border-radius:5px; display:block }
/* Large text wants negative tracking and tight leading. */
.pw-title{
  font-family:${SERIF}; font-weight:600;
  font-size:clamp(25px,3.3vw,33px); line-height:1.08; letter-spacing:-.021em;
  margin:0 0 9px; text-wrap:balance; color:${T.text};
}
.pw-sub{ margin:0; font-size:14.5px; line-height:1.5; color:${T.muted} }

.pw-togwrap{ display:flex; flex-direction:column; align-items:center; margin:20px 0 18px }
/* Fixed height on both tabs: switching billing must not shunt the cards
   vertically under a pointer that is on its way to one of them. */
.pw-save{
  margin:0 0 8px; min-height:16px;
  font-size:12.5px; font-weight:650; color:${T.green}; letter-spacing:.005em;
}
.pw-tog{ display:inline-flex; gap:3px; padding:4px; border-radius:999px; background:${T.neutralBg} }
.pw-tog button{
  display:inline-flex; align-items:center; gap:7px;
  padding:8px 18px; border-radius:999px; border:none; cursor:pointer;
  font-family:inherit; font-size:13.5px; font-weight:640; color:${T.muted};
  background:transparent; transition:color .18s ease, transform .1s ease-out;
}
.pw-tog button:active{ transform:scale(.97) }
.pw-tog button.on{ background:${T.card}; color:${T.text}; box-shadow:0 1px 3px rgba(16,20,40,.12) }
/* The discount rides on the control it describes, so it is legible from the
   Monthly tab without needing the caption above to be read first. */
.pw-togpct{
  font-size:10.5px; font-weight:750; letter-spacing:.015em;
  padding:2.5px 6px; border-radius:999px;
  background:${T.greenBg}; color:${T.green};
}

.pw-err{
  margin:0 auto 14px; max-width:520px; text-align:center;
  font-size:13px; color:${T.red}; background:${T.redBg};
  padding:9px 14px; border-radius:10px;
}

/* align-items:start, so each card is only as tall as it needs to be.
   Unlimited carries half the rows Pro does; stretching it to match left a
   block of dead white inside a bordered box, which reads as a mistake. A
   shorter box just reads as less content. */
.pw-cards{ display:grid; grid-template-columns:repeat(auto-fit,minmax(268px,1fr)); gap:14px; align-items:start }

.pw-card{
  position:relative; display:flex; flex-direction:column;
  border-radius:18px; padding:22px 22px 20px;
  border:1px solid ${T.border}; background:${T.card};
}
/* The featured card is brand blue, not a generic black slab. */
.pw-card.is-featured{
  border-color:transparent; color:#fff;
  background:linear-gradient(168deg, ${T.blue} 0%, ${T.blueHov} 100%);
  box-shadow:0 12px 34px -14px rgba(52,82,217,.55);
}
/* Sits inside the card rather than straddling its edge. Half-outside badges
   read as a sticker applied to the design instead of part of it, and they
   collide with the card above on a narrow screen. */
.pw-namerow{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px }
.pw-badge{
  flex:none;
  background:${T.blueBg}; color:${T.blue};
  font-size:10px; font-weight:750; letter-spacing:.045em; text-transform:uppercase;
  padding:3.5px 8px; border-radius:999px;
}
.pw-card.is-featured .pw-badge{ background:rgba(255,255,255,.20); color:#fff }
.pw-name{ margin:0; font-size:15px; font-weight:700; letter-spacing:-.005em }
.pw-price{ margin:0; display:flex; align-items:baseline; gap:5px; flex-wrap:wrap }
.pw-amount{ font-size:38px; font-weight:700; letter-spacing:-.032em; line-height:1; font-variant-numeric:tabular-nums }
.pw-unit{ font-size:14px; font-weight:500; opacity:.62 }
.pw-pct{
  margin-left:2px; font-size:11px; font-weight:700; letter-spacing:.02em;
  padding:3px 7px; border-radius:5px; background:${T.greenBg}; color:${T.green};
}
.pw-card.is-featured .pw-pct{ background:rgba(255,255,255,.18); color:#fff }
.pw-desc{ margin:9px 0 16px; font-size:13px; line-height:1.45; opacity:.72 }

.pw-cta{
  display:block; width:100%; padding:13px 16px; border-radius:11px; border:none;
  font-family:inherit; font-size:14.5px; font-weight:680; cursor:pointer;
  background:${T.blue}; color:#fff;
  transition:transform .1s ease-out, filter .16s ease, opacity .16s ease;
}
.pw-card.is-featured .pw-cta{ background:#fff; color:${T.blue} }
.pw-cta:hover{ filter:brightness(1.05) }
/* Response lands on the press, not the release. */
.pw-cta:active{ transform:scale(.978) }
.pw-cta:disabled{ opacity:.6; cursor:default; transform:none }
.pw-spin{
  display:inline-block; width:15px; height:15px; border-radius:50%;
  border:2px solid currentColor; border-top-color:transparent;
  animation:pw-spin .7s linear infinite; vertical-align:-2px;
}
@keyframes pw-spin{ to{ transform:rotate(360deg) } }
/* Vibrancy: over a saturated blue, thin grey-by-opacity text falls apart.
   The featured card gets its own higher-contrast value rather than inheriting
   the neutral card's opacity. */
.pw-fine{ margin:9px 0 15px; text-align:center; font-size:11.5px; line-height:1.45; opacity:.62 }
.pw-card.is-featured .pw-fine{ opacity:.86 }

/* Small text takes slightly positive tracking; the uppercase-ish eyebrow role
   this plays wants a touch more. */
.pw-feath{
  margin:0 0 8px; font-size:11.5px; font-weight:700; line-height:1.4;
  letter-spacing:.02em; text-transform:uppercase; opacity:.55;
}
.pw-list{ list-style:none; margin:0; padding:0 }
.pw-row{
  display:flex; align-items:center; gap:9px; width:100%;
  padding:6px 0; background:none; border:none; cursor:pointer;
  font-family:inherit; font-size:13px; line-height:1.35; text-align:left; color:inherit;
  border-radius:7px; transition:background .16s ease;
}
/* Twelve circled plus signs were the single busiest thing on this screen. A
   tick states what the row IS; the chevron, which only surfaces on hover or
   focus, states what it DOES. The quiet state is the one people look at. */
.pw-tick{ flex:none; display:inline-grid; place-items:center; width:13px; color:${T.green}; opacity:.9 }
.pw-card.is-featured .pw-tick{ color:#fff; opacity:.75 }
.pw-rowlabel{ flex:1; min-width:0 }
.pw-chev{
  flex:none; display:inline-grid; place-items:center;
  opacity:0; transition:opacity .16s ease, transform .18s cubic-bezier(.32,.72,0,1);
}
.pw-row:hover .pw-chev,.pw-row:focus-visible .pw-chev{ opacity:.5 }
.pw-list li.is-open .pw-chev{ opacity:.6; transform:rotate(180deg) }
.pw-detail{
  margin:0 0 7px 22px; font-size:12.5px; line-height:1.5; opacity:.66;
  animation:pw-detail-in .22s cubic-bezier(.32,.72,0,1) both;
}
@keyframes pw-detail-in{ from{ opacity:0; transform:translateY(-3px) } to{ opacity:.66; transform:none } }

.pw-foot{ margin-top:18px; text-align:center }
.pw-later{
  background:none; border:none; cursor:pointer; font-family:inherit;
  font-size:13px; font-weight:600; color:${T.dim}; padding:8px 12px; border-radius:8px;
  transition:color .16s ease, background .16s ease;
}
.pw-later:hover{ color:${T.text}; background:${T.neutralBg} }
.pw-reason label{ display:block; font-size:13px; font-weight:650; margin-bottom:9px; color:${T.text} }
.pw-reason div{ display:flex; gap:8px; max-width:440px; margin:0 auto }
.pw-reason input{
  flex:1; padding:10px 13px; border-radius:10px; border:1px solid ${T.border};
  font-family:inherit; font-size:13.5px; color:${T.text}; background:${T.bg};
}
.pw-reason input:focus{ outline:2px solid ${T.blueBg}; border-color:${T.blue} }
.pw-send{
  padding:10px 16px; border-radius:10px; border:none; cursor:pointer;
  font-family:inherit; font-size:13.5px; font-weight:650; background:${T.blue}; color:#fff;
  transition:transform .1s ease-out;
}
.pw-send:active{ transform:scale(.97) }
.pw-skip{
  margin-top:10px; background:none; border:none; cursor:pointer;
  font-family:inherit; font-size:12.5px; color:${T.dim}; text-decoration:underline;
}

/* Mobile: Pro first, with its price, its CTA and three features above the
   fold. The list used to be hidden outright, which left the "Everything in
   Free, plus" label introducing nothing at all. Three rows is the spec, and a
   label needs something to label. */
@media (max-width:768px){
  .pw-scrim{ padding:12px 10px; align-items:flex-start }
  .pw-sheet{ padding:26px 18px 18px; border-radius:20px }
  .pw-cards{ grid-template-columns:1fr }
  .pw-list li:nth-child(n+4){ display:none }
  .pw-row{ padding:5px 0 }
  .pw-title{ font-size:23px }
  .pw-amount{ font-size:34px }
  /* The chevron has no hover on touch, so show the affordance outright. */
  .pw-chev{ opacity:.4 }
}

@media (prefers-reduced-motion:reduce){
  .pw-scrim,.pw-sheet,.pw-scrim.is-closing,.pw-sheet.is-closing{
    animation:pw-fade .2s ease both; filter:none; transform:none;
  }
  @keyframes pw-fade{ from{opacity:0} to{opacity:1} }
  .pw-cta:active,.pw-tog button:active,.pw-x:active,.pw-send:active,.pw-row:active .pw-plus{ transform:none }
  .pw-spin{ animation-duration:2s }
}
@media (prefers-reduced-transparency:reduce){
  .pw-scrim{ background:rgba(12,14,24,.82); backdrop-filter:none; -webkit-backdrop-filter:none }
}
@media (prefers-contrast:more){
  .pw-card{ border-color:rgba(0,0,0,.5) }
  .pw-sub,.pw-desc,.pw-fine,.pw-detail{ opacity:1; color:${T.text} }
}
`
