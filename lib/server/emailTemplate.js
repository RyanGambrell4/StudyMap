/**
 * One shared layout for lifecycle email.
 *
 * Why this exists: there were 54 send sites, each hand-rolling its own HTML.
 * They had drifted into 21 files using an orange `#E8531A` call-to-action and
 * 93 uses of `#3B61C4`, while the actual brand blue in src/theme/tokens.js is
 * `#3452D9` and appeared in exactly zero emails. Copy drifted the same way: a
 * price string reading "$9.99/month or $9.99/month after" shipped to real
 * users because the copy linter's TARGET_GLOBS only covers public/*.html and
 * never looked at api/.
 *
 * Constraints this encodes, none of which are optional in email:
 *   - Tables, not flexbox. Outlook renders through Word's HTML engine.
 *   - Inline styles only. Gmail strips <style> blocks on some clients.
 *   - 600px max. Anything wider is side-scrolled on a phone.
 *   - A preheader, or the client previews the first thing it finds, usually
 *     "View in browser".
 *   - List-Unsubscribe headers live in emailHelpers.js and are still the
 *     caller's job; Gmail bulk rules require them.
 *
 * PRICES ARE NOT FREELY EDITABLE HERE. They are asserted against
 * content/facts.json by lib/server/emailCopy.test.js. facts.json is the source
 * of truth; this file only restates it, and the test fails if the two drift.
 * facts.json is deliberately NOT imported at runtime -- it would have to be
 * bundled into every serverless function that sends an email.
 */

import { preheader } from './emailHelpers.js'

/** Mirrors the V2 tokens in src/theme/tokens.js. Do not invent new hexes. */
export const BRAND = {
  blue:   '#3452D9',
  text:   '#1C1B18',
  muted:  '#5C5952',
  dim:    '#6E6B64',
  bg:     '#F7F8FA',
  card:   '#FFFFFF',
  border: '#E7E8EC',
  blueBg: '#EEF1FC',
  green:  '#10A56E',
  greenBg:'#E7F7F0',
}

/** Restates content/facts.json. Guarded by lib/server/emailCopy.test.js. */
export const PRICE = {
  proMonth: '9.99',
  proYear:  '69.99',
  trialDays: 7,
}

/**
 * The one sentence that states the offer. Every paid CTA should be followed by
 * it, because the trial is card-required and Stripe will auto-bill on day 8 --
 * saying so plainly up front is what stops a chargeback later.
 */
export const TRIAL_TERMS =
  `Free for ${PRICE.trialDays} days, then $${PRICE.proMonth}/month. ` +
  `Cancel any time before day ${PRICE.trialDays + 1} and you won't be charged.`

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

/**
 * A call-to-action button that survives Outlook.
 *
 * A styled <a> collapses its padding in Word-engine Outlook, so the button is
 * a single-cell table with the colour on the <td> and the padding on the <a>.
 */
export function ctaButton({ label, url }) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${BRAND.blue}" style="border-radius:12px;">
      <a href="${url}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;letter-spacing:-0.01em;">${label}</a>
    </td>
  </tr>
</table>`
}

/**
 * Render a complete lifecycle email.
 *
 * @param {object}   o
 * @param {string}   o.preheaderText  Inbox preview line. Required -- see above.
 * @param {string}   o.headline       One line. No icon or badge above it.
 * @param {string[]} o.paragraphs     Body copy, already escaped/trusted.
 * @param {object}  [o.callout]       { title, body } highlighted block.
 * @param {object}  [o.cta]           { label, url }.
 * @param {string}  [o.ctaSubtext]    Small print under the button.
 * @param {string}  [o.signoff]       Defaults to the team signature.
 * @param {string}   o.unsubscribeUrl Required. Gmail counts missing ones as spam.
 */
export function renderEmail({
  preheaderText,
  headline,
  paragraphs = [],
  callout = null,
  cta = null,
  ctaSubtext = '',
  signoff = 'The StudyEdge AI Team',
  unsubscribeUrl,
}) {
  if (!preheaderText) throw new Error('renderEmail: preheaderText is required')
  if (!unsubscribeUrl) throw new Error('renderEmail: unsubscribeUrl is required')

  const body = paragraphs
    .map(p => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">${p}</p>`)
    .join('')

  const calloutHtml = callout
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr><td style="background:${BRAND.blueBg};border-left:3px solid ${BRAND.blue};border-radius:8px;padding:16px 18px;">
          ${callout.title ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:700;color:${BRAND.blue};">${callout.title}</p>` : ''}
          <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.muted};">${callout.body}</p>
        </td></tr>
      </table>`
    : ''

  const ctaHtml = cta
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
        <tr><td align="center">${ctaButton(cta)}</td></tr>
      </table>
      ${ctaSubtext ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;color:${BRAND.dim};text-align:center;line-height:1.5;">${ctaSubtext}</p>` : ''}`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>StudyEdge AI</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-font-smoothing:antialiased;">
${preheader(preheaderText)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:36px 32px;">

            <img src="https://getstudyedge.com/favicon.png" width="36" height="36" alt="StudyEdge AI" style="display:block;width:36px;height:36px;border-radius:9px;margin:0 0 22px;">

            <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;color:${BRAND.text};letter-spacing:-0.02em;">${headline}</h1>

            ${body}
            ${calloutHtml}
            ${ctaHtml}

            <p style="margin:24px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.muted};">Questions? Just reply to this email. It comes straight to us and we read every one.</p>
            <p style="margin:8px 0 0;font-family:${FONT};font-size:15px;color:${BRAND.muted};">${signoff}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
              <tr><td style="border-top:1px solid ${BRAND.border};padding-top:16px;">
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:#9CA3AF;text-align:center;">
                  StudyEdge AI &middot;
                  <a href="https://getstudyedge.com/app" style="color:#9CA3AF;text-decoration:underline;">Open the app</a> &middot;
                  <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe</a>
                </p>
              </td></tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
