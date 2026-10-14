// The pet's little world: layered pixel scenery drawn in code (sky, far ridges or towers, trees,
// hills, ground), each layer seamless over its period so it can scroll for parallax while Claude
// works. Sizes are fractions of the scene's height, so the same scene draws 8 pixels tall in the
// terminal, 20 on desktop and full size on the share card.
import type { Grid } from './sprite'

export const SCENES = ['meadow', 'desert', 'jungle', 'city', 'skyline', 'snow', 'moon', 'savanna', 'lava', 'mountains'] as const
export type Scene = (typeof SCENES)[number]

type Layer =
  | { kind: 'sky'; stops: number[] }
  | { kind: 'dots'; color: number; from: number; to: number; every: number }
  | { kind: 'clouds'; color: number; at: number; every: number; speed: number }
  | { kind: 'ridge'; color: number; base: number; amp: number; jag?: boolean; speed: number }
  | { kind: 'bumps'; color: number; base: number; amp: number; every: number; speed: number }
  | { kind: 'trees'; color: number; base: number; size: number; every: number; shape: 'round' | 'pine' | 'palm'; speed: number }
  | { kind: 'towers'; colors: [number, number]; base: number; tall: number; speed: number }
  | { kind: 'band'; color: number; from: number; to: number; speed: number }
  | { kind: 'craters'; color: number; at: number; every: number; speed: number }

