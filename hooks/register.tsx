import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood, PetView } from '../types'
import type { PetViewProps } from './pet-view'
import { COLOR_NAMES, formFor, levelFor, petSvg, xpFor } from './sprite'

type Pet = { name: string; xp: number; born: number; turns: number; pets: number; color?: string }

const LINES: Record<Mood, string[]> = {
  idle: ['is waiting for you', 'is vibing', 'is counting pixels', 'is guarding your repo', 'is humming quietly'],
  working: ['is typing furiously…', 'is reading your code…', 'is thinking very hard…', 'is chasing a bug…', 'is consulting the docs…'],
  happy: ['did a happy dance!', 'is proud of you!', 'says: ship it!', 'high-fives the terminal!'],
  oops: ["saw an error. it's fine. everything's fine.", 'is sweating nervously', "says: that wasn't supposed to happen"],
  sleepy: ['is asleep. zzz', 'dreams of green tests', 'is napping on your keyboard'],
  loved: ['loves you back ♥', 'purrs in binary', 'is blushing in pixels'],
  reading: ['is reading along…', 'is peeking at what you type 👀', 'is following every keystroke', 'is taking notes'],
  wince: ['winces at the typo', 'pretends not to see that', 'says: backspace, backspace'],
  shocked: ['gasps: where did it all go?!', 'is shocked by the delete', 'clutches its pixels'],
}

const pick = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)]!
const SLEEP_AFTER_MS = 5 * 60_000

export function viewOf(pet: Pet, mood: Mood, line: string, isHidden: boolean): PetView {
  const level = levelFor(pet.xp)
  return { mood, line, name: pet.name, color: pet.color ?? defaultColor, level, xp: pet.xp, levelXp: xpFor(level), nextXp: xpFor(level + 1), form: formFor(level).name, isHidden }
}

export function xpBar(view: Pick<PetView, 'xp' | 'levelXp' | 'nextXp'>, width = 10): string {
  const filled = Math.round(((view.xp - view.levelXp) / (view.nextXp - view.levelXp)) * width)
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

// The configured colour, used until /pet color picks one.
let defaultColor = 'auto'

const view = atom({ plugin: 'pixel-pet', key: 'view' } as const, viewOf({ name: 'Bit', xp: 0, born: 0, turns: 0, pets: 0 }, 'idle', 'is waiting for you', false))

// Module state between hooks; the pet's record is rebuilt from the store on reload.
let pet: Pet = { name: 'Bit', xp: 0, born: 0, turns: 0, pets: 0 }
let mood: Mood = 'idle'
let moodUntil = 0
let isWorking = false
let lastActive = 0
let contextPercent = 0
// Where the eyes point while reading along (-1 left … 1 right), and what the band last said.
let look = 0
let lastLine = ''
// What the desktop last drew, so a change of mood or form fades from it.
let shown: { mood: Mood; level: number; color: string } | undefined
let fadeFrom: { mood: Mood; level: number; color: string; at: number } | undefined

function baseMood(now: number): Mood {
  if (isWorking) return 'working'
  return now - lastActive > SLEEP_AFTER_MS ? 'sleepy' : 'idle'
}

async function setMood($: EngineInterface, next: Mood, forMs = 0) {
  const now = await $.clock.now()
  moodUntil = forMs ? now + forMs : 0
  if (next === mood && !forMs) return
  mood = next
  const line = next === 'idle' && contextPercent >= 80 ? `is stuffed with tokens (${contextPercent}% context)` : pick(LINES[next])
  await update($, view, current => viewOf(pet, next, line, current.isHidden))
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
  moodUntil = now + 2000
  const isSame = mood === reaction.mood && look === reaction.look && (reaction.line === undefined || reaction.line === lastLine)
  look = reaction.look
  if (isSame) return
  const isNewMood = mood !== reaction.mood
  mood = reaction.mood
  if (reaction.line !== undefined || isNewMood) lastLine = reaction.line ?? pick(LINES[reaction.mood])
  await update($, view, current => viewOf(pet, reaction.mood, lastLine, current.isHidden))
}

async function gainXp($: EngineInterface, amount: number, sound: boolean) {
  const before = levelFor(pet.xp)
  pet = { ...pet, xp: pet.xp + amount }
  await $.store.set('pet', pet)
  const after = levelFor(pet.xp)
  if (after > before) {
    const evolved = formFor(after).name !== formFor(before).name
    $.ui.toast(evolved ? `✨ ${pet.name} evolved into its ${formFor(after).name} form! (level ${after})` : `✨ ${pet.name} reached level ${after}!`)
    if (sound) await $.audio.play({ asset: 'assets/levelup.wav' }).catch(() => undefined)
  }
  await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden))
}

// A passing mood (happy, oops, loved) wears off; a long idle drifts into sleep. The motion itself
// runs in pet-view.tsx on the surface's clock.
async function checkMood($: EngineInterface) {
  const now = await $.clock.now()
  if (moodUntil && now > moodUntil) await setMood($, baseMood(now))
  else if (mood === 'idle' && baseMood(now) === 'sleepy') await setMood($, 'sleepy')
}

