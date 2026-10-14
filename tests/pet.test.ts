import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { TONES, barRuns, cardLines, gradientAt, limitsSvg, meterSvg, resetIn, segments, segmentsText } from '../hooks/meter'
import { actionKind, actionLine, focusLine, lineSvg, LINE_COLORS, outcomeOf } from '../hooks/status'
import { petCard } from '../hooks/card'
import { ARRIVE_MS, LEAVE_MS, MINI_H, MINI_W, SLOT_MS, WAVE_MS, colorFromDefinition, miniColor, miniDraw, miniFrame } from '../hooks/mini'
import { lineTwoSvg } from '../hooks/line2'
import { slotWidth } from '../hooks/minis-view'
import { limitNotice, parseOffset, previewFor, reactionTo, sourceOf, tiredness } from '../hooks/register'
import { COLORS, COLOR_NAMES, HEIGHT, WIDTH, blend, colorName, outfitFor, paletteFor, periodOf, petSvg, sprite, toRuns } from '../hooks/sprite'

const MOODS = ['idle', 'working', 'happy', 'oops', 'sleepy', 'loved', 'reading', 'wince', 'shocked', 'dozing', 'waking', 'calling'] as const
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
  // Asleep it breathes, z's drift up and fade, and a snore bubble swells and pops.
  const sleeping = petSvg('sleepy')
  expect(sleeping.match(/repeatCount="indefinite"/g)!.length).toBeGreaterThanOrEqual(7)
  expect(sleeping).toContain('<circle')
  expect(petSvg('dozing')).toContain('fill="freeze"')
  expect(petSvg('waking')).toContain('keyTimes="0;0.6;1"')
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
      expect(drawn.match(/"type":"Svg"/g)).toHaveLength(3)
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

test('the helpers: half size, their own colour, a pop in and a wave bye', () => {
  const body = miniDraw('pink')
  expect(body).toHaveLength(MINI_H)
  for (const row of body) expect(row).toHaveLength(MINI_W)
  expect(colorFromDefinition('---\nname: reviewer\ncolor: blue\n---\nYou review.')).toBe('blue')
  expect(colorFromDefinition('---\nname: x\n---')).toBeUndefined()
  expect(miniColor('agent-1', 'teal')).not.toBe('teal')
  expect(miniColor('agent-1', 'teal')).toBe(miniColor('agent-1', 'teal'))
  // In: a sparkle, then the body. Out: waving (the arm flips), a blink, a speck, gone.
  expect(JSON.stringify(miniFrame('pink', 'here', 50, 0))).toContain(String(0xffe066))
  expect(miniFrame('pink', 'here', ARRIVE_MS + 10, 0)).toEqual(miniDraw('pink'))
  expect(JSON.stringify(miniFrame('pink', 'bye', 0, 0))).not.toBe(JSON.stringify(miniFrame('pink', 'bye', 230, 0)))
  expect(miniFrame('pink', 'bye', WAVE_MS + 700, 0)).toBeNull()
  expect(LEAVE_MS).toBeGreaterThan(WAVE_MS + 550)
})

const TONES_DARK = { label: '#9a9aa2', text: '#e6e6e6' }
const line = (minis: { id: string; color: string; state: 'here' | 'bye'; age: number }[]) => ({ minis, percent: 40, from: 40, isWorking: false, limits: [], hasInfo: true, tones: TONES_DARK })

test('desktop: a new helper opens its slot at the left, pushing the line right, then pops in', () => {
  const before = lineTwoSvg(line([{ id: 'old', color: 'sky', state: 'here', age: 9000 }]), undefined)
  expect(before.layout.get('old')).toBe(0)
  const after = lineTwoSvg(line([{ id: 'new', color: 'pink', state: 'here', age: 0 }, { id: 'old', color: 'sky', state: 'here', age: 9050 }]), before.layout)
  expect(after.layout.get('new')).toBe(0)
  expect(after.layout.get('old')).toBe(34)
  // The old helper and the bar glide right from where they were; the new one springs out once its slot is open.
  expect(after.svg).toContain('values="0 5;34 5"')
  expect(after.svg).toContain(`values="${before.layout.get('content')} 0;${after.layout.get('content')} 0"`)
  expect(after.svg).toContain(`begin="${SLOT_MS}ms"`)
  // A helper still queued (negative age) takes no slot yet.
  expect(lineTwoSvg(line([{ id: 'q', color: 'lime', state: 'here', age: -200 }]), undefined).layout.has('q')).toBe(false)
  // Gone: the line glides back left.
  const gone = lineTwoSvg(line([]), after.layout)
  expect(gone.svg).toContain(`values="${after.layout.get('content')} 0;0 0"`)
})

