// The pet's little helpers, one per running subagent: half its size (5x4 body, plus a column for a
// waving arm), in the agent's own colour. They pop in, bob while their agent works, and when it's
// done they wave bye, float up and fade away.
import type { Grid } from './sprite'
import { COLOR_NAMES, hex, paletteFor } from './sprite'

export const MINI_W = 6
export const MINI_H = 4
export const ARRIVE_MS = 600
export const WAVE_MS = 1300
export const LEAVE_MS = 2200

const INK = 0x1a1a2e
const BODY = ['.ooo.', 'okbko', 'obbbo', '.o.o.']

// A stable colour for an agent with none of its own, never the parent's.
export function miniColor(id: string, avoid: string): string {
  const names = COLOR_NAMES.filter(name => name !== avoid && name !== 'black' && name !== 'white')
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return names[h % names.length]!
}

// The Claude Code agent colours as a definition file names them, onto the pet's palette.
const AGENT_COLORS: Record<string, string> = { red: 'red', blue: 'blue', green: 'green', yellow: 'yellow', purple: 'purple', orange: 'orange', pink: 'pink', cyan: 'cyan' }
export const colorFromDefinition = (markdown: string) => {
  const front = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? ''
  const named = /^color:\s*["']?([a-z]+)/im.exec(front)?.[1]?.toLowerCase()
  return named ? AGENT_COLORS[named] ?? (COLOR_NAMES.includes(named) ? named : undefined) : undefined
}

export function miniDraw(color: string, { blink = false, armUp = false, arm = false } = {}): Grid {
  const { body, edge } = paletteFor(color)
  const paint: Record<string, number> = { o: edge, b: body, k: blink ? body : INK }
  const grid: Grid = BODY.map(row => [...row].map(c => (c === '.' ? null : paint[c]!)))
  for (const row of grid) row.push(null)
  if (arm) grid[armUp ? 0 : 1]![5] = edge
  return grid
}

// Terminal frames, by how long the mini has been in its state.
export function miniFrame(color: string, state: 'here' | 'bye', age: number, seed: number): Grid | null {
  if (state === 'here' && age < ARRIVE_MS) {
    // A sparkle, then the body: a pop in two beats.
    if (age < 200) return Array.from({ length: MINI_H }, (_, y) => Array.from({ length: MINI_W }, (_, x) => (x === 2 && y === 1 ? 0xffe066 : null)))
    return miniDraw(color)
  }
  if (state === 'bye') {
    if (age < WAVE_MS) return miniDraw(color, { arm: true, armUp: Math.floor(age / 220) % 2 === 0 })
    if (age < WAVE_MS + 300) return miniDraw(color, { blink: true })
    if (age < WAVE_MS + 550) return Array.from({ length: MINI_H }, (_, y) => Array.from({ length: MINI_W }, (_, x) => (x === 2 && y === 1 ? 0xcfd8ff : null)))
    return null
  }
  return miniDraw(color, { blink: (age + seed * 377) % 3100 < 130 })
}

export const seedOf = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 997

// Desktop: every mini in one SVG, each with its own motion: a springy pop-in, a bob at its own
// pace, a wave, then a float up and fade. Ages say where each one is in its story.
export function minisSvg(minis: readonly { id: string; color: string; state: 'here' | 'bye'; age: number }[], px = 5): { svg: string; width: number; height: number } {
  const w = MINI_W * px
  const h = MINI_H * px
  const gap = px * 1.4
  const height = h + px * 2
  const rects = (grid: Grid) => grid.map((row, y) => row.map((c, x) => (c === null ? '' : `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${hex(c)}"/>`)).join('')).join('')
  const spline = 'calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"'
  const groups = minis.map((mini, i) => {
    const seed = seedOf(mini.id)
    const x = i * (w + gap)
    const cx = (w - px) / 2
    const cy = h / 2
    if (mini.state === 'bye') {
      const wave = (up: boolean) => `<g opacity="${up ? 1 : 0}">${rects(miniDraw(mini.color, { arm: true, armUp: up }))}<animate attributeName="opacity" values="${up ? '1;0' : '0;1'}" keyTimes="0;0.5" calcMode="discrete" dur="440ms" repeatCount="${Math.ceil(WAVE_MS / 440)}" fill="freeze"/></g>`
      const fadeAt = Math.max(0, WAVE_MS - mini.age)
      return `<g transform="translate(${x} ${px * 2})"><g>${wave(true)}${wave(false)}`
        + `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-px * 1.6}" dur="800ms" begin="${fadeAt}ms" calcMode="spline" keyTimes="0;1" keySplines="0.3 0 0.7 1" fill="freeze"/>`
        + `<animate attributeName="opacity" values="1;0" dur="800ms" begin="${fadeAt}ms" fill="freeze"/></g></g>`
    }
    const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-px * 0.7};0 0" keyTimes="0;0.5;1" dur="${560 + (seed % 240)}ms" ${spline} repeatCount="indefinite"/>`
    const blink = `<g opacity="0">${rects(miniDraw(mini.color, { blink: true }))}<animate attributeName="opacity" values="0;1" keyTimes="0;0.96" calcMode="discrete" dur="${2900 + (seed % 900)}ms" begin="${-(seed % 2900)}ms" repeatCount="indefinite"/></g>`
    const pop = mini.age < ARRIVE_MS
      ? `<animateTransform attributeName="transform" type="scale" additive="sum" values="0;1.2;1" keyTimes="0;0.65;1" dur="${ARRIVE_MS}ms" calcMode="spline" keySplines="0.2 0.8 0.3 1;0.4 0 0.6 1" fill="freeze"/>`
      : ''
    return `<g transform="translate(${x + cx} ${px * 2 + cy})"><g>${pop}<g transform="translate(${-cx} ${-cy})"><g>${rects(miniDraw(mini.color))}${blink}${bob}</g></g></g></g>`
  })
  const width = Math.max(1, Math.ceil(minis.length * (w + gap) - gap))
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${groups.join('')}</svg>` }
}
