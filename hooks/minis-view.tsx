// The terminal's helpers, side by side on the surface's own clock: each pops in, blinks while its
// agent works, then waves bye and fades to a speck.
import type { ClientModule } from 'claude-code'

import { MINI_W, miniFrame, seedOf } from './mini'
import { toRunsOf } from './sprite'

export type MinisViewProps = { minis: { id: string; color: string; state: 'here' | 'bye'; age: number }[]; stamp: number }

type Ref = { t: number; stamp: number }
type State = { ref: Ref }

const FRAME_MS = 80

const MinisView: ClientModule<MinisViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { t: 0, stamp: props.stamp }
  if (props.stamp !== ref.stamp) {
    // Fresh ages from the band; count on from them.
    ref.stamp = props.stamp
    ref.t = 0
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(FRAME_MS, () => {
      ref.t += FRAME_MS
      surface.setState({ ref })
    })
  }

  const frames = props.minis.map(m => miniFrame(m.color, m.state, m.age + ref.t, seedOf(m.id)))
  const rows = [0, 1].map(row => frames.map(grid => (grid ? toRunsOf(grid, MINI_W)[row]! : [{ text: ' '.repeat(MINI_W) }])))
  return (
    <Box flexDirection="column">
      {rows.map(minis => (
        <Text>
          {minis.flatMap((runs, i) => [
            ...(i > 0 ? [<Text> </Text>] : []),
            ...runs.map(run => (run.fg ? <Text color={run.fg} backgroundColor={run.bg}>{run.text}</Text> : <Text>{run.text}</Text>)),
          ])}
        </Text>
      ))}
    </Box>
  )
}

export default MinisView
