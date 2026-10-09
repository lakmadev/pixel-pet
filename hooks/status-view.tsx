// The terminal's status line. Text there moves in whole rows only, so a change can't glide; it
// rolls instead: the old words fade out, then the new ones fade in, in about a quarter second.
import type { ClientModule } from 'claude-code'

export type StatusViewProps = { name: string; line: string }

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

  const since = ref.t - ref.changedAt
  const name = <Text bold color="claude">{props.name}</Text>
  if (ref.previous !== undefined && since < OUT_MS) {
    return <Text wrap="truncate">{name}<Text dimColor> {ref.previous}</Text></Text>
  }
  if (ref.previous !== undefined && since < OUT_MS + GAP_MS) return <Text wrap="truncate">{name}</Text>
  const isFadingIn = ref.previous !== undefined && since < OUT_MS + GAP_MS + IN_MS
  return <Text wrap="truncate">{name}<Text dimColor={isFadingIn}> {ref.line}</Text></Text>
}

export default StatusView
