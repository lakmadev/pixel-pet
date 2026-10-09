import type { Mood } from '../types'

// A 10x8 pixel canvas, two pixels per terminal row: 10 columns by 4 rows. null is see-through.
export type Grid = (number | null)[][]
export const WIDTH = 10
export const HEIGHT = 8

export const FORMS = [
  { minLevel: 10, name: 'legend', body: 0xf6c945, edge: 0x9c7a12 },
  { minLevel: 6, name: 'blaze', body: 0xff8a65, edge: 0xb2462a },
  { minLevel: 3, name: 'spark', body: 0x8b7cf6, edge: 0x4b3cb0 },
  { minLevel: 1, name: 'sprout', body: 0x4fd1c5, edge: 0x1f7a73 },
] as const

export const formFor = (level: number) => FORMS.find(form => level >= form.minLevel)!

// Level n starts at 40 * (n-1)^2 XP: 4 turns to level 2, ~64 to level 5, ~300 to level 10.
export const levelFor = (xp: number) => Math.floor(Math.sqrt(xp / 40)) + 1
export const xpFor = (level: number) => (level - 1) ** 2 * 40

const INK = 0x1a1a2e
const WHITE = 0xffffff
const BLUSH = 0xff8fb1
const TONGUE = 0xff5c6c
const SPARK = 0xffe066
const HEART = 0xff5c8a
const SWEAT = 0x7fdbff
const ZZZ = 0xcfd8ff
const GOLD = 0xffd84d

const BODY = [
  '..oooo..',
  '.obbbbo.',
  'obbbbbbo',
  'obbbbbbo',
  'opbbbbpo',
  '.obbbbo.',
  '.oo..oo.',
]

type Eyes = 'open' | 'glance' | 'closed' | 'happy' | 'dizzy'
type Mouth = 'smile' | 'open' | 'flat' | 'o'

// Eyes are 1x2 at body columns 2 and 5, rows 2-3: [top, bottom].
const EYES: Record<Eyes, [string, string]> = {
  open: ['w', 'k'],
  glance: ['k', 'k'],
  closed: ['b', 'k'],
  happy: ['k', 'b'],
  dizzy: ['k', 'w'],
}
const MOUTHS: Record<Mouth, [x: number, y: number, c: 'k' | 'r'][]> = {
  smile: [[3, 5, 'k'], [4, 5, 'k']],
  open: [[3, 4, 'k'], [4, 4, 'k'], [3, 5, 'r'], [4, 5, 'r']],
  flat: [[2, 5, 'k'], [3, 5, 'k'], [4, 5, 'k'], [5, 5, 'k']],
  o: [],
}

// Rhythm per mood: how fast it bobs (ms per cycle) and whether it shakes instead.
const RHYTHM: Record<Mood, { period: number; shake?: boolean; still?: boolean }> = {
  idle: { period: 2400 },
  working: { period: 640 },
  happy: { period: 480 },
  oops: { period: 260, shake: true },
  sleepy: { period: 3600, still: true },
  loved: { period: 900 },
}

const wave = (t: number, period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (t % period)) / period)

// Blink for 140ms every few seconds, at a beat that doesn't look mechanical.
export const isBlinking = (t: number) => (t % 3700) < 140 || ((t + 1300) % 6100) < 120

export function sprite(mood: Mood, t: number, level: number): Grid {
  const { body, edge } = formFor(level)
  const rhythm = RHYTHM[mood]
  const phase = wave(t, rhythm.period)
  const lift = rhythm.still ? 0 : phase > 0.5 ? 1 : 0
  const dx = rhythm.shake ? (phase > 0.5 ? 1 : -1) : 0
  const blink = isBlinking(t)
  const odd = Math.floor(t / 350) % 2 === 1

  const eyes: Eyes =
    mood === 'happy' || mood === 'loved' ? 'happy'
    : mood === 'sleepy' ? 'closed'
    : mood === 'oops' ? 'dizzy'
    : blink ? 'closed'
    : mood === 'working' && odd ? 'glance'
    : 'open'
  const mouth: Mouth = mood === 'happy' ? 'open' : mood === 'oops' ? 'flat' : mood === 'sleepy' ? 'o' : 'smile'

  const grid: Grid = Array.from({ length: HEIGHT }, () => Array<number | null>(WIDTH).fill(null))
  const ox = 1 + dx
  const oy = 1 - lift
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) grid[y]![x] = color
  }
  const paint = { o: edge, b: body, p: BLUSH, k: INK, w: WHITE, r: TONGUE } as const

  BODY.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && put(ox + x, oy + y, paint[c as keyof typeof paint])))
  for (const col of [2, 5]) EYES[eyes].forEach((c, i) => put(ox + col, oy + 2 + i, paint[c as keyof typeof paint]))
  for (const [x, y, c] of MOUTHS[mouth]) put(ox + x, oy + y, paint[c])
  if (level >= 10) for (const x of [2, 3, 4, 5]) put(ox + x, oy, x === 2 || x === 5 ? GOLD : SPARK) // a crown along the top edge

  if (mood === 'happy') for (const [x, y] of odd ? [[0, 1], [9, 3]] : [[9, 0], [0, 4]]) put(x!, y!, SPARK)
  if (mood === 'oops') put(9, 2 + (odd ? 1 : 0), SWEAT)
  if (mood === 'sleepy') put(odd ? 9 : 8, odd ? 0 : 1, ZZZ)
  if (mood === 'loved') for (const [x, y] of odd ? [[8, 0], [9, 1]] : [[0, 0], [1, 1]]) put(x!, y!, HEART)
  return grid
}

export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// A crossfade between two poses: colors blend, and a pixel that appears or vanishes swaps halfway.
export function blend(from: Grid, to: Grid, t: number): Grid {
  return to.map((row, y) => row.map((c, x) => {
    const a = from[y]?.[x] ?? null
    if (a === null || c === null) return t < 0.5 ? a : c
    return mix(a, c, t)
  }))
}

export type Run = { text: string; fg?: string; bg?: string }
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

// Two pixels per cell with half blocks; empty pixels draw nothing, so the surface shows through.
export function toRuns(grid: Grid): Run[][] {
  const rows: Run[][] = []
  for (let y = 0; y < HEIGHT; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < WIDTH; x++) {
      const top = grid[y]![x] ?? null
      const bottom = grid[y + 1]?.[x] ?? null
      const cell: Run =
        top === null && bottom === null ? { text: ' ' }
        : top === null ? { text: '▄', fg: hex(bottom!) }
        : bottom === null ? { text: '▀', fg: hex(top) }
        : top === bottom ? { text: '█', fg: hex(top) }
        : { text: '▀', fg: hex(top), bg: hex(bottom) }
      const last = runs[runs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}
