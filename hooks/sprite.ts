import type { Mood } from '../types'

// A 10x8 pixel canvas, two pixels per terminal row: 10 columns by 4 rows. null is see-through.
export type Grid = (number | null)[][]
export const WIDTH = 10
export const HEIGHT = 8

// Colours a person can pick with /pet color: the common names, plus a few moods. Each is a body
// and a darker outline; the order is what a typed prefix matches first.
export const COLORS: Record<string, { body: number; edge: number }> = {
  teal: { body: 0x4fd1c5, edge: 0x1f7a73 },
  red: { body: 0xef4444, edge: 0x7f1d1d },
  orange: { body: 0xfb923c, edge: 0x9a3412 },
  yellow: { body: 0xfacc15, edge: 0x854d0e },
  green: { body: 0x4ade80, edge: 0x166534 },
  blue: { body: 0x60a5fa, edge: 0x1e40af },
  purple: { body: 0x8b7cf6, edge: 0x4b3cb0 },
  pink: { body: 0xf9a8d4, edge: 0xbe185d },
  white: { body: 0xf3f4f6, edge: 0x9ca3af },
  gray: { body: 0x9ca3af, edge: 0x4b5563 },
  black: { body: 0x374151, edge: 0x111827 },
  brown: { body: 0xb08968, edge: 0x5c3d2e },
  cyan: { body: 0x22d3ee, edge: 0x155e75 },
  mint: { body: 0x86efac, edge: 0x15803d },
  lime: { body: 0xa3e635, edge: 0x3f6212 },
  sky: { body: 0x7dd3fc, edge: 0x0369a1 },
  navy: { body: 0x4f63d2, edge: 0x1e2a78 },
  indigo: { body: 0x818cf8, edge: 0x3730a3 },
  violet: { body: 0xa78bfa, edge: 0x5b21b6 },
  lavender: { body: 0xc4b5fd, edge: 0x6d28d9 },
  magenta: { body: 0xe879f9, edge: 0x86198f },
  rose: { body: 0xfb7185, edge: 0x9f1239 },
  peach: { body: 0xfdba74, edge: 0xc2410c },
  coral: { body: 0xff8a65, edge: 0xb2462a },
  gold: { body: 0xf6c945, edge: 0x9c7a12 },
  lava: { body: 0xf87171, edge: 0x991b1b },
  ghost: { body: 0xe5e7eb, edge: 0x6b7280 },
  midnight: { body: 0x64748b, edge: 0x1e293b },
}
export const COLOR_NAMES = Object.keys(COLORS)
export const DEFAULT_COLOR = 'teal'
const ALIASES: Record<string, string> = { grey: 'gray', auto: DEFAULT_COLOR }

export const colorName = (name: string | undefined) => {
  const n = (name ?? '').toLowerCase()
  return COLORS[n] ? n : ALIASES[n] ?? undefined
}
export const paletteFor = (color = DEFAULT_COLOR) => COLORS[colorName(color) ?? DEFAULT_COLOR]!

const INK = 0x1a1a2e
const WHITE = 0xffffff
const BLUSH = 0xff8fb1
const TONGUE = 0xff5c6c
const SPARK = 0xffe066
const HEART = 0xff5c8a
const SWEAT = 0x7fdbff
const ZZZ = 0xcfd8ff

const BODY = [
  '..oooo..',
  '.obbbbo.',
  'obbbbbbo',
  'obbbbbbo',
  'opbbbbpo',
  '.obbbbo.',
  '.oo..oo.',
]

type Eyes = 'open' | 'glance' | 'closed' | 'happy' | 'dizzy' | 'wide'
type Mouth = 'smile' | 'open' | 'flat' | 'o' | 'gasp'

