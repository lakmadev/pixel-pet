// The context meter on the band's second line: how full the context window is, what the session
// cost, and the 5-hour limit. A gradient runs mint → amber → red along the bar, so the colour at
// the tip says how worried to be.

export type Limit = { kind: string; percent: number; resetsAt?: string }
// Where the numbers come from: a Claude plan meters usage in 5-hour and weekly windows and bills
// nothing per token; the API and the cloud providers bill per token and have no windows.
export type Source = 'plan' | 'api' | 'bedrock' | 'vertex' | 'foundry' | 'gateway'
export type Meter = { percent?: number; tokens?: number; window?: number; usd?: number; limits?: Limit[]; source?: Source }
export type Segment = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type Run = { text: string; fg: string; bold?: boolean }

const STOPS: [at: number, color: number][] = [[0, 0x34d399], [0.6, 0xfbbf24], [1, 0xf87171]]
const TRACK = 0x3a3f4b

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

export function gradientAt(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    const [a, ca] = STOPS[i - 1]!
    const [b, cb] = STOPS[i]!
    if (x <= b) return mix(ca, cb, (x - a) / (b - a))
  }
  return STOPS[STOPS.length - 1]![1]
}

const kilo = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week', seven_day_opus: 'week·opus', spend_limit: 'spend' }
export const SOURCE_LABELS: Record<Source, string> = { plan: 'Claude plan', api: 'API', bedrock: 'Bedrock', vertex: 'Vertex AI', foundry: 'Foundry', gateway: 'gateway' }

// "1h52m", "38m", "3d4h": how long until a window resets.
export function resetIn(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return undefined
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  if (m < 24 * 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
  const h = Math.round(m / 60)
  return `${Math.floor(h / 24)}d${h % 24 ? `${h % 24}h` : ''}`
}

export const miniGauge = (percent: number, width = 5) => {
  const filled = Math.max(percent > 0 ? 1 : 0, Math.min(width, Math.round((percent / 100) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

// The line after the context bar: tokens, each usage window with a gauge and its reset, then
// where it's billed. On a plan the $ is only what the session would cost at API prices, so it's
// left out here; on the API or a cloud provider it's what you're actually billed.
export function segments(m: Meter, now: number): Segment[] {
  const out: Segment[] = []
  const sep = () => out.length && out.push({ text: ' · ', dim: true })
  // With usage windows to show, the context % already says enough; the token count makes room.
  if (m.tokens !== undefined && m.window && !m.limits?.length) out.push({ text: `${kilo(m.tokens)}/${kilo(m.window)}`, dim: true })
  for (const limit of m.limits ?? []) {
    sep()
    const color = hex(gradientAt(limit.percent / 100))
    out.push({ text: `${LIMIT_LABELS[limit.kind] ?? limit.kind} `, dim: true }, { text: miniGauge(limit.percent), color }, { text: ` ${Math.round(limit.percent)}%`, color, bold: true })
    const reset = resetIn(limit.resetsAt, now)
    if (reset) out.push({ text: ` ↻${reset}`, dim: true })
  }
  if (m.source && m.source !== 'plan' && m.usd !== undefined) {
    sep()
    out.push({ text: `$${m.usd.toFixed(2)} billed`, bold: true })
  }
  if (m.source) {
    sep()
    out.push({ text: SOURCE_LABELS[m.source], dim: true })
  }
  return out
}

export const segmentsText = (parts: readonly Segment[]) => parts.map(p => p.text).join('')

// The terminal bar: heavy line cells in the gradient, a half cell for precision, a dim track after.
// `shine` is the cell a highlight sweeps across while Claude works.
export function barRuns(percent: number, width: number, shine?: number): Run[] {
  const exact = (Math.max(0, Math.min(100, percent)) / 100) * width
  const full = Math.floor(exact)
  const half = exact - full >= 0.5
  const runs: Run[] = []
  const push = (text: string, color: number) => {
    const fg = hex(color)
    const last = runs[runs.length - 1]
    if (last && last.fg === fg) last.text += text
    else runs.push({ text, fg })
  }
  for (let i = 0; i < width; i++) {
    const glow = shine === undefined ? 0 : Math.max(0, 1 - Math.abs(i - shine) / 2)
    const color = mix(gradientAt(i / Math.max(1, width - 1)), 0xffffff, glow * 0.6)
    if (i < full) push('━', color)
    else if (i === full && half) push('╸', color)
    else push('─', TRACK)
  }
  return runs
}

// Desktop: a rounded pill whose fill glides from the last reading to this one, with a soft
// highlight sweeping across while Claude works and a glow at the tip.
export function meterSvg(percent: number, from: number, isWorking: boolean, width = 110): string {
  const w = (p: number) => Math.max(0, Math.min(1, p / 100)) * width
  const to = w(percent)
  const start = w(from)
  const tip = hex(gradientAt(percent / 100))
  const glide = Math.abs(to - start) > 0.5
    ? (attr: string) => `<animate attributeName="${attr}" from="${start.toFixed(1)}" to="${to.toFixed(1)}" dur="0.8s" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1" fill="freeze"/>`
    : () => ''
  const shimmer = isWorking
    ? `<rect y="3" width="30" height="6" fill="url(#s)" clip-path="url(#c)"><animate attributeName="x" values="-30;${width}" dur="1.6s" repeatCount="indefinite"/></rect>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 6}" height="12" viewBox="-3 0 ${width + 6} 12">`
    + `<defs><linearGradient id="g" x1="0" x2="${width}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#34d399"/><stop offset="0.6" stop-color="#fbbf24"/><stop offset="1" stop-color="#f87171"/></linearGradient>`
    + `<linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<clipPath id="c"><rect y="3" width="${to.toFixed(1)}" height="6" rx="3">${glide('width')}</rect></clipPath></defs>`
    + `<rect y="3" width="${width}" height="6" rx="3" fill="#8b93a7" fill-opacity="0.22"/>`
    + `<rect y="3" width="${to.toFixed(1)}" height="6" rx="3" fill="url(#g)">${glide('width')}</rect>`
    + shimmer
    + `<circle cx="${to.toFixed(1)}" cy="6" r="4.5" fill="${tip}" fill-opacity="0.35">${glide('cx')}</circle>`
    + `</svg>`
}
