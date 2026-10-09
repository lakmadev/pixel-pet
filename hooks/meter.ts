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

// A window's reset only earns a place on the line once it's getting tight; the card always has it.
export const RESET_SHOWN_FROM = 70

// The terminal's line after the context bar: tokens (when there are no windows to show), each
// usage window as a gauge and a percent, and the bill on the API or a cloud provider. On a plan
// the $ is only what the session would cost at API prices, so it stays in the card.
export function segments(m: Meter, now: number): Segment[] {
  const out: Segment[] = []
  const sep = () => out.length && out.push({ text: '  ' })
  if (m.tokens !== undefined && m.window && !m.limits?.length) out.push({ text: `${kilo(m.tokens)}/${kilo(m.window)}`, dim: true })
  for (const limit of m.limits ?? []) {
    sep()
    const color = hex(gradientAt(limit.percent / 100))
    out.push({ text: `${LIMIT_LABELS[limit.kind] ?? limit.kind} `, dim: true }, { text: miniGauge(limit.percent), color }, { text: ` ${Math.round(limit.percent)}%`, color, bold: true })
    const reset = limit.percent >= RESET_SHOWN_FROM ? resetIn(limit.resetsAt, now) : undefined
    if (reset) out.push({ text: ` resets ${reset}`, dim: true })
  }
  if (m.source && m.source !== 'plan' && m.usd !== undefined) {
    sep()
    out.push({ text: `$${m.usd.toFixed(2)}`, bold: true })
  }
  return out
}

const LIMIT_NAMES: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'Weekly limit', seven_day_opus: 'Weekly Opus limit', spend_limit: 'Spend limit' }

// The hover card: everything the line leaves out, in plain words.
export function cardLines(m: Meter, now: number): string[] {
  const lines: string[] = []
  if (m.percent !== undefined) lines.push(`Context ${m.percent}% full${m.tokens !== undefined && m.window ? ` · ${kilo(m.tokens)} of ${kilo(m.window)} tokens` : ''}`)
  for (const limit of m.limits ?? []) {
    const reset = resetIn(limit.resetsAt, now)
    lines.push(`${LIMIT_NAMES[limit.kind] ?? limit.kind} ${Math.round(limit.percent)}% used${reset ? ` · resets in ${reset}` : ''}`)
  }
  const usd = m.usd !== undefined ? `$${m.usd.toFixed(2)}` : undefined
  if (m.source === 'plan') lines.push(`Billing: Claude plan, usage limits instead of per-token charges${usd ? ` (≈${usd} at API rates)` : ''}`)
  else if (m.source) lines.push(`Billing: ${SOURCE_LABELS[m.source]}${usd ? `, ${usd} billed this session` : ''}`)
  return lines
}

export type Tones = { label: string }
export const TONES: Record<'dark' | 'light', Tones> = { dark: { label: '#9a9aa2' }, light: { label: '#6b7280' } }

// Desktop: the usage windows as one SVG, so labels, pills and percents line up exactly
// (the app's proportional font draws ▰ and ▱ at different widths).
export function limitsSvg(limits: readonly Limit[], tones: Tones): { svg: string; width: number } {
  const CHAR = 7.4
  const PILL = 30
  let x = 0
  let end = 0
  const parts = limits.map(limit => {
    const label = LIMIT_LABELS[limit.kind] ?? limit.kind
    const color = hex(gradientAt(limit.percent / 100))
    const pct = `${Math.round(limit.percent)}%`
    const fill = Math.max(limit.percent > 0 ? 4 : 0, (Math.min(100, limit.percent) / 100) * PILL)
    const lx = x
    const px = lx + label.length * CHAR + 6
    const tx = px + PILL + 6
    end = tx + pct.length * 8.4 // bold digits run wider than labels
    x = end + 16
    return `<text x="${lx}" y="12" fill="${tones.label}">${label}</text>`
      + `<rect x="${px}" y="5" width="${PILL}" height="5" rx="2.5" fill="#8b93a7" fill-opacity="0.25"/>`
      + `<rect x="${px}" y="5" width="${fill.toFixed(1)}" height="5" rx="2.5" fill="${color}"/>`
      + `<text x="${tx}" y="12" fill="${color}" font-weight="700">${pct}</text>`
  })
  const width = Math.ceil(Math.max(1, end + 2))
  return {
    width,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="16" viewBox="0 0 ${width} 16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif" font-size="12.5">${parts.join('')}</svg>`,
  }
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
