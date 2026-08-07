import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(new URL(import.meta.url).pathname)

// Swap the three app modules that reach for network state (subscription gate,
// PostHog, Supabase) for inert stubs, so the harness renders the real component
// without a session.
const stubs = {
  'lib/subscription': `${here}/stub-subscription.js`,
  'lib/analytics':    `${here}/stub-analytics.js`,
  'lib/db':           `${here}/stub-db.js`,
}

export default defineConfig({
  root: here,
  plugins: [
    react(),
    {
      name: 'grade-hub-harness-stubs',
      enforce: 'pre',
      resolveId(source) {
        const hit = Object.keys(stubs).find(k => source.endsWith(k))
        return hit ? stubs[hit] : null
      },
    },
  ],
  server: { port: 5199, strictPort: true },
})
