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

export type LineColors = { name: string; text: string }
export const LINE_COLORS: Record<'dark' | 'light', LineColors> = {
  dark: { name: '#d97757', text: '#e6e6e6' },
  light: { name: '#c4613f', text: '#1f2328' },
}

const escape = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

// Desktop: the line as SVG text. A new line rises from below while the old one drifts up and
// fades. Each layer rests where a still image should be, so without SMIL only the new line shows.
export const lineWidth = (name: string, line: string, previous?: string) => Math.min(640, Math.ceil((name.length + 1 + Math.max(line.length, previous?.length ?? 0)) * 7.9) + 24)

export function lineSvg(name: string, line: string, previous: string | undefined, colors: LineColors): string {
  const width = lineWidth(name, line, previous)
  const text = (l: string) => `<tspan fill="${colors.name}" font-weight="700">${escape(name)}</tspan><tspan fill="${colors.text}"> ${escape(l)}</tspan>`
  const ease = 'dur="0.38s" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1" fill="freeze"'
  const old = previous !== undefined && previous !== line
    ? `<text x="0" y="-4" opacity="0">${text(previous)}<animate attributeName="y" values="15;-4" ${ease}/><animate attributeName="opacity" values="1;0" ${ease}/></text>`
    : ''
  const rise = old ? `<animate attributeName="y" values="32;15" ${ease}/><animate attributeName="opacity" values="0;1" ${ease}/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif" font-size="14">${old}<text x="0" y="15">${text(line)}${rise}</text></svg>`
}