// Where the pet's feet go (a fraction of the height), and the layers back to front.
const SCENE: Record<Scene, { ground: number; layers: Layer[] }> = {
  meadow: { ground: 0.9, layers: [
    { kind: 'sky', stops: [0x1d7fe0, 0x3fa0ee, 0x7cc4f6] },
    { kind: 'clouds', color: 0xd9efff, at: 0.14, every: 26, speed: 0.08 },
    { kind: 'ridge', color: 0x7d8496, base: 0.42, amp: 0.08, jag: true, speed: 0.15 },
    { kind: 'trees', color: 0x2f6b3a, base: 0.56, size: 0.12, every: 3, shape: 'pine', speed: 0.3 },
    { kind: 'band', color: 0x86c94a, from: 0.56, to: 1, speed: 0.5 },
    { kind: 'bumps', color: 0x9ed858, base: 0.82, amp: 0.2, every: 22, speed: 0.7 },
    { kind: 'bumps', color: 0xb2e26a, base: 0.95, amp: 0.16, every: 30, speed: 1 },
  ] },
  desert: { ground: 0.9, layers: [
    { kind: 'sky', stops: [0x1f86e8, 0x56aef2] },
    { kind: 'clouds', color: 0xdcefff, at: 0.16, every: 30, speed: 0.08 },
    { kind: 'ridge', color: 0x5b616b, base: 0.42, amp: 0.05, jag: true, speed: 0.15 },
    { kind: 'bumps', color: 0xc8aa7c, base: 0.55, amp: 0.12, every: 18, speed: 0.4 },
    { kind: 'band', color: 0xddbf92, from: 0.6, to: 1, speed: 0.7 },
    { kind: 'bumps', color: 0xe6cc9f, base: 0.78, amp: 0.08, every: 34, speed: 1 },
  ] },
  jungle: { ground: 0.88, layers: [
    { kind: 'sky', stops: [0x3a9e9a, 0x6cc3b6] },
    { kind: 'trees', color: 0x4b8f93, base: 0.62, size: 0.42, every: 9, shape: 'palm', speed: 0.2 },
    { kind: 'trees', color: 0x4f8a2a, base: 0.66, size: 0.5, every: 14, shape: 'palm', speed: 0.5 },
    { kind: 'bumps', color: 0xa9a85a, base: 0.72, amp: 0.1, every: 20, speed: 0.7 },
    { kind: 'band', color: 0xc9c27a, from: 0.72, to: 1, speed: 1 },
    { kind: 'band', color: 0xeee6a8, from: 0.9, to: 1, speed: 1 },
  ] },
  city: { ground: 0.95, layers: [
    { kind: 'sky', stops: [0x5d7f8a, 0x9fb8b8] },
    { kind: 'towers', colors: [0xc6c9c0, 0x9da3a0], base: 0.62, tall: 0.55, speed: 0.15 },
    { kind: 'towers', colors: [0x7a3b3b, 0xd9c08a], base: 0.95, tall: 0.6, speed: 0.5 },
    { kind: 'band', color: 0x3a3a3e, from: 0.95, to: 1, speed: 1 },
  ] },
  // The city at night: lit windows under the stars.
  skyline: { ground: 0.95, layers: [
    { kind: 'sky', stops: [0x0a1030, 0x1a2252, 0x2c3266] },
    { kind: 'dots', color: 0xdfe6ff, from: 0, to: 0.35, every: 8 },
    { kind: 'towers', colors: [0x2a3156, 0x8f8a52], base: 0.62, tall: 0.55, speed: 0.15 },
    { kind: 'towers', colors: [0x1b1e2e, 0xf2cf62], base: 0.95, tall: 0.6, speed: 0.5 },
    { kind: 'band', color: 0x101218, from: 0.95, to: 1, speed: 1 },
  ] },
  snow: { ground: 0.92, layers: [
    { kind: 'sky', stops: [0x8f9ed1, 0xc4cbe6, 0xf0e2c8] },
    { kind: 'ridge', color: 0xa3afd6, base: 0.5, amp: 0.07, jag: true, speed: 0.15 },
    { kind: 'band', color: 0xe9effc, from: 0.6, to: 1, speed: 0.5 },
    { kind: 'bumps', color: 0xffffff, base: 0.78, amp: 0.14, every: 20, speed: 0.7 },
    { kind: 'dots', color: 0x9fb2dd, from: 0.8, to: 0.95, every: 7 },
  ] },
  moon: { ground: 0.92, layers: [
    { kind: 'sky', stops: [0x0b1426, 0x101c33] },
    { kind: 'dots', color: 0xe8ecff, from: 0, to: 0.4, every: 9 },
    { kind: 'ridge', color: 0x9a9a9e, base: 0.45, amp: 0.05, jag: true, speed: 0.15 },
    { kind: 'band', color: 0xd4d4d8, from: 0.52, to: 1, speed: 0.5 },
    { kind: 'craters', color: 0xa9a9ae, at: 0.66, every: 22, speed: 0.6 },
    { kind: 'band', color: 0xe9e9ec, from: 0.85, to: 1, speed: 1 },
  ] },
  savanna: { ground: 0.9, layers: [
    { kind: 'sky', stops: [0x9a4418, 0xd97a26, 0xf2b84b] },
    { kind: 'trees', color: 0x3d3a1c, base: 0.6, size: 0.2, every: 11, shape: 'round', speed: 0.3 },
    { kind: 'band', color: 0x1f1c10, from: 0.6, to: 0.7, speed: 0.4 },
    { kind: 'band', color: 0xb8a65e, from: 0.7, to: 1, speed: 0.8 },
    { kind: 'band', color: 0xe8ddb0, from: 0.88, to: 1, speed: 1 },
  ] },
  lava: { ground: 0.86, layers: [
    { kind: 'sky', stops: [0x140806, 0x3a120a, 0x6a1e0c] },
    { kind: 'ridge', color: 0x2a0f08, base: 0.4, amp: 0.08, jag: true, speed: 0.15 },
    { kind: 'band', color: 0xff7a12, from: 0.6, to: 0.7, speed: 0.4 },
    { kind: 'dots', color: 0xffd040, from: 0.6, to: 0.66, every: 5 },
    { kind: 'band', color: 0x3a1a10, from: 0.7, to: 1, speed: 1 },
    { kind: 'dots', color: 0xa8401a, from: 0.78, to: 1, every: 11 },
  ] },
  mountains: { ground: 0.92, layers: [
    { kind: 'sky', stops: [0xdfe3ea, 0xcdd5e0] },
    { kind: 'ridge', color: 0x7180a4, base: 0.32, amp: 0.1, jag: true, speed: 0.1 },
    { kind: 'ridge', color: 0xcbbfb2, base: 0.46, amp: 0.05, speed: 0.2 },
    { kind: 'ridge', color: 0x4c7a3a, base: 0.58, amp: 0.1, speed: 0.45 },
    { kind: 'band', color: 0x3f6b2e, from: 0.8, to: 1, speed: 1 },
  ] },
}

