import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { ContextMeter, Mini, Mood, PetView, Tone } from '../types'
import { petCard } from './card'
import { TONES, cardLines, hex, resetIn, segments } from './meter'
import type { Source } from './meter'
import type { MeterViewProps } from './meter-view'
import type { PetViewProps } from './pet-view'
import { COLOR_NAMES, COLORS, DEFAULT_COLOR, OUTFITS, colorName, localDate, outfitFor, petSvg } from './sprite'
import type { Outfit } from './sprite'
import { LINE_COLORS, actionKind, actionLine, focusLine, lineSvg, lineWidth, outcomeOf, toneColor } from './status'
import { LEAVE_MS, colorFromDefinition, miniColor } from './mini'
import { lineTwoSvg } from './line2'
import { HABITAT_HEIGHT, HABITAT_WIDTH, SCENES, TIMES_OF_DAY, habitatSvg, isScene, sceneFor } from './scene'
import type { Scene } from './scene'
import { HABITAT_COLUMNS, HABITAT_ROWS } from './pet-view'
import type { Layout } from './line2'
import type { MinisViewProps } from './minis-view'
import type { StatusViewProps } from './status-view'

// `xp` is a leftover field from when the pet had levels; old records keep it, nothing reads it.
type Pet = { name: string; born: number; turns: number; pets: number; color?: string; xp?: number; helpers?: number; greens?: number }
// Opt-ins, kept across sessions: smaller motion, break nudges, a chirp when it calls you, a name
// and colour per project, and which hat (auto: the one the date calls for).
type Prefs = { calm: boolean; breaks: boolean; sound: boolean; perProject: boolean; outfit: 'auto' | 'none' | Outfit; scene: 'auto' | 'none' | Scene }
type Project = { name?: string; color?: string }

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
  calling: ['wants your attention!', 'is waving at you 👋'],
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

let prefs: Prefs = { calm: false, breaks: false, sound: false, perProject: false, outfit: 'auto', scene: 'auto' }
// The session's project, and the names and colours given per project.
let cwd = ''
let projects: Record<string, Project> = {}
// The clock as of the last tick, for what the date decides (today's hat), and the person's UTC
// offset in minutes: asked of the system once (`date +%z`), since the sandbox's own time zone
// may not be theirs; JavaScript's guess until then, or where there's no `date`.
let today = 0
let utcOffsetMin = -new Date().getTimezoneOffset()

export function parseOffset(text: string): number | undefined {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : undefined
}

const project = () => (prefs.perProject ? projects[cwd] : undefined)
const nameNow = (pet: Pet) => project()?.name ?? pet.name
// Per project, a project with no colour of its own still gets a steady one, so windows tell apart.
const colorNow = (pet: Pet) => previewColor ?? (prefs.perProject ? colorName(project()?.color) ?? miniColor(cwd, '') : colorName(pet.color) ?? defaultColor)
// Until the clock is first read there's no date to dress for.
const outfitNow = (pet: Pet): Outfit | undefined => (prefs.outfit === 'auto' ? (today ? outfitFor(today, pet.born, utcOffsetMin) : undefined) : prefs.outfit === 'none' ? undefined : prefs.outfit)

// Its world: the one picked with /pet scene, or on auto the one the clock and the moment call
// for (a lava cave while it groans over failing tests).
const sceneNow = (mood: Mood, tone: Tone): Scene | 'none' => {
  if (prefs.scene !== 'auto') return prefs.scene
  if (!today) return 'meadow'
  const d = localDate(today, utcOffsetMin)
  return sceneFor(d.getUTCHours(), mood === 'oops' && tone === 'bad')
}

export function viewOf(pet: Pet, mood: Mood, line: string, isHidden: boolean, tone: Tone = 'plain'): PetView {
  return { mood, line, name: nameNow(pet), color: colorNow(pet), isHidden, meter, minis, tone, outfit: outfitNow(pet) ?? 'none', calm: prefs.calm, scene: sceneNow(mood, tone) }
}

const view = atom({ plugin: 'pixel-pet', key: 'view' } as const, viewOf({ name: 'Pip', born: 0, turns: 0, pets: 0 }, 'sleepy', 'is fast asleep… zzz', false))

// Module state between hooks; the pet's record is read back from the shared file on reload.
let pet: Pet = { name: 'Pip', born: 0, turns: 0, pets: 0 }

