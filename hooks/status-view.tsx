// The terminal's status line. The name stays put; text there moves in whole rows only, so the
// words after it can't glide: they roll instead, the old ones fading out, then the new ones
// fading in, in about a quarter second (calm: they simply change). Good news, bad news and
// "needs you" lines take a colour.
import type { ClientModule } from 'claude-code'

// `color` is left out for plain narration (a Client's props can't hold undefined).
export type StatusViewProps = { name: string; line: string; color?: string; calm: boolean }

type Ref = { t: number; line: string; previous?: string; changedAt: number }
type State = { ref: Ref }

const FRAME_MS = 50
const OUT_MS = 110
const GAP_MS = 40
const IN_MS = 130

const StatusView: ClientModule<StatusViewProps, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { t: 0, line: props.line, changedAt: -Infinity }
  if (props.line !== ref.line) {
    ref.previous = ref.line
    ref.line = props.line
    ref.changedAt = ref.t
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(FRAME_MS, () => {
      ref.t += FRAME_MS
      if (ref.t - ref.changedAt <= OUT_MS + GAP_MS + IN_MS + FRAME_MS) surface.setState({ ref })
    })
  }

  const since = props.calm ? Infinity : ref.t - ref.changedAt
  const name = <Text bold color="claude">{props.name}</Text>
  if (ref.previous !== undefined && since < OUT_MS) {
    return <Text wrap="truncate">{name}<Text dimColor> {ref.previous}</Text></Text>
  }
  if (ref.previous !== undefined && since < OUT_MS + GAP_MS) return <Text wrap="truncate">{name}</Text>
  const isFadingIn = ref.previous !== undefined && since < OUT_MS + GAP_MS + IN_MS
  return <Text wrap="truncate">{name}<Text color={props.color} dimColor={isFadingIn}> {ref.line}</Text></Text>
}

export default StatusView
