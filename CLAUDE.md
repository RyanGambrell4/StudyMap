# StudyEdge AI — Claude Code Context

This is the primary repo for StudyEdge AI (getstudyedge.com).

**Read `AGENTS_SPEC.md` before running any agent task.** It contains the full app context, agent specs, invocation commands, and quality rules.

## Quick Invocations

**SEO Agent:**
```
Run the StudyEdge SEO agent. Read AGENTS_SPEC.md first. Execute all four SEO layers in order. Commit everything. Send iMessage summary when done.
```

**QA Agent:**
```
Run the StudyEdge QA agent. Read AGENTS_SPEC.md first. Use Playwright to walk through every critical flow. Fix bugs you find. Commit fixes. Send iMessage summary when done.
```

**UI Agent:**
```
Run the StudyEdge UI consistency agent. Read AGENTS_SPEC.md first. Execute all three phases. Commit after each phase. Send iMessage summary when done.
```

## Stack
- React + Vite SPA
- Supabase (auth + DB)
- Vercel (hosting + serverless functions)
- Tailwind + inline styles
- Stripe (subscriptions)
- PostHog (analytics)
- Resend (email)

## Design System (non-negotiable)
- bg `#F7F6F3`, card `#FFFFFF`, border `rgba(0,0,0,0.07)`, accent `#3B61C4`, text `#111111`, muted `#6B6B6B`
- Light theme only. Any `dark:` Tailwind class is a bug.
- No emojis in UI. No em dashes in copy.