// A new pet hatches with one of these names, unless the `name` setting gives one.
const NAMES = ['Mochi', 'Pixel', 'Pip', 'Nibbles', 'Byte', 'Biscuit', 'Sprout', 'Dot', 'Pebble', 'Noodle', 'Bean', 'Comet']

// Everything the pet keeps (its record, your settings, the per-project names) lives in one file
// that every session and every installed copy shares, so it's the same pet everywhere. Each
// change re-reads the file first and applies itself to that, so two sessions counting at once
// don't undo each other. The plugin's own store keeps a copy too, for when there's no home folder.
type Kept = { pet: Pet; prefs: Prefs; projects: Record<string, Project> }
let keptPath: string | undefined
let lastSync = 0

async function readKept($: EngineInterface): Promise<Partial<Kept> | undefined> {
  if (!keptPath) return undefined
  const text = await $.fs.read(keptPath).catch(() => undefined)
  try {
    return text ? (JSON.parse(text) as Partial<Kept>) : undefined
  } catch {
    return undefined
  }
}

async function keep($: EngineInterface, change: (kept: Kept) => Kept) {
  const latest = await readKept($)
  const next = change({ pet: latest?.pet ?? pet, prefs: { ...prefs, ...latest?.prefs }, projects: latest?.projects ?? projects })
  pet = next.pet
  prefs = next.prefs
  projects = next.projects
  if (keptPath) await $.fs.write(keptPath, `${JSON.stringify(next, null, 2)}\n`).catch(() => undefined)
  await $.store.set('pet', pet)
  await $.store.set('prefs', prefs)
  await $.store.set('projects', projects)
}

// Picks up what another session changed (a rename, a colour, a setting) every few seconds.
async function sync($: EngineInterface, now: number) {
  if (!keptPath || now - lastSync < 10_000) return
  lastSync = now
  const kept = await readKept($)
  if (!kept?.pet) return
  const before = JSON.stringify([nameNow(pet), colorNow(pet), prefs])
  pet = kept.pet
  prefs = { ...prefs, ...kept.prefs }
  projects = kept.projects ?? projects
  if (JSON.stringify([nameNow(pet), colorNow(pet), prefs]) !== before) await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden, current.tone))
}
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
const HOLD_MS = 1200
let lineShownAt = 0
let pendingLine: string | undefined
let isLineQueued = false

// The turn in progress. Narration tells each new kind of work once (five reads in a row are one
// line), and once a turn runs long it settles into one quiet summary, refreshed now and then, so
// it never becomes a stream to tune out. What matters still breaks through at once: tests passing
// or failing, a push, a broken build, and anything that needs you.
const FOCUS_AFTER_STEPS = 12
const FOCUS_AFTER_MS = 40_000
const SUMMARY_EVERY_MS = 10_000
let turnAt = 0
let steps = 0
let lastKind: string | undefined
const touched = new Set<string>()
let lastSummaryAt = -Infinity

// Calling you: a turn that ran this long has finished, or Claude waits on you; it keeps waving
// until you're back (any key, a prompt) or this long has passed.
const LONG_TURN_MS = 30_000
const CALL_MS = 5 * 60_000

// Breaks (opt-in): a stretch after two hours with no ten-minute pause, then hourly; and once a
// night after midnight, a reminder to sleep.
const BREAK_AFTER_MS = 2 * 3600_000
const NUDGE_EVERY_MS = 3600_000
const PAUSE_MS = 10 * 60_000
let workStart = 0
let lastNudgeAt = 0
let nightNudgedOn = ''

function active(now: number) {
  if (!workStart || now - lastActive > PAUSE_MS) workStart = now
  lastActive = now
}

function baseMood(now: number): Mood {
  if (isWorking) return 'working'
  return now - lastActive > SLEEP_AFTER_MS ? 'sleepy' : 'idle'
}

async function setMood($: EngineInterface, next: Mood, forMs = 0, line?: string, tone: Tone = 'plain') {
  const now = await $.clock.now()
  moodUntil = forMs ? now + forMs : 0
  if (next === mood && !forMs && line === undefined) return
  mood = next
  lineShownAt = now
  lastLine = line ?? (next === 'working' ? 'is thinking… 💭' : next === 'idle' && (meter.percent ?? 0) >= 80 ? `is stuffed with tokens (${meter.percent}% context)` : pick(LINES[next]))
  await update($, view, current => viewOf(pet, next, lastLine, current.isHidden, tone))
}