// Eyes are 1x2 at body columns 2 and 5, rows 2-3: [top, bottom].
const EYES: Record<Eyes, [string, string]> = {
  open: ['w', 'k'],
  glance: ['k', 'k'],
  closed: ['b', 'k'],
  happy: ['k', 'b'],
  dizzy: ['k', 'w'],
  wide: ['k', 'k'],
}
const MOUTHS: Record<Mouth, [x: number, y: number, c: 'k' | 'r'][]> = {
  smile: [[3, 5, 'k'], [4, 5, 'k']],
  open: [[3, 4, 'k'], [4, 4, 'k'], [3, 5, 'r'], [4, 5, 'r']],
  flat: [[2, 5, 'k'], [3, 5, 'k'], [4, 5, 'k'], [5, 5, 'k']],
  o: [],
  gasp: [[3, 4, 'k'], [4, 4, 'k'], [3, 5, 'k'], [4, 5, 'k']],
}

// Rhythm per mood: how fast it bobs (ms per cycle) and whether it shakes instead.
const RHYTHM: Record<Mood, { period: number; shake?: boolean; still?: boolean }> = {
  reading: { period: 1400 },
  wince: { period: 200, shake: true },
  shocked: { period: 300 },
  idle: { period: 2400 },
  working: { period: 640 },
  happy: { period: 480 },
  oops: { period: 260, shake: true },
  sleepy: { period: 3600, still: true },
  dozing: { period: 3000, still: true },
  waking: { period: 520 },
  loved: { period: 900 },
}

const wave = (t: number, period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (t % period)) / period)

// Blink for 140ms every few seconds, at a beat that doesn't look mechanical.
export const isBlinking = (t: number) => (t % 3700) < 140 || ((t + 1300) % 6100) < 120

// look: where the eyes point, -1 left, 0 ahead, 1 right (reading along as you type).
// t: the clock, for extras that drift (a sleeper's z's).
type Pose = { lift?: number; dx?: number; blink?: boolean; odd?: boolean; look?: number; color?: string; t?: number; withBody?: boolean; withExtras?: boolean }

// One still frame. The terminal animates by drawing many of these; the desktop SVG layers a few.
export function draw(mood: Mood, { lift = 0, dx = 0, blink = false, odd = false, look = 0, color = DEFAULT_COLOR, t = 0, withBody = true, withExtras = true }: Pose = {}): Grid {
  const { body, edge } = paletteFor(color)
  const eyes: Eyes =
    mood === 'happy' || mood === 'loved' ? 'happy'
    : mood === 'sleepy' ? 'closed'
    : mood === 'dozing' ? (blink ? 'open' : 'closed') // heavy lids: only now and then do they open
    : mood === 'waking' ? (blink ? 'closed' : 'open') // quick bleary blinks
    : mood === 'oops' ? 'dizzy'
    : mood === 'wince' ? 'closed'
    : mood === 'shocked' ? 'wide'
    : blink ? 'closed'
    : mood === 'working' && odd ? 'glance'
    : 'open'
  const mouth: Mouth = mood === 'happy' ? 'open' : mood === 'oops' || mood === 'wince' ? 'flat' : mood === 'sleepy' ? 'o' : mood === 'shocked' || mood === 'dozing' || mood === 'waking' ? 'gasp' : 'smile'

  const grid: Grid = Array.from({ length: HEIGHT }, () => Array<number | null>(WIDTH).fill(null))
  const ox = 1 + dx
  const oy = 1 - lift
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) grid[y]![x] = c
  }
  const paint = { o: edge, b: body, p: BLUSH, k: INK, w: WHITE, r: TONGUE } as const

  if (withBody) {
    BODY.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && put(ox + x, oy + y, paint[c as keyof typeof paint])))
    const shift = mood === 'reading' ? Math.max(-1, Math.min(1, Math.round(look))) : 0
    for (const col of [2 + shift, 5 + shift]) EYES[eyes].forEach((c, i) => put(ox + col, oy + 2 + i, paint[c as keyof typeof paint]))
    for (const [x, y, c] of MOUTHS[mouth]) put(ox + x, oy + y, paint[c])
  }
  if (withExtras) {
    if (mood === 'happy') for (const [x, y] of odd ? [[0, 1], [9, 3]] : [[9, 0], [0, 4]]) put(x!, y!, SPARK)
    if (mood === 'oops') put(9, 2 + (odd ? 1 : 0), SWEAT)
    if (mood === 'sleepy') {
      // Two z's drifting up and away, half a cycle apart, and a snore bubble on the breath.
      const path = [[7, 4], [8, 3], [8, 2], [9, 1], [9, 0]]
      for (const offset of [0, 2]) {
        const [x, y] = path[(Math.floor(t / 420) + offset) % path.length]!
        put(x!, y!, ZZZ)
      }
      if (Math.floor(t / 1800) % 2 === 0) put(9, 4, SWEAT) // the snore bubble, beside the cheek
    }
    if (mood === 'loved') for (const [x, y] of odd ? [[8, 0], [9, 1]] : [[0, 0], [1, 1]]) put(x!, y!, HEART)
    if (mood === 'shocked') for (const y of [0, 1, 3]) put(9, y, odd ? SPARK : 0xff6b6b) // a blinking "!"
    if (mood === 'wince') put(odd ? 9 : 8, 2, SWEAT)
  }
  return grid
}

