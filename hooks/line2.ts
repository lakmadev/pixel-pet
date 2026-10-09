// Desktop: the band's second line as one SVG: the helpers on the left, newest first, then the
// context bar, its percent, the usage windows, the bill and the ⓘ. Each element starts where the
// previous draw left it and glides to its new place, so a helper's slot opening pushes the line
// right and one closing pulls it back.
import { FONT, gradientAt, hex, limitsParts, meterParts } from './meter'
import type { Limit, Tones } from './meter'
import { MINI_W, miniBody } from './mini'

export type Layout = Map<string, number>
export type LineTwo = {
  minis: { id: string; color: string; state: 'here' | 'bye'; age: number }[]
  percent?: number
  from: number
  isWorking: boolean
  limits: Limit[]
  resets?: string
  bill?: string
  hasInfo: boolean
  tones: Tones & { text: string }
}

const PX = 5
const SLOT = MINI_W * PX + 4
const HEIGHT = 26
const PILL = 110
const GLIDE = 'dur="420ms" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.8 0.25 1" fill="freeze"'

export function lineTwoSvg(line: LineTwo, previous: Layout | undefined): { svg: string; width: number; layout: Layout } {
  const layout: Layout = new Map()
  const minis = line.minis.filter(m => m.age >= 0)
  minis.forEach((m, i) => layout.set(m.id, i * SLOT))
  const contentX = minis.length ? minis.length * SLOT + 4 : 0
  layout.set('content', contentX)

  // Where an element was on the last draw, to glide from; a new helper has no past and pops in.
  const place = (key: string, y: number) => {
    const x = layout.get(key)!
    const was = previous?.get(key)
    const move = was !== undefined && Math.abs(was - x) > 0.5
      ? `<animateTransform attributeName="transform" type="translate" values="${was} ${y};${x} ${y}" ${GLIDE}/>`
      : ''
    return { open: `<g transform="translate(${x} ${y})">${move}`, close: '</g>' }
  }

  let defs = ''
  let content = ''
  let x = 0
  if (line.percent === undefined) {
    content = `<text x="0" y="17.5" fill="${line.tones.label}">context · waiting for the first reply</text>`
    x = 230
  } else {
    const meter = meterParts(line.percent, line.from, line.isWorking, PILL)
    defs = meter.defs
    const pct = `${line.percent}%`
    content = `<g transform="translate(3 7)">${meter.body}</g>`
      + `<text x="${PILL + 12}" y="17.5" fill="${hex(gradientAt(line.percent / 100))}" font-weight="700">${pct}</text>`
    x = PILL + 12 + pct.length * 8.4 + 12
    if (line.limits.length) {
      const limits = limitsParts(line.limits, line.tones)
      content += `<g transform="translate(${x.toFixed(1)} 5)">${limits.body}</g>`
      x += limits.width + 10
    }
    if (line.resets) {
      content += `<text x="${x.toFixed(1)}" y="17.5" fill="${line.tones.label}">${line.resets}</text>`
      x += line.resets.length * 7.1 + 10
    }
    if (line.bill) {
      content += `<text x="${x.toFixed(1)}" y="17.5" fill="${line.tones.text}" font-weight="700">${line.bill}</text>`
      x += line.bill.length * 8.4 + 10
    }
  }
  if (line.hasInfo) {
    content += `<text x="${x.toFixed(1)}" y="17.5" fill="${line.tones.label}">ⓘ</text>`
    x += 14
  }

  const helpers = minis.map(m => {
    const at = place(m.id, 5)
    return `${at.open}${miniBody(m, PX)}${at.close}`
  })
  const body = place('content', 0)
  const width = Math.ceil(Math.max(contentX + x, (previous?.get('content') ?? 0) + x))
  return {
    layout,
    width,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" ${FONT}><defs>${defs}</defs>`
      + `<g shape-rendering="crispEdges">${helpers.join('')}</g>${body.open}${content}${body.close}</svg>`,
  }
}