export const register: Register = (on, options) => {
  const sound = options.sound !== false
  defaultColor = COLOR_NAMES.includes(String(options.color)) ? String(options.color) : 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pet', description: 'Your pixel pet: stats, or show / hide / rename <name> / color <name>', argumentHint: '[show|hide|rename <name>|color <name>]' })
    const now = await $.clock.now()
    const saved = (await $.store.get('pet')) as Pet | undefined
    pet = saved ?? { name: String(options.name ?? 'Bit'), xp: 0, born: now, turns: 0, pets: 0 }
    if (!saved) await $.store.set('pet', pet)
    lastActive = now
    await update($, view, current => viewOf(pet, 'idle', saved ? pick(LINES.idle) : 'just hatched! say hi 👋', current.isHidden))
    $.clock.every(1000, () => void checkMood($).catch(() => undefined))
    return next(e)
  })

  // Keystrokes in the prompt box: answer at once, react off the typing path.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const reaction = reactionTo(e)
    if (reaction) react($, reaction).catch(() => undefined)
    return box
  })

  on('prompt.submit', async ($, e, next) => {
    lastActive = await $.clock.now()
    look = 0
    if (mood === 'sleepy' || mood === 'reading' || mood === 'wince' || mood === 'shocked') await setMood($, 'idle')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    if (!moodUntil) await setMood($, 'working')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    isWorking = false
    lastActive = await $.clock.now()
    if (e.isAborted) {
      await setMood($, 'idle')
      return done
    }
    pet = { ...pet, turns: pet.turns + 1 }
    await setMood($, 'happy', 6000)
    await gainXp($, 10, sound)
    return done
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true && e.agentId === undefined) await setMood($, 'oops', 5000)
    return ran
  })

  on('session.measure', async ($, e, next) => {
    contextPercent = e.context.percent ?? contextPercent
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'hide' || verb === 'show') {
      await update($, view, current => ({ ...current, isHidden: verb === 'hide' }))
      return { text: verb === 'hide' ? `${pet.name} is resting off-screen. /pet show brings it back.` : `${pet.name} is back!` }
    }
    if (verb === 'color' || verb === 'colour') {
      const choice = (rest[0] ?? '').toLowerCase()
      if (!COLOR_NAMES.includes(choice)) return { text: `Colours: ${COLOR_NAMES.join(', ')}. Try /pet color pink.` }
      pet = { ...pet, color: choice === 'auto' ? undefined : choice }
      await $.store.set('pet', pet)
      await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden))
      return { text: choice === 'auto' ? `${pet.name} follows its level's colours again.` : `${pet.name} is now ${choice}.` }
    }
    if (verb === 'rename' && rest.length) {
      pet = { ...pet, name: rest.join(' ').slice(0, 24) }
      await $.store.set('pet', pet)
      await update($, view, current => viewOf(pet, current.mood, current.line, current.isHidden))
      return { text: `Your pet is now called ${pet.name}.` }
    }
    const level = levelFor(pet.xp)
    const days = Math.max(0, Math.floor(((await $.clock.now()) - pet.born) / 86_400_000))
    return {
      text: [
        `${pet.name} · level ${level} ${formFor(level).name} · ${pet.color ?? defaultColor} colour`,
        `XP ${xpBar({ xp: pet.xp, levelXp: xpFor(level), nextXp: xpFor(level + 1) })} ${pet.xp}/${xpFor(level + 1)}`,
        `${pet.turns} turns together · petted ${pet.pets} times · ${days} days old`,
        level < 10 ? `Next form at level ${[3, 6, 10].find(l => l > level)}; a crown at level 10.` : 'Fully evolved. Legendary.',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (e.props.hasSurvey || current.isHidden || e.props.maxRows < 4) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)

    const onPet = async () => {
      pet = { ...pet, pets: pet.pets + 1 }
      await setMood($, 'loved', 4000)
      await gainXp($, 1, sound)
    }
    // One sentence and one quiet line: "Bit is typing furiously…", then its level and the pet button.
    const words = (
      <Box flexDirection="column" justifyContent="center">
        <Text wrap="truncate">
          <Text bold color="claude">{current.name}</Text>
          <Text> {current.line}</Text>
        </Text>
        <Box gap={1}>
          <Text dimColor>lv {current.level} {current.form}</Text>
          <Button key="pet" label="♥ pet" plain dimColor hotkey="p" onPress={onPet} />
        </Box>
      </Box>
    )

    // The terminal draws pixels as half-block text on its grid; anywhere else text doesn't line up
    // into pixels, so the pet is an SVG with its motion built in.
    if (e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      const props: PetViewProps = { mood: current.mood, level: current.level, look, color: current.color }
      return (
        <Box gap={2} alignItems="center">
          <Client key="pet" module="./pet-view.tsx" width={10} height={4} props={props} />
          {words}
        </Box>
      )
    }
    const now = await $.clock.now()
    if (shown && (shown.mood !== current.mood || shown.level !== current.level || shown.color !== current.color)) fadeFrom = { ...shown, at: now }
    shown = { mood: current.mood, level: current.level, color: current.color }
    const { Svg } = $.ui.resolve(e)
    const svg = petSvg(current.mood, current.level, fadeFrom && now - fadeFrom.at < 500 ? fadeFrom : undefined, look, current.color)
    return (
      <Box gap={2} alignItems="center">
        <Svg source={svg} alt={`${current.name}, a pixel pet, ${current.mood}`} width={50} height={40} />
        {words}
      </Box>
    )
  })
}