export const isScene = (name: string | undefined): name is Scene => SCENES.includes(name as Scene)
export const groundOf = (scene: Scene) => SCENE[scene].ground

// A steady random from a seed, so a scene looks the same every time.
const rand = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// One layer over its period: `period` columns, `height` rows, null where it's see-through.
function drawLayer(layer: Layer, period: number, height: number, seed: number): Grid {
  const grid: Grid = Array.from({ length: height }, () => Array<number | null>(period).fill(null))
  const put = (x: number, y: number, c: number) => {
    const yy = Math.round(y)
    if (yy >= 0 && yy < height) grid[yy]![((Math.round(x) % period) + period) % period] = c
  }
  const fill = (x: number, from: number, c: number) => {
    for (let y = Math.max(0, Math.round(from)); y < height; y++) put(x, y, c)
  }
  const r = rand(seed)
  const scale = height / 20
  const every = (n: number) => Math.max(2, Math.round(n * Math.max(scale, 0.4)))
  // Strokes (stars, fronds, cloud puffs) grow with the scene, so a big one isn't hairlines.
  const brush = Math.max(1, Math.round(scale))
  const dab = (x: number, y: number, c: number) => {
    for (let dx = 0; dx < brush; dx++) for (let dy = 0; dy < brush; dy++) put(x + dx, y + dy, c)
  }
  switch (layer.kind) {
    case 'sky':
      for (let y = 0; y < height; y++) {
        const t = (y / Math.max(1, height - 1)) * (layer.stops.length - 1)
        const i = Math.min(layer.stops.length - 2, Math.floor(t))
        const c = layer.stops.length === 1 ? layer.stops[0]! : mix(layer.stops[i]!, layer.stops[i + 1]!, t - i)
        for (let x = 0; x < period; x++) put(x, y, c)
      }
      break
    case 'dots':
      for (let x = 0; x < period; x += every(layer.every)) dab(x + Math.floor(r() * 3), (layer.from + r() * (layer.to - layer.from)) * height, layer.color)
      break
    case 'clouds':
      for (let x = 0; x < period; x += every(layer.every)) {
        const cx = x + r() * 4
        const y = layer.at * height
        const w = Math.max(2, Math.round(5 * scale))
        for (let i = 0; i < w; i++) dab(cx + i, y, layer.color)
        for (let i = Math.round(w * 0.2); i < w * 0.8; i++) dab(cx + i, y - brush, layer.color)
      }
      break
    case 'ridge': {
      // Whole sine waves over the period, so the ridge joins up seamlessly.
      const waves = (layer.jag ? [1, 3, 7, 13] : [1, 2, 4]).map(k => ({ k, phase: r() * Math.PI * 2, weight: 1 / k ** 0.6 }))
      const total = waves.reduce((sum, w) => sum + w.weight, 0)
      for (let x = 0; x < period; x++) {
        const v = waves.reduce((sum, w) => sum + w.weight * Math.sin((2 * Math.PI * w.k * x) / period + w.phase), 0) / total
        fill(x, (layer.base - layer.amp * v) * height, layer.color)
      }
      break
    }
    case 'bumps':
      for (let x = 0; x < period; x++) {
        const k = Math.max(1, Math.round(period / every(layer.every)))
        const v = Math.abs(Math.sin((Math.PI * k * x) / period))
        fill(x, (layer.base - layer.amp * v) * height, layer.color)
      }
      break
    case 'band':
      for (let x = 0; x < period; x++) for (let y = Math.round(layer.from * height); y < Math.round(layer.to * height); y++) put(x, y, layer.color)
      break
    case 'craters':
      for (let x = 0; x < period; x += every(layer.every)) {
        const cx = x + r() * 6
        const w = Math.max(2, Math.round((3 + r() * 3) * scale))
        const y = layer.at * height + r() * 2 * scale
        for (let i = -w; i <= w; i++) dab(cx + i, y + (Math.abs(i) < w * 0.7 ? brush : 0), layer.color)
      }
      break
    case 'trees':
      for (let x = 0; x < period; x += every(layer.every)) {
        const cx = x + r() * 2
        const s = Math.max(1, layer.size * height * (0.75 + r() * 0.5))
        const base = layer.base * height
        if (layer.shape === 'pine') {
          for (let y = 0; y < s; y++) for (let i = -Math.floor((y * 0.5)); i <= Math.floor(y * 0.5); i++) put(cx + i, base - s + y, layer.color)
        } else if (layer.shape === 'round') {
          // An acacia: a trunk and a flat-topped crown.
          for (let y = 0; y < s * 0.6; y++) dab(cx, base - y, layer.color)
          for (let i = -s; i <= s; i++) for (let y = 0; y < Math.max(1, s * 0.35); y++) put(cx + i, base - s * 0.6 - y - (Math.abs(i) < s * 0.6 ? 1 : 0), layer.color)
        } else {
          // A palm: a leaning trunk and fronds falling either side.
          for (let y = 0; y < s; y++) dab(cx + (y / s) * s * 0.25, base - y, layer.color)
          const top = { x: cx + s * 0.25, y: base - s }
          for (let i = 0; i < s * 0.6; i++) {
            dab(top.x + i, top.y + i * 0.45, layer.color)
            dab(top.x - i, top.y + i * 0.45, layer.color)
            dab(top.x + i * 0.7, top.y - i * 0.25, layer.color)
            dab(top.x - i * 0.7, top.y - i * 0.25, layer.color)
          }
        }
      }
      break
    case 'towers': {
      let x = 0
      while (x < period) {
        const w = Math.max(2, Math.round((3 + r() * 5) * scale))
        const top = (layer.base - layer.tall * (0.45 + r() * 0.55)) * height
        for (let i = 0; i < w && x + i < period; i++) {
          for (let y = Math.round(top); y < layer.base * height; y++) {
            const isWindow = scale >= 0.8 && i % 2 === 1 && i < w - 1 && Math.round(y - top) % 2 === 1
            put(x + i, y, isWindow ? layer.colors[1] : layer.colors[0])
          }
        }
        x += w + (r() < 0.5 ? 1 : 0)
      }
      break
    }
  }
  return grid
}

