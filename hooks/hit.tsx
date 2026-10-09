// An invisible region laid over the desktop's SVG sprite: a click on it pets the pet.
import type { ClientModule } from 'claude-code'

type State = { isListening: true }

const Hit: ClientModule<{ columns: number }, State> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ isListening: true })
    surface.onPointer(event => {
      if (event.type === 'down') surface.post({ pet: true })
    })
  }
  return <Text>{' '.repeat(Math.max(1, props.columns))}</Text>
}

export default Hit
