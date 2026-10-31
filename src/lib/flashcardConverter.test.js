// The flashcard converter lives in public/flashcard-converter.html as an inline script.
// These tests pull its real splitLine() out of the page and exercise it, so a change to
// the separator rules (like the one made during the 2026-10 em-dash pass, now reverted)
// shows up here.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'flashcard-converter.html'), 'utf8')
const src = html.match(/function splitLine\(line, sep\) \{[\s\S]*?\n  \}\n/)[0]
// eslint-disable-next-line no-new-func
const splitLine = new Function(`${src}; return splitLine;`)()

const EM = '\u2014'
const EN = '\u2013'
// The dash separator exactly as it was before the em-dash pass: /\s*[\u2014-]\s+/
const ORIGINAL_DASH = new RegExp(`\\s*[${EM}-]\\s+`)

describe('flashcard converter dash separator', () => {
  it('still splits on an em dash followed by a space', () => {
    expect(splitLine(`Mitochondrion ${EM} produces ATP`, 'dash')).toEqual(['Mitochondrion', 'produces ATP'])
  })

  it('still splits on a hyphen followed by a space', () => {
    expect(splitLine('Osmosis - water moving across a membrane', 'dash')).toEqual(['Osmosis', 'water moving across a membrane'])
  })

  it(`does not split "15${EN}30" inside a card`, () => {
    expect(splitLine(`Pomodoro long break 15${EN}30 minutes`, 'dash')).toBeNull()
  })

  it('does not split an en dash used as a spaced range either', () => {
    expect(splitLine(`Long break 15 ${EN} 30 minutes`, 'dash')).toBeNull()
  })

  it('keeps an en dash range intact when another separator splits the line', () => {
    expect(splitLine(`Long break\t15${EN}30 minutes`, 'auto')).toEqual(['Long break', `15${EN}30 minutes`])
  })

  it('behaves exactly like the original dash separator', () => {
    const lines = [
      `Term ${EM} definition`, 'Term - definition', `Term${EM} definition`, 'well-known term - meaning',
      `Range 15${EN}30`, `Range 15 ${EN} 30 - note`, 'no separator here', `A ${EM} B ${EM} C`, 'x -y',
    ]
    for (const line of lines) {
      const parts = line.split(ORIGINAL_DASH)
      const expected = parts.length >= 2 && parts[0].trim() && parts.slice(1).join(' ').trim()
        ? [parts[0].trim(), parts.slice(1).join(' ').trim()] : null
      expect(splitLine(line, 'dash')).toEqual(expected)
    }
  })
})
