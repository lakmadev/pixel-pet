// The terminal's helpers, left of the context bar, newest first, on the surface's own clock. A new
// one first widens its slot a column at a time, pushing the bar along, then sparkles in; a leaving
// one waves, shrinks to a speck, and its slot narrows back.
import type { ClientModule } from 'claude-code'

import { LEAVE_MS, MINI_W, SLOT_MS, miniFrame, seedOf } from './mini'
import { toRunsOf } from './sprite'

export type MinisViewProps = { minis: { id: string; color: string; state: 'here' | 'bye'; age: number }[]; stamp: number }

type Ref = { t: number; stamp: number }
type State = { ref: Ref }

const FRAME_MS = 40
const SLOT = MINI_W + 1
const CLOSE_MS = 300

// How wide a helper's slot is at this age: opening, full, then closing as it leaves.
export function slotWidth(state: 'here' | 'bye', age: number): number {
  if (age < 0) return 0
  if (state === 'here') return Math.min(SLOT, Math.round((age / SLOT_MS) * SLOT))
  const closing = age - (LEAVE_MS - CLOSE_MS)
  return closing <= 0 ? SLOT : Math.max(0, Math.round(SLOT * (1 - closing / CLOSE_MS)))
}

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

  const slots = props.minis.map(m => {
    const age = m.age + ref.t
    const width = slotWidth(m.state, age)
    // The helper itself waits for its slot to open; its own story starts then.
    const grid = width === SLOT || m.state === 'bye' ? miniFrame(m.color, m.state, m.state === 'here' ? age - SLOT_MS : age, seedOf(m.id)) : null
    const rows = grid ? toRunsOf(grid, MINI_W) : [[{ text: ' '.repeat(MINI_W) }], [{ text: ' '.repeat(MINI_W) }]]
    return { width, rows }
  })
  return (
    <Box flexDirection="column">
      {[0, 1].map(row => (
        <Text>
          {slots.flatMap(slot => {
            if (slot.width === 0) return []
            // A slot narrower than the helper shows its left part: the room it has so far.
            let room = slot.width
            const out = []
            for (const run of slot.rows[row]!) {
              if (room <= 0) break
              const text = run.text.slice(0, room)
              room -= text.length
              out.push(run.fg ? <Text color={run.fg} backgroundColor={run.bg}>{text}</Text> : <Text>{text}</Text>)
            }
            if (room > 0) out.push(<Text>{' '.repeat(room)}</Text>)
            return out
          })}
        </Text>
      ))}
    </Box>
  )
}

export default MinisView
