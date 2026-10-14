// What the pet says while Claude works, one line per kind of action, and the desktop's slide
// between one line and the next.

const base = (path: unknown) => (typeof path === 'string' ? path.split('/').filter(Boolean).pop() ?? path : 'a file')
const clip = (text: unknown, max = 28) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

const SHELL: [RegExp, string][] = [
  [/\b(jest|vitest|pytest|mocha|rspec|phpunit|go test|cargo test|(npm|pnpm|yarn|bun) (run )?test)\b/, 'is running the tests 🧪'],
  [/\bgit commit\b/, 'is committing the work ✍️'],
  [/\bgit push\b/, 'is pushing to the remote 🚀'],
  [/\bgit (pull|fetch|clone)\b/, 'is pulling from git…'],
  [/\bgit (diff|status|log|show|blame)\b/, 'is checking the git history…'],
  [/\bgit\b/, 'is talking to git…'],
  [/\b((npm|pnpm|yarn|bun) (i|install|add)|pip3? install|poetry add|cargo add|brew install|go get|gem install)\b/, 'is installing packages 📦'],
  [/\b(tsc|webpack|vite build|next build|make|cargo build|go build|gradle|mvn|(npm|pnpm|yarn|bun) run build)\b/, 'is building the project 🔨'],
  [/\b(eslint|prettier|ruff|black|flake8|rubocop|biome|(npm|pnpm|yarn|bun) run lint)\b/, 'is tidying the code style…'],
  [/\b(docker|kubectl|helm|terraform)\b/, 'is poking the infrastructure 🐳'],
  [/\b(curl|wget|http)\b/, 'is fetching something from the web…'],
  [/^\s*(ls|cat|head|tail|find|tree|pwd|wc)\b/, 'is looking around the repo 👀'],
  [/\b(rm|mv|cp|mkdir)\b/, 'is moving files around…'],
]

// What kind of work a call is, so a run of the same kind (five reads in a row) is told once.
export function actionKind(tool: string, args: Record<string, unknown>): string | undefined {
  if (tool === 'Read' || tool === 'NotebookRead') return 'read'
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LS') return 'search'
  if (tool === 'WebSearch' || tool === 'WebFetch') return 'web'
  if (tool === 'Bash') {
    const cmd = String(args.command ?? '')
    const at = SHELL.findIndex(([re]) => re.test(cmd))
    return at < 0 ? 'shell' : `shell:${at}`
  }
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__/.exec(tool)?.[1]
  if (mcp) return `mcp:${mcp}`
  return actionLine(tool, args) === undefined ? undefined : tool
}

const shellRe = (line: string) => SHELL.find(([, l]) => l.startsWith(line))![0]
const TESTS = shellRe('is running the tests')
const BUILD = shellRe('is building')
const count = (text: string, re: RegExp) => Number(re.exec(text)?.[1] ?? 0)

// What came of a call worth reacting to: tests passing or failing, a push landing or bouncing,
// a build breaking. Undefined for everything else, which the pet lets pass without comment.
export function outcomeOf(tool: string, args: Record<string, unknown>, isError: boolean, text = ''): { tone: 'good' | 'bad'; line: string } | undefined {
  if (tool !== 'Bash') return undefined
  const cmd = String(args.command ?? '')
  if (TESTS.test(cmd)) {
    const failed = count(text, /(\d+)\s+(?:tests?\s+)?(?:failed|failing|failures?)\b/i)
    const passed = count(text, /(\d+)\s+(?:tests?\s+)?(?:passed|passing)\b/i)
    if (isError || failed > 0) return { tone: 'bad', line: failed > 0 ? `saw ${failed} test${failed === 1 ? '' : 's'} fail ❌` : 'saw the tests fail ❌' }
    return { tone: 'good', line: passed > 0 ? `cheers: all ${passed} tests pass ✅` : 'cheers: the tests pass ✅' }
  }
  if (/\bgit push\b/.test(cmd)) return isError ? { tone: 'bad', line: 'saw the push bounce 😬' } : { tone: 'good', line: 'watched it ship 🚀' }
  if (isError && BUILD.test(cmd)) return { tone: 'bad', line: 'saw the build break 🔨' }
  return undefined
}

// Once a turn runs long, one quiet summary instead of a line per step.
export const focusLine = (steps: number, files: number) => `is deep in it · ${steps} steps${files ? ` · ${files} file${files === 1 ? '' : 's'} changed` : ''}`