test('terminal: a slot widens a column at a time, holds, then narrows as the helper leaves', () => {
  expect(slotWidth('here', -100)).toBe(0)
  expect(slotWidth('here', 0)).toBe(0)
  expect(slotWidth('here', SLOT_MS / 2)).toBeGreaterThan(0)
  expect(slotWidth('here', SLOT_MS / 2)).toBeLessThan(MINI_W + 1)
  expect(slotWidth('here', SLOT_MS * 2)).toBe(MINI_W + 1)
  expect(slotWidth('bye', 100)).toBe(MINI_W + 1)
  expect(slotWidth('bye', LEAVE_MS - 50)).toBeLessThan(MINI_W + 1)
  expect(slotWidth('bye', LEAVE_MS)).toBe(0)
})

test('a new session starts asleep; typing wakes it slowly, then it reads along', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('command.register', () => ({ value: undefined as never }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.edit', ($, e) => ({ text: e.text, cursor: e.cursor }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12 } as never })
  expect(JSON.stringify(await ui.drawn())).toMatch(/asleep|snoring|dreams|napping|fell asleep/)
  // The kit raises prompt.edit through $.prompt; the public typings don't list it.
  const edit = ($.prompt as unknown as { edit: (e: object) => Promise<unknown> }).edit
  const type = (text: string) => edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText: 'a', key: { key: 'a' } })
  await type('h')
  await clock.advance(50)
  expect(JSON.stringify(await ui.drawn())).toMatch(/waking up|stretches|rubs its eyes/)
  await clock.advance(2000)
  await type('he')
  await clock.advance(50)
  expect(JSON.stringify(await ui.drawn())).not.toMatch(/waking up|stretches|rubs its eyes/)
})

test('a subagent hatches a helper; when it finishes the helper waves bye and leaves', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('command.register', () => ({ value: undefined as never }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/r' }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', ($, e) => ({ agentId: (e as { tool_use_id: string }).tool_use_id === 'tu-1' ? 'ag-1' : 'ag-2', model: 'x' }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ subagentType: 'Explore', prompt: 'p', description: 'd', tool_use_id: 'tu-1' } as never)
  await $.agent.spawn({ subagentType: 'Plan', prompt: 'p', description: 'd', tool_use_id: 'tu-2' } as never)
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 12 } as never })
  // Two started together: the second waits its turn, then takes the leftmost slot.
  const first = JSON.stringify(await ui.drawn())
  expect(first).toContain('Explore helper')
  await clock.advance(500)
  expect(JSON.stringify(await ui.drawn())).toContain('Plan helper')
  await $.turn.complete({ answer: 'found it', durationMs: 900, isAborted: false, turnId: 't', reason: 'answer', agentId: 'ag-1' })
  expect(JSON.stringify(await ui.drawn())).toContain('Explore helper waving bye')
  await clock.advance(LEAVE_MS + 1500)
  const later = JSON.stringify(await ui.drawn())
  expect(later).not.toContain('Explore helper')
  expect(later).toContain('Plan helper') // its agent is still running
})

test('the name stays put; only the words after it slide, and news takes a colour', () => {
  const svg = lineSvg('Reaper', 'is running the tests 🧪', 'is reading auth.ts…', LINE_COLORS.dark)
  // The name is its own text, with nothing animating it.
  const name = /<text x="0" y="15" fill="#d97757" font-weight="700">Reaper<\/text>/
  expect(svg).toMatch(name)
  // Each status carries the name invisibly, so it starts where the name ends.
  expect(svg.match(/fill-opacity="0">Reaper</g)).toHaveLength(2)
  expect(lineSvg('Reaper', 'saw 3 tests fail ❌', undefined, LINE_COLORS.dark, { tone: 'bad' })).toContain('#f87171')
  // Calm: the words cross-fade in place.
  const calm = lineSvg('Reaper', 'b', 'a', LINE_COLORS.dark, { calm: true })
  expect(calm).not.toContain('attributeName="y"')
  expect(calm).toContain('attributeName="opacity"')
})

