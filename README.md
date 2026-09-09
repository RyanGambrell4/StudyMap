# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Local setup

`npm run dev` serves the app on `127.0.0.1` only. That bind is deliberate: the
dev server carries a set of `/api/*` AI routes that do no auth, no rate limiting
and no usage gating, so exposing them on a network turns them into an open relay
on whatever Anthropic key is in `.env`.

Those AI routes are **off by default**. To use them, set `ALLOW_DEV_AI=1` in
`.env`. Without it each one returns 503 explaining the flag; the rest of the dev
server is unaffected.

Put a **separate, low-limit Anthropic key** in `.env` for this. Never the
production key. Dev calls are logged as `dev:<route>` in the same `ai.call`
telemetry as production, so local testing shows up in the cost data rather than
being invisible.

## Supabase migrations

SQL migrations live in [`migrations/`](./migrations). They are not run automatically — apply them manually via the Supabase dashboard SQL editor (Project → SQL Editor → New query → paste → Run).

Pending migrations to run before shipping:

- `migrations/20260528_ios_state.sql` — adds the `ios_state` table that backs the iOS write-through cross-device sync. **Must be run before the next iOS release** or the app will silently fall back to local-only storage.