// The line for a tool call that's starting, or undefined for a tool not worth a line.
export function actionLine(tool: string, args: Record<string, unknown>): string | undefined {
  const t = tool
  if (t === 'Read' || t === 'NotebookRead') return `is reading ${base(args.file_path ?? args.notebook_path)}…`
  if (t === 'Edit' || t === 'MultiEdit') return `is editing ${base(args.file_path)} ✏️`
  if (t === 'Write') return `is writing ${base(args.file_path)} ✏️`
  if (t === 'NotebookEdit') return 'is editing a notebook 📓'
  if (t === 'Bash') {
    const cmd = String(args.command ?? '')
    return SHELL.find(([re]) => re.test(cmd))?.[1] ?? `is running \`${clip(cmd.split(/\s+/)[0], 16)}\`…`
  }
  if (t === 'Grep') return `is searching for "${clip(args.pattern, 22)}" 🔍`
  if (t === 'Glob' || t === 'LS') return `is looking for ${clip(args.pattern ?? args.path, 22)}…`
  if (t === 'WebSearch') return `is searching the web for "${clip(args.query, 22)}" 🌐`
  if (t === 'WebFetch') {
    const host = /^https?:\/\/([^/]+)/.exec(String(args.url ?? ''))?.[1]
    return `is reading ${host ?? 'a web page'} 🌐`
  }
  if (t === 'TodoWrite' || t === 'TaskCreate' || t === 'TaskUpdate') return 'is planning the next steps 📝'
  if (t === 'EnterPlanMode' || t === 'ExitPlanMode') return 'is drafting a plan 🗺️'
  if (t === 'AskUserQuestion') return 'has a question for you ❓'
  if (t === 'Skill') return `is using the ${clip(args.skill ?? args.name, 20)} skill 🧰`
  if (t === 'Agent' || t === 'Task') return `is sending a helper off ${args.subagent_type ? `(${clip(args.subagent_type, 16)}) ` : ''}🧭`
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__/.exec(t)?.[1]
  if (mcp) return `is asking ${clip(mcp.replace(/[-_]/g, ' '), 20)}…`
  return undefined
}

export type LineColors = { name: string; text: string; good: string; bad: string; ask: string }
export const LINE_COLORS: Record<'dark' | 'light', LineColors> = {
  dark: { name: '#d97757', text: '#e6e6e6', good: '#4ade80', bad: '#f87171', ask: '#fbbf24' },
  light: { name: '#c4613f', text: '#1f2328', good: '#15803d', bad: '#b91c1c', ask: '#b45309' },
}
export const toneColor = (colors: LineColors, tone: 'plain' | 'good' | 'bad' | 'ask' = 'plain') => (tone === 'plain' ? colors.text : colors[tone])

const escape = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

// Desktop: the line as SVG text. The name stays put; only what follows it moves: the new words
// rise from below while the old ones drift up and fade (calm: they just cross-fade). Each status
// carries the name invisibly in front of it, so it starts exactly where the name ends in any font.
// Each layer rests where a still image should be, so without SMIL only the new line shows.
export const lineWidth = (name: string, line: string, previous?: string) => Math.min(640, Math.ceil((name.length + 1 + Math.max(line.length, previous?.length ?? 0)) * 7.9) + 24)

export function lineSvg(name: string, line: string, previous: string | undefined, colors: LineColors, { tone = 'plain', calm = false }: { tone?: 'plain' | 'good' | 'bad' | 'ask'; calm?: boolean } = {}): string {
  const width = lineWidth(name, line, previous)
  const status = (l: string, fill: string) => `<tspan font-weight="700" fill-opacity="0">${escape(name)}</tspan><tspan fill="${fill}"> ${escape(l)}</tspan>`
  const ease = 'dur="0.38s" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1" fill="freeze"'
  const isChange = previous !== undefined && previous !== line
  const old = isChange
    ? `<text x="0" y="${calm ? 15 : -4}" opacity="0">${status(previous, colors.text)}${calm ? '' : `<animate attributeName="y" values="15;-4" ${ease}/>`}<animate attributeName="opacity" values="1;0" ${ease}/></text>`
    : ''
  const rise = isChange ? `${calm ? '' : `<animate attributeName="y" values="32;15" ${ease}/>`}<animate attributeName="opacity" values="0;1" ${ease}/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif" font-size="14">`
    + `${old}<text x="0" y="15">${status(line, toneColor(colors, tone))}${rise}</text>`
    + `<text x="0" y="15" fill="${colors.name}" font-weight="700">${escape(name)}</text></svg>`
}