const cache = new Map<string, { grids: Grid[]; speeds: number[] }>()

// The scene's layers at this size, each over `period` columns, with how fast each scrolls.
export function sceneLayers(scene: Scene, period: number, height: number): { grids: Grid[]; speeds: number[] } {
  const key = `${scene}:${period}:${height}`
  let layers = cache.get(key)
  if (!layers) {
    const spec = SCENE[scene].layers
    layers = { grids: spec.map((layer, i) => drawLayer(layer, period, height, 7 + i * 101 + scene.length * 13)), speeds: spec.map(layer => ('speed' in layer ? layer.speed : 0)) }
    cache.set(key, layers)
  }
  return layers
}

// A window onto the scene, `width` wide, the layers scrolled by `offset` (the nearest layer's,
// in pixels; farther ones move less).
export function sceneGrid(scene: Scene, width: number, height: number, offset: number, period = 64): Grid {
  const { grids, speeds } = sceneLayers(scene, period, height)
  const out: Grid = Array.from({ length: height }, () => Array<number | null>(width).fill(null))
  grids.forEach((grid, l) => {
    const shift = Math.floor(offset * speeds[l]!)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = grid[y]![(((x + shift) % period) + period) % period]
        if (c !== null && c !== undefined) out[y]![x] = c
      }
    }
  })
  return out
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