// News that can't wait for the line's hold: shown at once, in its colour, with the mood that fits,
// and held a few seconds so the next bit of narration doesn't push it straight off.
async function announce($: EngineInterface, next: Mood, line: string, tone: Tone, forMs: number) {
  pendingLine = undefined
  await setMood($, next, forMs, line, tone)
  lineShownAt += Math.min(forMs, 5000) - HOLD_MS
}

// A plan limit getting close: one calm line as it crosses 80%, another at 95%, nothing more (no
// mood, no waving, no sound); a window that resets re-arms it. Undefined when there's nothing new.
const LIMIT_NAMES: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'weekly limit', seven_day_opus: 'weekly Opus limit' }
const NOTICE_AT = [80, 95]
const notedLimits = new Set<string>()

export function limitNotice(limits: readonly { kind: string; percent: number; resetsAt?: string }[], noted: Set<string>, now: number): string | undefined {
  let line: string | undefined
  for (const limit of limits) {
    const name = LIMIT_NAMES[limit.kind]
    if (!name) continue
    for (const at of NOTICE_AT) {
      const key = `${limit.kind}:${at}`
      if (limit.percent < at) noted.delete(key)
      else if (!noted.has(key)) {
        noted.add(key)
        const reset = resetIn(limit.resetsAt, now)
        line = `notes your ${name} is at ${Math.round(limit.percent)}%${reset ? ` · resets in ${reset}` : ''}`
      }
    }
  }
  return line
}

// It calls you over: waves with a "!" beside it, and chirps if you asked it to.
async function call($: EngineInterface, line: string, tone: Tone) {
  await announce($, 'calling', line, tone, CALL_MS)
  if (prefs.sound) $.audio.play({ asset: 'assets/chirp.wav' }, { gain: 0.6 }).catch(() => undefined)
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
  // Asleep, it leaves the notice for when it's up; the meter shows the number either way.
  if (mood === 'sleepy' || mood === 'dozing') return
  const notice = limitNotice(meter.limits ?? [], notedLimits, await $.clock.now())
  if (notice) await announce($, mood, notice, 'ask', 6000)
}

// How worn out a full context makes it: nothing until 60%, slowest at 95%.
export const tiredness = (percent: number | undefined) => Math.min(1, Math.max(0, ((percent ?? 0) - 60) / 35))

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
  await update($, view, current => (current.line === line && current.tone === 'plain' ? current : { ...current, line, tone: 'plain' as const }))
}

// One step of Claude's work: a line when the kind of work changes, or the quiet summary once deep in.
async function narrate($: EngineInterface, tool: string, args: Record<string, unknown>) {
  const now = await $.clock.now()
  steps++
  const kind = actionKind(tool, args)
  if (kind === 'edit' && typeof args.file_path === 'string') touched.add(args.file_path)
  // A passing mood (a test result, a stretch) has the line until it wears off.
  if (moodUntil > now && mood !== 'working') return
  if (steps > FOCUS_AFTER_STEPS || now - turnAt > FOCUS_AFTER_MS) {
    if (now - lastSummaryAt < SUMMARY_EVERY_MS) return
    lastSummaryAt = now
    return say($, focusLine(steps, touched.size))
  }
  if (kind === undefined || kind === lastKind) return
  lastKind = kind
  const line = actionLine(tool, args)
  if (line) await say($, line)
}

// What a finished call means to the pet: back to work after a permission, a cheer or a groan
// for a result worth one, a flinch at any other error.
async function afterCall($: EngineInterface, tool: string, args: Record<string, unknown>, isError: boolean, text: string) {
  if (mood === 'calling' && isWorking) await setMood($, 'working')
  const outcome = outcomeOf(tool, args, isError, text)
  if (outcome) {
    await announce($, outcome.tone === 'good' ? 'happy' : 'oops', outcome.line, outcome.tone, outcome.tone === 'good' ? 4000 : 6000)
    if (outcome.tone === 'good' && /tests? pass/.test(outcome.line)) {
      await keep($, kept => ({ ...kept, pet: { ...kept.pet, greens: (kept.pet.greens ?? 0) + 1 } }))
    }
  } else if (isError) await setMood($, 'oops', 3000, lastLine) // a flinch, not news: the line stays
}

