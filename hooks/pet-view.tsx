// The pet itself, drawn on the surface's own frame clock: it bobs and blinks between the band's
// redraws, a change of mood or colour crossfades instead of popping, and a click pets it. With a
// scene it stands in its little world, 16 columns wide, which scrolls past while Claude works.
import type { ClientModule } from 'claude-code'

import type { Mood } from '../types'
import { DEFAULT_COLOR, WIDTH, blend, sprite, toRunsOf } from './sprite'
import { sceneGrid } from './scene'
import type { Scene } from './scene'
import type { Outfit, Style } from './sprite'

// `outfit` is 'none' without a hat: a Client's props can't hold undefined.
export type PetViewProps = { mood: Mood; look: number; color: string; outfit: Outfit | 'none'; tired: number; calm: boolean; scene: Scene | 'none'; isMoving: boolean }

// Its world in the terminal: 14 columns by 5 rows (10 pixels), the pet standing at the bottom.
export const HABITAT_COLUMNS = 14
export const HABITAT_ROWS = 5
const PET_AT = 2
const SCROLL_PER_FRAME = 0.9 // the nearest layer's pixels per frame; farther ones move less

type Ref = { t: number; mood: Mood; color: string; from?: { mood: Mood; color: string; at: number }; offset: number; isMoving: boolean }
type State = { ref: Ref }

const FRAME_MS = 100
const FADE_MS = 350

const PetView: ClientModule<PetViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { t: 0, mood: props.mood, color: props.color, offset: 0, isMoving: props.isMoving }
  ref.isMoving = props.isMoving
  if (props.mood !== ref.mood || props.color !== ref.color) {
    ref.from = { mood: ref.mood, color: ref.color, at: ref.t }
    ref.mood = props.mood
    ref.color = props.color
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    // Some clicks arrive as a down, some only as an up: either pets, once per click.
    let lastPet = -Infinity
    surface.onPointer(event => {
      if ((event.type !== 'down' && event.type !== 'up') || ref.t - lastPet < 300) return
      lastPet = ref.t
      surface.post({ pet: true })
    })
    surface.every(FRAME_MS, () => {
      // Asleep it barely moves, so a quarter of the frames will do.
      ref.t += FRAME_MS
      if (ref.isMoving) ref.offset += SCROLL_PER_FRAME
      if (ref.isMoving || ref.mood !== 'sleepy' || ref.t % (FRAME_MS * 4) === 0) surface.setState({ ref })
    })
  }

  const style: Style = { outfit: props.outfit === 'none' ? undefined : props.outfit, tired: props.tired, calm: props.calm }
  let grid = sprite(ref.mood, ref.t, props.look, ref.color ?? DEFAULT_COLOR, style)
  if (ref.from) {
    const k = (ref.t - ref.from.at) / FADE_MS
    if (k >= 1) ref.from = undefined
    else grid = blend(sprite(ref.from.mood, ref.t, 0, ref.from.color, style), grid, k * k * (3 - 2 * k)) // smoothstep
  }

  // In its world: the scene behind, the pet's see-through pixels showing it.
  let width = WIDTH
  if (props.scene !== 'none') {
    const world = sceneGrid(props.scene, HABITAT_COLUMNS, HABITAT_ROWS * 2, ref.offset, 32)
    const top = HABITAT_ROWS * 2 - grid.length
    grid.forEach((row, y) => row.forEach((c, x) => c !== null && (world[y + top]![x + PET_AT] = c)))
    grid = world
    width = HABITAT_COLUMNS
  }

  return (
    <Box flexDirection="column">
      {toRunsOf(grid, width).map(runs => (
        <Text>
          {runs.map(run => (run.fg ? <Text color={run.fg} backgroundColor={run.bg}>{run.text}</Text> : <Text>{run.text}</Text>))}
        </Text>
      ))}
    </Box>
  )
}

export default PetView