// One layer's pixels as rects, `copies` periods side by side: runs merged along rows or along
// columns, whichever is shorter (a sky is a few rows; a ridge is many columns), since a drawing
// has a size limit.
function layerRects(grid: Grid, px: number, copies: number): string {
  const period = grid[0]!.length
  const height = grid.length
  const rect = (x: number, y: number, w: number, h: number, c: number) => `<rect x="${x * px}" y="${y * px}" width="${w * px}" height="${h * px}" fill="${hex(c)}"/>`
  let byRows = ''
  for (let y = 0; y < height; y++) {
    const at = (x: number) => grid[y]![x % period] ?? null
    for (let x = 0; x < period * copies; ) {
      const c = at(x)
      let end = x + 1
      while (end < period * copies && at(end) === c) end++
      if (c !== null) byRows += rect(x, y, end - x, 1, c)
      x = end
    }
  }
  let byColumns = ''
  for (let x = 0; x < period * copies; x++) {
    for (let y = 0; y < height; ) {
      const c = grid[y]![x % period] ?? null
      let end = y + 1
      while (end < height && (grid[end]![x % period] ?? null) === c) end++
      if (c !== null) byColumns += rect(x, y, 1, end - y, c)
      y = end
    }
  }
  return byRows.length <= byColumns.length ? byRows : byColumns
}

// Desktop and the card: the scene as SVG layers. Moving, each layer slides left by its period
// forever at its own speed (parallax); still, it simply stands.
export function sceneSvgLayers(scene: Scene, width: number, height: number, px: number, isMoving: boolean, period = 64, pxPerSecond = 14): string {
  const { grids, speeds } = sceneLayers(scene, period, height)
  const copies = Math.ceil(width / period) + 1
  return grids.map((grid, l) => {
    const speed = speeds[l]!
    const slide = isMoving && speed > 0
      ? `<animateTransform attributeName="transform" type="translate" from="0 0" to="${-period * px} 0" dur="${Math.round((period / (pxPerSecond * speed)) * 1000)}ms" repeatCount="indefinite"/>`
      : ''
    return `<g>${slide}${layerRects(grid, px, speed > 0 ? copies : Math.ceil(width / period))}</g>`
  }).join('')
}

// `auto` follows the time of day: a meadow in the morning (5–12), the desert in the afternoon
// (12–17), a savanna sunset in the evening (17–20), the city skyline at night (20–24) and the
// moon after midnight (0–5); and a lava cave for a moment while it groans over failing tests.
export const TIMES_OF_DAY: [from: number, name: string, scene: Scene][] = [[0, 'midnight', 'moon'], [5, 'morning', 'meadow'], [12, 'afternoon', 'desert'], [17, 'evening', 'savanna'], [20, 'night', 'skyline']]
export function sceneFor(hour: number, isGroaning: boolean): Scene {
  if (isGroaning) return 'lava'
  return TIMES_OF_DAY.findLast(([from]) => hour >= from)![2]
}

// Desktop: the pet in its little world, a rounded window with sky above it and a little ground
// either side, the pet standing at the bottom. While Claude works the scenery scrolls past in
// layers, so the pet seems to run through it.
export const HABITAT_WIDTH = 76
export const HABITAT_HEIGHT = 52
export function habitatSvg(scene: Scene, isMoving: boolean, pet: string): string {
  const inner = pet.replace('<svg ', `<svg x="${(HABITAT_WIDTH - 50) / 2}" y="${HABITAT_HEIGHT - 40}" `)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HABITAT_WIDTH}" height="${HABITAT_HEIGHT}" viewBox="0 0 ${HABITAT_WIDTH} ${HABITAT_HEIGHT}" shape-rendering="crispEdges">`
    + `<defs><clipPath id="habitat"><rect width="${HABITAT_WIDTH}" height="${HABITAT_HEIGHT}" rx="7"/></clipPath></defs>`
    + `<g clip-path="url(#habitat)">${sceneSvgLayers(scene, HABITAT_WIDTH / 2, HABITAT_HEIGHT / 2, 2, isMoving)}</g>${inner}</svg>`
}
