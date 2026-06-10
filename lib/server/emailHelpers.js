/**
 * Shared email utilities used across all transactional and drip email handlers.
 */

/**
 * Returns a hidden preheader span. The zero-width space padding prevents
 * Gmail from appending body copy into the preview pane after the intended text.
 */
export function preheader(text) {
  const pad = '&nbsp;&#8203;'.repeat(60)
  return `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;font-size:1px;">${text}${pad}</span>`
}

/**
 * Returns List-Unsubscribe headers for Resend. Required by Gmail bulk sender
 * rules — without these, users hit "Report spam" instead of unsubscribing,
 * which degrades domain reputation.
 */
export function listUnsubscribeHeaders(email) {
  const encoded = encodeURIComponent(email ?? '')
  return {
    'List-Unsubscribe': `<mailto:support@mail.getstudyedge.com?subject=unsubscribe>, <https://getstudyedge.com/unsubscribe?email=${encoded}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
