import { defineConfig } from 'vitest/config'

// Pinned include: without it vitest walks .claude/worktrees/ and discovers a
// second copy of every suite, which doubles the reported test count and makes
// a green run impossible to read.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js', 'lib/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