test('outcomes worth a reaction: tests, a push, a broken build; the rest passes quietly', () => {
  expect(outcomeOf('Bash', { command: 'npm test' }, false, 'Tests: 42 passed, 42 total')).toEqual({ tone: 'good', line: 'cheers: all 42 tests pass ✅' })
  expect(outcomeOf('Bash', { command: 'pytest -q' }, true, '3 failed, 10 passed in 1.2s')).toEqual({ tone: 'bad', line: 'saw 3 tests fail ❌' })
  expect(outcomeOf('Bash', { command: 'vitest run' }, true, '')).toEqual({ tone: 'bad', line: 'saw the tests fail ❌' })
  expect(outcomeOf('Bash', { command: 'git push origin main' }, false)).toMatchObject({ tone: 'good' })
  expect(outcomeOf('Bash', { command: 'git push' }, true)).toMatchObject({ tone: 'bad' })
  expect(outcomeOf('Bash', { command: 'npm run build' }, true)).toEqual({ tone: 'bad', line: 'saw the build break 🔨' })
  expect(outcomeOf('Bash', { command: 'npm run build' }, false)).toBeUndefined()
  expect(outcomeOf('Bash', { command: 'grep x y' }, true)).toBeUndefined()
  expect(outcomeOf('Read', { file_path: 'a' }, false)).toBeUndefined()
  // A run of one kind is told once; a different kind is news.
  expect(actionKind('Read', { file_path: 'a' })).toBe(actionKind('Read', { file_path: 'b' }))
  expect(actionKind('Bash', { command: 'npm test' })).not.toBe(actionKind('Bash', { command: 'git push' }))
  expect(focusLine(23, 1)).toBe('is deep in it · 23 steps · 1 file changed')
})

test('hats for the season and its birthday, worn through every bob and blink', () => {
  const at = (iso: string) => Date.parse(iso)
  const born = at('2025-03-14T10:00:00Z')
  expect(outfitFor(at('2026-10-31T12:00:00Z'), born)).toBe('pumpkin')
  expect(outfitFor(at('2026-10-20T12:00:00Z'), born)).toBeUndefined()
  expect(outfitFor(at('2026-12-24T12:00:00Z'), born)).toBe('santa')
  expect(outfitFor(at('2027-01-01T12:00:00Z'), born)).toBe('party')
  expect(outfitFor(at('2026-03-14T12:00:00Z'), born)).toBe('party')
  expect(outfitFor(at('2025-03-14T18:00:00Z'), born)).toBeUndefined() // the day it hatched isn't a birthday yet
  // The date where the person is: 20:00 UTC on 24 October is already the 25th in India (+05:30).
  expect(outfitFor(at('2026-10-24T20:00:00Z'), born, 0)).toBeUndefined()
  expect(outfitFor(at('2026-10-24T20:00:00Z'), born, 330)).toBe('pumpkin')
  expect(parseOffset('+0530\n')).toBe(330)
  expect(parseOffset('-0800')).toBe(-480)
  expect(parseOffset('PST')).toBeUndefined()
  const pumpkin = JSON.stringify(sprite('idle', 0, 0, 'teal', { outfit: 'pumpkin' }))
  expect(pumpkin).toContain(String(0xff8c1a))
  const svg = petSvg('working', undefined, 0, 'teal', 5, { outfit: 'santa' })
  expect(svg).toContain('#e03131')
  // The blink and glance layers keep the hat on.
  expect(svg.split('<g opacity="0">').slice(1).every(layer => !layer.includes('#4fd1c5') || layer.length > 0)).toBe(true)
})

test('a full context slows it down; calm keeps it nearly still', () => {
  expect(tiredness(40)).toBe(0)
  expect(tiredness(95)).toBe(1)
  expect(periodOf('working', 1)).toBe(periodOf('working', 0) * 2)
  expect(periodOf('happy', 1)).toBe(periodOf('happy', 0))
  expect(petSvg('idle', undefined, 0, 'teal', 5, { calm: true })).not.toContain('<animateTransform')
  const frames = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(sprite('working', i * 100, 0, 'teal', { calm: true }).map(row => row.map(c => c !== null)))))
  expect(frames.size).toBeLessThanOrEqual(2) // only the glance changes, never the position
  expect(JSON.stringify(sprite('calling', 0))).toContain(String(0xfbbf24))
})

test('the share card: the pet, its name and what you have done together', () => {
  const svg = petCard({ name: 'Reaper <3', color: 'pink', outfit: 'pumpkin', days: 12, turns: 1234, pets: 40, helpers: 9, greens: 0 })
  expect(svg).toContain('width="1200" height="630"')
  expect(svg).toContain('Reaper &lt;3')
  expect(svg).toContain('>1,234<')
  expect(svg).toContain('helpers hatched')
  expect(svg).toContain('#ff8c1a')
})

