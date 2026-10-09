import { expect, mock, test } from 'claude-code/testing'

import { xpBar } from '../hooks/register'
import { SIZE, formFor, levelFor, sprite, toBase64, toCells, toSvg, xpFor } from '../hooks/sprite'

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

test('every mood draws a full 12x12 sprite that changes between frames', () => {
  for (const mood of ['idle', 'working', 'happy', 'oops', 'sleepy', 'loved'] as const) {
    const a = sprite(mood, 1, 7)
    expect(a).toHaveLength(SIZE)
    for (const row of a) expect(row).toHaveLength(SIZE)
    if (mood !== 'idle') expect(JSON.stringify(sprite(mood, 2, 7))).not.toBe(JSON.stringify(a))
  }
})

test('encodes cells as base64 u32 triplets and SVG as two frames', () => {
  expect(toBase64(new Uint8Array([104, 105]))).toBe('aGk=')
  expect(toCells(sprite('idle', 1, 1))).toHaveLength(Math.ceil((12 * 6 * 12) / 3) * 4)
  const svg = toSvg([sprite('happy', 1, 1), sprite('happy', 2, 1)])
  expect(svg.match(/<animate /g)).toHaveLength(2)
})

test('draws the band on terminal and desktop', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'pixel-pet',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never,
    })
    expect(await ui.find({ text: 'Lv 1' })).toBeDefined()
    expect(await ui.find({ key: 'pet' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).toContain(surface === 'terminal' ? '"type":"Raster"' : '"type":"Svg"')
  }
})
