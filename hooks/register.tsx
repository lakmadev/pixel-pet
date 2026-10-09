import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { ContextMeter, Mini, Mood, PetView } from '../types'
import { TONES, cardLines, hex, segments } from './meter'
import type { Source } from './meter'
import type { MeterViewProps } from './meter-view'
import type { PetViewProps } from './pet-view'
import { COLOR_NAMES, COLORS, DEFAULT_COLOR, colorName, petSvg } from './sprite'
import { LINE_COLORS, actionLine, lineSvg, lineWidth } from './status'
import { LEAVE_MS, colorFromDefinition, miniColor } from './mini'
import { lineTwoSvg } from './line2'
import type { Layout } from './line2'
import type { MinisViewProps } from './minis-view'
import type { StatusViewProps } from './status-view'

// `xp` is a leftover field from when the pet had levels; old records keep it, nothing reads it.
type Pet = { name: string; born: number; turns: number; pets: number; color?: string; xp?: number }

const LINES: Record<Mood, string[]> = {
  idle: ['is waiting for you', 'is vibing', 'is counting pixels', 'is guarding your repo', 'is humming quietly'],
  working: ['is typing furiously…', 'is reading your code…', 'is thinking very hard…', 'is chasing a bug…', 'is consulting the docs…'],
  happy: ['did a happy dance!', 'is proud of you!', 'says: ship it!', 'high-fives the terminal!'],
  oops: ["saw an error. it's fine. everything's fine.", 'is sweating nervously', "says: that wasn't supposed to happen"],
  sleepy: ['is fast asleep… zzz', 'is snoring softly', 'dreams of green tests', 'is napping on your keyboard'],
  dozing: ['is getting sleepy…', 'yawns…', 'is fighting to stay awake'],
  waking: ['is waking up… ☀️', 'stretches and yawns', 'rubs its eyes'],
  loved: ['loves you back ♥', 'purrs in binary', 'is blushing in pixels'],
  reading: ['is reading along…', 'is peeking at what you type 👀', 'is following every keystroke', 'is taking notes'],
  wince: ['winces at the typo', 'pretends not to see that', 'says: backspace, backspace'],
  shocked: ['gasps: where did it all go?!', 'is shocked by the delete', 'clutches its pixels'],
}

const pick = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)]!
const SLEEP_AFTER_MS = 60_000
const METER_CELLS = 14

// The configured colour, used until /pet color picks one; and the one being tried on while typing it.
let defaultColor = DEFAULT_COLOR
let previewColor: string | undefined
let meter: ContextMeter = {}
// The helpers on screen, one per running subagent, and which agent each stands for.
let minis: Mini[] = []
// Helpers that start together arrive one by one, this far apart.
const HATCH_GAP_MS = 450
let lastHatchAt = 0
// Where the desktop's second line last put each helper and the bar, to glide from.
let lineTwoLayout: Layout | undefined
const miniOf = new Map<string, string>()

export function viewOf(pet: Pet, mood: Mood, line: string, isHidden: boolean): PetView {
  return { mood, line, name: pet.name, color: previewColor ?? colorName(pet.color) ?? defaultColor, isHidden, meter, minis }
}

const view = atom({ plugin: 'pixel-pet', key: 'view' } as const, viewOf({ name: 'Bit', born: 0, turns: 0, pets: 0 }, 'sleepy', 'is fast asleep… zzz', false))

// Module state between hooks; the pet's record is rebuilt from the store on reload.
let pet: Pet = { name: 'Bit', born: 0, turns: 0, pets: 0 }
// A new session finds the pet asleep; the first keystroke wakes it.
let mood: Mood = 'sleepy'
let moodUntil = 0
let isWorking = false
let lastActive = 0
// Where the eyes point while reading along (-1 left … 1 right), and what the band last said.
let look = 0
let lastLine = ''
// What the desktop last drew, so a change of mood or colour fades from it and the meter glides.
let shown: { mood: Mood; color: string } | undefined
let fadeFrom: { mood: Mood; color: string; at: number } | undefined
let drawnPercent = 0
let shownLine: string | undefined
let slideFrom: { line: string; at: number } | undefined
// The desktop draws its line as SVG text, which can't follow the theme by itself.
let theme: 'dark' | 'light' = 'dark'
// Who bills the tokens when no plan limits come back: the API, or a cloud provider.
let provider: Source = 'api'
// A line stays up at least this long, so a burst of tool calls reads as a story, not a flicker.
const HOLD_MS = 900
let lineShownAt = 0
let pendingLine: string | undefined
let isLineQueued = false