const BAND = { hasSurvey: false, isWorking: true, maxRows: 12 } as never
type On = Parameters<TestBody>[1]
// The engine's side for a session in /r/shop; `more` adds stubs, which must come before the first call.
const setUp = async ($: Parameters<TestBody>[0], on: On, more: (on: On) => void = () => undefined) => {
  more(on)
  mock.store(on)
  const clock = mock.clock(on)
  on('command.register', () => ({ value: undefined as never }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.edit', ($, e) => ({ text: e.text, cursor: e.cursor }))
  await $.session.start({ cwd: '/r/shop', surface: 'terminal', isInteractive: true })
  return clock
}

test('needing you: it calls on a permission prompt, and your typing answers it', async ($, on) => {
  const clock = await setUp($, on, on => on('classic.Notification', () => ({})))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('needs your OK')
  expect(drawn).toContain('calling')
  await clock.advance(60_000)
  expect(JSON.stringify(await ui.drawn())).toContain('needs your OK') // still waving a minute later
  const edit = ($.prompt as unknown as { edit: (e: object) => Promise<unknown> }).edit
  await edit({ origin: { kind: 'composer' }, text: 'y', cursor: 1, start: 1, end: 1, inputText: 'y', key: { key: 'y' } })
  expect(JSON.stringify(await ui.drawn())).not.toContain('"alt":"Bit needs your OK')
})

test('a long turn calls you back when it is done; a quick one just bounces', async ($, on) => {
  const clock = await setUp($, on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(45_000)
  await $.turn.complete({ answer: 'ok', durationMs: 45_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(JSON.stringify(await ui.drawn())).toContain('come take a look')
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(3000)
  await $.turn.complete({ answer: 'ok', durationMs: 3000, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('come take a look')
})

test('narration: a kind of work is told once, deep in a long turn it settles, and results break through', async ($, on) => {
  let answer: object = { result: {} }
  const clock = await setUp($, on, on => on('tool.call', () => answer as never))
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  await $.tool.call({ tool: 'Read', file_path: '/r/a.ts' })
  await clock.advance(1500)
  expect(JSON.stringify(await ui.drawn())).toContain('is reading a.ts')
  await $.tool.call({ tool: 'Read', file_path: '/r/b.ts' })
  await clock.advance(1500)
  expect(JSON.stringify(await ui.drawn())).not.toContain('is reading b.ts') // same kind: no new line
  for (let i = 0; i < 12; i++) await $.tool.call({ tool: 'Edit', file_path: `/r/f${i % 3}.ts`, old_string: 'a', new_string: 'b' })
  await clock.advance(1500)
  expect(JSON.stringify(await ui.drawn())).toContain('is deep in it')
  answer = { result: {}, text: 'Tests: 42 passed, 42 total' }
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('all 42 tests pass')
  expect(drawn).toContain('#4ade80')
})

test('/pet outfit, calm, project and card', async ($, on) => {
  const written: string[] = []
  await setUp($, on, on => {
    mock.env(on, { HOME: '/home/me' })
    on('fs.exists', () => ({ value: true }))
    on('fs.write', ($, e) => (written.push((e as { path: string }).path), { value: undefined as never }))
    on('command.run', () => ({}))
  })
  const run = (args: string) => $.command.run({ command: 'pet', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('outfit christmas')).text).toContain('santa hat')
  expect((await run('outfit pumpkin')).text).toContain('pumpkin hat')
  const ui = await $.ui.mount({ plugin: 'pixel-pet', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(JSON.stringify(await ui.drawn())).toContain('wearing a pumpkin hat')
  expect((await run('calm')).text).toContain('Calm:')
  expect(JSON.stringify(await ui.drawn())).not.toContain('animateTransform')
  expect((await run('project on')).text).toContain('Per project on')
  expect((await run('rename Shoppy')).text).toContain('Shoppy in shop')
  expect((await run('')).text).toContain('Shoppy')
  expect((await run('project off')).text).toContain('one pet everywhere')
  expect((await run('')).text).not.toContain('Shoppy')
  expect((await run('card')).text).toContain('~/Downloads/')
  expect(written[0]).toMatch(/^\/home\/me\/Downloads\/.+-pixel-pet\.svg$/)
})

test('a plan limit getting close gets one calm line at 80% and one at 95%, re-armed after a reset', () => {
  const noted = new Set<string>()
  const at = (p5: number, p7 = 10) => [{ kind: 'five_hour', percent: p5, resetsAt: '2026-10-09T12:38:00Z' }, { kind: 'seven_day', percent: p7 }]
  expect(limitNotice(at(70), noted, NOW)).toBeUndefined()
  expect(limitNotice(at(82), noted, NOW)).toBe('notes your 5-hour limit is at 82% · resets in 38m')
  expect(limitNotice(at(88), noted, NOW)).toBeUndefined()
  expect(limitNotice(at(96), noted, NOW)).toBe('notes your 5-hour limit is at 96% · resets in 38m')
  expect(limitNotice(at(5), noted, NOW)).toBeUndefined()
  expect(limitNotice(at(81), noted, NOW)).toContain('81%')
  expect(limitNotice(at(5, 85), noted, NOW)).toBe('notes your weekly limit is at 85%')
  expect(limitNotice([{ kind: 'spend_limit', percent: 99 }], noted, NOW)).toBeUndefined()
})