// React first, save after: the blush shouldn't wait on a disk write.
async function petIt($: EngineInterface) {
  await setMood($, 'loved', 4000)
  await keep($, kept => ({ ...kept, pet: { ...kept.pet, pets: kept.pet.pets + 1 } }))
}

const COLOR_COMMAND = /^\s*\/pet\s+colou?r\s+(\S*)$/i
const PET_COMMAND = /^\s*\/pet\s+(\S*)$/i
const OUTFIT_COMMAND = /^\s*\/pet\s+outfit\s+(\S*)$/i
const SCENE_COMMAND = /^\s*\/pet\s+scene\s+(\S*)$/i
// The occasion a hat is for works as its name too: `/pet outfit christmas`.
const OCCASIONS: Record<string, Outfit> = { halloween: 'pumpkin', christmas: 'santa', xmas: 'santa', birthday: 'party', newyear: 'party' }
const VERBS: [string, string][] = [
  ['color', 'change its colour'], ['rename', 'give it a new name'], ['scene', 'its background: on (changes through the day), off, or meadow, desert, jungle…'], ['outfit', 'auto, none, pumpkin, santa or party'], ['card', 'save a picture of it to share'],
  ['calm', 'keep its motion small (on/off)'], ['breaks', 'nudge me to take breaks (on/off)'], ['sound', 'chirp when it needs me (on/off)'],
  ['project', 'its own name and colour in each project (on/off)'], ['hide', 'tuck it away'], ['show', 'bring it back'],
]

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
// mood, gaze or words touches the band, so a run of keystrokes costs a handful of redraws. Typing
// also answers a pet that was calling you.
async function react($: EngineInterface, reaction: NonNullable<ReturnType<typeof reactionTo>>) {
  const now = await $.clock.now()
  active(now)
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

const isLateNight = (now: number) => localDate(now, utcOffsetMin).getUTCHours() < 5
const dayOf = (now: number) => localDate(now, utcOffsetMin).toISOString().slice(0, 10)

// A passing mood (happy, oops, loved, waking, calling) wears off; a long quiet nods off into sleep,
// through a few heavy-lidded seconds of dozing. The motion itself runs on the surface's clock or in
// the SVG. Breaks get their nudge here too.
async function checkMood($: EngineInterface) {
  const now = await $.clock.now()
  const was = `${outfitNow(pet)}:${sceneNow(mood, 'plain')}`
  today = now
  if (`${outfitNow(pet)}:${sceneNow(mood, 'plain')}` !== was) await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden, current.tone))
  if (moodUntil && now > moodUntil) {
    const next = baseMood(now)
    // Drifting off from an awake mood goes through dozing first.
    if (next === 'sleepy' && mood !== 'dozing') await setMood($, 'dozing', DOZE_MS)
    else await setMood($, next)
  } else if (mood === 'idle' && baseMood(now) === 'sleepy') await setMood($, 'dozing', DOZE_MS)
  else if (prefs.breaks && !moodUntil && (mood === 'idle' || mood === 'working')) await nudge($, now)
  await tendMinis($, now)
  await sync($, now)
}

async function nudge($: EngineInterface, now: number) {
  if (now - workStart >= BREAK_AFTER_MS && now - lastNudgeAt >= NUDGE_EVERY_MS) {
    lastNudgeAt = now
    const hours = Math.floor((now - workStart) / 3600_000)
    await announce($, 'waking', `has been at it for ${hours}h · stretch break? 🧘`, 'ask', WAKE_MS * 2)
  } else if (mood === 'idle' && isLateNight(now) && nightNudgedOn !== dayOf(now)) {
    nightNudgedOn = dayOf(now)
    await announce($, 'dozing', "yawns · it's late, don't forget to sleep 🌙", 'plain', DOZE_MS)
  }
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
  const color = (await definedColor($, name)) ?? miniColor(id, colorNow(pet))
  const now = await $.clock.now()
  const at = Math.max(now, lastHatchAt + HATCH_GAP_MS)
  lastHatchAt = at
  minis = [...minis.filter(m => m.id !== id), { id, name, color, state: 'here' as const, at }].slice(-6)
  await update($, view, current => ({ ...current, minis }))
  // A queued helper's turn: draw again when it's due, so its slot starts opening on time.
  if (at > now) $.clock.after(at - now, () => void update($, view, current => ({ ...current, minis })).catch(() => undefined))
  await keep($, kept => ({ ...kept, pet: { ...kept.pet, helpers: (kept.pet.helpers ?? 0) + 1 } }))
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
  const dir0 = await $.session.cwd().catch(() => undefined)
  for (const dir of [dir0 && `${dir0}/.claude/agents`, home && `${home}/.claude/agents`]) {
    if (!dir) continue
    const text = await $.fs.read(`${dir}/${name}.md`).catch(() => undefined)
    const color = text ? colorFromDefinition(text) : undefined
    if (color) return color
  }
  return undefined
}

