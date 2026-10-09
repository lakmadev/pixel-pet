import { expect, mock, test } from 'claude-code/testing'

import { xpBar } from '../hooks/register'
import { HEIGHT, WIDTH, blend, formFor, levelFor, sprite, toRuns, xpFor } from '../hooks/sprite'

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

test('the band is one sentence beside a live sprite on terminal and desktop', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-pet', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('"type":"Client"')
    expect(drawn).toContain('sprout')
    expect(drawn).not.toContain('XP')
    expect(await ui.find({ key: 'pet' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn({ in: 'pet' }))).toContain('▀')
    await ui.unmount()
  }
})
