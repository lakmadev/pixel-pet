// `/pet card`: a share-sized picture (1200x630, the size social sites preview) of the pet, cheering,
// in its colour and today's hat, with a few things you've done together.
import { HEIGHT, WIDTH, draw, hex, paletteFor } from './sprite'
import type { Outfit } from './sprite'
import { groundOf, sceneSvgLayers } from './scene'
import type { Scene } from './scene'

export type CardFacts = { name: string; color: string; outfit?: Outfit | undefined; scene?: Scene | undefined; days: number; turns: number; pets: number; helpers: number; greens: number }

const escape = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
const FONT = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif"`

export function petCard(f: CardFacts): string {
  const px = 26
  const grid = draw('happy', { color: f.color, outfit: f.outfit })
  const pixels = grid.flatMap((row, y) => row.map((c, x) => (c === null ? '' : `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${hex(c)}"/>`))).join('')
  const accent = hex(paletteFor(f.color).body)
  const stats: [number, string][] = [
    [f.days, f.days === 1 ? 'day together' : 'days together'],
    [f.turns, f.turns === 1 ? 'turn' : 'turns'],
    [f.pets, f.pets === 1 ? 'pet' : 'pets'],
    f.greens > 0 ? [f.greens, f.greens === 1 ? 'green test run' : 'green test runs'] : [f.helpers, f.helpers === 1 ? 'helper hatched' : 'helpers hatched'],
  ]
  const tiles = stats.map(([n, label], i) => {
    const x = 470 + (i % 2) * 330
    const y = 360 + Math.floor(i / 2) * 105
    return `<text x="${x}" y="${y}" font-size="52" font-weight="800" fill="#f4f4f6">${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</text><text x="${x}" y="${y + 34}" font-size="22" fill="#9a9db0">${label}</text>`
  }).join('')
  const nameSize = f.name.length > 14 ? 52 : 76
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" ${FONT}>`
    + `<defs><radialGradient id="glow" cx="0.25" cy="0.45" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>`
    + (f.scene
      // Its world behind it, darkened under the words so they read on any scene.
      ? `<g shape-rendering="crispEdges">${sceneSvgLayers(f.scene, 120, 63, 10, false, 120)}</g>`
        + `<defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0.24" stop-color="#0b0d12" stop-opacity="0"/><stop offset="0.36" stop-color="#0b0d12" stop-opacity="0.82"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/>`
      : `<rect width="1200" height="630" fill="#11131a"/><rect width="1200" height="630" fill="url(#glow)"/>`)
    + `<rect x="0" y="0" width="1200" height="8" fill="${accent}"/>`
    + `<g transform="translate(${(430 - WIDTH * px) / 2 + 20} ${f.scene ? Math.round(groundOf(f.scene) * 630 - HEIGHT * px) : (630 - HEIGHT * px) / 2 - 10})" shape-rendering="crispEdges">${pixels}</g>`
    + `<text x="470" y="200" font-size="${nameSize}" font-weight="800" fill="${accent}" letter-spacing="-1">${escape(f.name)}</text>`
    + `<text x="472" y="250" font-size="26" fill="#c9cbd6">my pixel pet in Claude Code</text>`
    + tiles
    + `<text x="1140" y="600" text-anchor="end" font-size="20" fill="#8a8ea3">pixel-pet · github.com/lakmadev/pixel-pet</text></svg>`
}
