import { expect, mock, test } from 'claude-code/testing'

import { reactionTo, xpBar } from '../hooks/register'
import { HEIGHT, WIDTH, blend, formFor, levelFor, petSvg, sprite, toRuns, xpFor } from '../hooks/sprite'

const MOODS = ['idle', 'working', 'happy', 'oops', 'sleepy', 'loved'] as const

test('levels and forms follow XP', () => {
  expect(levelFor(0)).toBe(1)
  expect(levelFor(39)).toBe(1)
  expect(levelFor(40)).toBe(2)
  expect(levelFor(xpFor(10))).toBe(10)
  expect(formFor(1).name).toBe('sprout')
  expect(formFor(3).name).toBe('spark')
  expect(formFor(12).name).toBe('legend')
  expect(xpBar({ xp: 20, levelXp: 0, nextXp: 40 })).toBe('▰▰▰▰▰▱▱▱▱▱')
})

test('every mood fills the 10x8 canvas and moves over time', () => {
  for (const mood of MOODS) {
    const a = sprite(mood, 0, 7)
    expect(a).toHaveLength(HEIGHT)
    for (const row of a) expect(row).toHaveLength(WIDTH)
    const frames = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(sprite(mood, i * 100, 7))))
    expect(frames.size).toBeGreaterThan(1)
  }
})

test('draws 4 rows of 10 cells, empty pixels see-through', () => {
  const rows = toRuns(sprite('idle', 500, 1))
  expect(rows).toHaveLength(4)
  for (const runs of rows) expect(runs.map(r => r.text).join('')).toHaveLength(WIDTH)
  // The corners are empty: nothing painted behind them.
  expect(rows[0]![0]!.fg).toBeUndefined()
  expect(rows.flat().every(r => r.bg === undefined || r.fg !== undefined)).toBe(true)
})

test('a crossfade blends colours and swaps appearing pixels halfway', () => {
  const from = [[0x000000, null]]
  const to = [[0xffffff, 0x123456]]
  expect(blend(from, to, 0.5)).toEqual([[0x808080, 0x123456]])
  expect(blend(from, to, 0.2)[0]![1]).toBeNull()
})

test('the desktop SVG animates, stays transparent and degrades to a still pet', () => {
  const svg = petSvg('working', 3, { mood: 'idle', level: 3 })
  expect(svg).toContain('<animateTransform')
  expect(svg).toContain('calcMode="spline"')
  expect(svg).not.toContain('<rect width="100%"')
  expect(svg.length).toBeLessThan(20_000)
  // Animated layers start hidden, so without SMIL only the still body shows.
  expect(svg.match(/<g opacity="0">/g)!.length).toBeGreaterThanOrEqual(3)
  expect(petSvg('sleepy', 1)).not.toContain('animateTransform')
})

test('the band: a live text sprite in the terminal, an SVG on desktop, one sentence beside it', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-pet', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain(surface === 'terminal' ? '"type":"Client"' : '"type":"Svg"')
    expect(drawn).not.toContain('isInteractive')
    expect(drawn).toContain('sprout')
    expect(drawn).not.toContain('XP')
    expect(await ui.find({ key: 'pet' })).toBeDefined()
    if (surface === 'terminal') expect(JSON.stringify(await ui.drawn({ in: 'pet' }))).toContain('▀')
    await ui.unmount()
  }
})

const edit = (text: string, start: number, end: number, inputText: string, key: unknown = { key: 'x' }) => ({ text, cursor: start, start, end, inputText, key })

test('reacts to typing, code, small and big deletes, pastes and manners', () => {
  expect(reactionTo(edit('hello', 5, 5, ' ')))?.toMatchObject({ mood: 'reading' })
  expect(reactionTo(edit('const x ', 8, 8, '='))!.line).toBe('is reading your code…')
  expect(reactionTo(edit('helo', 3, 4, ''))).toMatchObject({ mood: 'wince' })
  expect(reactionTo(edit('a long sentence I regret', 0, 24, ''))).toMatchObject({ mood: 'shocked' })
  expect(reactionTo({ ...edit('', 0, 0, 'x'.repeat(200)), key: undefined })!.line).toBe("whoa, that's a lot of text")
  expect(reactionTo(edit('fix it please', 13, 13, ' '))).toMatchObject({ mood: 'loved' })
  expect(reactionTo(edit('there is a bug', 14, 14, ' '))!.line).toBe('spots the bug 👀')
  expect(reactionTo(edit('abc', 1, 1, ''))).toBeUndefined()
})

test('the eyes sweep across as the caret moves along a line', () => {
  expect(reactionTo(edit('', 0, 0, 'a'))!.look).toBe(-1)
  expect(reactionTo(edit('x'.repeat(14), 14, 14, 'a'))!.look).toBe(0)
  expect(reactionTo(edit('x'.repeat(27), 27, 27, 'a'))!.look).toBe(1)
  const left = JSON.stringify(sprite('reading', 0, 1, -1))
  expect(left).not.toBe(JSON.stringify(sprite('reading', 0, 1, 1)))
  for (const mood of ['reading', 'wince', 'shocked'] as const) expect(petSvg(mood, 1).length).toBeGreaterThan(200)
})
