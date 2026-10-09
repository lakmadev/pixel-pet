import { expect, mock, test } from 'claude-code/testing'

import { barRuns, details, gradientAt, meterSvg } from '../hooks/meter'
import { previewFor, reactionTo } from '../hooks/register'
import { COLORS, COLOR_NAMES, HEIGHT, WIDTH, blend, colorName, paletteFor, petSvg, sprite, toRuns } from '../hooks/sprite'

const MOODS = ['idle', 'working', 'happy', 'oops', 'sleepy', 'loved', 'reading', 'wince', 'shocked'] as const
const USAGE = { startedAt: 0, context: { tokens: 124_000, window: 200_000, percent: 62 }, cost: { usd: 1.84 }, rateLimits: [{ kind: 'five_hour', percentUsed: 41 }] }

test('28 colours by name, aliases, teal by default', () => {
  expect(COLOR_NAMES).toHaveLength(28)
  expect(colorName('Grey')).toBe('gray')
  expect(colorName('auto')).toBe('teal')
  expect(colorName('rainbow')).toBeUndefined()
  expect(paletteFor()).toBe(COLORS.teal!)
  expect(paletteFor('nonsense')).toBe(COLORS.teal!)
  expect(JSON.stringify(sprite('idle', 0, 0, 'pink'))).toContain(String(COLORS.pink!.body))
})

test('every mood fills the 10x8 canvas and moves over time', () => {
  for (const mood of MOODS) {
    const a = sprite(mood, 0)
    expect(a).toHaveLength(HEIGHT)
    for (const row of a) expect(row).toHaveLength(WIDTH)
    const frames = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(sprite(mood, i * 100))))
    expect(frames.size).toBeGreaterThan(1)
  }
})

test('draws 4 rows of 10 cells, empty pixels see-through; crossfades blend', () => {
  const rows = toRuns(sprite('idle', 500))
  expect(rows).toHaveLength(4)
  for (const runs of rows) expect(runs.map(r => r.text).join('')).toHaveLength(WIDTH)
  expect(rows[0]![0]!.fg).toBeUndefined()
  expect(blend([[0x000000, null]], [[0xffffff, 0x123456]], 0.5)).toEqual([[0x808080, 0x123456]])
})

test('the desktop pet SVG animates, fades between colours, and rests still without SMIL', () => {
  const svg = petSvg('working', { mood: 'idle', color: 'teal' }, 0, 'pink')
  expect(svg).toContain('<animateTransform')
  expect(svg).toContain('values="1;0" dur="350ms"')
  expect(svg.match(/<g opacity="0">/g)!.length).toBeGreaterThanOrEqual(3)
  expect(petSvg('sleepy')).not.toContain('animateTransform')
})

test('the meter: gradient, numbers, a precise bar, and a pill that glides and shimmers', () => {
  expect(gradientAt(0)).toBe(0x34d399)
  expect(gradientAt(1)).toBe(0xf87171)
  expect(details({ tokens: 124_000, window: 200_000, usd: 1.84, limit: 41 })).toBe('124k/200k · $1.84 · 5h 41%')
  expect(details({})).toBe('')
  const bar = barRuns(50, 14)
  expect(bar.map(r => r.text).join('')).toBe('━━━━━━━───────')
  expect(barRuns(54, 14).map(r => r.text).join('')).toBe('━━━━━━━╸──────')
  expect(meterSvg(62, 40, false)).toContain('from="44.0" to="68.2"')
  expect(meterSvg(62, 40, false)).not.toContain('values="-30;')
  expect(meterSvg(62, 62, true)).toContain('values="-30;')
})

test('the band: pet and live meter in the terminal; SVGs and a click layer on desktop', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE as never }))
  on('command.register', () => ({ value: undefined as never }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-pet', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).not.toContain('"type":"Button"')
    expect(drawn).not.toMatch(/\blv\b|XP/)
    if (surface === 'terminal') {
      expect(drawn).toContain('meter-view.tsx')
      const meter = JSON.stringify(await ui.drawn({ in: 'meter' }))
      expect(meter).toContain('━')
      expect(meter).toContain('124k/200k · $1.84 · 5h 41%')
    } else {
      expect(drawn).toContain('hit.tsx')
      expect(drawn.match(/"type":"Svg"/g)).toHaveLength(2)
      expect(drawn).toContain('124k/200k · $1.84 · 5h 41%')
    }
    await ui.unmount()
  }
})

test('clicking the sprite pets it', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
  await ui.pointer({ type: 'down', x: 4, y: 2, button: 'left', in: 'pet' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/loves you back|purrs in binary|blushing in pixels/)
})

test('on desktop a click on the layer over the sprite pets it, a heart at once, an up alone counts', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
  await ui.pointer({ type: 'up', x: 2, y: 1, button: 'left', in: 'pet-hit' })
  expect(JSON.stringify(await ui.drawn({ in: 'pet-hit' }))).toContain('♥')
  expect(JSON.stringify(await ui.drawn())).toMatch(/loves you back|purrs in binary|blushing in pixels/)
})

const edit = (text: string, start: number, end: number, inputText: string, key: unknown = { key: 'x' }) => ({ text, cursor: start, start, end, inputText, key })

test('reacts to typing, code, small and big deletes, pastes and manners', () => {
  expect(reactionTo(edit('hello', 5, 5, ' '))).toMatchObject({ mood: 'reading' })
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
  expect(JSON.stringify(sprite('reading', 0, -1))).not.toBe(JSON.stringify(sprite('reading', 0, 1)))
})

test('typing /pet color previews the first matching colour', () => {
  expect(previewFor('/pet color pi')).toBe('pink')
  expect(previewFor('/pet colour lava')).toBe('lava')
  expect(previewFor('/pet color grey')).toBe('gray')
  expect(previewFor('/pet color mi')).toBe('mint')
  expect(previewFor('/pet color mid')).toBe('midnight')
  expect(previewFor('/pet color ')).toBeUndefined()
  expect(previewFor('/pet color zzz')).toBeUndefined()
  expect(previewFor('make the pet color pink')).toBeUndefined()
})

test('the colour names show in the typeahead after /pet color', async ($, on) => {
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  // The kit raises prompt.autocomplete through $.prompt; the public typings don't list it.
  type Autocomplete = (a: { text: string; cursor: number; token: string; start: number }) => Promise<{ suggestions: { text: string; description?: string }[] }>
  const autocomplete = ($.prompt as unknown as { autocomplete: Autocomplete }).autocomplete
  const ask = (text: string, token: string) => autocomplete({ text, cursor: text.length, token, start: text.length - token.length })
  const rows = (await ask('/pet color p', 'p')).suggestions
  expect(rows.map(r => r.text)).toEqual(['purple', 'pink', 'peach'])
  expect(rows[1]!.description).toBe('#f9a8d4')
  expect((await ask('/pet rename p', 'p')).suggestions).toHaveLength(0)
})

test('/pet color picks and lists, and the band follows', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('command.run', () => ({}))
  const run = (args: string) => $.command.run({ command: 'pet', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('color pink')).text).toContain('now pink')
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
  expect(JSON.stringify(await ui.drawn())).toContain('f9a8d4')
  expect((await run('color rainbow')).text).toContain('Colours: teal, red')
  expect((await run('')).text).toContain('Click it to pet it')
})