const baseName = (path: string) => path.split('/').filter(Boolean).pop() ?? path
const onOff = (arg: string | undefined, current: boolean) => (arg === 'on' ? true : arg === 'off' ? false : !current)

const cardScene = () => {
  const scene = sceneNow('happy', 'plain')
  return scene === 'none' ? undefined : scene
}

// `/pet card`: the picture goes to Downloads (or home), named after the pet.
async function saveCard($: EngineInterface): Promise<string> {
  const now = await $.clock.now()
  const home = await $.env.get('HOME').catch(() => undefined)
  if (!home) return 'No home folder to save the card in.'
  const dir = (await $.fs.exists(`${home}/Downloads`).catch(() => false)) ? `${home}/Downloads` : home
  const name = nameNow(pet)
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pet'
  const path = `${dir}/${slug}-pixel-pet.svg`
  await $.fs.write(path, petCard({
    name, color: colorNow(pet), outfit: outfitNow(pet), scene: cardScene(), days: Math.max(0, Math.floor((now - pet.born) / 86_400_000)),
    turns: pet.turns, pets: pet.pets, helpers: pet.helpers ?? 0, greens: pet.greens ?? 0,
  }))
  return `Saved ${name}'s card to ${path.replace(home, '~')}. Open it in a browser to share it.`
}

