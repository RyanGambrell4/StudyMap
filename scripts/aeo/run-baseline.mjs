#!/usr/bin/env node
/**
 * run-baseline.mjs — AEO citation baseline: are we named, linked, and where?
 *
 * Point of this file: the AEO work (answer blocks, fact density, sourcing) has
 * no click-based success metric, because AI answers frequently do not produce a
 * click at all. The only honest measure is whether we get *named* and *linked*
 * in the answer, and how that moves over time. That requires a before-state
 * captured with a FIXED prompt set and a FIXED schema, so runs are comparable.
 * Change prompts.json and you have broken the time series.
 *
 * Engines:
 *   API-driven (run automatically when the key is present)
 *     openai      OPENAI_API_KEY       - needs a web-search-enabled model to be
 *                                        a fair proxy for ChatGPT search
 *     perplexity  PERPLEXITY_API_KEY   - closest to a real answer engine
 *     anthropic   ANTHROPIC_API_KEY    - needs the web search tool enabled
 *     gemini      GEMINI_API_KEY       - grounding must be on
 *   Manual (no API exists for the surface users actually see)
 *     copilot, google-ai-mode  -> use --template to emit rows to fill in by hand
 *
 * A caveat worth writing down rather than discovering later: an API answer is
 * NOT the same artifact as the consumer product's answer. ChatGPT-the-website
 * and the OpenAI API differ in retrieval, grounding, and personalisation. Trends
 * from this harness are meaningful; absolute "we are cited by ChatGPT" claims
 * from the API alone are not.
 *
 * Usage:
 *   node scripts/aeo/run-baseline.mjs --template          # manual CSV skeleton
 *   node scripts/aeo/run-baseline.mjs --engines perplexity
 *   node scripts/aeo/run-baseline.mjs                     # every keyed engine
 *
 * Output: scripts/aeo/results/YYYY-MM-DD.csv (append-safe, one row per
 * prompt x engine).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROMPTS = JSON.parse(readFileSync(resolve(HERE, 'prompts.json'), 'utf8'))
const OUTDIR = resolve(HERE, 'results')

const BRAND = /studyedge\s*ai|studyedge|getstudyedge\.com/i
// Named so a competitor set shift is visible, not just our own presence.
const COMPETITORS = ['Anki', 'Quizlet', 'Notion', 'Obsidian', 'Chegg', 'Course Hero',
  'Khan Academy', 'Brainscape', 'RemNote', 'Coursera', 'Gizmo', 'Knowt', 'StudySmarter',
  'ChatGPT', 'Grammarly', 'Wolfram', 'Symbolab', 'Photomath', 'LeetCode', 'Forest']

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
const today = new Date().toISOString().slice(0, 10)

const CSV_HEADER = 'date,engine,prompt_id,category,prompt,mentioned,linked,url,' +
  'position_pct,competitors_named,answer_chars,excerpt\n'

const esc = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').slice(0, 400)}"`

/** Score one answer against the schema the time series depends on. */
function score(text) {
  const t = text ?? ''
  const m = BRAND.exec(t)
  const linked = /getstudyedge\.com/i.test(t)
  const url = (t.match(/https?:\/\/(?:www\.)?getstudyedge\.com[^\s)\]"']*/i) ?? [''])[0]
  // Position as % through the answer: being named in sentence 1 is worth far
  // more than a footnote, and a raw char index is not comparable across answers.
  const positionPct = m && t.length ? Math.round((m.index / t.length) * 100) : ''
  const named = COMPETITORS.filter((c) => new RegExp(`\\b${c.replace(/ /g, '\\s')}\\b`, 'i').test(t))
  return { mentioned: !!m, linked, url, positionPct, named, len: t.length }
}

function row(engine, p, text) {
  const s = score(text)
  return [today, engine, p.id, p.category, esc(p.prompt), s.mentioned, s.linked,
    esc(s.url), s.positionPct, esc(s.named.join('|')), s.len, esc(text.slice(0, 300))].join(',') + '\n'
}

// ---------------------------------------------------------------- engines

async function openai(prompt) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o', tools: [{ type: 'web_search_preview' }], input: prompt }),
  })
  if (!r.ok) throw new Error(`openai ${r.status} ${(await r.text()).slice(0, 160)}`)
  const j = await r.json()
  return j.output_text ?? JSON.stringify(j).slice(0, 4000)
}

