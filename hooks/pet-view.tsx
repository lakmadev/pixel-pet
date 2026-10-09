// The pet itself, drawn on the surface's own frame clock: it bobs and blinks between the band's
// redraws, a change of mood or colour crossfades instead of popping, and a click pets it.
import type { ClientModule } from 'claude-code'

import type { Mood } from '../types'
import { DEFAULT_COLOR, blend, sprite, toRuns } from './sprite'

export type PetViewProps = { mood: Mood; look: number; color: string }

type Ref = { t: number; mood: Mood; color: string; from?: { mood: Mood; color: string; at: number } }
type State = { ref: Ref }

const FRAME_MS = 100
const FADE_MS = 350

const PetView: ClientModule<PetViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { t: 0, mood: props.mood, color: props.color }
  if (props.mood !== ref.mood || props.color !== ref.color) {
    ref.from = { mood: ref.mood, color: ref.color, at: ref.t }
    ref.mood = props.mood
    ref.color = props.color
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.onPointer(event => {
      if (event.type === 'down') surface.post({ pet: true })
    })
    surface.every(FRAME_MS, () => {
      // Asleep it barely moves, so a quarter of the frames will do.
      ref.t += FRAME_MS
      if (ref.mood !== 'sleepy' || ref.t % (FRAME_MS * 4) === 0) surface.setState({ ref })
    })
  }

  let grid = sprite(ref.mood, ref.t, props.look, ref.color ?? DEFAULT_COLOR)
  if (ref.from) {
    const k = (ref.t - ref.from.at) / FADE_MS
    if (k >= 1) ref.from = undefined
    else grid = blend(sprite(ref.from.mood, ref.t, 0, ref.from.color), grid, k * k * (3 - 2 * k)) // smoothstep
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
