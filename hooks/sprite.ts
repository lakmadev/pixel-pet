import type { Mood } from '../types'

// A 12x12 pixel canvas; null is see-through (the terminal's own background).
export type Grid = (number | null)[][]
export const SIZE = 12

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

const BODY = [
  '..oooooo..',
  '.obbbbbbo.',
  'obbbbbbbbo',
  'obbbbbbbbo',
  'obbbbbbbbo',
  'obpbbbbpbo',
  'obbbbbbbbo',
  'obbbbbbbbo',
  '.obbbbbbo.',
  '..oo..oo..',
]

type Eyes = 'open' | 'glance' | 'closed' | 'happy' | 'dizzy'
type Mouth = 'smile' | 'open' | 'flat' | 'o'
type Pose = { eyes: Eyes; mouth: Mouth; dx: number; dy: number; extras: [x: number, y: number, color: number][] }

// Each eye is 2x2: [top-left, top-right, bottom-left, bottom-right]; 'b' is body color.
const EYES: Record<Eyes, [left: string, right: string]> = {
  open: ['kwkk', 'kwkk'],
  glance: ['wkkk', 'wkkk'],
  closed: ['bbkk', 'bbkk'],
  happy: ['kkbb', 'kkbb'],
  dizzy: ['kbbk', 'bkkb'],
}

const MOUTHS: Record<Mouth, [x: number, y: number, color: 'k' | 'r'][]> = {
  smile: [[3, 5, 'k'], [4, 6, 'k'], [5, 6, 'k'], [6, 5, 'k']],
  open: [[4, 6, 'k'], [5, 6, 'k'], [4, 7, 'r'], [5, 7, 'r']],
  flat: [[3, 6, 'k'], [4, 6, 'k'], [5, 6, 'k'], [6, 6, 'k']],
  o: [[4, 6, 'k'], [5, 6, 'k'], [4, 7, 'k'], [5, 7, 'k']],
}

function pose(mood: Mood, frame: number): Pose {
  const odd = frame % 2 === 1
  switch (mood) {
    case 'working':
      return { eyes: odd ? 'glance' : 'open', mouth: 'smile', dx: 0, dy: odd ? 1 : 0, extras: [] }
    case 'happy':
      return { eyes: 'happy', mouth: 'open', dx: 0, dy: odd ? 1 : 0, extras: odd ? [[11, 1, SPARK], [0, 5, SPARK], [10, 0, SPARK]] : [[0, 2, SPARK], [11, 4, SPARK], [1, 0, SPARK]] }
    case 'oops':
      return { eyes: 'dizzy', mouth: 'flat', dx: odd ? 1 : -1, dy: 0, extras: [[11, 2, SWEAT], [11, 3, SWEAT]] }
    case 'sleepy':
      return { eyes: 'closed', mouth: 'o', dx: 0, dy: 0, extras: [[[9, 1], [10, 0], [11, 0]][frame % 3]!].map(([x, y]) => [x!, y!, ZZZ]) }
    case 'loved': {
      const x = odd ? 8 : 1
      return { eyes: 'happy', mouth: 'smile', dx: 0, dy: odd ? 1 : 0, extras: [[x, 0, HEART], [x + 2, 0, HEART], [x + 1, 1, HEART]] }
    }
    default:
      return { eyes: frame % 12 === 0 ? 'closed' : 'open', mouth: 'smile', dx: 0, dy: 0, extras: [] }
  }
}

export function sprite(mood: Mood, frame: number, level: number): Grid {
  const { body, edge } = formFor(level)
  const { eyes, mouth, dx, dy, extras } = pose(mood, frame)
  const grid: Grid = Array.from({ length: SIZE }, () => Array<number | null>(SIZE).fill(null))
  const ox = 1 + dx
  const oy = 2 - dy
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y]![x] = color
  }
  const paint = { o: edge, b: body, p: BLUSH, k: INK, w: WHITE, r: TONGUE } as const

  BODY.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && put(ox + x, oy + y, paint[c as keyof typeof paint])))
  EYES[eyes].forEach((eye, side) =>
    [...eye].forEach((c, i) => put(ox + 2 + side * 4 + (i % 2), oy + 3 + Math.floor(i / 2), paint[c as keyof typeof paint])),
  )
  for (const [x, y, c] of MOUTHS[mouth]) put(ox + x, oy + y, paint[c])
  if (level >= 10) for (const x of [3, 5, 6]) put(ox + x, oy - 1, SPARK)
  else if (level >= 5) {
    put(ox + 5, oy - 1, edge)
    put(ox + 5, oy - 2, SPARK)
  }
  for (const [x, y, color] of extras) put(x, y, color)
  return grid
}

// Terminal: two pixels per cell with half blocks, encoded as RasterProps.cells wants.
const DEFAULT = 0x01000000
export function toCells(grid: Grid): string {
  const rows = SIZE / 2
  const view = new DataView(new ArrayBuffer(SIZE * rows * 12))
  let at = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < SIZE; x++) {
      const top = grid[y * 2]![x] ?? null
      const bottom = grid[y * 2 + 1]![x] ?? null
      const [glyph, fg, bg] =
        top === null && bottom === null ? [0x20, DEFAULT, DEFAULT]
        : top === null ? [0x2584, bottom!, DEFAULT]
        : [0x2580, top, bottom ?? DEFAULT]
      for (const word of [glyph, fg, bg]) {
        view.setUint32(at, word, true)
        at += 4
      }
    }
  }
  return toBase64(new Uint8Array(view.buffer))
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// Desktop: the same pixels as SVG, two frames swapped by SMIL so it animates without redraws.
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
export function toSvg(frames: Grid[], scale = 6): string {
  const groups = frames.map((grid, i) => {
    const rects = grid.flatMap((row, y) =>
      row.map((c, x) => (c === null ? '' : `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${hex(c)}"/>`)),
    ).join('')
    const values = frames.map((_, j) => (j === i ? 1 : 0)).join(';')
    return `<g opacity="${i === 0 ? 1 : 0}"><animate attributeName="opacity" values="${values}" dur="${frames.length * 0.45}s" calcMode="discrete" repeatCount="indefinite"/>${rects}</g>`
  })
  const side = SIZE * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">${groups.join('')}</svg>`
}
