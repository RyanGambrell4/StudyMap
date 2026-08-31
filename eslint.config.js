import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),

  // ── Browser code ───────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Compiled in by the build-id plugin in vite.config.js. Real at build
        // time, absent in dev, which src/lib/appVersion.js handles explicitly.
        __BUILD_ID__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  // ── Server code and tooling ────────────────────────────────────────────────
  // Previously this whole repo was linted with `globals.browser`, so `process`
  // was undefined in every serverless function, and `.mjs` was not matched at
  // all so scripts/ went unlinted entirely. Between them that meant lint could
  // not see real errors in exactly the code that runs unattended on a cron.
  {
    files: [
      'api/**/*.js',
      'lib/**/*.js',
      'scripts/**/*.{js,mjs}',
      '*.config.{js,mjs}',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },

  // ── Tests ──────────────────────────────────────────────────────────────────
  // Vitest globals are imported explicitly in this repo, so the only extra need
  // is both environments, since tests server-render browser components.
  {
    files: ['**/*.test.{js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
])
