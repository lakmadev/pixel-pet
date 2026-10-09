// An invisible region laid over the desktop's SVG sprite: a click on it pets the pet. A heart pops
// where you clicked at once, from here, while the pet's own reaction makes its round trip.
import type { ClientModule } from 'claude-code'

type Ref = { heart?: { x: number; y: number; at: number }; lastPet: number; t: number }
type State = { ref: Ref }

const HEART_MS = 700

const Hit: ClientModule<{ columns: number; rows: number }, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { lastPet: -Infinity, t: 0 }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(100, () => {
      ref.t += 100
      if (ref.heart && ref.t - ref.heart.at > HEART_MS) {
        ref.heart = undefined
        surface.setState({ ref })
      }
    })
    // Some clicks arrive as a down, some only as an up: either pets, once per click.
    surface.onPointer(event => {
      if (event.type !== 'down' && event.type !== 'up') return
      if (ref.t - ref.lastPet < 300) return
      ref.lastPet = ref.t
      ref.heart = { x: event.x, y: event.y, at: ref.t }
      surface.setState({ ref })
      surface.post({ pet: true })
    })
  }

  const lines = Array.from({ length: Math.max(1, props.rows) }, (_, y) => {
    const row = ' '.repeat(Math.max(1, props.columns)).split('')
    if (ref.heart && ref.heart.y === y) row[Math.min(row.length - 1, Math.max(0, ref.heart.x))] = '♥'
    return row.join('')
  })
  return (
    <Box flexDirection="column">
      {lines.map(line => <Text color="#ff5c8a" bold>{line}</Text>)}
    </Box>
  )
}

export default Hit
