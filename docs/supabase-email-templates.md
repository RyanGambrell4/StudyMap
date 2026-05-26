# Supabase Auth Email Templates

These templates run inside the Supabase Auth flow (signup confirmation + password reset). They are stored in Supabase's dashboard — Claude can't deploy them via code. Copy each section into the matching Supabase Email Template box.

**Dashboard path:** Supabase Project → Authentication → Email Templates

The variables `{{ .ConfirmationURL }}` and `{{ .Email }}` are populated by Supabase at send time.

---

## Why custom SMTP is critical

Supabase's built-in SMTP has a hard 4 emails / hour rate limit and is shared across the entire Supabase platform. New signups frequently see "Error sending confirmation email" because of that shared cap, even when the project itself isn't busy.

**Fix:** point Supabase Auth at Resend SMTP. One-time setup:

1. Resend → Domains → verify `getstudyedge.com` (add the SPF, DKIM, MX rows Resend lists).
2. Resend → API Keys → create a key with `SMTP` scope.
3. Supabase → Authentication → Settings → SMTP Settings → enable custom SMTP and enter:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the SMTP-scoped API key
   - Sender email: `support@mail.getstudyedge.com`
   - Sender name: `StudyEdge AI`
4. Supabase → Authentication → URL Configuration → set Site URL to `https://getstudyedge.com` and add `https://getstudyedge.com/app` to Redirect URLs.

Once this is live, signup confirmation should no longer return "Error sending confirmation email" — Resend can handle 100 emails/sec and has zero shared throttling.

---

## Template — Confirm signup

**Subject:**

```
Confirm your StudyEdge AI account
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your email</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:24px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 30px;">
        <p style="margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:#3B61C4;text-transform:uppercase;">Confirm your email</p>
        <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">One quick tap to finish signup.</h1>
        <p style="margin:0 0 22px;font-size:15.5px;color:#444444;line-height:1.65;">
          Hit the button below to verify <strong style="color:#111111;">{{ .Email }}</strong>. After that you're in — your study plan and 7-day Pro trial are ready.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 36px;box-shadow:0 1px 2px rgba(59,97,196,0.18);">Confirm email</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12.5px;color:#9B9B9B;">This link expires in 24 hours.</span>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#9B9B9B;line-height:1.6;">
          If the button doesn't work, paste this into your browser:<br>
          <a href="{{ .ConfirmationURL }}" style="color:#3B61C4;text-decoration:none;word-break:break-all;">{{ .ConfirmationURL }}</a>
        </p>
      </td></tr>
      <tr><td style="padding:24px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Didn't try to sign up? You can safely ignore this email — your address won't be added without confirmation.<br>
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">— The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
```

---

## Template — Reset password

**Subject:**

```
Reset your StudyEdge password
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:24px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 30px;">
        <p style="margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:#3B61C4;text-transform:uppercase;">Password reset</p>
        <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">Reset your password.</h1>
        <p style="margin:0 0 22px;font-size:15.5px;color:#444444;line-height:1.65;">
          We got a reset request for <strong style="color:#111111;">{{ .Email }}</strong>. Click below to set a new one.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 36px;box-shadow:0 1px 2px rgba(59,97,196,0.18);">Reset password</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12.5px;color:#9B9B9B;">This link expires in 1 hour.</span>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#9B9B9B;line-height:1.6;">
          Didn't request this? Ignore this email — your password stays the same.
        </p>
      </td></tr>
      <tr><td style="padding:24px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">— The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
```

---

## Template — Magic link (optional, if you enable passwordless)

Same structure as Confirm signup, just swap the body copy: "Click below to sign in to StudyEdge — this link gets you straight into the app, no password needed."

---

## After deploying these templates

1. Send yourself a test signup with a real address.
2. Confirm the email arrives (check spam folder if it doesn't — that's the SPF/DKIM hint).
3. Click the confirm link — should land on `https://getstudyedge.com/app`.
4. AuthScreen.jsx polls every 5s for `email_confirmed_at` and will auto-advance once Supabase marks the account as confirmed.

If signup still errors out:
- Look at Supabase → Logs → Auth for the exact failure
- 99% of the time it's "Domain not verified" in Resend or wrong SMTP password
