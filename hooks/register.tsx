import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood, PetView } from '../types'
import { formFor, levelFor, sprite, toCells, toSvg, xpFor } from './sprite'

type Pet = { name: string; xp: number; born: number; turns: number; pets: number }

const LINES: Record<Mood, string[]> = {
  idle: ['is waiting for you', 'is vibing', 'is counting pixels', 'is guarding your repo', 'is humming quietly'],
  working: ['is typing furiously…', 'is reading your code…', 'is thinking very hard…', 'is chasing a bug…', 'is consulting the docs…'],
  happy: ['did a happy dance!', 'is proud of you!', 'says: ship it!', 'high-fives the terminal!'],
  oops: ["saw an error. it's fine. everything's fine.", 'is sweating nervously', "says: that wasn't supposed to happen"],
  sleepy: ['is asleep. zzz', 'dreams of green tests', 'is napping on your keyboard'],
  loved: ['loves you back ♥', 'purrs in binary', 'is blushing in pixels'],
}

const pick = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)]!
const SLEEP_AFTER_MS = 5 * 60_000
const TICK_MS = 450

export function viewOf(pet: Pet, mood: Mood, line: string, isHidden: boolean): PetView {
  const level = levelFor(pet.xp)
  return { mood, line, name: pet.name, level, xp: pet.xp, levelXp: xpFor(level), nextXp: xpFor(level + 1), form: formFor(level).name, isHidden }
}

export function xpBar(view: Pick<PetView, 'xp' | 'levelXp' | 'nextXp'>, width = 10): string {
  const filled = Math.round(((view.xp - view.levelXp) / (view.nextXp - view.levelXp)) * width)
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

const view = atom({ plugin: 'pixel-pet', key: 'view' } as const, viewOf({ name: 'Bit', xp: 0, born: 0, turns: 0, pets: 0 }, 'idle', 'is waiting for you', false))

// Module state: what the animation timer reads between renders. Rebuilt from the store on reload.
let pet: Pet = { name: 'Bit', xp: 0, born: 0, turns: 0, pets: 0 }
let mood: Mood = 'idle'
let moodUntil = 0
let isWorking = false
let lastActive = 0
let contextPercent = 0
let frame = 0
let bandId: string | undefined

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

async function tick($: EngineInterface) {
  frame += 1
  const now = await $.clock.now()
  if (moodUntil && now > moodUntil) await setMood($, baseMood(now))
  else if (mood === 'idle' && baseMood(now) === 'sleepy') await setMood($, 'sleepy')
  if (bandId) await $.ui.blit({ requestId: bandId, key: 'pet', cells: toCells(sprite(mood, frame, levelFor(pet.xp))) }).catch(() => undefined)
}

export const register: Register = (on, options) => {
  const sound = options.sound !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pet', description: 'Your pixel pet: stats, or show / hide / rename <name>', argumentHint: '[show|hide|rename <name>]' })
    const now = await $.clock.now()
    const saved = (await $.store.get('pet')) as Pet | undefined
    pet = saved ?? { name: String(options.name ?? 'Bit'), xp: 0, born: now, turns: 0, pets: 0 }
    if (!saved) await $.store.set('pet', pet)
    lastActive = now
    await update($, view, current => viewOf(pet, 'idle', saved ? pick(LINES.idle) : 'just hatched! say hi 👋', current.isHidden))
    $.clock.every(TICK_MS, () => void tick($).catch(() => undefined))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    lastActive = await $.clock.now()
    if (mood === 'sleepy') await setMood($, 'idle')
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
        `${pet.name} · level ${level} ${formFor(level).name}`,
        `XP ${xpBar({ xp: pet.xp, levelXp: xpFor(level), nextXp: xpFor(level + 1) })} ${pet.xp}/${xpFor(level + 1)}`,
        `${pet.turns} turns together · petted ${pet.pets} times · ${days} days old`,
        level < 5 ? 'Grows an antenna at level 5, wears a crown at level 10.' : level < 10 ? 'Wears a crown at level 10.' : 'Fully evolved. Legendary.',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (e.props.hasSurvey || current.isHidden) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    // Choose by surface: every table lists Raster, but only the terminal draws it.
    bandId = e.surface === 'terminal' ? e.requestId : undefined

    const onPet = async () => {
      pet = { ...pet, pets: pet.pets + 1 }
      await setMood($, 'loved', 4000)
      await gainXp($, 1, sound)
    }
    const info = (
      <Box flexDirection="column" justifyContent="center">
        <Text>
          <Text bold>{current.name}</Text>
          <Text dimColor> · Lv {current.level} {current.form}</Text>
        </Text>
        <Text italic>{current.line}</Text>
        <Text dimColor>XP {xpBar(current)} {current.xp}/{current.nextXp}</Text>
        <Box gap={1}>
          <Button key="pet" label="Pet ♥" hotkey="p" onPress={onPet} />
          <Button key="hide" label="Hide" hotkey="h" onPress={() => update($, view, v => ({ ...v, isHidden: true }))} />
        </Box>
      </Box>
    )

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      if (e.props.maxRows < 6) return next(e)
      return (
        <Box gap={2}>
          <Raster key="pet" columns={12} rows={6} cells={toCells(sprite(current.mood, frame, current.level))} />
          {info}
        </Box>
      )
    }
    const { Svg } = $.ui.resolve(e)
    const svg = toSvg([sprite(current.mood, 1, current.level), sprite(current.mood, 2, current.level)])
    return (
      <Box gap={2} alignItems="center">
        <Svg source={svg} alt={`${current.name} the pixel pet, ${current.mood}`} width={72} height={72} isInteractive />
        {info}
      </Box>
    )
  })
}