function baseMood(now: number): Mood {
  if (isWorking) return 'working'
  return now - lastActive > SLEEP_AFTER_MS ? 'sleepy' : 'idle'
}

async function setMood($: EngineInterface, next: Mood, forMs = 0) {
  const now = await $.clock.now()
  moodUntil = forMs ? now + forMs : 0
  if (next === mood && !forMs) return
  mood = next
  lineShownAt = now
  const line = next === 'working' ? 'is thinking… 💭' : next === 'idle' && (meter.percent ?? 0) >= 80 ? `is stuffed with tokens (${meter.percent}% context)` : pick(LINES[next])
  await update($, view, current => viewOf(pet, next, line, current.isHidden))
}

type Reading = { context: { percent?: number; tokens?: number; window: number }; cost?: { usd: number }; rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[] }

// Plan windows (5-hour, weekly) only come back on a Claude subscription; a gateway reports a spend
// limit; with neither, once a reply has come back, the tokens are billed by the API or the provider.
export function sourceOf(reading: Reading, fallback: Source): Source | undefined {
  if (reading.rateLimits.some(r => r.kind === 'five_hour' || r.kind.startsWith('seven_day'))) return 'plan'
  if (reading.rateLimits.some(r => r.kind === 'spend_limit')) return 'gateway'
  return reading.context.percent !== undefined ? fallback : undefined
}

async function setMeter($: EngineInterface, reading: Reading) {
  const limits = reading.rateLimits.map(r => (r.resetsAt ? { kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt } : { kind: r.kind, percent: r.percentUsed }))
  const source = sourceOf(reading, provider) ?? meter.source
  const next: ContextMeter = {}
  const percent = reading.context.percent ?? meter.percent
  const tokens = reading.context.tokens ?? meter.tokens
  const usd = reading.cost?.usd ?? meter.usd
  if (percent !== undefined) next.percent = percent
  if (tokens !== undefined) next.tokens = tokens
  if (reading.context.window || meter.window) next.window = reading.context.window || meter.window!
  if (usd !== undefined) next.usd = usd
  if (limits.length || meter.limits) next.limits = limits.length ? limits : meter.limits!
  if (source) next.source = source
  meter = next
  await update($, view, current => ({ ...current, meter }))
}

// Show a working line, holding the current one for HOLD_MS first; only the latest waiting line
// is kept, so a burst of calls skips straight to what's happening now.
async function say($: EngineInterface, line: string) {
  const now = await $.clock.now()
  const wait = HOLD_MS - (now - lineShownAt)
  if (wait > 0) {
    pendingLine = line
    if (!isLineQueued) {
      isLineQueued = true
      $.clock.after(wait, () => {
        isLineQueued = false
        const queued = pendingLine
        pendingLine = undefined
        if (queued && isWorking) say($, queued).catch(() => undefined)
      })
    }
    return
  }
  lineShownAt = now
  lastLine = line
  await update($, view, current => (current.line === line ? current : { ...current, line }))
}

// React first, save after: the blush shouldn't wait on a disk write.
async function petIt($: EngineInterface) {
  pet = { ...pet, pets: pet.pets + 1 }
  await setMood($, 'loved', 4000)
  await $.store.set('pet', pet)
}

const COLOR_COMMAND = /^\s*\/pet\s+colou?r\s+(\S*)$/i

// While the draft reads `/pet color <partial>`, the colour to try on: the exact name, else the
// first that starts with what's typed.
export function previewFor(draft: string): string | undefined {
  const partial = COLOR_COMMAND.exec(draft)?.[1]?.toLowerCase()
  if (!partial) return undefined
  return colorName(partial) ?? COLOR_NAMES.find(name => name.startsWith(partial))
}

const afterEdit = (e: { text: string; start: number; end: number; inputText: string }) => e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)

async function preview($: EngineInterface, color: string | undefined) {
  if (color === previewColor) return
  previewColor = color
  const line = color ? `is trying on ${color}… press Enter to keep it` : pick(LINES.idle)
  await update($, view, current => viewOf(pet, current.mood, line, current.isHidden))
}

