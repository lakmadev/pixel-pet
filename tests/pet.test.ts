import { expect, mock, test } from 'claude-code/testing'

import { TONES, barRuns, cardLines, gradientAt, limitsSvg, meterSvg, resetIn, segments, segmentsText } from '../hooks/meter'
import { actionLine, lineSvg, LINE_COLORS } from '../hooks/status'
import { previewFor, reactionTo, sourceOf } from '../hooks/register'
import { COLORS, COLOR_NAMES, HEIGHT, WIDTH, blend, colorName, paletteFor, petSvg, sprite, toRuns } from '../hooks/sprite'

const MOODS = ['idle', 'working', 'happy', 'oops', 'sleepy', 'loved', 'reading', 'wince', 'shocked'] as const
const USAGE = { startedAt: 0, context: { tokens: 124_000, window: 200_000, percent: 62 }, cost: { usd: 1.84 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: new Date(Date.now() + 2 * 3600_000).toISOString() }, { kind: 'seven_day', percentUsed: 40 }] }

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
      expect(meter).toContain('▰▰▰▰▱')
      expect(meter).not.toContain('Claude plan')
      expect(drawn).toContain('Billing: Claude plan')
      expect(drawn).toContain('"hover":{"display":"flex"}')
    } else {
      expect(drawn).toContain('hit.tsx')
      expect(drawn.match(/"type":"Svg"/g)).toHaveLength(4)
      expect(drawn).not.toContain('↻')
      expect(drawn).toContain('Billing: Claude plan')
      expect(drawn).toContain('resets ')
      expect(drawn).not.toContain('billed')
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

const NOW = Date.parse('2026-10-09T12:00:00Z')

test('usage windows read plainly: gauge, percent, reset, and who bills', () => {
  expect(resetIn('2026-10-09T13:52:00Z', NOW)).toBe('1h52m')
  expect(resetIn('2026-10-09T12:38:00Z', NOW)).toBe('38m')
  expect(resetIn('2026-10-12T16:00:00Z', NOW)).toBe('3d4h')
  expect(resetIn('2026-10-09T11:00:00Z', NOW)).toBeUndefined()
  const plan = segmentsText(segments({ tokens: 124_000, window: 200_000, usd: 1.84, source: 'plan', limits: [{ kind: 'five_hour', percent: 85, resetsAt: '2026-10-09T13:52:00Z' }, { kind: 'seven_day', percent: 40 }] }, NOW))
  // A reset shows on the line only once a window is past 70%; the plan's $ estimate stays in the card.
  expect(plan).toBe('5h ▰▰▰▰▱ 85% resets 1h52m  week ▰▰▱▱▱ 40%')
  expect(segmentsText(segments({ tokens: 9000, window: 200_000, usd: 0.42, source: 'api' }, NOW))).toBe('9k/200k  $0.42')
  expect(segmentsText(segments({ usd: 3, source: 'bedrock' }, NOW))).toBe('$3.00')
})

test('the hover card says it plainly; desktop pills line up as SVG', () => {
  const card = cardLines({ percent: 62, tokens: 124_000, window: 200_000, usd: 1.84, source: 'plan', limits: [{ kind: 'five_hour', percent: 4, resetsAt: '2026-10-09T16:51:00Z' }, { kind: 'seven_day', percent: 1 }] }, NOW)
  expect(card).toEqual([
    'Context 62% full · 124k of 200k tokens',
    '5-hour limit 4% used · resets in 4h51m',
    'Weekly limit 1% used',
    'Billing: Claude plan, usage limits instead of per-token charges (≈$1.84 at API rates)',
  ])
  expect(cardLines({ usd: 0.42, source: 'api' }, NOW)).toEqual(['Billing: API, $0.42 billed this session'])
  const { svg, width } = limitsSvg([{ kind: 'five_hour', percent: 4 }, { kind: 'seven_day', percent: 1 }], TONES.dark)
  expect(svg.match(/<rect/g)).toHaveLength(4)
  expect(svg).toContain('>5h<')
  expect(width).toBeGreaterThan(100)
})

test('the billing source: plan windows, a gateway limit, else the API or provider once a reply is in', () => {
  const ctx = { percent: 10, window: 200_000 }
  expect(sourceOf({ context: ctx, rateLimits: [{ kind: 'five_hour', percentUsed: 3 }] }, 'api')).toBe('plan')
  expect(sourceOf({ context: ctx, rateLimits: [{ kind: 'spend_limit', percentUsed: 3 }] }, 'api')).toBe('gateway')
  expect(sourceOf({ context: ctx, rateLimits: [] }, 'bedrock')).toBe('bedrock')
  expect(sourceOf({ context: { window: 200_000 }, rateLimits: [] }, 'api')).toBeUndefined()
})

test('a line for each kind of action', () => {
  expect(actionLine('Read', { file_path: '/r/src/auth.ts' })).toBe('is reading auth.ts…')
  expect(actionLine('Edit', { file_path: '/r/a.ts' })).toBe('is editing a.ts ✏️')
  expect(actionLine('Bash', { command: 'npm test -- --watch=false' })).toBe('is running the tests 🧪')
  expect(actionLine('Bash', { command: 'git commit -m "x"' })).toBe('is committing the work ✍️')
  expect(actionLine('Bash', { command: 'pnpm add zod' })).toBe('is installing packages 📦')
  expect(actionLine('Bash', { command: 'ls -la' })).toBe('is looking around the repo 👀')
  expect(actionLine('Bash', { command: 'python3 scripts/seed.py' })).toBe('is running `python3`…')
  expect(actionLine('Grep', { pattern: 'TODO' })).toBe('is searching for "TODO" 🔍')
  expect(actionLine('WebFetch', { url: 'https://docs.anthropic.com/x' })).toBe('is reading docs.anthropic.com 🌐')
  expect(actionLine('mcp__github__create_issue', {})).toBe('is asking github…')
  expect(actionLine('TodoWrite', {})).toBe('is planning the next steps 📝')
  expect(actionLine('SomethingElse', {})).toBeUndefined()
})

test('the desktop line slides: the new one rises, the old one drifts up and fades', () => {
  const svg = lineSvg('Reaper', 'is running the tests 🧪', 'is reading auth.ts…', LINE_COLORS.dark)
  expect(svg).toContain('values="32;15"')
  expect(svg).toContain('values="15;-4"')
  expect(svg).toContain('#d97757')
  expect(lineSvg('Reaper', 'is vibing', undefined, LINE_COLORS.light)).not.toContain('<animate')
  expect(lineSvg('A<b>', 'x & y', undefined, LINE_COLORS.dark)).toContain('A&lt;b&gt;')
})