export const register: Register = (on, options) => {
  defaultColor = colorName(String(options.color)) ?? DEFAULT_COLOR

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pet', description: 'Your pixel pet: stats, or color / rename / outfit / card / calm / breaks / sound / project / hide / show', argumentHint: '[color|rename|outfit|card|calm|breaks|sound|project|hide|show]' })
    const now = await $.clock.now()
    today = now
    cwd = e.cwd
    const offset = await $.process.run(['date', '+%z'], { timeoutMs: 2000 }).then(r => parseOffset(r.stdout)).catch(() => undefined)
    if (offset !== undefined) utcOffsetMin = offset
    const home = await $.env.get('HOME').catch(() => undefined)
    keptPath = home ? `${home}/.claude/pixel-pet.json` : undefined
    const kept = await readKept($)
    const saved = kept?.pet ? undefined : ((await $.store.get('pet')) as Pet | undefined)
    if (kept?.pet) {
      pet = kept.pet
      prefs = { ...prefs, ...kept.prefs }
      projects = kept.projects ?? {}
    } else {
      // The first time with the shared file: carry over this copy's own pet, or hatch one.
      const configured = String(options.name ?? '').trim()
      pet = saved ?? { name: configured || NAMES[Math.floor(Math.random() * NAMES.length)]!, born: now, turns: 0, pets: 0 }
      prefs = { ...prefs, ...((await $.store.get('prefs')) as Partial<Prefs> | undefined) }
      projects = ((await $.store.get('projects')) as Record<string, Project> | undefined) ?? {}
      await keep($, () => ({ pet, prefs, projects }))
    }
    active(now)
    // Which provider bills the tokens, from the switches Claude Code reads (never a key).
    if (await $.env.get('CLAUDE_CODE_USE_BEDROCK').catch(() => undefined)) provider = 'bedrock'
    else if (await $.env.get('CLAUDE_CODE_USE_VERTEX').catch(() => undefined)) provider = 'vertex'
    else if (await $.env.get('CLAUDE_CODE_USE_FOUNDRY').catch(() => undefined)) provider = 'foundry'
    const themeRow = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')
    theme = /light/i.test(String(themeRow?.value ?? '')) ? 'light' : 'dark'
    const usage = await $.session.usage().catch(() => undefined)
    if (usage) await setMeter($, usage)
    mood = 'sleepy'
    const isNew = !kept?.pet && !saved
    await update($, view, current => viewOf(pet, 'sleepy', isNew ? 'just hatched and fell asleep… type to wake it' : pick(LINES.sleepy), current.isHidden))
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

  // Typeahead for /pet: its verbs, the colour names (each with its swatch), and the hats.
  on('prompt.autocomplete', async ($, e, next) => {
    const offered = await next(e)
    const before = e.text.slice(0, e.cursor)
    const partial = e.token.toLowerCase()
    let rows: { text: string; description?: string }[] = []
    if (COLOR_COMMAND.test(before)) rows = COLOR_NAMES.filter(name => name.startsWith(partial)).map(name => ({ text: name, description: hex(COLORS[name]!.body) }))
    else if (SCENE_COMMAND.test(before)) rows = ['on', 'off', ...SCENES].filter(name => name.startsWith(partial)).map(text => ({ text }))
    else if (OUTFIT_COMMAND.test(before)) rows = ['auto', 'none', ...OUTFITS].filter(name => name.startsWith(partial)).map(text => ({ text }))
    else if (PET_COMMAND.test(before)) rows = VERBS.filter(([verb]) => verb.startsWith(partial)).map(([text, description]) => ({ text, description }))
    return rows.length ? { suggestions: [...offered.suggestions, ...rows] } : offered
  })

  // A click on the sprite (terminal) or on the layer over it (desktop) pets it.
  on('ui.message', async ($, e, next) => {
    if ((e.element === 'pet' || e.element === 'pet-hit') && (e.data as { pet?: boolean } | null)?.pet) petIt($).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    active(await $.clock.now())
    look = 0
    if (mood === 'sleepy' || mood === 'dozing') await wake($)
    else if (mood === 'reading' || mood === 'wince' || mood === 'shocked' || mood === 'calling') await setMood($, 'idle')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    const now = await $.clock.now()
    active(now)
    turnAt = now
    steps = 0
    lastKind = undefined
    touched.clear()
    lastSummaryAt = -Infinity
    // Asleep, it wakes first; once up, the waking mood wears off into working.
    if (mood === 'sleepy' || mood === 'dozing') await wake($)
    else if (!moodUntil || mood === 'calling') await setMood($, 'working')
    return next(e)
  })

  // Each subagent hatches a little helper beside the pet, in its own colour; it waves bye when done.
  on('agent.spawn', async ($, e, next) => {
    if (!e.parentAgentId) say($, `sent ${e.subagentType.split(':').pop()} off on a side quest 🧭`).catch(() => undefined)
    await hatch($, e.tool_use_id, e.subagentType).catch(() => undefined)
    const started = await next(e)
    if (started.deny !== undefined || !started.agentId) await sayBye($, e.tool_use_id).catch(() => undefined)
    else miniOf.set(started.agentId, e.tool_use_id)
    return started
  })

  // Tidying its memory; once the context is light again, a big stretch.
  on('session.compact', async ($, e, next) => {
    say($, 'is tidying its memory 🧹').catch(() => undefined)
    const compacted = await next(e)
    await announce($, 'waking', 'stretches · feels light again ✨', 'good', WAKE_MS).catch(() => undefined)
    return compacted
  })

  // Claude is waiting on you: a permission, a question, or your next message.
  on('classic.Notification', async ($, e, next) => {
    if (/permission|elicitation/i.test(e.notification_type)) call($, 'needs your OK ✋', 'ask').catch(() => undefined)
    else if (/idle/i.test(e.notification_type) && mood !== 'calling' && mood !== 'sleepy') call($, 'is waiting for you 💬', 'ask').catch(() => undefined)
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
    const now = await $.clock.now()
    active(now)
    if (e.isAborted) {
      await setMood($, 'idle')
      return done
    }
    await keep($, kept => ({ ...kept, pet: { ...kept.pet, turns: kept.pet.turns + 1 } }))
    // A long turn calls you back to look; a quick one just gets a happy bounce.
    if (now - turnAt >= LONG_TURN_MS) await call($, `is done${touched.size ? ` · ${touched.size} file${touched.size === 1 ? '' : 's'} changed` : ''} · come take a look 👀`, 'good')
    else await setMood($, 'happy', 6000)
    return done
  })

  on('tool.call', async ($, e, next) => {
    const isMine = e.agentId === undefined
    const args = e as unknown as Record<string, unknown>
    if (isMine && isWorking) narrate($, String(e.tool), args).catch(() => undefined)
    const ran = await next(e)
    if (isMine && ran.deny === undefined) await afterCall($, String(e.tool), args, ran.isError === true, typeof ran.text === 'string' ? ran.text : '').catch(() => undefined)
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    await setMeter($, e)
    return measured
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const arg = rest[0]?.toLowerCase()
    const redraw = () => update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden, current.tone))
    const savePrefs = async (next: Partial<Prefs>) => {
      await keep($, kept => ({ ...kept, prefs: { ...kept.prefs, ...next } }))
      await redraw()
    }
    const where = prefs.perProject ? ` in ${baseName(cwd)}` : ''
    if (verb === 'hide' || verb === 'show') {
      await update($, view, current => ({ ...current, isHidden: verb === 'hide' }))
      return { text: verb === 'hide' ? `${nameNow(pet)} is resting off-screen. /pet show brings it back.` : `${nameNow(pet)} is back!` }
    }
    if (verb === 'color' || verb === 'colour') {
      const choice = colorName(arg)
      if (!choice) {
        await preview($, undefined)
        return { text: `Colours: ${COLOR_NAMES.join(', ')}. Try /pet color pink.` }
      }
      previewColor = undefined
      if (prefs.perProject) await keep($, kept => ({ ...kept, projects: { ...kept.projects, [cwd]: { ...kept.projects[cwd], color: choice } } }))
      else await keep($, kept => ({ ...kept, pet: { ...kept.pet, color: choice } }))
      await redraw()
      return { text: `${nameNow(pet)} is now ${choice}${where}.` }
    }
    if (verb === 'rename' && rest.length) {
      const name = rest.join(' ').slice(0, 24)
      if (prefs.perProject) await keep($, kept => ({ ...kept, projects: { ...kept.projects, [cwd]: { ...kept.projects[cwd], name } } }))
      else await keep($, kept => ({ ...kept, pet: { ...kept.pet, name } }))
      await redraw()
      return { text: `Your pet is now called ${name}${where}.` }
    }
    if (verb === 'outfit') {
      const named = OCCASIONS[arg ?? ''] ?? arg
      const choice = named === 'auto' || named === 'none' || OUTFITS.includes(named as Outfit) ? (named as Prefs['outfit']) : undefined
      if (!choice) return { text: `Outfits: auto (dresses up for Halloween, Christmas, New Year and its birthday), none, ${OUTFITS.join(', ')}.` }
      await savePrefs({ outfit: choice })
      const wearing = outfitNow(pet)
      return { text: choice === 'auto' ? `${nameNow(pet)} dresses for the date${wearing ? `: today it's wearing a ${wearing} hat` : ''}.` : choice === 'none' ? 'No hats.' : `${nameNow(pet)} is wearing a ${choice} hat until you change it (/pet outfit auto goes back to dressing for the date).` }
    }
    if (verb === 'scene') {
      // `off` and `on` are the plain words for no background and the automatic one.
      const named = arg === 'off' ? 'none' : arg === 'on' ? 'auto' : arg
      const choice = named === 'auto' || named === 'none' || isScene(named) ? (named as Prefs['scene']) : undefined
      if (!choice) return { text: `Scenes: on (changes through the day: ${TIMES_OF_DAY.map(([, time, scene]) => `${time} ${scene}`).join(', ')}), off, or one of ${SCENES.join(', ')}.` }
      await savePrefs({ scene: choice })
      return { text: choice === 'auto' ? `${nameNow(pet)}'s world changes through the day: ${TIMES_OF_DAY.map(([, time, scene]) => `${time} ${scene}`).join(', ')}.` : choice === 'none' ? 'No background: just the pet. /pet scene on brings it back.' : `${nameNow(pet)} now lives in the ${choice}.` }
    }
    if (verb === 'card') return { text: await saveCard($) }
    if (verb === 'calm' || verb === 'breaks' || verb === 'sound' || verb === 'project') {
      const key = verb === 'project' ? 'perProject' : verb
      const value = onOff(arg, prefs[key])
      const change: Partial<Prefs> = {}
      change[key] = value
      await savePrefs(change)
      const said: Record<string, string> = {
        calm: value ? 'Calm: it keeps its motion small and lines fade instead of sliding.' : 'Calm off: full motion.',
        breaks: value ? 'Breaks on: a stretch after two hours without a pause, and a nudge to sleep after midnight.' : 'Breaks off.',
        sound: value ? 'Sound on: it chirps when it calls you.' : 'Sound off.',
        project: value ? `Per project on: each project has its own name and colour (this one: ${nameNow(pet)}, ${colorNow(pet)}). /pet rename and /pet color now change it here only.` : 'Per project off: one pet everywhere.',
      }
      return { text: said[verb]! }
    }
    const days = Math.max(0, Math.floor(((await $.clock.now()) - pet.born) / 86_400_000))
    const toggles = (['calm', 'breaks', 'sound', 'perProject'] as const).filter(k => prefs[k]).map(k => (k === 'perProject' ? 'per project' : k))
    return {
      text: [
        `${nameNow(pet)} · ${colorNow(pet)}${outfitNow(pet) ? ` · ${outfitNow(pet)} hat` : ''}${toggles.length ? ` · ${toggles.join(', ')}` : ''}`,
        `${pet.turns} turns together · petted ${pet.pets} times · ${pet.helpers ?? 0} helpers hatched · ${pet.greens ?? 0} green test runs · ${days} days old`,
        'Click it to pet it. /pet color, rename, outfit, card, calm, breaks, sound, project.',
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
    const tired = tiredness(percent)
    const outfit = current.outfit === 'none' ? undefined : current.outfit
    const colors = LINE_COLORS[theme]
    // Calm keeps the meter's shimmer still too.
    const isShimmering = isWorking && !current.calm
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
      // In its world, the scenery scrolls while Claude works (still in calm mode).
      const pet: PetViewProps = { mood: current.mood, look, color: current.color, outfit: current.outfit, tired, calm: current.calm, scene: current.scene, isMoving: isWorking && !current.calm }
      const status: StatusViewProps = { name: current.name, line: current.line, calm: current.calm, ...(current.tone === 'plain' ? {} : { color: toneColor(colors, current.tone) }) }
      const gauge: MeterViewProps = { ...(percent === undefined ? {} : { percent }), segments: parts, isWorking: isShimmering, width: METER_CELLS }
      return (
        <Box gap={2} alignItems="center">
          <Client key="pet" module="./pet-view.tsx" width={current.scene === 'none' ? 10 : HABITAT_COLUMNS} height={current.scene === 'none' ? 4 : HABITAT_ROWS} props={pet} />
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
    // An invisible layer over the sprite (and its world) catches the click; the SVG itself can't.
    const hitColumns = current.scene === 'none' ? 6 : 9
    let hit: RenderChildren = null
    if (e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)
      hit = (
        <Box position="absolute" top={0} left={0}>
          <Client key="pet-hit" module="./hit.tsx" width={hitColumns} height={2} props={{ columns: hitColumns, rows: 2 }} />
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
      isWorking: isShimmering,
      limits: current.meter.limits ?? [],
      ...(resets ? { resets } : {}),
      ...(bill ? { bill } : {}),
      hasInfo: card.length > 0,
      tones: { ...TONES[theme], text: colors.text },
      calm: current.calm,
    }, lineTwoLayout)
    lineTwoLayout = two.layout
    const helpersAlt = current.minis.map(m => `${m.name} helper${m.state === 'bye' ? ' waving bye' : ''}`)
    const style = { outfit, tired, calm: current.calm }
    // The pet, standing in its world when it has one; the scenery scrolls while Claude works.
    const sprite = petSvg(current.mood, fadeFrom && now - fadeFrom.at < 500 ? fadeFrom : undefined, look, current.color, 5, style)
    const petAlt = `${current.name}, a pixel pet, ${current.mood}${outfit ? `, wearing a ${outfit} hat` : ''}`
    const petImage = current.scene === 'none'
      ? <Svg source={sprite} alt={petAlt} width={50} height={40} />
      : <Svg source={habitatSvg(current.scene, isWorking && !current.calm, sprite)} alt={`${petAlt}, in the ${current.scene}`} width={HABITAT_WIDTH} height={HABITAT_HEIGHT} />
    return (
      <Box gap={2} alignItems="center">
        <Box>
          {petImage}
          {hit}
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Svg source={lineSvg(current.name, current.line, previous, colors, { tone: current.tone, calm: current.calm })} alt={`${current.name} ${current.line}`} width={lineWidth(current.name, current.line, previous)} height={20} />
          <Box key="meter-row">
            <Svg source={two.svg} alt={[...helpersAlt, ...card].join('; ') || 'context meter'} width={two.width} height={26} />
            {details}
          </Box>
        </Box>
      </Box>
    )
  })
}