async function perplexity(prompt) {
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) throw new Error(`perplexity ${r.status} ${(await r.text()).slice(0, 160)}`)
  const j = await r.json()
  const msg = j.choices?.[0]?.message?.content ?? ''
  // Citations live outside the prose; append so link detection sees them.
  return msg + '\n' + (j.citations ?? []).join('\n')
}

async function anthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5', max_tokens: 1200,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) throw new Error(`anthropic ${r.status} ${(await r.text()).slice(0, 160)}`)
  const j = await r.json()
  return (j.content ?? []).map((b) => b.text ?? JSON.stringify(b)).join('\n')
}

async function gemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }) })
  if (!r.ok) throw new Error(`gemini ${r.status} ${(await r.text()).slice(0, 160)}`)
  const j = await r.json()
  return JSON.stringify(j.candidates?.[0] ?? {}).slice(0, 6000)
}

const ENGINES = {
  openai: { fn: openai, key: 'OPENAI_API_KEY' },
  perplexity: { fn: perplexity, key: 'PERPLEXITY_API_KEY' },
  anthropic: { fn: anthropic, key: 'ANTHROPIC_API_KEY' },
  gemini: { fn: gemini, key: 'GEMINI_API_KEY' },
}
const MANUAL = ['copilot', 'google-ai-mode']

// ---------------------------------------------------------------- main

async function main() {
  mkdirSync(OUTDIR, { recursive: true })
  const out = resolve(OUTDIR, `${today}.csv`)
  if (!existsSync(out)) writeFileSync(out, CSV_HEADER)

  if (has('--template')) {
    for (const e of MANUAL)
      for (const p of PROMPTS)
        appendFileSync(out, [today, e, p.id, p.category, esc(p.prompt), '', '', '', '', '', '', ''].join(',') + '\n')
    console.log(`wrote ${MANUAL.length * PROMPTS.length} blank rows for manual completion -> ${out}`)
    console.log('Fill: mentioned(TRUE/FALSE) linked(TRUE/FALSE) url position_pct competitors_named(pipe-separated)')
    return
  }

  const want = (val('--engines') ?? Object.keys(ENGINES).join(',')).split(',')
  const runnable = want.filter((e) => ENGINES[e] && process.env[ENGINES[e].key])
  const skipped = want.filter((e) => ENGINES[e] && !process.env[ENGINES[e].key])

  if (skipped.length) console.log(`skipped (no key): ${skipped.map((e) => `${e} (${ENGINES[e].key})`).join(', ')}`)
  if (!runnable.length) {
    console.log('\nNo engine keys set, so no automated run is possible.')
    console.log('Set a key, or capture the manual surfaces with --template.')
    return
  }

  let n = 0, hits = 0
  for (const e of runnable) {
    for (const p of PROMPTS) {
      try {
        const text = await ENGINES[e].fn(p.prompt)
        const line = row(e, p, text)
        appendFileSync(out, line)
        const s = score(text)
        if (s.mentioned) hits++
        n++
        console.log(`  ${e}/${p.id} mentioned=${s.mentioned} linked=${s.linked} others=${s.named.slice(0, 3).join('|')}`)
      } catch (err) {
        appendFileSync(out, [today, e, p.id, p.category, esc(p.prompt), 'ERROR', '', esc(err.message), '', '', '', ''].join(',') + '\n')
        console.error(`  ${e}/${p.id} FAILED: ${err.message}`)
      }
    }
  }
  console.log(`\n${n} runs, mentioned in ${hits} (${(hits / Math.max(n, 1) * 100).toFixed(1)}%) -> ${out}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
