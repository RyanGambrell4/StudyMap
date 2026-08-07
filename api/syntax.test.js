import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vitest transforms modules through esbuild, which tolerates things Node does
 * not: a duplicate `import { toISO }` alongside a local `const toISO` passed
 * every test here and still threw SyntaxError the moment Vercel ran it.
 *
 * `node --check` parses with the same rules the serverless runtime uses, so
 * this catches that class of break before it reaches a deploy.
 */
describe('api modules parse under Node', () => {
  const files = readdirSync('api')
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))

  it('finds the api directory', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s', (file) => {
    expect(() => execFileSync('node', ['--check', join('api', file)], { stdio: 'pipe' })).not.toThrow()
  })
})
