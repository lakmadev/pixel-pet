// The pet itself, drawn on the surface's own frame clock: it bobs and blinks between the band's
// redraws, and a change of mood or form crossfades instead of popping.
import type { ClientModule } from 'claude-code'

import type { Mood } from '../types'
import { blend, sprite, toRuns } from './sprite'

export type PetViewProps = { mood: Mood; level: number }

type Ref = { t: number; mood: Mood; level: number; from?: { mood: Mood; level: number; at: number } }
type State = { ref: Ref }

const FRAME_MS = 100
const FADE_MS = 350

const PetView: ClientModule<PetViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { t: 0, mood: props.mood, level: props.level }
  if (props.mood !== ref.mood || props.level !== ref.level) {
    ref.from = { mood: ref.mood, level: ref.level, at: ref.t }
    ref.mood = props.mood
    ref.level = props.level
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(FRAME_MS, () => {
      // Asleep it barely moves, so a quarter of the frames will do.
      ref.t += FRAME_MS
      if (ref.mood !== 'sleepy' || ref.t % (FRAME_MS * 4) === 0) surface.setState({ ref })
    })
  }

  let grid = sprite(ref.mood, ref.t, ref.level)
  if (ref.from) {
    const k = (ref.t - ref.from.at) / FADE_MS
    if (k >= 1) ref.from = undefined
    else grid = blend(sprite(ref.from.mood, ref.t, ref.from.level), grid, k * k * (3 - 2 * k)) // smoothstep
  }

  return (
    <Box flexDirection="column">
      {toRuns(grid).map(runs => (
        <Text>
          {runs.map(run => (run.fg ? <Text color={run.fg} backgroundColor={run.bg}>{run.text}</Text> : <Text>{run.text}</Text>))}
        </Text>
      ))}
    </Box>
  )
}

export default PetView
