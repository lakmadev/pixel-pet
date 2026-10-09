// The terminal's context meter, on the surface's own clock: the bar and the number glide to each
// new reading with an ease-out, and a highlight sweeps along the fill while Claude works.
import type { ClientModule } from 'claude-code'

import { barRuns, gradientAt, hex } from './meter'

export type MeterViewProps = { percent?: number; details: string; isWorking: boolean; width: number }

type Ref = { shown: number; target: number; phase: number; isWorking: boolean }
type State = { ref: Ref }

const FRAME_MS = 60

const MeterView: ClientModule<MeterViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  // The first reading shows as it is; later ones glide.
  const ref = surface.state?.ref ?? { shown: props.percent ?? 0, target: props.percent ?? 0, phase: 0, isWorking: props.isWorking }
  ref.target = props.percent ?? 0
  ref.isWorking = props.isWorking
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(FRAME_MS, () => {
      const isGliding = Math.abs(ref.target - ref.shown) > 0.05
      if (isGliding) ref.shown += (ref.target - ref.shown) * 0.18
      else ref.shown = ref.target
      if (ref.isWorking) ref.phase += 1
      if (isGliding || ref.isWorking) surface.setState({ ref })
    })
  }

  if (props.percent === undefined) return <Text dimColor>context · waiting for the first reply</Text>

  const filled = Math.max(1, Math.round((ref.shown / 100) * props.width))
  const shine = ref.isWorking ? (ref.phase % (filled + 8)) - 4 : undefined
  return (
    <Box>
      {barRuns(ref.shown, props.width, shine).map(run => <Text color={run.fg}>{run.text}</Text>)}
      <Text bold color={hex(gradientAt(ref.shown / 100))}> {Math.round(ref.shown)}%</Text>
      {props.details && <Text dimColor> {props.details}</Text>}
    </Box>
  )
}

export default MeterView