// The frame at time t: bob or shake on the mood's rhythm, blink now and then, twinkle the extras.
export function sprite(mood: Mood, t: number, look = 0, color = DEFAULT_COLOR): Grid {
  const rhythm = RHYTHM[mood]
  const phase = wave(t, rhythm.period)
  const lids = mood === 'dozing' ? (t % 1800) < 420 : mood === 'waking' ? (t % 520) < 140 : isBlinking(t)
  return draw(mood, {
    lift: rhythm.still || rhythm.shake ? 0 : phase > 0.5 ? 1 : 0,
    dx: rhythm.shake ? (phase > 0.5 ? 1 : -1) : 0,
    blink: lids,
    odd: Math.floor(t / 350) % 2 === 1,
    look,
    color,
    t,
  })
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
export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

// Two pixels per cell with half blocks; empty pixels draw nothing, so the surface shows through.
export const toRuns = (grid: Grid) => toRunsOf(grid, WIDTH)

export function toRunsOf(grid: Grid, width: number): Run[][] {
  const rows: Run[][] = []
  for (let y = 0; y < grid.length; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < width; x++) {
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

// Desktop: one SVG with the motion built in, so it animates without redraws. The body glides on
// an eased curve (smoother than whole pixels), blinks and twinkles switch layers, and a mood change
// fades the previous pose out. Every animated layer rests where a still image should be, so a
// surface that ignores SMIL still shows a clean pet.
export function petSvg(mood: Mood, from?: { mood: Mood; color: string }, look = 0, color = DEFAULT_COLOR, px = 5): string {
  // Pixels as rects, a row's same-coloured neighbours merged; with `over`, only the pixels that differ from it.
  const rects = (grid: Grid, over?: Grid) =>
    grid.map((row, y) => {
      const cells = row.map((c, x) => (over && (over[y]![x] ?? null) === c ? null : c))
      let out = ''
      for (let x = 0; x < WIDTH; ) {
        let end = x + 1
        while (end < WIDTH && cells[end] === cells[x]) end++
        if (cells[x] !== null) out += `<rect x="${x * px}" y="${y * px}" width="${(end - x) * px}" height="${px}" fill="${hex(cells[x]!)}"/>`
        x = end
      }
      return out
    }).join('')
  const ease = 'calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"'
  const once = (ms: number, spline = '0.2 0.8 0.2 1') => `dur="${ms}ms" calcMode="spline" keyTimes="0;1" keySplines="${spline}" fill="freeze"`
  const rhythm = RHYTHM[mood]
  // How the body moves: a bob or a shake on the mood's rhythm; asleep, a slow breath that swells it
  // a touch; dozing off, a slow sink; waking, a rise from that sink with a little overshoot.
  const motion =
    mood === 'sleepy' ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-px * 0.35};0 0" dur="3600ms" ${ease} repeatCount="indefinite"/>`
    : mood === 'dozing' ? `<animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${px * 0.6}" ${once(2600, '0.4 0 0.6 1')}/>`
    : mood === 'waking' ? `<animateTransform attributeName="transform" type="translate" values="0 ${px * 0.6};0 ${-px * 0.5};0 0" keyTimes="0;0.6;1" dur="1100ms" calcMode="spline" keySplines="0.2 0.8 0.3 1;0.4 0 0.6 1" fill="freeze"/>`
    : rhythm.shake ? `<animateTransform attributeName="transform" type="translate" values="${-px * 0.6} 0;${px * 0.6} 0;${-px * 0.6} 0" dur="${rhythm.period}ms" ${ease} repeatCount="indefinite"/>`
    : `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-px * (mood === 'idle' || mood === 'reading' ? 0.6 : 1)};0 0" dur="${rhythm.period}ms" ${ease} repeatCount="indefinite"/>`
  const toggle = (dur: number, on: string) => `<animate attributeName="opacity" values="0;1" keyTimes="0;${on}" calcMode="discrete" dur="${dur}ms" repeatCount="indefinite"/>`

  const base = draw(mood, { withExtras: false, look, color })
  // Lids: a blink now and then; dozing, heavy lids that open less and less; waking, quick bleary blinks.
  const lids =
    mood === 'idle' || mood === 'working' || mood === 'reading' ? `<g opacity="0">${rects(draw(mood, { blink: true, withExtras: false, look, color }), base)}${toggle(3700, '0.962')}</g>`
    : mood === 'dozing' ? `<g opacity="0">${rects(draw(mood, { blink: true, withExtras: false, color }), base)}<animate attributeName="opacity" values="0;1;0;1;0" keyTimes="0;0.1;0.35;0.45;1" calcMode="discrete" dur="2600ms" fill="freeze"/></g>`
    : mood === 'waking' ? `<g opacity="0">${rects(draw(mood, { blink: true, withExtras: false, color }), base)}<animate attributeName="opacity" values="1;0;1;0" keyTimes="0;0.25;0.4;0.6" calcMode="discrete" dur="1100ms" fill="freeze"/></g>`
    : ''
  const glance = mood === 'working' ? `<g opacity="0">${rects(draw(mood, { odd: true, withExtras: false, color }), base)}${toggle(700, '0.5')}</g>` : ''

  // Asleep: z's that drift up and fade, one after another, and a snore bubble that swells and pops.
  const z = (begin: number) =>
    `<g opacity="0"><rect x="${px * 7.6}" y="${px * 3.6}" width="${px * 0.9}" height="${px * 0.9}" fill="#cfd8ff"/>`
    + `<animateTransform attributeName="transform" type="translate" values="0 0;${px * 1.2} ${-px * 3.4}" dur="2400ms" begin="${begin}ms" repeatCount="indefinite"/>`
    + `<animate attributeName="opacity" values="0;0.95;0" keyTimes="0;0.25;1" dur="2400ms" begin="${begin}ms" repeatCount="indefinite"/></g>`
  const snore = mood === 'sleepy'
    ? z(0) + z(800) + z(1600)
      + `<circle shape-rendering="geometricPrecision" cx="${px * 6.9}" cy="${px * 6.2}" r="0" fill="#7fdbff" fill-opacity="0.55" stroke="#bfefff" stroke-opacity="0.8" stroke-width="0.6"><animate attributeName="r" values="0;${px * 0.9};${px * 1.25};0;0" keyTimes="0;0.55;0.7;0.72;1" dur="3600ms" repeatCount="indefinite"/></circle>`
    : ''
  const extrasA = mood === 'sleepy' ? '' : rects(draw(mood, { withBody: false }))
  const extrasB = mood === 'sleepy' ? '' : rects(draw(mood, { withBody: false, odd: true }))
  const twinkle = extrasA || extrasB
    ? `<g>${extrasA}<animate attributeName="opacity" values="1;0" keyTimes="0;0.5" calcMode="discrete" dur="700ms" repeatCount="indefinite"/></g><g opacity="0">${extrasB}${toggle(700, '0.5')}</g>`
    : ''
  const fade = from && (from.mood !== mood || from.color !== color)
    ? `<g opacity="0">${rects(draw(from.mood, { color: from.color }))}<animate attributeName="opacity" values="1;0" dur="350ms" fill="freeze"/></g>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * px}" height="${HEIGHT * px}" viewBox="0 0 ${WIDTH * px} ${HEIGHT * px}" shape-rendering="crispEdges"><g>${rects(base)}${lids}${glance}${motion}</g>${twinkle}${snore}${fade}</svg>`
}