const CODEY = /[{}();=<>[\]`]|=>|\b(function|const|def|class|import|return)\b/

// How the pet reacts to one edit of the draft: what changed, where the caret is, and what the draft says.
export function reactionTo(e: { text: string; cursor: number; start: number; end: number; inputText: string; key?: unknown }) {
  const removed = e.end - e.start
  const draft = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
  const caret = e.start + e.inputText.length
  // The eyes sweep left to right across each 30 characters, like reading a line.
  const look = Math.round(((caret % 30) / 30) * 2 - 1)
  if (removed >= 10 || (removed > 0 && draft.trim() === '')) return { mood: 'shocked' as const, look, line: undefined }
  if (removed > 0) return { mood: 'wince' as const, look, line: undefined }
  if (e.inputText.length > 40 && e.key === undefined) return { mood: 'shocked' as const, look, line: "whoa, that's a lot of text" }
  if (e.inputText === '') return undefined // a bare caret move
  const lastWords = draft.slice(-24).toLowerCase()
  if (/\b(please|thanks|thank you|ty)\s?$/.test(lastWords)) return { mood: 'loved' as const, look, line: 'appreciates your manners ♥' }
  if (/\bbug\s?$/.test(lastWords)) return { mood: 'reading' as const, look, line: 'spots the bug 👀' }
  return { mood: 'reading' as const, look, line: CODEY.test(draft) ? 'is reading your code…' : undefined }
}

// Typing moods hold while the keys keep coming and fade ~2s after the last one. Only a change of
// mood, gaze or words touches the band, so a run of keystrokes costs a handful of redraws.
async function react($: EngineInterface, reaction: NonNullable<ReturnType<typeof reactionTo>>) {
  const now = await $.clock.now()
  lastActive = now
  // Asleep or nodding off, the first keys wake it gently; reactions resume once it's up.
  if (mood === 'sleepy' || mood === 'dozing') return wake($)
  if (mood === 'waking' && now < moodUntil) return
  moodUntil = now + 2000
  const isSame = mood === reaction.mood && look === reaction.look && (reaction.line === undefined || reaction.line === lastLine)
  look = reaction.look
  if (isSame) return
  const isNewMood = mood !== reaction.mood
  mood = reaction.mood
  if (reaction.line !== undefined || isNewMood) lastLine = reaction.line ?? pick(LINES[reaction.mood])
  await update($, view, current => viewOf(pet, reaction.mood, lastLine, current.isHidden))
}

const WAKE_MS = 1600
const DOZE_MS = 2800

// Blinks, a yawn and a little rise, then on with whatever comes next.
async function wake($: EngineInterface) {
  if (mood === 'waking') return
  await setMood($, 'waking', WAKE_MS)
}

// A passing mood (happy, oops, loved, waking) wears off; a long quiet nods off into sleep, through a
// few heavy-lidded seconds of dozing. The motion itself runs on the surface's clock or in the SVG.
async function checkMood($: EngineInterface) {
  const now = await $.clock.now()
  if (moodUntil && now > moodUntil) {
    const next = baseMood(now)
    // Drifting off from an awake mood goes through dozing first.
    if (next === 'sleepy' && mood !== 'dozing') await setMood($, 'dozing', DOZE_MS)
    else await setMood($, next)
  } else if (mood === 'idle' && baseMood(now) === 'sleepy') await setMood($, 'dozing', DOZE_MS)
  await tendMinis($, now)
}

// Helpers whose agents have finished wave bye; ones that have waved long enough leave.
async function tendMinis($: EngineInterface, now: number) {
  if (minis.length === 0) return
  const here = minis.filter(m => m.state === 'here' && now - m.at > 3000)
  if (here.length) {
    const agents = await $.agent.list().catch(() => [])
    const finished = new Set(agents.filter(a => ['completed', 'failed', 'killed'].includes(a.status)).map(a => a.id))
    for (const [agentId, miniId] of miniOf) if (finished.has(agentId)) await sayBye($, miniId)
  }
  const kept = minis.filter(m => m.state === 'here' || now - m.at < LEAVE_MS)
  if (kept.length !== minis.length) {
    minis = kept
    await update($, view, current => ({ ...current, minis }))
  }
}

async function hatch($: EngineInterface, id: string, type: string) {
  const name = type.split(':').pop() ?? type
  const color = (await definedColor($, name)) ?? miniColor(id, colorName(pet.color) ?? defaultColor)
  const now = await $.clock.now()
  const at = Math.max(now, lastHatchAt + HATCH_GAP_MS)
  lastHatchAt = at
  minis = [...minis.filter(m => m.id !== id), { id, name, color, state: 'here' as const, at }].slice(-6)
  await update($, view, current => ({ ...current, minis }))
  // A queued helper's turn: draw again when it's due, so its slot starts opening on time.
  if (at > now) $.clock.after(at - now, () => void update($, view, current => ({ ...current, minis })).catch(() => undefined))
}

async function sayBye($: EngineInterface, id: string) {
  const mini = minis.find(m => m.id === id)
  if (!mini || mini.state === 'bye') return
  const now = await $.clock.now()
  minis = minis.map(m => (m.id === id ? { ...m, state: 'bye' as const, at: now } : m))
  await update($, view, current => ({ ...current, minis }))
  if (isWorking) say($, `${mini.name} is back with answers 👋`).catch(() => undefined)
}

// A custom agent may name its colour in its definition (`color: blue`): the project's, then the person's.
async function definedColor($: EngineInterface, name: string): Promise<string | undefined> {
  if (!/^[\w-]+$/.test(name)) return undefined
  const home = await $.env.get('HOME').catch(() => undefined)
  const cwd = await $.session.cwd().catch(() => undefined)
  for (const dir of [cwd && `${cwd}/.claude/agents`, home && `${home}/.claude/agents`]) {
    if (!dir) continue
    const text = await $.fs.read(`${dir}/${name}.md`).catch(() => undefined)
    const color = text ? colorFromDefinition(text) : undefined
    if (color) return color
  }
  return undefined
}

export const register: Register = (on, options) => {
  defaultColor = colorName(String(options.color)) ?? DEFAULT_COLOR

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pet', description: 'Your pixel pet: stats, or show / hide / rename <name> / color <name>', argumentHint: '[show|hide|rename <name>|color <name>]' })
    const now = await $.clock.now()
    const saved = (await $.store.get('pet')) as Pet | undefined
    pet = saved ?? { name: String(options.name ?? 'Bit'), born: now, turns: 0, pets: 0 }
    if (!saved) await $.store.set('pet', pet)
    lastActive = now
    // Which provider bills the tokens, from the switches Claude Code reads (never a key).
    if (await $.env.get('CLAUDE_CODE_USE_BEDROCK').catch(() => undefined)) provider = 'bedrock'
    else if (await $.env.get('CLAUDE_CODE_USE_VERTEX').catch(() => undefined)) provider = 'vertex'
    else if (await $.env.get('CLAUDE_CODE_USE_FOUNDRY').catch(() => undefined)) provider = 'foundry'
    const themeRow = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')
    theme = /light/i.test(String(themeRow?.value ?? '')) ? 'light' : 'dark'
    const usage = await $.session.usage().catch(() => undefined)
    if (usage) await setMeter($, usage)
    mood = 'sleepy'
    await update($, view, current => viewOf(pet, 'sleepy', saved ? pick(LINES.sleepy) : 'just hatched and fell asleep… type to wake it', current.isHidden))
    $.clock.every(1000, () => void checkMood($).catch(() => undefined))
    return next(e)
  })

  // Keystrokes in the prompt box: answer at once, react off the typing path.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    // Typing `/pet color …` tries the colour on; anything else reacts to the typing.
    const color = previewFor(afterEdit(e))
    if (color || previewColor) preview($, color).catch(() => undefined)
    else {
      const reaction = reactionTo(e)
      if (reaction) react($, reaction).catch(() => undefined)
    }
    return box
  })

  // The colour names as typeahead rows while the colour word is being typed, each with its swatch.
  on('prompt.autocomplete', async ($, e, next) => {
    const offered = await next(e)
    if (!COLOR_COMMAND.test(e.text.slice(0, e.cursor))) return offered
    const partial = e.token.toLowerCase()
    const rows = COLOR_NAMES.filter(name => name.startsWith(partial)).map(name => ({ text: name, description: hex(COLORS[name]!.body) }))
    return { suggestions: [...offered.suggestions, ...rows] }
  })

  // A click on the sprite (terminal) or on the layer over it (desktop) pets it.
  on('ui.message', async ($, e, next) => {
    if ((e.element === 'pet' || e.element === 'pet-hit') && (e.data as { pet?: boolean } | null)?.pet) petIt($).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    lastActive = await $.clock.now()
    look = 0
    if (mood === 'sleepy' || mood === 'dozing') await wake($)
    else if (mood === 'reading' || mood === 'wince' || mood === 'shocked') await setMood($, 'idle')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    lastActive = await $.clock.now()
    // Asleep, it wakes first; once up, the waking mood wears off into working.
    if (mood === 'sleepy' || mood === 'dozing') await wake($)
    else if (!moodUntil) await setMood($, 'working')
    return next(e)
  })

  // A sentence for each kind of action as it starts; the pet keeps its working mood.
  // Each subagent hatches a little helper beside the pet, in its own colour; it waves bye when done.
  on('agent.spawn', async ($, e, next) => {
    if (!e.parentAgentId) say($, `sent ${e.subagentType.split(':').pop()} off on a side quest 🧭`).catch(() => undefined)
    await hatch($, e.tool_use_id, e.subagentType).catch(() => undefined)
    const started = await next(e)
    if (started.deny !== undefined || !started.agentId) await sayBye($, e.tool_use_id).catch(() => undefined)
    else miniOf.set(started.agentId, e.tool_use_id)
    return started
  })

  on('session.compact', async ($, e, next) => {
    say($, 'is tidying its memory 🧹').catch(() => undefined)
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (/permission/i.test(e.notification_type)) say($, 'is waiting for your OK ✋').catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) {
      const miniId = miniOf.get(e.agentId)
      if (miniId) await sayBye($, miniId).catch(() => undefined)
      return done
    }
    isWorking = false
    lastActive = await $.clock.now()
    if (e.isAborted) {
      await setMood($, 'idle')
      return done
    }
    pet = { ...pet, turns: pet.turns + 1 }
    await $.store.set('pet', pet)
    await setMood($, 'happy', 6000)
    return done
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && isWorking) {
      const line = actionLine(String(e.tool), e as unknown as Record<string, unknown>)
      if (line) say($, line).catch(() => undefined)
    }
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true && e.agentId === undefined) await setMood($, 'oops', 5000)
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    await setMeter($, e)
    return measured
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'hide' || verb === 'show') {
      await update($, view, current => ({ ...current, isHidden: verb === 'hide' }))
      return { text: verb === 'hide' ? `${pet.name} is resting off-screen. /pet show brings it back.` : `${pet.name} is back!` }
    }
    if (verb === 'color' || verb === 'colour') {
      const choice = colorName(rest[0])
      if (!choice) {
        await preview($, undefined)
        return { text: `Colours: ${COLOR_NAMES.join(', ')}. Try /pet color pink.` }
      }
      previewColor = undefined
      pet = { ...pet, color: choice }
      await $.store.set('pet', pet)
      await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden))
      return { text: `${pet.name} is now ${choice}.` }
    }
    if (verb === 'rename' && rest.length) {
      pet = { ...pet, name: rest.join(' ').slice(0, 24) }
      await $.store.set('pet', pet)
      await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden))
      return { text: `Your pet is now called ${pet.name}.` }
    }
    const days = Math.max(0, Math.floor(((await $.clock.now()) - pet.born) / 86_400_000))
    return {
      text: [
        `${pet.name} · ${colorName(pet.color) ?? defaultColor}`,
        `${pet.turns} turns together · petted ${pet.pets} times · ${days} days old`,
        'Click it to pet it. /pet color <name> changes its colour, /pet rename <name> its name.',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (e.props.hasSurvey || current.isHidden || e.props.maxRows < 4) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const percent = current.meter.percent
    const parts = segments(current.meter, now)
    // The helpers' ages at this draw: each one's story (pop in, bob, wave, fade) runs from its age.
    // Newest first, so a new helper takes the leftmost slot and pushes the rest along; one still
    // queued has a negative age and no slot yet.
    const helpers = [...current.minis].sort((a, b) => b.at - a.at).map(m => ({ id: m.id, color: m.color, state: m.state, age: now - m.at }))
    // Point at the meter for the details the line leaves out: tokens, resets, how you're billed.
    // Hidden until hovered; it opens over the band, which clips it, so it stays within four rows.
    const card = cardLines(current.meter, now)
    const details = card.length > 0 && (
      <Box position="absolute" top={-2} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column" paddingX={1} backgroundColor={theme === 'light' ? '#f3f3f5' : '#2b2b30'}>
        {card.map(text => <Text wrap="truncate">{text}</Text>)}
      </Box>
    )
    const hint = card.length > 0 && <Text dimColor> ⓘ</Text>

    // The terminal draws pixels as half-block text on its grid and animates the line and the meter
    // there too; anywhere else text doesn't line up into pixels, so pet, line and meter are SVGs
    // with their motion built in.
    if (e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      const pet: PetViewProps = { mood: current.mood, look, color: current.color }
      const status: StatusViewProps = { name: current.name, line: current.line }
      const gauge: MeterViewProps = { ...(percent === undefined ? {} : { percent }), segments: parts, isWorking, width: METER_CELLS }
      return (
        <Box gap={2} alignItems="center">
          <Client key="pet" module="./pet-view.tsx" width={10} height={4} props={pet} />
          <Box flexDirection="column" justifyContent="center">
            <Client key="status" module="./status-view.tsx" props={status} />
            <Box key="meter-row" alignItems="flex-end">
              {helpers.length > 0 && <Client key="minis" module="./minis-view.tsx" props={{ minis: helpers, stamp: now } satisfies MinisViewProps} />}
              <Client key="meter" module="./meter-view.tsx" props={gauge} />
              {hint}
              {details}
            </Box>
          </Box>
        </Box>
      )
    }

    if (shown && (shown.mood !== current.mood || shown.color !== current.color)) fadeFrom = { ...shown, at: now }
    shown = { mood: current.mood, color: current.color }
    if (shownLine !== undefined && shownLine !== current.line) slideFrom = { line: shownLine, at: now }
    shownLine = current.line
    const from = drawnPercent
    if (percent !== undefined) drawnPercent = percent
    const { Svg } = $.ui.resolve(e)
    // An invisible layer over the sprite catches the click; the SVG itself can't.
    let hit: RenderChildren = null
    if (e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)
      hit = (
        <Box position="absolute" top={0} left={0}>
          <Client key="pet-hit" module="./hit.tsx" width={6} height={2} props={{ columns: 6, rows: 2 }} />
        </Box>
      )
    }
    const previous = slideFrom && now - slideFrom.at < 600 ? slideFrom.line : undefined
    // The second line, helpers and all, as one SVG that glides from where the last draw left it.
    const resets = parts.filter(p => p.text.startsWith(' resets')).map(p => p.text.trim()).join(' · ')
    const bill = parts.find(p => p.text.startsWith('$'))?.text
    const two = lineTwoSvg({
      minis: helpers,
      ...(percent === undefined ? {} : { percent }),
      from,
      isWorking,
      limits: current.meter.limits ?? [],
      ...(resets ? { resets } : {}),
      ...(bill ? { bill } : {}),
      hasInfo: card.length > 0,
      tones: { ...TONES[theme], text: LINE_COLORS[theme].text },
    }, lineTwoLayout)
    lineTwoLayout = two.layout
    const helpersAlt = current.minis.map(m => `${m.name} helper${m.state === 'bye' ? ' waving bye' : ''}`)
    return (
      <Box gap={2} alignItems="center">
        <Box>
          <Svg source={petSvg(current.mood, fadeFrom && now - fadeFrom.at < 500 ? fadeFrom : undefined, look, current.color)} alt={`${current.name}, a pixel pet, ${current.mood}`} width={50} height={40} />
          {hit}
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Svg source={lineSvg(current.name, current.line, previous, LINE_COLORS[theme])} alt={`${current.name} ${current.line}`} width={lineWidth(current.name, current.line, previous)} height={20} />
          <Box key="meter-row">
            <Svg source={two.svg} alt={[...helpersAlt, ...card].join('; ') || 'context meter'} width={two.width} height={26} />
            {details}
          </Box>
        </Box>
      </Box>
    )
  })
}
